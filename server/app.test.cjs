'use strict';
// Tests der Server-API: npm run test:server
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-data-'));
process.env.DATA_DIR = dataDir;
process.env.ADMIN_PASSWORD = 'test-admin-passwort';
const { createServer, normalizeCode } = require('./app.cjs');

let server;
let base;
const project = (n = 1) => ({ meta: { format: 'netzwerk-simulator', version: 1 }, topology: { devices: Array.from({ length: n }, (_, i) => ({ id: `d${i + 1}` })), cables: [], nextId: n + 1 }, configuration: {} });

/** Schreib-Tokens wie im Browser: aus Antworten merken und bei Sessions mitschicken. */
const writers = new Map();
const sessionOf = (url) => (/\/api\/sessions\/([^/?]+)/.exec(url)?.[1] ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function call(method, url, body, token) {
  const key = sessionOf(url);
  const writer = key && writers.get(key);
  const res = await fetch(base + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(writer ? { 'X-Leyonet-Writer': writer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  const owner = data && typeof data === 'object' && data.writer ? String(data.code ?? data.session ?? key).toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  if (owner) writers.set(owner, data.writer);
  return { status: res.status, data, headers: res.headers };
}

before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('liefert die App mit Server-Kennung und CSP für die eigene API', async () => {
  const res = await call('GET', '/');
  assert.equal(res.status, 200);
  assert.match(res.data, /<meta name="ns-server" content="1"/);
  assert.match(res.data, /connect-src 'self'/);
  assert.doesNotMatch(res.data, /connect-src 'none'/);
  assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});

test('liefert Skripte und Stile als eigene Dateien, ohne Inline-Skripte', async () => {
  const res = await call('GET', '/');
  const html = res.data;
  // Keine ausführbaren Inline-Skripte: so läuft die Seite auch unter einer strengeren Hosting-CSP.
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)(?![^>]*application\/json)[^>]*>/);
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  const sources = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(sources.some((s) => s.endsWith('.js')));
  assert.ok(sources.some((s) => s.endsWith('.css')));
  for (const src of sources) {
    const asset = await fetch(base + src);
    assert.equal(asset.status, 200, src);
    assert.match(asset.headers.get('content-type'), src.endsWith('.js') ? /javascript/ : /text\/css/);
    assert.ok((await asset.text()).length > 0);
  }
  assert.equal((await call('GET', '/assets/gibtsnicht.js')).status, 404);
});

test('Codes: normalisiert und ohne verwechselbare Zeichen', () => {
  assert.equal(normalizeCode('k7f2 9qxm'), 'K7F2-9QXM');
  assert.equal(normalizeCode('K7F2-9QX0'), null);
  assert.equal(normalizeCode('../etc'), null);
});

/** Wie ein zweites Gerät: ohne das Schreib-Token des ersten. */
async function foreign(method, url, body, headers = {}) {
  const res = await fetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null) };
}

test('Session nur an einem Gerät offen, Ansehen, Sperre mit PIN', async () => {
  const { code, writer } = (await call('POST', '/api/sessions', { project: project(1) })).data;
  assert.match(writer, /^[A-Za-z0-9_-]{30,}$/);
  // Zweites Gerät: verbunden ist das erste, also kein Schreibrecht, aber Ansehen geht.
  assert.equal((await foreign('GET', `/api/sessions/${code}`)).data.error, 'sessionInUse');
  const watched = await foreign('GET', `/api/sessions/${code}?watch=1`);
  assert.equal(watched.status, 200);
  assert.equal(watched.data.watch, true);
  assert.equal(watched.data.writer, undefined);
  assert.equal(watched.data.connected, true);
  assert.equal((await foreign('PUT', `/api/sessions/${code}`, { project: project(5) })).status, 409);
  assert.equal((await foreign('DELETE', `/api/sessions/${code}`)).status, 409);
  assert.equal((await foreign('POST', `/api/sessions/${code}/ping`)).status, 409);
  assert.equal((await call('POST', `/api/sessions/${code}/ping`)).data.ok, true);
  // Sperren: nur mit gültiger PIN.
  assert.equal((await call('POST', `/api/sessions/${code}/lock`, { pin: '12' })).status, 400);
  assert.equal((await call('POST', `/api/sessions/${code}/lock`, { pin: '4711' })).data.locked, true);
  assert.equal((await foreign('POST', `/api/sessions/${code}/lock`, { pin: '0000' })).status, 409);
  // Gerät weg (nicht mehr verbunden): ohne PIN gesperrt, mit falscher PIN abgewiesen, mit richtiger übernommen.
  const { _leases } = require('./app.cjs');
  _leases.clear();
  assert.equal((await foreign('GET', `/api/sessions/${code}`)).data.error, 'sessionLocked');
  assert.equal((await foreign('GET', `/api/sessions/${code}`, undefined, { 'X-Leyonet-Pin': '1234' })).data.error, 'wrongPin');
  const taken = await foreign('GET', `/api/sessions/${code}`, undefined, { 'X-Leyonet-Pin': '4711' });
  assert.equal(taken.status, 200);
  assert.ok(taken.data.writer && taken.data.writer !== writer);
  assert.equal(taken.data.locked, true);
  // Das erste Gerät hat das Schreibrecht verloren.
  assert.equal((await call('PUT', `/api/sessions/${code}`, { project: project(2) })).data.error, 'sessionTakenOver');
  // Zu viele falsche PINs: vorübergehend gesperrt.
  _leases.clear();
  for (let i = 0; i < 5; i++) await foreign('GET', `/api/sessions/${code}`, undefined, { 'X-Leyonet-Pin': '9999' });
  assert.equal((await foreign('GET', `/api/sessions/${code}`, undefined, { 'X-Leyonet-Pin': '4711' })).status, 429);
  // Entsperren nur mit Schreibrecht.
  assert.equal((await foreign('DELETE', `/api/sessions/${code}/lock`, undefined, { 'X-Leyonet-Writer': taken.data.writer })).data.locked, false);
});

