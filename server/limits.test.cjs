'use strict';
// Schutz gegen Überlastung ohne Anmeldung: npm run test:server
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-limits-'));
process.env.DATA_DIR = dataDir;
process.env.ADMIN_PASSWORD = 'test-admin-passwort';
process.env.MAX_SESSIONS = '4';
process.env.MAX_STORAGE_MB = '1';

// Vorhandene Daten vor dem Start: eine gültige und eine abgelaufene Session.
fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true });
const project = (n = 1, pad = 0) => ({ meta: { format: 'netzwerk-simulator', version: 1 }, topology: { devices: Array.from({ length: n }, (_, i) => ({ id: `d${i + 1}`, ...(pad ? { note: 'x'.repeat(pad) } : {}) })), cables: [], nextId: n + 1 }, configuration: {} });
const old = { code: 'AAAA-AAAA', created: 1, updated: 1, expires: Date.now() + 3_600_000, classCode: null, project: project() };
fs.writeFileSync(path.join(dataDir, 'sessions', 'AAAA-AAAA.json'), JSON.stringify(old));
fs.writeFileSync(path.join(dataDir, 'sessions', 'BBBB-BBBB.json'), JSON.stringify({ ...old, code: 'BBBB-BBBB', expires: 5 }));

const { createServer } = require('./app.cjs');
let server;
let base;

async function call(method, url, body, headers = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
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

before(async () => {
  server = createServer();
  await server.ready;
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('Verzeichnis beim Start: vorhandene Sessions gezählt, abgelaufene gelöscht', async () => {
  assert.equal(fs.existsSync(path.join(dataDir, 'sessions', 'BBBB-BBBB.json')), false);
  const login = await call('POST', '/api/admin/login', { password: 'test-admin-passwort' });
  const overview = await call('GET', '/api/admin/overview', undefined, { Authorization: `Bearer ${login.data.token}` });
  assert.equal(overview.data.sessions, 1);
  assert.equal(overview.data.storage.maxSessions, 4);
  assert.ok(overview.data.storage.bytes > 0);
  assert.equal((await call('GET', '/api/sessions/AAAA-AAAA')).data.code, 'AAAA-AAAA');
});

test('zu grosse Projekte werden abgewiesen (413)', async () => {
  const res = await call('POST', '/api/sessions', { project: project(1, 1_100_000) }, { 'X-Forwarded-For': '192.0.2.10' });
  assert.equal(res.status, 413);
});

test('Gesamtgrenze: Platz und Anzahl voll → 507, Löschen gibt wieder frei', async () => {
  const xff = { 'X-Forwarded-For': '192.0.2.11' };
  // 1 MB Speicher: zwei Projekte mit je ~400 KB passen, das dritte nicht.
  const a = await call('POST', '/api/sessions', { project: project(1, 400_000) }, xff);
  const b = await call('POST', '/api/sessions', { project: project(1, 400_000) }, xff);
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  const c = await call('POST', '/api/sessions', { project: project(1, 400_000) }, xff);
  assert.deepEqual([c.status, c.data.error], [507, 'storageFull']);
  // Ein bestehendes Projekt vergrössern geht ebenfalls nicht.
  assert.equal((await call('PUT', `/api/sessions/${a.data.code}`, { project: project(1, 700_000) }, xff)).status, 507);
  // Kleine Sessions bis zur Höchstzahl (4), dann voll.
  assert.equal((await call('POST', '/api/sessions', { project: project() }, xff)).status, 201);
  assert.equal((await call('POST', '/api/sessions', { project: project() }, xff)).status, 507);
  // Löschen gibt Platz frei.
  assert.equal((await call('DELETE', `/api/sessions/${b.data.code}`, undefined, xff)).status, 200);
  assert.equal((await call('POST', '/api/sessions', { project: project() }, xff)).status, 201);
});

test('Ratenbegrenzung je Adresse hinter dem Proxy (X-Forwarded-For)', async () => {
  // Neue Sessions: höchstens 60 pro Minute und Adresse; die Speichergrenze ist hier schon erreicht (507),
  // gezählt werden die Anfragen trotzdem.
  const one = { 'X-Forwarded-For': '203.0.113.5, 198.51.100.7' };
  let last;
  for (let i = 0; i < 61; i++) last = await call('POST', '/api/sessions', { project: project() }, one);
  assert.equal(last.status, 429);
  // Eine andere Adresse ist nicht betroffen; der erste (vom Absender gefälschte) Eintrag zählt nicht.
  const other = await call('POST', '/api/sessions', { project: project() }, { 'X-Forwarded-For': '203.0.113.5, 198.51.100.8' });
  assert.notEqual(other.status, 429);
});

test('Prüfungsplätze funktionieren auch bei vollem Speicher', async () => {
  const login = await call('POST', '/api/admin/login', { password: 'test-admin-passwort' });
  const auth = { Authorization: `Bearer ${login.data.token}` };
  const learner = { ...project(), tasks: { title: 'P', goals: [], exam: { id: 'E1', minutes: 10 } } };
  const exam = await call('POST', '/api/admin/exams', { label: 'Test', learner, seats: 1 }, auth);
  assert.equal(exam.status, 201);
  await call('POST', `/api/admin/exams/${exam.data.id}/start`, undefined, auth);
  const join = await call('POST', '/api/exams/join', { seatCode: exam.data.seats[0].code }, { 'X-Forwarded-For': '192.0.2.20' });
  assert.ok(join.data.session);
  const save = await call('PUT', `/api/sessions/${join.data.session}`, { project: learner }, { 'X-Forwarded-For': '192.0.2.20' });
  assert.equal(save.status, 200);
});
