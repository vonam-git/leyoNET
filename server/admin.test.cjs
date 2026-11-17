'use strict';
// Admin-Konsole: Zwei-Faktor-Anmeldung, Statistik der Sessions, Verlängern und Löschen.
// npm run test:server
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-admin-'));
process.env.DATA_DIR = dataDir;
process.env.ADMIN_PASSWORD = 'test-admin-passwort';
const { createServer } = require('./app.cjs');

let server;
let base;
const project = (n = 1) => ({ meta: { format: 'netzwerk-simulator', version: 1 }, topology: { devices: Array.from({ length: n }, (_, i) => ({ id: `d${i + 1}` })), cables: [], nextId: n + 1 }, configuration: {} });

async function call(method, url, body, token) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

/** Eigene Rechnung nach RFC 6238 (unabhängig vom Server), um Codes wie eine App zu erzeugen. */
function totp(secret, offset = 0) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offset));
  const h = crypto.createHmac('sha1', key).update(msg).digest();
  const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
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

test('Zwei-Faktor: einrichten, anmelden nur mit Code, kein Code zweimal, Wiederherstellung, Sperre, Zurücksetzen', async () => {
  const admin = (await call('POST', '/api/admin/login', { password: 'test-admin-passwort' })).data.token;
  const created = (await call('POST', '/api/admin/tenants', { label: 'LP Test', role: 'teacher' }, admin)).data;
  const key = created.key;
  const login = (code) => call('POST', '/api/admin/login', { password: key, ...(code !== undefined ? { code } : {}) });
  const teacher = (await login()).data.token;

  // Ohne Einrichtung: ausschalten geht nicht, bestätigen ohne Einrichtung auch nicht.
  assert.equal((await call('POST', '/api/admin/mfa/enable', { code: '123456' }, teacher)).data.error, 'mfaNoSetup');
  const setup = (await call('POST', '/api/admin/mfa/setup', {}, teacher)).data;
  assert.match(setup.secret, /^[A-Z2-7]{32}$/);
  assert.match(setup.uri, /^otpauth:\/\/totp\/leyoNET:LP%20Test\?secret=[A-Z2-7]{32}&issuer=leyoNET/);
  assert.equal((await call('POST', '/api/admin/mfa/enable', { code: '000000' }, teacher)).status, 401);
  const enabled = (await call('POST', '/api/admin/mfa/enable', { code: totp(setup.secret, -1) }, teacher)).data;
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.recovery.length, 8);
  // Das Geheimnis liegt nicht lesbar im Datenordner, die Wiederherstellungscodes nur als Hash.
  const stored = fs.readFileSync(path.join(dataDir, 'tenants', `${created.id}.json`), 'utf8');
  assert.ok(!stored.includes(setup.secret));
  assert.ok(!stored.includes(enabled.recovery[0]));

  // Anmelden: Passwort allein reicht nicht mehr; falscher Code abgewiesen.
  const noCode = await login();
  assert.equal(noCode.status, 401);
  assert.equal(noCode.data.error, 'mfaRequired');
  assert.equal(noCode.data.token, undefined);
  assert.equal((await login('111111')).data.error, 'wrongCode');
  const code = totp(setup.secret, 0);
  const ok = await login(code);
  assert.equal(ok.status, 200);
  assert.ok(ok.data.token);
  // Derselbe Code ein zweites Mal: abgewiesen (abgefangener Code nützt nichts).
  assert.equal((await login(code)).data.error, 'wrongCode');
  // Wiederherstellungscode gilt genau einmal.
  assert.equal((await login(enabled.recovery[0].toLowerCase())).status, 200);
  assert.equal((await login(enabled.recovery[0])).data.error, 'wrongCode');
  // Nach 5 Fehlversuchen gesperrt, auch mit richtigem Code.
  for (let i = 0; i < 4; i++) await login('222222');
  assert.equal((await login(enabled.recovery[1])).status, 429);

  // Status für die eigene Seite: an, 7 Codes übrig, letzte Anmeldung bekannt.
  const me = (await call('GET', '/api/admin/me', null, ok.data.token)).data;
  assert.equal(me.mfa.enabled, true);
  assert.equal(me.mfa.recoveryLeft, 7);
  assert.ok(me.previousLogin > 0);
  assert.ok(me.logins >= 2);

  // Hauptadmin setzt zurück (Handy verloren): Anmeldungen des Zugangs enden, danach ohne Code.
  const tenants = (await call('GET', '/api/admin/tenants', null, admin)).data;
  assert.equal(tenants.find((x) => x.id === created.id).mfa, true);
  const reset = (await call('DELETE', `/api/admin/tenants/${created.id}/mfa`, null, admin)).data;
  assert.equal(reset.mfa, false);
  assert.equal((await call('GET', '/api/admin/me', null, ok.data.token)).status, 401);
  assert.equal((await login()).status, 200);
});