test('Session anlegen, laden, ändern, löschen', async () => {
  const created = await call('POST', '/api/sessions', { project: project(2) });
  assert.equal(created.status, 201);
  const { code } = created.data;
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const loaded = await call('GET', `/api/sessions/${code.toLowerCase().replace('-', '')}`);
  assert.equal(loaded.data.project.topology.devices.length, 2);
  const updated = await call('PUT', `/api/sessions/${code}`, { project: project(3) });
  assert.equal(updated.status, 200);
  assert.equal((await call('GET', `/api/sessions/${code}`)).data.project.topology.devices.length, 3);
  assert.equal((await call('DELETE', `/api/sessions/${code}`)).status, 200);
  assert.equal((await call('GET', `/api/sessions/${code}`)).status, 404);
});

test('nimmt nur Projekte des Simulators an', async () => {
  assert.equal((await call('POST', '/api/sessions', { project: { name: 'Max Muster' } })).status, 400);
});

test('speichert keine IP-Adressen', async () => {
  await call('POST', '/api/sessions', { project: project() });
  await call('POST', '/api/feedback', { kind: 'idea', text: 'Mehr Aufgaben' });
  const all = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) walk(file);
      else all.push(fs.readFileSync(file, 'utf8'));
    }
  };
  walk(dataDir);
  assert.ok(all.length > 0);
  for (const content of all) assert.doesNotMatch(content, /127\.0\.0\.1|::ffff/);
});

test('Admin: Anmeldung, Einstellungen, Klassen, Rückmeldungen', async () => {
  assert.equal((await call('GET', '/api/admin/overview')).status, 401);
  assert.equal((await call('POST', '/api/admin/login', { password: 'falsch' })).status, 401);
  const { token } = (await call('POST', '/api/admin/login', { password: 'test-admin-passwort' })).data;
  assert.ok(token);

  const saved = await call('PUT', '/api/admin/settings', { modes: { simulation: false }, maxLevel: 3, defaultLevel: 4, disabled: ['routing.bgp', 'kein gültiger Name'], sessionHours: 48 }, token);
  assert.equal(saved.data.sessionHours, 48);
  const config = (await call('GET', '/api/config')).data;
  assert.deepEqual(config.policy, { modes: { design: true, simulation: false }, maxLevel: 3, defaultLevel: 3, disabled: ['routing.bgp'], sessionHours: 48 });
  // Release-Prüfungen: ohne Bericht 404, sonst JSON.
  assert.ok([200, 404].includes((await call('GET', '/api/admin/checks', null, token)).status));

  const cls = (await call('POST', '/api/admin/classes', { label: 'INF22a' }, token)).data;
  assert.equal((await call('POST', '/api/classes/join', { classCode: cls.code })).data.label, 'INF22a');
  const s1 = (await call('POST', '/api/sessions', { project: project(4), classCode: cls.code })).data;
  assert.equal(s1.classCode, cls.code);
  const sessions = (await call('GET', `/api/admin/classes/${cls.code}/sessions`, null, token)).data;
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].devices, 4);
  assert.equal((await call('GET', `/api/admin/sessions/${s1.code}`, null, token)).data.project.topology.devices.length, 4);
  // Fortschritt mit Fehlersuche: nur gültige kleine Zahlen werden übernommen.
  await call('PUT', `/api/sessions/${s1.code}`, { project: project(4), progress: { goals: 3, total: 9, faults: { fixed: 2, total: 5 } } });
  assert.deepEqual((await call('GET', `/api/admin/classes/${cls.code}/sessions`, null, token)).data[0].progress, { goals: 3, total: 9, faults: { fixed: 2, total: 5 } });
  await call('PUT', `/api/sessions/${s1.code}`, { project: project(4), progress: { goals: 3, total: 9, faults: { fixed: 7, total: 5, x: '<b>' } } });
  assert.deepEqual((await call('GET', `/api/admin/classes/${cls.code}/sessions`, null, token)).data[0].progress, { goals: 3, total: 9 });
  await call('POST', `/api/admin/classes/${cls.code}/status`, { sites: { 1: { level: 'done', goals: 9, total: 9, faults: { fixed: 5, total: 5 } }, 2: { level: 'x', faults: { fixed: -1, total: 5 } } } }, token);

  // Klasse schliessen löscht auch ihre Sessions.
  await call('DELETE', `/api/admin/classes/${cls.code}`, null, token);
  assert.equal((await call('GET', `/api/sessions/${s1.code}`)).status, 404);

  const feedback = (await call('GET', '/api/admin/feedback', null, token)).data;
  assert.ok(feedback.some((f) => f.text === 'Mehr Aufgaben' && f.status === 'open'));
  const id = feedback[0].id;
  await call('PATCH', `/api/admin/feedback/${id}`, { status: 'done' }, token);
  assert.equal((await call('GET', `/api/admin/feedback/${id}`, null, token)).data.status, 'done');
});

