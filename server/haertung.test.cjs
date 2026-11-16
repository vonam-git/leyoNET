'use strict';
// Härtung nach der Sicherheitsprüfung vom November 2026: npm run test:server
// Der Server lauscht hier wie unter Phusion Passenger an einem Unix-Socket (ohne Absenderadresse);
// die Adresse der Anfragenden kommt aus dem Weiterleitungs-Kopf des Proxys.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-haertung-'));
process.env.DATA_DIR = dataDir;
process.env.ADMIN_PASSWORD = 'test-admin-passwort';
const { createServer, rateAddress, _leases } = require('./app.cjs');

const socketPath = process.platform === 'win32' ? `\\\\.\\pipe\\leyonet-test-${process.pid}` : path.join(dataDir, 'app.sock');
const project = (n = 1) => ({ meta: { format: 'netzwerk-simulator', version: 1 }, topology: { devices: Array.from({ length: n }, (_, i) => ({ id: `d${i + 1}` })), cables: [], nextId: n + 1 }, configuration: {} });
let server;

/** Anfrage über den Socket; `slowMs` schickt den Inhalt in zwei Teilen mit Pause (langsame Leitung). */
function call(method, url, body, headers = {}, slowMs = 0) {
  return new Promise((resolve, reject) => {
    const data = body === undefined || body === null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({ socketPath, path: url, method, headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}), ...headers } }, (res) => {
      let text = '';
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => {
        let parsed = text;
        try {
          parsed = JSON.parse(text);
        } catch {
          // kein JSON
        }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('error', reject);
    if (data && slowMs) {
      req.write(data.subarray(0, 10));
      setTimeout(() => req.end(data.subarray(10)), slowMs);
    } else req.end(data || undefined);
  });
}
const from = (address) => ({ 'X-Forwarded-For': address });
const login = async (password, address = '192.0.2.200') => call('POST', '/api/admin/login', { password }, from(address));

before(async () => {
  server = createServer();
  await server.ready;
  await new Promise((r) => server.listen(socketPath, r));
});