test('Zwei-Faktor für alle verlangen: erst selbst einrichten; Zugänge ohne Code dürfen nur einrichten', async () => {
  const admin = (await call('POST', '/api/admin/login', { password: 'test-admin-passwort' })).data.token;
  const settings = (await call('GET', '/api/admin/overview', null, admin)).data.settings;
  assert.equal((await call('PUT', '/api/admin/settings', { ...settings, mfaRequired: true }, admin)).data.error, 'mfaOwnFirst');
  const setup = (await call('POST', '/api/admin/mfa/setup', {}, admin)).data;
  const enabled = (await call('POST', '/api/admin/mfa/enable', { code: totp(setup.secret, 0) }, admin)).data;
  assert.equal(enabled.enabled, true);
  assert.equal((await call('PUT', '/api/admin/settings', { ...settings, mfaRequired: true }, admin)).data.mfaRequired, true);
  // Ausschalten geht nicht, solange es für alle verlangt ist.
  assert.equal((await call('POST', '/api/admin/mfa/disable', { code: enabled.recovery[0] }, admin)).data.error, 'mfaRequired');

  const created = (await call('POST', '/api/admin/tenants', { label: 'LP Pflicht', role: 'teacher' }, admin)).data;
  const first = (await call('POST', '/api/admin/login', { password: created.key })).data;
  assert.equal(first.mfaSetup, true);
  // Nur Einrichten und Abmelden: keine Klassen, Prüfungen, Statistik.
  for (const url of ['/api/admin/overview', '/api/admin/stats', '/api/admin/exams']) assert.equal((await call('GET', url, null, first.token)).data.error, 'mfaSetupRequired');
  assert.equal((await call('POST', '/api/admin/classes', { label: 'X' }, first.token)).data.error, 'mfaSetupRequired');
  assert.equal((await call('GET', '/api/admin/me', null, first.token)).data.mfa.setupNeeded, true);
  const own = (await call('POST', '/api/admin/mfa/setup', {}, first.token)).data;
  await call('POST', '/api/admin/mfa/enable', { code: totp(own.secret, 0) }, first.token);
  assert.equal((await call('GET', '/api/admin/overview', null, first.token)).status, 200);

  // Wieder ausschalten für die übrigen Tests (Hauptadmin mit Wiederherstellungscode).
  await call('PUT', '/api/admin/settings', { ...settings, mfaRequired: false }, admin);
  assert.equal((await call('POST', '/api/admin/mfa/disable', { code: enabled.recovery[1] }, admin)).data.enabled, false);
  // Der Hauptadmin kann sich wieder nur mit dem Passwort anmelden.
  assert.equal((await call('POST', '/api/admin/login', { password: 'test-admin-passwort' })).status, 200);
});

