'use strict';
// Mengengrenzen je Zugang und je Klasse, keine Admin-Pfade mit beliebigem Zusatz.
// npm run test:server
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-mengen-'));
process.env.DATA_DIR = dataDir;
process.env.ADMIN_PASSWORD = 'test-admin-passwort';
process.env.MAX_CLASSES_PER_TENANT = '2';
process.env.MAX_EXAMS_PER_TENANT = '1';
process.env.MAX_SESSIONS_PER_CLASS = '2';
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
  return { status: res.status, data: await res.json().catch(() => null) };
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

test('Mengengrenzen: Klassen und Prüfungen je Zugang, Sessions je Klasse; Hauptadmin ausgenommen', async () => {
  const admin = (await call('POST', '/api/admin/login', { password: 'test-admin-passwort' })).data.token;
  const key = (await call('POST', '/api/admin/tenants', { label: 'LP Menge', role: 'teacher' }, admin)).data.key;
  const teacher = (await call('POST', '/api/admin/login', { password: key })).data.token;
  const first = (await call('POST', '/api/admin/classes', { label: 'A' }, teacher)).data;
  assert.equal((await call('POST', '/api/admin/classes', { label: 'B' }, teacher)).status, 201);
  const third = await call('POST', '/api/admin/classes', { label: 'C' }, teacher);
  assert.deepEqual([third.status, third.data.error], [507, 'quotaExceeded']);
  // Nach dem Löschen geht es wieder.
  assert.equal((await call('DELETE', `/api/admin/classes/${first.code}`, null, teacher)).status, 200);
  const again = (await call('POST', '/api/admin/classes', { label: 'C' }, teacher)).data;
  assert.ok(again.code);
  // Der Hauptadmin hat keine Grenze.
  for (const l of ['X', 'Y', 'Z']) assert.equal((await call('POST', '/api/admin/classes', { label: l }, admin)).status, 201);

  const learner = { ...project(0), tasks: { title: 'P', goals: [], exam: { id: 'P-MENGE', variant: '1' } } };
  assert.equal((await call('POST', '/api/admin/exams', { label: 'P1', learner, seats: 1, minutes: 10 }, teacher)).status, 201);
  assert.equal((await call('POST', '/api/admin/exams', { label: 'P2', learner, seats: 1, minutes: 10 }, teacher)).data.error, 'quotaExceeded');
  assert.equal((await call('POST', '/api/admin/exams', { label: 'P2', learner, seats: 1, minutes: 10 }, admin)).status, 201);

  // Sessions je Klasse.
  for (let i = 0; i < 2; i++) assert.equal((await call('POST', '/api/sessions', { classCode: again.code, project: project(1) })).status, 201);
  const full = await call('POST', '/api/sessions', { classCode: again.code, project: project(1) });
  assert.deepEqual([full.status, full.data.error], [507, 'classFull']);
});

test('Admin-Pfade mit beliebigem Zusatz wirken nicht wie ohne', async () => {
  const admin = (await call('POST', '/api/admin/login', { password: 'test-admin-passwort' })).data.token;
  const cls = (await call('POST', '/api/admin/classes', { label: 'Zusatz' }, admin)).data;
  const s = (await call('POST', '/api/sessions', { classCode: cls.code, project: project(1) })).data;
  assert.equal((await call('DELETE', `/api/admin/sessions/${s.code}/beliebig`, null, admin)).status, 404);
  assert.equal((await call('PATCH', `/api/admin/sessions/${s.code}/beliebig`, { extendHours: 2 }, admin)).status, 404);
  assert.equal((await call('POST', `/api/admin/sessions/${s.code}/help/x`, {}, admin)).status, 404);
  assert.equal((await call('GET', `/api/sessions/${s.code}?watch=1`)).status, 200, 'Session noch da');
  assert.equal((await call('PATCH', `/api/admin/classes/${cls.code}/beliebig`, { label: 'Neu' }, admin)).status, 404);
  assert.equal((await call('DELETE', `/api/admin/classes/${cls.code}/beliebig`, null, admin)).status, 404);
  assert.equal((await call('GET', `/api/admin/classes/${cls.code}/sessions/x`, null, admin)).status, 404);
  assert.equal((await call('GET', `/api/admin/classes/${cls.code}/sessions`, null, admin)).status, 200);
  assert.equal((await call('PATCH', `/api/admin/sessions/${s.code}`, { extendHours: 2 }, admin)).status, 200);
});