after(() => {
  server.closeAllConnections();
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('Adresse für die Ratenbegrenzung: IPv4 unverändert, IPv6 auf das /64-Netz gekürzt', () => {
  assert.equal(rateAddress('203.0.113.7'), '203.0.113.7');
  assert.equal(rateAddress('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(rateAddress('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
  assert.equal(rateAddress('2001:db8:1:2::1'), rateAddress('2001:0db8:0001:0002:ffff:ffff:ffff:ffff'));
  assert.notEqual(rateAddress('2001:db8:1:2::1'), rateAddress('2001:db8:1:3::1'));
  assert.equal(rateAddress('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(rateAddress('fe80::1%eth0'), 'fe80:0:0:0::/64');
  assert.equal(rateAddress(''), '');
});

test('hinter dem Proxy am Unix-Socket: Fehlversuche einer Adresse sperren die anderen nicht', async () => {
  const created = await call('POST', '/api/sessions', { project: project() }, from('203.0.113.9'));
  assert.equal(created.status, 201);
  let last;
  for (let i = 0; i < 31; i++) last = await call('GET', `/api/sessions/AAAA-BBB${'23456789'[i % 8]}`, null, from('198.51.100.1'));
  assert.equal(last.status, 429, 'wer rät, wird gebremst');
  const other = await call('GET', `/api/sessions/${created.data.code}?watch=1`, null, from('203.0.113.77'));
  assert.equal(other.status, 200, 'eine andere Adresse arbeitet weiter');
  // Dasselbe /64-Netz zählt als eine Adresse.
  for (let i = 0; i < 31; i++) last = await call('GET', '/api/sessions/AAAA-BBB2', null, from(`2001:db8:9:9::${(i + 1).toString(16)}`));
  assert.equal(last.status, 429);
  assert.equal((await call('GET', `/api/sessions/${created.data.code}?watch=1`, null, from('2001:db8:9:8::1'))).status, 200);
});

test('Speichern über eine langsame Leitung überschreibt eine inzwischen gesetzte Sperre nicht', async () => {
  const created = (await call('POST', '/api/sessions', { project: project() }, from('203.0.113.20'))).data;
  const headers = { ...from('203.0.113.20'), 'X-Leyonet-Writer': created.writer };
  const slow = call('PUT', `/api/sessions/${created.code}`, { project: project(3) }, headers, 400);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal((await call('POST', `/api/sessions/${created.code}/lock`, { pin: '4711' }, headers)).data.locked, true);
  assert.equal((await slow).status, 200);
  const seen = (await call('GET', `/api/sessions/${created.code}?watch=1`, null, from('203.0.113.21'))).data;
  assert.equal(seen.locked, true, 'die Sperre bleibt');
  assert.equal(seen.project.topology.devices.length, 3, 'der neue Stand ist gespeichert');
});

test('gelöschte Session kommt durch ein laufendes Speichern nicht zurück', async () => {
  const created = (await call('POST', '/api/sessions', { project: project() }, from('203.0.113.30'))).data;
  const headers = { ...from('203.0.113.30'), 'X-Leyonet-Writer': created.writer };
  const slow = call('PUT', `/api/sessions/${created.code}`, { project: project(2) }, headers, 400);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal((await call('DELETE', `/api/sessions/${created.code}`, null, headers)).data.deleted, true);
  assert.equal((await slow).status, 404);
  assert.equal((await call('GET', `/api/sessions/${created.code}?watch=1`, null, from('203.0.113.31'))).status, 404);
});

test('Sperren mit PIN hat eine eigene, enge Grenze', async () => {
  const created = (await call('POST', '/api/sessions', { project: project() }, from('203.0.113.40'))).data;
  const headers = { ...from('203.0.113.40'), 'X-Leyonet-Writer': created.writer };
  let last;
  for (let i = 0; i < 21; i++) last = await call('POST', `/api/sessions/${created.code}/lock`, { pin: '4711' }, headers);
  assert.equal(last.status, 429);
});

test('Anmeldung: falsche Passwörter sperren Zugangsschlüssel derselben Adresse nicht aus', async () => {
  const admin = (await login('test-admin-passwort', '192.0.2.1')).data.token;
  const teacher = await call('POST', '/api/admin/tenants', { label: 'LP 1', role: 'teacher' }, { ...from('192.0.2.1'), Authorization: `Bearer ${admin}` });
  assert.equal(teacher.status, 201);
  // Jemand im Schulnetz probiert Passwörter, bis die Grenze erreicht ist.
  for (let i = 0; i < 12; i++) await login(`falsch-${i}`, '192.0.2.50');
  assert.equal((await login('test-admin-passwort', '192.0.2.50')).status, 429, 'Passwort: gebremst');
  const ok = await login(teacher.data.key, '192.0.2.50');
  assert.equal(ok.status, 200, 'Zugangsschlüssel: weiterhin möglich');
  assert.equal(ok.data.role, 'teacher');
  // Ein falscher Schlüssel bleibt falsch.
  assert.equal((await login(`${teacher.data.key.slice(0, -1)}${teacher.data.key.endsWith('A') ? 'B' : 'A'}`, '192.0.2.50')).status, 401);
});

test('Prüfungsplatz: anderes Gerät nur nach Freigabe, nach der Abgabe keine Arbeit mehr, Lesen nur im SEB', async () => {
  const token = (await login('test-admin-passwort', '192.0.2.2')).data.token;
  const adminHeaders = { ...from('192.0.2.2'), Authorization: `Bearer ${token}` };
  const learner = { ...project(0), tasks: { title: 'Härtung', goals: [], exam: { id: 'P-HART', variant: '1' } } };
  const exam = (await call('POST', '/api/admin/exams', { label: 'Härtung', learner, seats: 2, minutes: 30 }, adminHeaders)).data;
  await call('POST', `/api/admin/exams/${exam.id}/start`, {}, adminHeaders);
  const seatCode = exam.seats[0].code;
  const first = (await call('POST', '/api/exams/join', { seatCode }, from('203.0.113.50'))).data;
  assert.equal(first.fresh, true);
  const work = { ...project(4), tasks: learner.tasks };
  assert.equal((await call('PUT', `/api/sessions/${first.session}`, { project: work }, { ...from('203.0.113.50'), 'X-Leyonet-Writer': first.writer })).status, 200);

  // Das erste Gerät ist still (z.B. Notebook zugeklappt): Ein anderes kommt trotzdem nicht hinein.
  _leases.clear();
  const other = await call('POST', '/api/exams/join', { seatCode }, from('203.0.113.51'));
  assert.equal(other.status, 409);
  assert.equal(other.data.error, 'seatInUse');
  assert.equal(other.data.project, undefined);
  assert.equal((await call('GET', `/api/sessions/${first.session}`, null, from('203.0.113.51'))).data.error, 'sessionInUse');
  // Das erste Gerät arbeitet weiter.
  assert.equal((await call('POST', '/api/exams/join', { seatCode, writer: first.writer }, from('203.0.113.50'))).data.session, first.session);
  // Nach der Freigabe durch die Lehrperson übernimmt das andere Gerät.
  await call('POST', `/api/admin/exams/${exam.id}/seats/01/release`, {}, adminHeaders);
  const taken = (await call('POST', '/api/exams/join', { seatCode }, from('203.0.113.51'))).data;
  assert.equal(taken.project.topology.devices.length, 4);

  // Ende: Mit dem Platz-Code kommt die Abgabe nicht mehr heraus, auch nicht für das eigene Gerät.
  await call('POST', `/api/admin/exams/${exam.id}/end`, {}, adminHeaders);
  await call('POST', `/api/admin/exams/${exam.id}/seats/01/release`, {}, adminHeaders);
  const closed = (await call('POST', '/api/exams/join', { seatCode, writer: taken.writer }, from('203.0.113.51'))).data;
  assert.equal(closed.exam.state, 'closed');
  assert.equal(closed.project, undefined);
  assert.equal(closed.session, undefined);
  // Die Lehrperson wertet weiterhin aus.
  assert.equal((await call('GET', `/api/admin/exams/${exam.id}/submissions`, null, adminHeaders)).data.submissions.length, 1);

  // SEB-Pflicht gilt auch beim Lesen der Session.
  const sebExam = (await call('POST', '/api/admin/exams', { label: 'Härtung SEB', learner: { ...learner, tasks: { ...learner.tasks, exam: { id: 'P-HSEB', variant: '1' } } }, seats: 1, seb: true }, adminHeaders)).data;
  await call('POST', `/api/admin/exams/${sebExam.id}/start`, {}, adminHeaders);
  const ua = { ...from('203.0.113.60'), 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 SEB/3.8' };
  const inSeb = (await call('POST', '/api/exams/join', { seatCode: sebExam.seats[0].code, sebKey: sebExam.seb.key }, ua)).data;
  assert.ok(inSeb.session);
  assert.equal((await call('GET', `/api/sessions/${inSeb.session}?watch=1`, null, from('203.0.113.61'))).data.error, 'sebRequired');
  assert.equal((await call('GET', `/api/sessions/${inSeb.session}`, null, { ...ua, 'X-Leyonet-Writer': inSeb.writer })).data.error, 'sebRequired');
  assert.equal((await call('GET', `/api/sessions/${inSeb.session}`, null, { ...ua, 'X-Leyonet-Writer': inSeb.writer, 'X-Leyonet-Seb': sebExam.seb.key })).status, 200);
  // Die Lehrperson sieht den Platz über die Admin-Konsole.
  assert.equal((await call('GET', `/api/admin/sessions/${inSeb.session}`, null, adminHeaders)).status, 200);
});

test('Platz-Codes: gelöschte Prüfung ist sofort unbekannt, neue sofort bekannt', async () => {
  const token = (await login('test-admin-passwort', '192.0.2.3')).data.token;
  const adminHeaders = { ...from('192.0.2.3'), Authorization: `Bearer ${token}` };
  const learner = { ...project(0), tasks: { title: 'Verzeichnis', goals: [], exam: { id: 'P-VERZ', variant: '1' } } };
  const exam = (await call('POST', '/api/admin/exams', { label: 'Verzeichnis', learner, seats: 1 }, adminHeaders)).data;
  const seatCode = exam.seats[0].code;
  assert.equal((await call('POST', '/api/exams/join', { seatCode }, from('203.0.113.70'))).data.exam.state, 'waiting');
  // Zusatzminuten vor dem Start bleiben beim Start erhalten (Stand wird nicht aus einer alten Kopie überschrieben).
  await call('POST', `/api/admin/exams/${exam.id}/seats/01/extra`, { minutes: 5 }, adminHeaders);
  const started = (await call('POST', `/api/admin/exams/${exam.id}/start`, {}, adminHeaders)).data;
  assert.equal(started.seats[0].extra, 5);
  assert.equal((await call('POST', '/api/exams/join', { seatCode }, from('203.0.113.70'))).data.exam.state, 'open');
  await call('DELETE', `/api/admin/exams/${exam.id}`, null, adminHeaders);
  assert.equal((await call('POST', '/api/exams/join', { seatCode }, from('203.0.113.70'))).status, 404);
});
