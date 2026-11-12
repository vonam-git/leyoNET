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

test('Prüfung nur im Safe Exam Browser: Schlüssel, Kennung, gilt bis zum Ende', async () => {
  const { token } = (await call('POST', '/api/admin/login', { password: 'test-admin-passwort' })).data;
  const learner = { ...project(0), tasks: { title: 'SEB', goals: [], noSelfCheck: true, exam: { id: 'P-SEB', unlock: 'b'.repeat(64), minutes: 30 } } };
  const exam = (await call('POST', '/api/admin/exams', { label: 'SEB-Test', learner, seats: 1, seb: true }, token)).data;
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