test('stabile Version: kein noindex, robots.txt erlaubt alles, Kanal «stable»', async () => {
  const config = await call('GET', '/api/config');
  assert.equal(config.data.channel, 'stable');
  const page = await call('GET', '/');
  assert.equal(page.headers.get('x-robots-tag'), null);
  assert.doesNotMatch(page.data, /name="robots"/);
  assert.match((await call('GET', '/robots.txt')).data, /Allow: \//);
});

test('lehnt Formular-Posts ohne JSON ab', async () => {
  const res = await fetch(base + '/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'text=x' });
  assert.equal(res.status, 415);
});

test('Prüfung: Plätze mit Code, warten, starten, speichern, Nachteilsausgleich, Ende, Abgaben mit Schlüssel', async () => {
  const { token } = (await call('POST', '/api/admin/login', { password: 'test-admin-passwort' })).data;
  const learner = { ...project(0), tasks: { title: 'LB3', goals: [], noSelfCheck: true, exam: { id: 'P-SRV', unlock: 'a'.repeat(64), minutes: 30, variants: [{ id: '01', title: 'Platz 1' }, { id: '02', title: 'Platz 2' }] } } };
  const key = { meta: { format: 'netzwerk-simulator-pruefungsschluessel', version: 1 }, key: { id: 'P-SRV', title: 'LB3', code: 'ABCD', variants: [] } };
  assert.equal((await call('POST', '/api/admin/exams', { label: 'INF22a LB3', learner, key: { ...key, key: { ...key.key, id: 'ANDERS' } } }, token)).data.error, 'keyMismatch');
  const created = await call('POST', '/api/admin/exams', { label: 'INF22a LB3', learner, key, minutes: 45 }, token);
  assert.equal(created.status, 201);
  const exam = created.data;
  assert.equal(exam.seats.length, 2);
  assert.equal(exam.minutes, 45);
  const [seat1, seat2] = exam.seats;
  assert.match(seat1.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  // Der Schlüssel liegt verschlüsselt im Datenordner.
  const raw = fs.readFileSync(path.join(dataDir, 'exams', `${exam.id}.json`), 'utf8');
  assert.doesNotMatch(raw, /pruefungsschluessel/);

  // Prüfungsblätter: Aufgabentext je Platz und Code zum Beenden, nur für die Lehrperson.
  const sheet = (await call('GET', `/api/admin/exams/${exam.id}/sheet`, null, token)).data;
  assert.equal(sheet.code, 'ABCD');
  assert.deepEqual(sheet.seats.map((s) => [s.id, s.code, s.sheet.title]), [['01', seat1.code, 'Platz 1'], ['02', seat2.code, 'Platz 2']]);
  assert.equal((await call('GET', `/api/admin/exams/${exam.id}/sheet`)).status, 401);

  // Vor dem Start: warten, keine Session.
  assert.equal((await call('POST', '/api/exams/join', { seatCode: seat1.code })).data.exam.state, 'waiting');
  assert.equal((await call('POST', '/api/exams/join', { seatCode: 'AAAA-AAAA' })).status, 404);
  await call('POST', `/api/admin/exams/${exam.id}/seats/02/extra`, { minutes: 15 }, token);
  const started = (await call('POST', `/api/admin/exams/${exam.id}/start`, {}, token)).data;
  assert.equal(started.state, 'running');
  const until2 = started.seats.find((s) => s.id === '02').until;
  const until1 = started.seats.find((s) => s.id === '01').until;
  assert.equal(until2 - until1, 15 * 60_000);

  // Beitreten: neue Session mit der Prüfungsdatei, Variante des Platzes.
  const join = (await call('POST', '/api/exams/join', { seatCode: seat1.code.toLowerCase().replace('-', ' ') })).data;
  assert.equal(join.fresh, true);
  assert.equal(join.variant, '01');
  assert.equal(join.project.tasks.exam.id, 'P-SRV');
  const work = { ...project(3), tasks: { ...learner.tasks, exam: { id: 'P-SRV', variant: '01' } } };
  const put = await call('PUT', `/api/sessions/${join.session}`, { project: work });
  assert.equal(put.status, 200);
  assert.equal(put.data.exam.state, 'open');
  // Zweites Gerät, solange das erste verbunden ist: abgewiesen (ein Platz ist nur einmal offen).
  const other = await call('POST', '/api/exams/join', { seatCode: seat1.code });
  assert.equal(other.status, 409);
  assert.equal(other.data.error, 'seatInUse');
  // Dasselbe Gerät (mit seinem Token) kommt wieder hinein.
  const same = (await call('POST', '/api/exams/join', { seatCode: seat1.code, writer: join.writer })).data;
  assert.equal(same.session, join.session);
  assert.equal(same.writer, join.writer);
  // Lehrperson sieht den Platz als verbunden und gibt ihn frei; dann übernimmt ein anderes Gerät mit dem Stand.
  const online = (await call('GET', `/api/admin/exams/${exam.id}`, null, token)).data.seats.find((s) => s.id === '01');
  assert.equal(online.online, true);
  assert.equal(online.session, join.session);
  await call('POST', `/api/admin/exams/${exam.id}/seats/01/release`, {}, token);
  const again = (await call('POST', '/api/exams/join', { seatCode: seat1.code })).data;
  assert.equal(again.session, join.session);
  assert.equal(again.fresh, false);
  assert.equal(again.project.topology.devices.length, 3);
  assert.notEqual(again.writer, join.writer);
  // Lernende können ihre Abgabe nicht löschen.
  assert.equal((await call('DELETE', `/api/sessions/${join.session}`)).status, 403);

  // Übersicht: wer ist dabei, wann zuletzt gespeichert.
  const detail = (await call('GET', `/api/admin/exams/${exam.id}`, null, token)).data;
  assert.equal(detail.seats.find((s) => s.id === '01').joined, true);
  assert.equal(detail.seats.find((s) => s.id === '02').joined, false);

  // Ende: Speichern abgewiesen (nach der Gnadenfrist sicher; hier sofort, weil until in der Vergangenheit liegt).
  const ended = (await call('POST', `/api/admin/exams/${exam.id}/end`, {}, token)).data;
  assert.ok(ended.seats.every((s) => s.until <= Date.now()));
  // Nachteilsausgleich nach dem Ende öffnet den Platz wieder.
  const reopened = (await call('POST', `/api/admin/exams/${exam.id}/seats/01/extra`, { minutes: 10 }, token)).data;
  assert.equal(reopened.seats.find((s) => s.id === '01').state, 'open');
  assert.equal((await call('PUT', `/api/sessions/${join.session}`, { project: work })).status, 200);

  // Abgaben mit entschlüsseltem Schlüssel.
  const subs = (await call('GET', `/api/admin/exams/${exam.id}/submissions`, null, token)).data;
  assert.equal(subs.key.key.id, 'P-SRV');
  assert.equal(subs.submissions.length, 1);
  assert.equal(subs.submissions[0].seat, '01');
  assert.equal(subs.submissions[0].project.topology.devices.length, 3);

  // «Alle Sessions löschen» lässt Prüfungsabgaben stehen; die Prüfung löschen entfernt sie.
  await call('DELETE', '/api/admin/sessions', null, token);
  assert.equal((await call('GET', `/api/admin/exams/${exam.id}/submissions`, null, token)).data.submissions.length, 1);
  await call('DELETE', `/api/admin/exams/${exam.id}`, null, token);
  assert.equal((await call('GET', `/api/sessions/${join.session}`)).status, 404);
  void seat2;
});

test('Prüfung: Speichern nach Ablauf der Zeit wird abgewiesen', async () => {
  const { token } = (await call('POST', '/api/admin/login', { password: 'test-admin-passwort' })).data;
  const learner = { ...project(0), tasks: { title: 'Kurz', goals: [], exam: { id: 'P-KURZ', variant: '1' } } };
  const exam = (await call('POST', '/api/admin/exams', { label: 'Kurz', learner, seats: 3, minutes: 1 }, token)).data;
  assert.deepEqual(exam.seats.map((s) => s.id), ['01', '02', '03']);
  await call('POST', `/api/admin/exams/${exam.id}/start`, {}, token);
  const join = (await call('POST', '/api/exams/join', { seatCode: exam.seats[2].code })).data;
  assert.equal(join.variant, null);
  // Zeit künstlich ablaufen lassen: Platz-Ende in die Vergangenheit (Datei direkt anpassen).
  const file = path.join(dataDir, 'exams', `${exam.id}.json`);
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const s of stored.seats) s.until = Date.now() - 60_000;
  fs.writeFileSync(file, JSON.stringify(stored));
  const put = await call('PUT', `/api/sessions/${join.session}`, { project: learner });
  assert.equal(put.status, 423);
  assert.equal(put.data.exam.state, 'closed');
  assert.equal((await call('GET', `/api/admin/exams/${exam.id}`, null, token)).data.state, 'ended');
});

test('Prüfung: Zeit ist Pflicht; Abgeben schliesst den Platz sofort, mit Zeitpunkt im Cockpit', async () => {
  const { token } = (await call('POST', '/api/admin/login', { password: 'test-admin-passwort' })).data;
  const learner = { ...project(0), tasks: { title: 'Abgabe', goals: [], exam: { id: 'P-ABG', variant: '1' } } };
  const missing = await call('POST', '/api/admin/exams', { label: 'Ohne Zeit', learner, seats: 1 }, token);
  assert.equal(missing.status, 400);
  assert.equal(missing.data.error, 'badMinutes');
  const exam = (await call('POST', '/api/admin/exams', { label: 'Abgabe', learner, seats: 2, minutes: 20 }, token)).data;
  // Vor dem Start: Abgeben geht nicht (Session gibt es noch nicht).
  await call('POST', `/api/admin/exams/${exam.id}/start`, {}, token);
  const join = (await call('POST', '/api/exams/join', { seatCode: exam.seats[0].code })).data;
  const work = { ...project(2), tasks: learner.tasks };
  assert.equal((await call('PUT', `/api/sessions/${join.session}`, { project: work })).status, 200);
  // Ein fremdes Gerät ohne Schreib-Token kann nicht für den Platz abgeben.
  const foreign = await fetch(`${base}/api/sessions/${join.session}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(foreign.status, 409);
  // Abgeben mit dem letzten Stand.
  const final = { ...project(4), tasks: learner.tasks };
  const sub = await call('POST', `/api/sessions/${join.session}/submit`, { project: final });
  assert.equal(sub.status, 200);
  assert.equal(sub.data.exam.state, 'closed');
  assert.ok(sub.data.exam.submitted > 0);
  // Danach nimmt der Server nichts mehr an, auch nicht in der Gnadenfrist.
  const put = await call('PUT', `/api/sessions/${join.session}`, { project: work });
  assert.equal(put.status, 423);
  // Zweites Abgeben ändert nichts (gleicher Zeitpunkt).
  const again = await call('POST', `/api/sessions/${join.session}/submit`, { project: work });
  assert.equal(again.data.exam.submitted, sub.data.exam.submitted);
  // Mit dem Platz-Code kommt man nicht mehr an die Arbeit.
  const rejoin = (await call('POST', '/api/exams/join', { seatCode: exam.seats[0].code })).data;
  assert.equal(rejoin.exam.state, 'closed');
  assert.equal(rejoin.project, undefined);
  assert.equal(rejoin.session, undefined);
  // Cockpit: abgegeben mit Zeitpunkt, der andere Platz arbeitet noch.
  const detail = (await call('GET', `/api/admin/exams/${exam.id}`, null, token)).data;
  assert.equal(detail.state, 'running');
  assert.equal(detail.seats[0].state, 'closed');
  assert.equal(detail.seats[0].submitted, sub.data.exam.submitted);
  assert.equal(detail.seats[1].submitted, null);
  const subs = (await call('GET', `/api/admin/exams/${exam.id}/submissions`, null, token)).data;
  assert.equal(subs.submissions[0].project.topology.devices.length, 4);
  assert.equal(subs.submissions[0].submitted, sub.data.exam.submitted);
  // Wieder öffnen (versehentlich abgegeben): mit der regulären Restzeit, der abgegebene Stand bleibt.
  assert.equal((await call('POST', `/api/admin/exams/${exam.id}/seats/${exam.seats[1].id}/reopen`, {}, token)).data.error, 'notSubmitted');
  const back = (await call('POST', `/api/admin/exams/${exam.id}/seats/${exam.seats[0].id}/reopen`, {}, token)).data;
  assert.equal(back.seats[0].state, 'open');
  assert.equal(back.seats[0].submitted, null);
  assert.ok(back.seats[0].until > Date.now() + 18 * 60_000 && back.seats[0].until <= Date.now() + 20 * 60_000);
  const resumed = (await call('POST', '/api/exams/join', { seatCode: exam.seats[0].code })).data;
  assert.equal(resumed.exam.state, 'open');
  assert.equal(resumed.project.topology.devices.length, 4);
  assert.ok(resumed.writer);
  // Nochmals abgeben, dann der bisherige Weg mit «+ Minuten».
  assert.equal((await call('POST', `/api/sessions/${resumed.session}/submit`, {})).status, 200);
  // Mehr Zeit öffnet den Platz wieder (z.B. versehentlich abgegeben).
  const reopened = (await call('POST', `/api/admin/exams/${exam.id}/seats/${exam.seats[0].id}/extra`, { minutes: 5 }, token)).data;
  assert.equal(reopened.seats[0].state, 'open');
  assert.equal(reopened.seats[0].submitted, null);
  // Normale Sessions können nicht «abgeben».
  const normal = (await call('POST', '/api/sessions', { project: project(1) })).data;
  assert.equal((await call('POST', `/api/sessions/${normal.code}/submit`, {})).status, 400);
  await call('DELETE', `/api/admin/exams/${exam.id}`, null, token);
});

test('Prüfung nur im Safe Exam Browser: Schlüssel, Kennung, gilt bis zum Ende', async () => {
  const { token } = (await call('POST', '/api/admin/login', { password: 'test-admin-passwort' })).data;
  const learner = { ...project(0), tasks: { title: 'SEB', goals: [], noSelfCheck: true, exam: { id: 'P-SEB', unlock: 'b'.repeat(64), minutes: 30 } } };
  const exam = (await call('POST', '/api/admin/exams', { label: 'SEB-Test', learner, seats: 1, seb: true, minutes: 30 }, token)).data;
  assert.match(exam.seb.key, /^[0-9a-f]{64}$/);
  const seatCode = exam.seats[0].code;
  await call('POST', `/api/admin/exams/${exam.id}/start`, {}, token);
  const seb = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 SEB/3.8' };
  // Normaler Browser, falscher Schlüssel oder ohne SEB-Kennung: abgewiesen.
  assert.equal((await foreign('POST', '/api/exams/join', { seatCode })).data.error, 'sebRequired');
  assert.equal((await foreign('POST', '/api/exams/join', { seatCode, sebKey: 'c'.repeat(64) }, seb)).data.error, 'sebRequired');
  assert.equal((await foreign('POST', '/api/exams/join', { seatCode, sebKey: exam.seb.key })).data.error, 'sebRequired');
  assert.equal((await foreign('POST', '/api/exams/join', { seatCode, sebKey: { x: 1 } }, seb)).data.error, 'sebRequired');
  // Im SEB mit dem Schlüssel der Prüfung: beitreten und speichern.
  const join = await foreign('POST', '/api/exams/join', { seatCode, sebKey: exam.seb.key }, seb);
  assert.equal(join.status, 200);
  const headers = { ...seb, 'X-Leyonet-Writer': join.data.writer };
  assert.equal((await foreign('PUT', `/api/sessions/${join.data.session}`, { project: learner }, headers)).data.error, 'sebRequired');
  assert.equal((await foreign('PUT', `/api/sessions/${join.data.session}`, { project: learner }, { ...headers, 'X-Leyonet-Seb': exam.seb.key })).status, 200);
  // Neuer Schlüssel: der alte gilt nicht mehr.
  const renewed = (await call('POST', `/api/admin/exams/${exam.id}/seb`, { on: true }, token)).data;
  assert.notEqual(renewed.seb.key, exam.seb.key);
  assert.equal((await foreign('PUT', `/api/sessions/${join.data.session}`, { project: learner }, { ...headers, 'X-Leyonet-Seb': exam.seb.key })).data.error, 'sebRequired');
  // Prüfung beendet: Schlüssel gelöscht, SEB lässt sich nicht wieder abschalten.
  const ended = (await call('POST', `/api/admin/exams/${exam.id}/end`, {}, token)).data;
  assert.equal(ended.seb.key, null);
  assert.doesNotMatch(fs.readFileSync(path.join(dataDir, 'exams', `${exam.id}.json`), 'utf8'), new RegExp(renewed.seb.key));
  assert.equal((await call('POST', `/api/admin/exams/${exam.id}/seb`, { on: false }, token)).data.error, 'examEnded');
  assert.equal((await foreign('POST', '/api/exams/join', { seatCode, sebKey: renewed.seb.key }, seb)).data.error, 'sebRequired');
  // Ohne Admin-Anmeldung kein Zugriff auf den Schlüssel.
  assert.equal((await foreign('POST', `/api/admin/exams/${exam.id}/seb`, { on: true })).status, 401);
});

test('Codes raten: nach 30 Fehlversuchen pro Minute gebremst (je Adresse, nicht für andere)', async () => {
  const angreifer = { 'X-Forwarded-For': '198.51.100.7' };
  for (let i = 0; i < 30; i++) assert.equal((await foreign('GET', `/api/sessions/ZZZZ-ZZ${String(i).padStart(2, '0')}`, null, angreifer)).status, 404);
  assert.equal((await foreign('GET', '/api/sessions/ZZZZ-ZZZZ', null, angreifer)).status, 429);
  // Platz-Codes zählen getrennt; andere Adressen bleiben unberührt.
  assert.equal((await foreign('POST', '/api/exams/join', { seatCode: 'ZZZZ-ZZZZ' }, angreifer)).status, 404);
  assert.equal((await foreign('GET', '/api/sessions/ZZZZ-ZZZZ', null, { 'X-Forwarded-For': '198.51.100.8' })).status, 404);
  for (let i = 0; i < 30; i++) await foreign('POST', '/api/exams/join', { seatCode: `ZZZZ-ZY${String(i).padStart(2, '0')}` }, angreifer);
  assert.equal((await foreign('POST', '/api/exams/join', { seatCode: 'ZZZZ-ZZZZ' }, angreifer)).data.error, 'rateLimited');
});

/** Anmelden von eigener Adresse aus (die Anmeldung ist pro Adresse begrenzt). */
let anmeldeNr = 0;
async function anmelden(password) {
  return (await foreign('POST', '/api/admin/login', { password }, { 'X-Forwarded-For': `198.51.100.${50 + (anmeldeNr++ % 100)}` })).data;
}

test('Zugänge: Schule und Lehrpersonen sehen nur ihre Klassen und Prüfungen, ohne Personendaten', async () => {
  const { token: root } = (await anmelden('test-admin-passwort'));
  const school = (await call('POST', '/api/admin/tenants', { label: 'Schule A', role: 'school' }, root)).data;
  assert.match(school.key, /^LN-[0-9a-f]{8}-[A-Za-z0-9_-]{24,}$/);
  const other = (await call('POST', '/api/admin/tenants', { label: 'Schule B', role: 'school' }, root)).data;
  // Gespeichert wird nur der Hash des Schlüssels.
  const stored = fs.readFileSync(path.join(dataDir, 'tenants', `${school.id}.json`), 'utf8');
  assert.ok(!stored.includes(school.key.split('-').slice(2).join('-')));
  const loginA = (await anmelden(school.key));
  assert.equal(loginA.role, 'school');
  const teacher = (await call('POST', '/api/admin/tenants', { label: 'LP 1', role: 'school' }, loginA.token)).data;
  assert.equal(teacher.role, 'teacher');
  const lp = (await anmelden(teacher.key)).token;
  const b = (await anmelden(other.key)).token;
  const classLp = (await call('POST', '/api/admin/classes', { label: 'INF22a' }, lp)).data;
  const classB = (await call('POST', '/api/admin/classes', { label: 'INF22b' }, b)).data;
  const ov = async (t) => (await call('GET', '/api/admin/overview', null, t)).data;
  assert.deepEqual((await ov(lp)).classes.map((c) => c.label), ['INF22a']);
  assert.deepEqual((await ov(loginA.token)).classes.map((c) => c.label), ['INF22a']);
  assert.deepEqual((await ov(b)).classes.map((c) => c.label), ['INF22b']);
  assert.ok((await ov(root)).classes.length >= 2);
  // Fremde Klasse: wie nicht vorhanden.
  assert.equal((await call('GET', `/api/admin/classes/${classB.code}/sessions`, null, lp)).status, 404);
  assert.equal((await call('PATCH', `/api/admin/classes/${classB.code}`, { label: 'x' }, lp)).status, 404);
  // Nur der Hauptadmin: Einstellungen, Rückmeldungen, alle Sessions löschen, Prüfberichte.
  assert.equal((await call('PUT', '/api/admin/settings', { sessionHours: 2 }, lp)).status, 403);
  assert.equal((await call('GET', '/api/admin/feedback', null, loginA.token)).status, 403);
  assert.equal((await call('DELETE', '/api/admin/sessions', null, lp)).status, 403);
  assert.equal((await call('GET', '/api/admin/tenants', null, lp)).status, 403);
  // Schule sieht nur eigene Lehrpersonen; neuer Schlüssel meldet ab.
  assert.deepEqual((await call('GET', '/api/admin/tenants', null, loginA.token)).data.map((t) => t.label), ['LP 1']);
  await call('POST', `/api/admin/tenants/${teacher.id}/key`, {}, loginA.token);
  assert.equal((await call('GET', '/api/admin/overview', null, lp)).status, 401);
  assert.equal((await foreign('POST', '/api/admin/login', { password: teacher.key }, { 'X-Forwarded-For': '198.51.100.40' })).status, 401);
  // Gelöschte Schule: Anmeldung endet sofort.
  await call('DELETE', `/api/admin/tenants/${other.id}`, null, root);
  assert.equal((await call('GET', '/api/admin/overview', null, b)).status, 401);
  void classLp;
});

test('Klassen-Verbund: Plätze, Infrastruktur, Standorte nur bei Freigabe, Nachrichten nur von Mitgliedern', async () => {
  const { token } = (await anmelden('test-admin-passwort'));
  const klasse = (await call('POST', '/api/admin/classes', { label: 'Verbund' }, token)).data;
  const p = project(0);
  const a = (await foreign('POST', '/api/sessions', { project: p, classCode: klasse.code, site: { seat: 3, label: 'Bern' } })).data;
  const b = (await foreign('POST', '/api/sessions', { project: p, classCode: klasse.code, site: { seat: 3 } })).data;
  assert.deepEqual(a.site, { seat: 3, label: 'Bern' });
  assert.equal(b.site.seat, 1);
  // Ohne Freigabe: kein Verbund.
  assert.equal((await foreign('GET', `/api/classes/${klasse.code}/verbund`)).data.enabled, false);
  await call('PATCH', `/api/admin/classes/${klasse.code}`, { verbund: { enabled: true } }, token);
  await call('PUT', `/api/admin/classes/${klasse.code}/infra`, { project: p }, token);
  let v = (await foreign('GET', `/api/classes/${klasse.code}/verbund`)).data;
  assert.ok(v.infra);
  assert.deepEqual(v.sites.map((s) => [s.seat, s.label, 'project' in s]), [[3, 'Bern', false], [1, '', false]]);
  assert.ok(!JSON.stringify(v).includes(a.code), 'nie Session-Codes anderer');
  await call('PATCH', `/api/admin/classes/${klasse.code}`, { verbund: { shareSites: true } }, token);
  v = (await foreign('GET', `/api/classes/${klasse.code}/verbund`)).data;
  assert.ok(v.sites.every((s) => s.project));
  // Nur Geändertes seit `since`.
  v = (await foreign('GET', `/api/classes/${klasse.code}/verbund?since=${v.now}`)).data;
  assert.ok(!v.infra && v.sites.every((s) => !s.project));
  // Platz wechseln: belegt → 409, frei → ok.
  assert.equal((await foreign('PUT', `/api/sessions/${b.code}/site`, { seat: 3 }, { 'X-Leyonet-Writer': b.writer })).status, 409);
  assert.equal((await foreign('PUT', `/api/sessions/${b.code}/site`, { seat: 7, label: '<b>Genf</b>' }, { 'X-Leyonet-Writer': b.writer })).data.site.label, 'bGenf/b');
  // Nachrichten: nur mit Schreibrecht einer Session der Klasse.
  assert.equal((await foreign('POST', `/api/classes/${klasse.code}/messages`, { session: a.code, to: 7, text: 'Hallo' })).status, 403);
  assert.equal((await foreign('POST', `/api/classes/${klasse.code}/messages`, { session: a.code, to: 7, text: 'Hallo Genf' }, { 'X-Leyonet-Writer': a.writer })).status, 201);
  const list = (await foreign('GET', `/api/classes/${klasse.code}/messages`)).data;
  assert.deepEqual(list.map((m) => [m.from, m.to, m.text]), [[3, 7, 'Hallo Genf']]);
  assert.equal((await foreign('GET', `/api/classes/${klasse.code}/messages?after=${list[0].id}`)).data.length, 0);
  // An alle (-1) geht, unbekannte Ziele nicht.
  assert.equal((await foreign('POST', `/api/classes/${klasse.code}/messages`, { session: a.code, to: -1, text: 'An alle' }, { 'X-Leyonet-Writer': a.writer })).status, 201);
  assert.equal((await foreign('POST', `/api/classes/${klasse.code}/messages`, { session: a.code, to: -2, text: 'x' }, { 'X-Leyonet-Writer': a.writer })).status, 400);
  // Status vom Dashboard erscheint auf der Karte nur, wenn die Lehrperson sie zeigt.
  await call('POST', `/api/admin/classes/${klasse.code}/status`, { sites: { 3: { level: 'online', goals: 2, total: 4 }, 99: { level: 'x' } } }, token);
  assert.equal((await foreign('GET', `/api/classes/${klasse.code}/verbund`)).data.status, undefined);
  await call('PATCH', `/api/admin/classes/${klasse.code}`, { verbund: { showMap: true } }, token);
  assert.deepEqual((await foreign('GET', `/api/classes/${klasse.code}/verbund`)).data.status, { 3: { level: 'online', goals: 2, total: 4 } });
});

test('Klasse: Gültigkeit beim Anlegen wählen und später verlängern (höchstens 180 Tage ab heute)', async () => {
  const { token } = (await call('POST', '/api/admin/login', { password: 'test-admin-passwort' })).data;
  const day = 86_400_000;
  const created = (await call('POST', '/api/admin/classes', { label: 'INF24a', days: 3 }, token)).data;
  assert.ok(Math.abs(created.expires - created.created - 3 * day) < 1000);
  // Ohne Angabe gilt die Voreinstellung (14 Tage), ungültige Angaben ebenfalls.
  const standard = (await call('POST', '/api/admin/classes', { label: 'INF24b', days: 9999 }, token)).data;
  assert.ok(Math.abs(standard.expires - standard.created - 14 * day) < 1000);
  const longer = (await call('PATCH', `/api/admin/classes/${created.code}`, { extendDays: 7 }, token)).data;
  assert.ok(Math.abs(longer.expires - created.expires - 7 * day) < 1000);
  assert.equal(longer.label, 'INF24a');
  // Deckel: nie weiter als 180 Tage ab heute; ungültige Werte werden abgewiesen.
  const capped = (await call('PATCH', `/api/admin/classes/${created.code}`, { extendDays: 180 }, token)).data;
  assert.ok(capped.expires <= Date.now() + 180 * day);
  assert.equal((await call('PATCH', `/api/admin/classes/${created.code}`, { extendDays: 0 }, token)).data.error, 'badDays');
  assert.equal((await call('PATCH', `/api/admin/classes/${created.code}`, { extendDays: '7' }, token)).data.error, 'badDays');
  // Ohne Anmeldung nicht möglich.
  assert.equal((await call('PATCH', `/api/admin/classes/${created.code}`, { extendDays: 7 })).status, 401);
});

test('Prüfung: Code zum Beenden wird auf dem Server geprüft, mit begrenzten Versuchen und Sperre', async () => {
  const { token } = (await call('POST', '/api/admin/login', { password: 'test-admin-passwort' })).data;
  const crypto = require('node:crypto');
  const unlock = crypto.createHash('sha256').update('leyonet-pruefung:AB12CD').digest('hex');
  const learner = { ...project(0), tasks: { title: 'Code', goals: [], exam: { id: 'P-CODE', variant: '1', unlock } } };
  assert.equal((await call('POST', '/api/admin/exams', { label: 'X', learner, seats: 1, minutes: 20, unlock: { attempts: 0, lockMinutes: 5 } }, token)).data.unlock.attempts, 5);
  const exam = (await call('POST', '/api/admin/exams', { label: 'Code', learner, seats: 2, minutes: 20, unlock: { attempts: 2, lockMinutes: 0 }, seb: true, sebQuitLink: true }, token)).data;
  assert.deepEqual(exam.unlock, { attempts: 2, lockMinutes: 0 });
  assert.equal(exam.seb.quitLink, true);
  await call('POST', `/api/admin/exams/${exam.id}/start`, {}, token);
  // Ohne SEB kein Beitritt; SEB-Pflicht wieder aus, um den Ablauf ohne SEB zu testen.
  await call('POST', `/api/admin/exams/${exam.id}/seb`, { on: false }, token);
  const join = (await call('POST', '/api/exams/join', { seatCode: exam.seats[0].code })).data;
  assert.equal(join.exam.unlock.left, 2);
  // Der Prüfwert des Codes bleibt auf dem Server (sonst liesse sich der Code offline erraten).
  assert.equal(join.project.tasks.exam.unlock, undefined);
  assert.equal((await call('GET', `/api/sessions/${join.session}`)).data.project.tasks.exam.unlock, undefined);
  assert.equal((await call('POST', `/api/sessions/${join.session}/unlock`, { code: '  ' })).status, 400);
  assert.equal(join.exam.sebQuit, undefined);
  // Fremdes Gerät (ohne Schreib-Token) darf nicht raten.
  const foreign = await fetch(`${base}/api/sessions/${join.session}/unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"code":"AB12CD"}' });
  assert.equal(foreign.status, 409);
  const w1 = await call('POST', `/api/sessions/${join.session}/unlock`, { code: 'falsch' });
  assert.equal(w1.status, 403);
  assert.equal(w1.data.exam.unlock.left, 1);
  await call('POST', `/api/sessions/${join.session}/unlock`, { code: 'auch falsch' });
  // Gesperrt (0 Minuten = bis zur Freigabe): auch der richtige Code geht nicht mehr.
  const locked = await call('POST', `/api/sessions/${join.session}/unlock`, { code: 'ab12 cd' });
  assert.equal(locked.status, 423);
  assert.equal(locked.data.exam.unlock.lockedUntil, -1);
  const seats = (await call('GET', `/api/admin/exams/${exam.id}`, null, token)).data.seats;
  assert.equal(seats[0].unlockLocked, true);
  assert.equal(seats[0].unlockFails, 2);
  await call('POST', `/api/admin/exams/${exam.id}/seats/${seats[0].id}/unlock-reset`, {}, token);
  const ok = await call('POST', `/api/sessions/${join.session}/unlock`, { code: 'ab12 cd' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.ok, true);
  // Regel ändern; ungültige Werte abgewiesen.
  assert.equal((await call('POST', `/api/admin/exams/${exam.id}/unlock`, { attempts: 99, lockMinutes: 1 }, token)).status, 400);
  assert.deepEqual((await call('POST', `/api/admin/exams/${exam.id}/unlock`, { attempts: 3, lockMinutes: 15 }, token)).data.unlock, { attempts: 3, lockMinutes: 15 });
  // Beenden-Link nur mit SEB; Schlüssel bleibt beim Umschalten.
  assert.equal((await call('POST', `/api/admin/exams/${exam.id}/seb`, { quitLink: true }, token)).status, 409);
  // Ungültige Anfrage erzeugt keinen neuen SEB-Schlüssel.
  assert.equal((await call('POST', `/api/admin/exams/${exam.id}/seb`, {}, token)).status, 400);
  assert.equal((await call('POST', `/api/admin/exams/${exam.id}/seb`, { on: 'ja' }, token)).status, 400);
  const on = (await call('POST', `/api/admin/exams/${exam.id}/seb`, { on: true }, token)).data;
  const toggled = (await call('POST', `/api/admin/exams/${exam.id}/seb`, { quitLink: true }, token)).data;
  assert.equal(toggled.seb.key, on.seb.key);
  assert.equal(toggled.seb.quitLink, true);
});

test('Prüfung mit Varianten: Ein Platz bekommt nur seine Variante, nie die der anderen', async () => {
  const { token } = (await call('POST', '/api/admin/login', { password: 'test-admin-passwort' })).data;
  const topo = (n) => ({ devices: Array.from({ length: n }, (_, i) => ({ id: `d${i + 1}` })), cables: [], nextId: n + 1 });
  const variants = ['01', '02', '03'].map((id, i) => ({ id, title: `Platz ${id}`, goals: [{ id: 'fehler-1', text: `Fehler ${id}`, points: 2 }], topology: topo(i + 2), raster: [] }));
  const learner = { ...project(0), tasks: { title: 'Varianten', goals: [], exam: { id: 'P-VAR', unlock: 'a'.repeat(64), variants } } };
  const exam = (await call('POST', '/api/admin/exams', { label: 'Var', learner, minutes: 20 }, token)).data;
  assert.equal(exam.seats.length, 3);
  await call('POST', `/api/admin/exams/${exam.id}/start`, {}, token);
  const join = (await call('POST', '/api/exams/join', { seatCode: exam.seats[1].code })).data;
  const text = JSON.stringify(join.project);
  assert.equal(join.project.tasks.exam.variants, undefined);
  assert.equal(join.project.tasks.exam.variant, '02');
  assert.equal(join.project.tasks.title, 'Platz 02');
  assert.equal(join.project.topology.devices.length, 3);
  assert.doesNotMatch(text, /Fehler 01|Fehler 03|"unlock"/);
  const again = (await call('GET', `/api/sessions/${join.session}`)).data;
  assert.doesNotMatch(JSON.stringify(again.project), /Fehler 01|Fehler 03|"unlock"|"variants"/);
});