test('Statistik: aktive Sessions ohne Projekte und Geheimnisse, Zugänge sehen nur ihre Klassen; verlängern und löschen', async () => {
  const admin = (await call('POST', '/api/admin/login', { password: 'test-admin-passwort' })).data.token;
  const created = (await call('POST', '/api/admin/tenants', { label: 'LP Statistik', role: 'teacher' }, admin)).data;
  const teacher = (await call('POST', '/api/admin/login', { password: created.key })).data.token;
  const own = (await call('POST', '/api/admin/classes', { label: 'Eigene' }, teacher)).data;
  const other = (await call('POST', '/api/admin/classes', { label: 'Fremde' }, admin)).data;
  const inOwn = (await call('POST', '/api/sessions', { classCode: own.code, project: project(2) })).data;
  const inOther = (await call('POST', '/api/sessions', { classCode: other.code, project: project(1) })).data;
  const single = (await call('POST', '/api/sessions', { project: project(1) })).data;
  // Gesperrte Session: der PIN-Hash darf nirgends erscheinen.
  await fetch(`${base}/api/sessions/${single.code}/lock`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Leyonet-Writer': single.writer }, body: JSON.stringify({ pin: '4711' }) });

  const all = (await call('GET', '/api/admin/stats', null, admin)).data;
  const codes = all.sessions.map((s) => s.code);
  for (const c of [inOwn.code, inOther.code, single.code]) assert.ok(codes.includes(c), c);
  assert.ok(all.counts.single >= 1 && all.counts.class >= 2);
  assert.ok(all.storage.maxBytes > 0);
  const row = all.sessions.find((s) => s.code === single.code);
  assert.equal(row.kind, 'single');
  assert.equal(row.locked, true);
  const text = JSON.stringify(all);
  for (const secret of ['writer', 'salt', 'hash', 'project', 'topology']) assert.ok(!text.includes(`"${secret}"`), secret);

  const mine = (await call('GET', '/api/admin/stats', null, teacher)).data;
  assert.deepEqual(mine.sessions.map((s) => s.code), [inOwn.code]);
  assert.equal(mine.sessions[0].group, 'Eigene');
  assert.equal(mine.storage, null);
  // Fremde Session: für die Lehrperson nicht da (weder ansehen noch verlängern noch löschen).
  assert.equal((await call('PATCH', `/api/admin/sessions/${inOther.code}`, { extendHours: 24 }, teacher)).status, 404);
  assert.equal((await call('DELETE', `/api/admin/sessions/${inOther.code}`, null, teacher)).status, 404);

  // Verlängern: höchstens 30 Tage auf einmal, gültige Werte nötig.
  assert.equal((await call('PATCH', `/api/admin/sessions/${inOwn.code}`, { extendHours: 0 }, teacher)).status, 400);
  const before = mine.sessions[0].expires;
  const longer = (await call('PATCH', `/api/admin/sessions/${inOwn.code}`, { extendHours: 48 }, teacher)).data;
  assert.ok(longer.expires >= before + 47 * 3_600_000);
  // Löschen.
  assert.equal((await call('DELETE', `/api/admin/sessions/${inOwn.code}`, null, teacher)).status, 200);
  assert.equal((await call('GET', `/api/sessions/${inOwn.code}`)).status, 404);
  // Ohne Anmeldung: nichts.
  assert.equal((await call('GET', '/api/admin/stats')).status, 401);
});

test('Prüfungsplätze lassen sich in der Statistik weder verlängern noch einzeln löschen', async () => {
  const admin = (await call('POST', '/api/admin/login', { password: 'test-admin-passwort' })).data.token;
  const learner = { ...project(0), tasks: { title: 'P', goals: [], exam: { id: 'P-STAT', variant: '1' } } };
  const exam = (await call('POST', '/api/admin/exams', { label: 'Statistik', learner, seats: 1, minutes: 10 }, admin)).data;
  await call('POST', `/api/admin/exams/${exam.id}/start`, {}, admin);
  const join = (await call('POST', '/api/exams/join', { seatCode: exam.seats[0].code })).data;
  const row = (await call('GET', '/api/admin/stats', null, admin)).data.sessions.find((s) => s.code === join.session);
  assert.equal(row.kind, 'exam');
  assert.equal(row.group, 'Statistik');
  assert.equal((await call('PATCH', `/api/admin/sessions/${join.session}`, { extendHours: 1 }, admin)).data.error, 'examSession');
  assert.equal((await call('DELETE', `/api/admin/sessions/${join.session}`, null, admin)).data.error, 'examSession');
});
