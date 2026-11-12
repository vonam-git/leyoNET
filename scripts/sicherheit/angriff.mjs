#!/usr/bin/env node
/**
 * Sicherheitsprüfung von aussen («White-Hat»): greift den Server und die Website so an, wie
 * es jemand aus dem Internet versuchen würde, und meldet jede Schwachstelle.
 *
 *   node scripts/sicherheit/angriff.mjs
 *     Lokal (bei jedem Release): startet den Server mit leerem Datenordner auf einem freien
 *     Port und führt ALLE Angriffe aus, auch solche, die Daten anlegen oder die Ratenbegrenzung
 *     auslösen.
 *
 *   node scripts/sicherheit/angriff.mjs --live --app https://app.leyonet.ch --site https://leyonet.ch
 *     Gegen die echten Seiten (GitHub Actions, wöchentlich und nach jedem Release): nur
 *     lesende und abgewiesene Anfragen, keine neuen Daten, höchstens zwei falsche Anmeldungen,
 *     Pausen zwischen den Anfragen. Mehrere --app/--site sind erlaubt.
 *
 * Ergebnis: Bericht (Markdown) auf stdout und in sicherheit-bericht.md; Exitcode 1 bei
 * Befunden der Stufe «hoch» oder «mittel». Ohne Abhängigkeiten (Node 20+).
 * Geprüft wird, was in docs/sicherheit.md als Massnahme steht; neue Massnahmen hier ergänzen.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { connect as tlsConnect } from 'node:tls';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const listOf = (flag) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1].replace(/\/+$/, '')] : []));
const UA = 'leyoNET-Sicherheitspruefung/1 (+https://github.com/vonam-git/leyoNET/blob/main/docs/sicherheit.md)';
const PAUSE_MS = LIVE ? 350 : 0;
const LOCAL_ADMIN_PASSWORD = 'sicherheitspruefung-admin-passwort';

// --- Befunde ---------------------------------------------------------------------------------

/** @type {{ target: string; id: string; title: string; level: 'hoch' | 'mittel' | 'hinweis'; ok: boolean; detail: string }[]} */
const results = [];
function check(target, id, title, level, ok, detail = '') {
  results.push({ target, id, title, level, ok: !!ok, detail });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, init = {}) {
  await sleep(PAUSE_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: 'manual', ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(20_000) });
    const body = init.method === 'HEAD' ? '' : await res.text();
    return { status: res.status, headers: res.headers, body, ms: Date.now() - started };
  } catch (error) {
    return { status: 0, headers: new Headers(), body: '', error: String(error?.cause?.code || error?.message || error), ms: Date.now() - started };
  }
}

/** Anfrage mit beliebiger Methode (für TRACE, das fetch() nicht erlaubt). */
async function rawRequest(url, method, headers = {}) {
  await sleep(PAUSE_MS);
  return new Promise((resolve) => {
    const req = (url.startsWith('https:') ? httpsRequest : httpRequest)(url, { method, headers: { 'User-Agent': UA, ...headers }, timeout: 15_000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (body += d.slice(0, 10_000)));
      res.on('end', () => resolve({ status: res.statusCode || 0, body }));
    });
    req.on('error', (e) => resolve({ status: 0, body: '', error: e.code || e.message }));
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end();
  });
}

/** Antwort verrät Programminterna (Stacktrace, Pfade, Versionen)? */
const leaks = (body) => /\bat [\w.<>]+ \(|\/home\/|\/var\/www\/|node:internal|\.cjs:\d+|Error: [A-Z]?[a-z]+.*\n\s+at /.test(body);

/** Inhalt sieht nach Quellcode, Konfiguration oder Git aus? */
const looksSensitive = (body) => /\[core\]|repositoryformatversion|ref: refs\/|require\(|module\.exports|"devDependencies"|ADMIN_PASSWORD|<\?php|Index of \//.test(body);

function headerChecks(target, res, { https, html }) {
  const h = (n) => res.headers.get(n) || '';
  const csp = h('content-security-policy');
  if (html) {
    check(target, 'csp', 'Content-Security-Policy vorhanden und streng', 'mittel', /default-src 'none'/.test(csp) && !/unsafe-eval/.test(csp) && !/script-src[^;]*unsafe-inline/.test(csp) && !/script-src[^;]*(\*|https?:)/.test(csp), csp || 'fehlt');
    check(target, 'frame', 'Einbetten in fremde Seiten verboten (Clickjacking)', 'mittel', /frame-ancestors 'none'/.test(csp) || /deny/i.test(h('x-frame-options')), `${csp.match(/frame-ancestors[^;]*/)?.[0] || ''} ${h('x-frame-options')}`.trim() || 'fehlt');
  }
  check(target, 'nosniff', 'X-Content-Type-Options: nosniff', 'mittel', /nosniff/i.test(h('x-content-type-options')), h('x-content-type-options') || 'fehlt');
  check(target, 'referrer', 'Referrer-Policy ohne Weitergabe', 'hinweis', /no-referrer|same-origin|strict-origin/.test(h('referrer-policy')), h('referrer-policy') || 'fehlt');
  if (https) {
    const hsts = h('strict-transport-security');
    const age = Number(hsts.match(/max-age=(\d+)/)?.[1] || 0);
    check(target, 'hsts', 'HTTPS erzwungen (HSTS, mindestens 180 Tage)', 'mittel', age >= 15_552_000, hsts || 'fehlt');
  }
  check(target, 'cookies', 'Keine Cookies (Datenschutz: keine Cookies, kein Tracking)', 'hoch', !h('set-cookie'), h('set-cookie') ? 'Set-Cookie gesendet' : '');
  const server = `${h('server')} ${h('x-powered-by')}`.trim();
  check(target, 'banner', 'Server verrät keine Softwareversion', 'hinweis', !/\d+\.\d+/.test(server) && !h('x-powered-by'), server || 'keine Angabe');
}

async function tlsCheck(target, url) {
  const { hostname, port } = new URL(url);
  const info = await new Promise((resolve) => {
    const socket = tlsConnect({ host: hostname, port: Number(port) || 443, servername: hostname, timeout: 15_000 }, () => {
      const cert = socket.getPeerCertificate();
      resolve({ valid: socket.authorized, error: socket.authorizationError, until: cert?.valid_to ? new Date(cert.valid_to) : null, protocol: socket.getProtocol() });
      socket.end();
    });
    socket.on('error', (e) => resolve({ valid: false, error: e.code || e.message }));
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ valid: false, error: 'timeout' });
    });
  });
  check(target, 'tls', 'Gültiges TLS-Zertifikat', 'hoch', info.valid, info.error ? String(info.error) : '');
  if (info.until) {
    const days = Math.floor((info.until.getTime() - Date.now()) / 86_400_000);
    check(target, 'tls-ablauf', 'Zertifikat noch mindestens 14 Tage gültig', 'mittel', days >= 14, `noch ${days} Tage`);
  }
  if (info.protocol) check(target, 'tls-version', 'TLS 1.2 oder neuer', 'hoch', /TLSv1\.[23]/.test(info.protocol), info.protocol);
  // Alte Protokolle dürfen nicht angeboten werden.
  for (const old of ['TLSv1', 'TLSv1.1']) {
    const accepted = await new Promise((resolve) => {
      const s = tlsConnect({ host: hostname, port: Number(port) || 443, servername: hostname, minVersion: old, maxVersion: old, timeout: 10_000, rejectUnauthorized: false }, () => {
        resolve(true);
        s.end();
      });
      s.on('error', () => resolve(false));
      s.on('timeout', () => {
        s.destroy();
        resolve(false);
      });
    });
    check(target, `tls-alt-${old}`, `Veraltetes ${old} abgelehnt`, 'mittel', !accepted, accepted ? 'angeboten' : '');
  }
}

async function redirectCheck(target, url) {
  const plain = url.replace(/^https:/, 'http:');
  const res = await request(`${plain}/`);
  const location = res.headers.get('location') || '';
  check(target, 'http', 'http:// leitet auf https:// um', 'mittel', [301, 302, 307, 308].includes(res.status) && location.startsWith('https://'), res.error || `${res.status} ${location}`);
}

const SENSITIVE_COMMON = ['/.git/HEAD', '/.git/config', '/.env', '/.htaccess', '/package.json', '/package-lock.json', '/server/app.cjs', '/.DS_Store', '/backup.zip', '/data/'];

async function sensitivePaths(target, base, paths) {
  for (const path of paths) {
    const res = await request(`${base}${path}`);
    const exposed = res.status === 200 && (looksSensitive(res.body) || res.body.length > 0) && !/<!doctype html/i.test(res.body.slice(0, 200));
    check(target, `pfad:${path}`, `Nicht öffentlich: ${path}`, 'hoch', !exposed && !(res.status === 200 && looksSensitive(res.body)), res.error || `${res.status}`);
    check(target, `leck:${path}`, `Fehlerseite ohne Programminterna: ${path}`, 'mittel', !leaks(res.body), leaks(res.body) ? 'Stacktrace oder Pfad sichtbar' : '');
  }
}

/** Seite lädt nichts von fremden Servern. */
function externalResources(target, base, html) {
  const own = new URL(base).host;
  const urls = [...html.matchAll(/<(?:script|img|link|iframe|source|video|audio)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)].map((m) => m[1]);
  const foreign = urls.filter((u) => /^(https?:)?\/\//i.test(u) && new URL(u, base).host !== own && !/^https?:\/\/(www\.)?leyonet\.ch\//.test(u));
  // <link rel=canonical/alternate> zählen nicht als Ressource.
  const loads = foreign.filter((u) => !html.includes(`rel="canonical" href="${u}"`));
  check(target, 'fremd', 'Lädt nichts von fremden Servern', 'hoch', loads.length === 0, loads.join(', '));
}

// --- Angriffe auf den Server (app.leyonet.ch) ---------------------------------------------------

async function attackApp(base) {
  const target = base;
  const https = base.startsWith('https:');
  if (https && LIVE) {
    await tlsCheck(target, base);
    await redirectCheck(target, base);
  }

  const home = await request(`${base}/`);
  check(target, 'erreichbar', 'Startseite erreichbar', 'hoch', home.status === 200, home.error || String(home.status));
  if (home.status !== 200) return;
  headerChecks(target, home, { https, html: true });
  externalResources(target, base, home.body);

  // Programmdateien, Daten und Git dürfen nicht abrufbar sein, auch nicht über Pfad-Tricks.
  await sensitivePaths(target, base, [
    ...SENSITIVE_COMMON,
    '/app.cjs',
    '/start.cjs',
    '/data/sessions/',
    '/%2e%2e/app.cjs',
    '/assets/..%2f..%2fapp.cjs',
    '/assets/%2e%2e/%2e%2e/server/app.cjs',
    '/api/..%2fapp.cjs',
    '/..%5capp.cjs',
    '/THIRD_PARTY_NOTICES.md/../app.cjs',
  ]);

  // CORS: fremde Seiten dürfen die API nicht mit Browserrechten lesen.
  const cors = await request(`${base}/api/config`, { headers: { Origin: 'https://angreifer.example' } });
  check(target, 'cors', 'API erlaubt keine fremden Origins (CORS)', 'hoch', !cors.headers.get('access-control-allow-origin'), cors.headers.get('access-control-allow-origin') || '');
  const preflight = await request(`${base}/api/sessions`, { method: 'OPTIONS', headers: { Origin: 'https://angreifer.example', 'Access-Control-Request-Method': 'PUT' } });
  check(target, 'cors-preflight', 'Preflight von fremder Seite abgewiesen', 'hoch', !preflight.headers.get('access-control-allow-origin'), `${preflight.status}`);

  // Fremde Formulare (CSRF): nur JSON wird angenommen.
  const form = await request(`${base}/api/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://angreifer.example' }, body: 'project=x' });
  check(target, 'csrf', 'Formular-Post von fremder Seite abgewiesen (nur JSON)', 'hoch', form.status === 415, `${form.status}`);

  // Methoden: TRACE/PUT auf Seiten werden abgewiesen, nichts wird zurückgespiegelt.
  // fetch() kennt TRACE nicht: direkt über http(s).
  const trace = await rawRequest(`${base}/`, 'TRACE', { 'X-Sicherheitspruefung': 'echo-test' });
  check(target, 'trace', 'TRACE abgewiesen, nichts zurückgespiegelt', 'mittel', (trace.status >= 400 || trace.status === 0) && !/echo-test/.test(trace.body), trace.error || `${trace.status}`);

  // Admin ohne gültige Anmeldung.
  for (const [name, auth] of [
    ['ohne', undefined],
    ['falsch', 'Bearer ' + 'A'.repeat(43)],
    ['kaputt', 'Bearer ../../etc/passwd'],
    ['riesig', 'Bearer ' + 'x'.repeat(6000)],
  ]) {
    const res = await request(`${base}/api/admin/exams`, { headers: auth ? { Authorization: auth } : {} });
    check(target, `admin-${name}`, `Admin-Bereich gesperrt (Token ${name})`, 'hoch', res.status === 401 || res.status === 431 || res.status === 400, `${res.status}`);
    check(target, `admin-${name}-leck`, `Admin-Fehler ohne Interna (Token ${name})`, 'mittel', !leaks(res.body), '');
  }
  const login = await request(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'falsches-passwort-der-sicherheitspruefung' }) });
  check(target, 'login-falsch', 'Falsches Admin-Passwort abgewiesen', 'hoch', login.status === 401 || login.status === 429 || login.status === 403, `${login.status}`);
  const injection = await request(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: { $ne: '' } }) });
  check(target, 'login-objekt', 'Anmeldung mit Objekt statt Text abgewiesen (Injection)', 'hoch', injection.status >= 400 && injection.status < 500, `${injection.status}`);

  // Eingaben: kaputtes JSON, Prototype Pollution, zu grosse Anfragen, Pfade im Code.
  const broken = await request(`${base}/api/exams/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"seatCode":' });
  check(target, 'json-kaputt', 'Kaputtes JSON: sauberer Fehler 400', 'mittel', broken.status === 400 && !leaks(broken.body), `${broken.status}`);
  const pollute = await request(`${base}/api/exams/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"__proto__":{"admin":true},"constructor":{"prototype":{"admin":true}},"seatCode":"AAAA-AAAA"}' });
  check(target, 'proto', 'Prototype Pollution ohne Wirkung (kein Serverfehler)', 'hoch', pollute.status < 500, `${pollute.status}`);
  const afterPollute = await request(`${base}/api/admin/exams`);
  check(target, 'proto-admin', 'Nach Pollution-Versuch weiterhin kein Admin-Zugriff', 'hoch', afterPollute.status === 401, `${afterPollute.status}`);
  const big = await request(`${base}/api/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(1_200_000) }) });
  check(target, 'gross', 'Zu grosse Anfrage (> 1 MB) abgewiesen', 'mittel', big.status === 413 || big.status === 429 || big.status === 0, big.error || `${big.status}`);
  for (const code of ['..%2F..%2Fetc%2Fpasswd', '%00', 'A'.repeat(300), '<script>']) {
    const res = await request(`${base}/api/sessions/${code}`);
    check(target, `code:${code.slice(0, 12)}`, `Ungültiger Session-Code abgewiesen (${code.slice(0, 12)})`, 'hoch', res.status >= 400 && res.status < 500 && !looksSensitive(res.body), `${res.status}`);
  }
  const unknown = await request(`${base}/api/sessions/ZZZZ-ZZZZ-ZZZZ`);
  check(target, 'session-unbekannt', 'Unbekannte Session: 404 ohne Hinweis auf andere', 'mittel', unknown.status === 404 || unknown.status === 400, `${unknown.status}`);
  const seat = await request(`${base}/api/exams/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seatCode: 'ZZZZ-ZZZZ' }) });
  check(target, 'platz-unbekannt', 'Unbekannter Platz-Code abgewiesen', 'hoch', seat.status === 404 || seat.status === 429 || seat.status === 400, `${seat.status}`);

  // Klassen-Verbund: ohne gültigen Klassencode nichts lesen, nichts senden.
  const verbund = await request(`${base}/api/classes/ZZZZ-ZZZZ/verbund`);
  check(target, 'verbund-unbekannt', 'Verbund einer unbekannten Klasse: 404 ohne Daten', 'hoch', verbund.status === 404 || verbund.status === 429 || verbund.status === 400, `${verbund.status}`);
  const msgs = await request(`${base}/api/classes/ZZZZ-ZZZZ/messages`);
  check(target, 'nachrichten-unbekannt', 'Nachrichten einer unbekannten Klasse: 404 ohne Daten', 'hoch', msgs.status === 404 || msgs.status === 429 || msgs.status === 400, `${msgs.status}`);
  const tenants = await request(`${base}/api/admin/tenants`);
  check(target, 'zugaenge-gesperrt', 'Zugänge ohne Anmeldung gesperrt', 'hoch', tenants.status === 401, `${tenants.status}`);

  const sec = await request(`${base}/.well-known/security.txt`);
  check(target, 'security.txt', 'security.txt vorhanden (Meldestelle für Sicherheitslücken, RFC 9116)', 'hinweis', sec.status === 200 && /^Contact:/m.test(sec.body), `${sec.status}`);

  // Fehlerseite (404) ohne Interna, mit Sicherheitsköpfen.
  const missing = await request(`${base}/gibt-es-nicht-${Date.now()}`);
  check(target, '404', 'Unbekannte Seite: 404 ohne Interna', 'mittel', missing.status === 404 && !leaks(missing.body), `${missing.status}`);
  check(target, '404-nosniff', 'Auch Fehlerseiten mit nosniff', 'hinweis', /nosniff/i.test(missing.headers.get('x-content-type-options') || ''), '');

  if (!LIVE) await attackAppDeep(base);
}

/** Nur lokal: Angriffe, die Daten anlegen oder Ratenbegrenzungen auslösen. */
async function attackAppDeep(base) {
  const target = base;
  const post = (path, body, headers = {}) => request(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const project = { meta: { format: 'netzwerk-simulator', version: 1 }, topology: { devices: [], cables: [], nextId: 1 } };

  const created = await post('/api/sessions', { project });
  check(target, 'session-neu', 'Session anlegen (Vorbedingung)', 'hoch', created.status === 201 || created.status === 200, `${created.status}`);
  const data = (() => {
    try {
      return JSON.parse(created.body);
    } catch {
      return {};
    }
  })();
  if (data.code) {
    check(target, 'code-stark', 'Session-Code mit mindestens 8 Zeichen aus 30+ Zeichen (≥ 10¹¹ Möglichkeiten)', 'hoch', /^[A-Z0-9]{4}-[A-Z0-9]{4,}$/.test(data.code), data.code.replace(/[A-Z0-9]/g, '·'));
    const put = await request(`${base}/api/sessions/${data.code}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project }) });
    check(target, 'schreiber', 'Fremdes Gerät kann eine offene Session nicht überschreiben (Schreiberkennung)', 'hoch', put.status === 409 || put.status === 403 || put.status === 423, `${put.status}`);
    const del = await request(`${base}/api/sessions/${data.code}`, { method: 'DELETE' });
    check(target, 'loeschen', 'Fremdes Gerät kann die Session nicht löschen', 'hoch', del.status >= 400, `${del.status}`);
    // XSS: Projekttext wird als Daten gespeichert und als JSON ausgeliefert, nie als HTML.
    const evil = { ...project, topology: { ...project.topology, devices: [] }, meta: { ...project.meta, title: '<img src=x onerror=alert(1)>' } };
    const xss = await post('/api/sessions', { project: evil });
    const code2 = (() => {
      try {
        return JSON.parse(xss.body).code;
      } catch {
        return '';
      }
    })();
    if (code2) {
      const got = await request(`${base}/api/sessions/${code2}`);
      check(target, 'xss-json', 'Gespeicherte Daten kommen als JSON (nicht als HTML) zurück', 'hoch', /application\/json/.test(got.headers.get('content-type') || ''), got.headers.get('content-type') || '');
    }
  }

  await tenantChecks(base, post, project);

  // Raten von Codes: Ratenbegrenzung greift (Session-Codes und Platz-Codes getrennt).
  let limitedSession = false;
  for (let i = 0; i < 40 && !limitedSession; i++) limitedSession = (await request(`${base}/api/sessions/ZZZ${i % 10}-ZZ${String(i).padStart(2, '0')}`)).status === 429;
  check(target, 'rate-session', 'Session-Codes raten wird gebremst (429)', 'hoch', limitedSession, '');
  let limitedJoin = false;
  for (let i = 0; i < 40 && !limitedJoin; i++) limitedJoin = (await post('/api/exams/join', { seatCode: `ZZZ${i % 10}-ZZZZ` })).status === 429;
  check(target, 'rate-platz', 'Platz-Codes raten wird gebremst (429)', 'hoch', limitedJoin, '');
  let limitedLogin = false;
  for (let i = 0; i < 15 && !limitedLogin; i++) limitedLogin = (await post('/api/admin/login', { password: `falsch-${i}` })).status === 429;
  check(target, 'rate-login', 'Admin-Passwort raten wird gebremst (429)', 'hoch', limitedLogin, '');
  let limitedNew = false;
  for (let i = 0; i < 80 && !limitedNew; i++) limitedNew = (await post('/api/sessions', { project })).status === 429;
  check(target, 'rate-neu', 'Massenhaft Sessions anlegen wird gebremst (429)', 'hoch', limitedNew, '');
  let limitedFeedback = false;
  for (let i = 0; i < 12 && !limitedFeedback; i++) limitedFeedback = (await post('/api/feedback', { text: `Test ${i}` })).status === 429;
  check(target, 'rate-feedback', 'Rückmeldungen fluten wird gebremst (429)', 'mittel', limitedFeedback, '');

  // Viele Verbindungen gleichzeitig: Server bleibt erreichbar.
  const burst = await Promise.all(Array.from({ length: 60 }, () => request(`${base}/healthz`)));
  const ok = burst.filter((r) => r.status === 200).length;
  const health = await request(`${base}/healthz`);
  check(target, 'last', 'Nach 60 gleichzeitigen Anfragen weiter erreichbar', 'mittel', health.status === 200, `${ok}/60 ok`);
}

/**
 * Zugänge und Klassen-Verbund (nur lokal, vor den Ratentests der Anmeldung): Lehrpersonen sehen
 * einander nicht, haben keine Hauptadmin-Rechte, und Nachrichten brauchen eine Session der Klasse.
 */
async function tenantChecks(base, post, project) {
  const target = base;
  const json = (res) => {
    try {
      return JSON.parse(res.body);
    } catch {
      return {};
    }
  };
  const as = (token) => ({ Authorization: `Bearer ${token}` });
  const call = (method, path, token, body) => request(`${base}/api/admin/${path}`, { method, headers: { 'Content-Type': 'application/json', ...as(token) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const admin = json(await post('/api/admin/login', { password: LOCAL_ADMIN_PASSWORD })).token;
  check(target, 'zugang-vorbedingung', 'Hauptadmin-Anmeldung (Vorbedingung)', 'hoch', !!admin, '');
  if (!admin) return;
  const a = json(await call('POST', 'tenants', admin, { label: 'Prüfung A', role: 'teacher' }));
  const b = json(await call('POST', 'tenants', admin, { label: 'Prüfung B', role: 'teacher' }));
  const tokenA = json(await post('/api/admin/login', { password: a.key })).token;
  const tokenB = json(await post('/api/admin/login', { password: b.key })).token;
  check(target, 'zugang-anmelden', 'Lehrperson meldet sich mit Zugangsschlüssel an', 'hoch', !!tokenA && !!tokenB, '');
  if (!tokenA || !tokenB) return;
  const tenantList = await request(`${base}/api/admin/tenants`, { headers: as(admin) });
  check(target, 'zugang-hash', 'Zugangsschlüssel wird nicht gespeichert oder zurückgegeben', 'hoch', !tenantList.body.includes(a.key.split('-').pop()), '');
  const klasse = json(await call('POST', 'classes', tokenA, { label: 'Prüfklasse' }));
  const overviewB = json(await call('GET', 'overview', tokenB));
  check(target, 'zugang-trennung', 'Lehrperson B sieht die Klasse von A nicht', 'hoch', Array.isArray(overviewB.classes) && !overviewB.classes.some((c) => c.code === klasse.code), '');
  const foreign = await call('GET', `classes/${klasse.code}/sessions?projects=1`, tokenB);
  check(target, 'zugang-fremde-klasse', 'Lehrperson B liest keine Sessions der Klasse von A', 'hoch', foreign.status === 403 || foreign.status === 404, `${foreign.status}`);
  const patch = await call('PATCH', `classes/${klasse.code}`, tokenB, { verbund: { enabled: true, shareSites: true } });
  check(target, 'zugang-fremd-aendern', 'Lehrperson B ändert die Klasse von A nicht', 'hoch', patch.status === 403 || patch.status === 404, `${patch.status}`);
  for (const [path, method] of [['tenants', 'GET'], ['settings', 'PUT'], ['feedback', 'GET'], ['checks', 'GET']]) {
    const res = await call(method, path, tokenA, method === 'PUT' ? { maxLevel: 5 } : undefined);
    check(target, `zugang-recht-${path}`, `Lehrperson hat keinen Zugriff auf ${path}`, 'hoch', res.status === 403, `${res.status}`);
  }
  // Nachrichten: nur Sessions der Klasse mit Schreibrecht, gebremst.
  await call('PATCH', `classes/${klasse.code}`, tokenA, { verbund: { enabled: true } });
  const member = json(await post('/api/sessions', { project, classCode: klasse.code, site: { seat: 1 } }));
  const outsider = json(await post('/api/sessions', { project }));
  const noWriter = await post(`/api/classes/${klasse.code}/messages`, { session: member.code, to: 0, text: 'x' });
  check(target, 'nachricht-schreiber', 'Nachricht ohne Schreiberkennung abgewiesen', 'hoch', noWriter.status === 403, `${noWriter.status}`);
  const stranger = await post(`/api/classes/${klasse.code}/messages`, { session: outsider.code, to: 0, text: 'x' }, { 'X-Leyonet-Writer': outsider.writer || '' });
  check(target, 'nachricht-fremd', 'Nachricht einer Session ausserhalb der Klasse abgewiesen', 'hoch', stranger.status === 403, `${stranger.status}`);
  let flooded = false;
  for (let i = 0; i < 10 && !flooded; i++) flooded = (await post(`/api/classes/${klasse.code}/messages`, { session: member.code, to: 0, text: `Test ${i}` }, { 'X-Leyonet-Writer': member.writer || '' })).status === 429;
  check(target, 'nachricht-flut', 'Nachrichten fluten wird gebremst (429)', 'mittel', flooded, '');
  const verbund = json(await request(`${base}/api/classes/${klasse.code}/verbund`));
  check(target, 'verbund-ohne-codes', 'Verbund-Daten enthalten keine Session-Codes', 'hoch', !JSON.stringify(verbund).includes(member.code), '');
}

// --- Angriffe auf die Website (leyonet.ch) -------------------------------------------------

async function attackSite(base) {
  const target = base;
  const https = base.startsWith('https:');
  if (https) {
    await tlsCheck(target, base);
    await redirectCheck(target, base);
  }
  const home = await request(`${base}/`);
  check(target, 'erreichbar', 'Startseite erreichbar', 'hoch', home.status === 200, home.error || String(home.status));
  if (home.status !== 200) return;
  headerChecks(target, home, { https, html: true });
  externalResources(target, base, home.body);
  const downloads = [...home.body.matchAll(/href="(https:\/\/github\.com\/[^"]+)"/g)].map((m) => m[1]);
  check(target, 'downloads', 'Downloads nur aus den Releases des eigenen Repos', 'hoch', downloads.every((u) => u.startsWith('https://github.com/vonam-git/leyoNET')), downloads.filter((u) => !u.startsWith('https://github.com/vonam-git/leyoNET')).join(', '));
  check(target, 'skripte', 'Keine Inline-Skripte', 'mittel', !/<script>(?!\s*<\/script>)[\s\S]*?<\/script>/i.test(home.body) && !/\son[a-z]+="/i.test(home.body), '');

  await sensitivePaths(target, base, [
    ...SENSITIVE_COMMON,
    '/impressum.vorlage.html',
    '/datenschutz.vorlage.html',
    '/ANLEITUNG.md',
    '/website/ANLEITUNG.md',
    '/leyonet-repo/package.json',
    '/../package.json',
    '/download/',
  ]);
  const listing = await request(`${base}/img/`);
  check(target, 'listing', 'Keine Verzeichnisliste (/img/)', 'mittel', !/Index of|<title>Directory/i.test(listing.body), `${listing.status}`);
  for (const page of ['/impressum.html', '/datenschutz.html']) {
    const res = await request(`${base}${page}`);
    check(target, `seite:${page}`, `${page} vorhanden (rechtlich nötig)`, 'mittel', res.status === 200, `${res.status}`);
    if (res.status === 200) check(target, `platzhalter:${page}`, `${page} ohne Platzhalter`, 'mittel', !/\[(PLZ Ort|E-Mail-Adresse)\]/.test(res.body), '');
  }
  const sec = await request(`${base}/.well-known/security.txt`);
  const expires = sec.body.match(/^Expires:\s*(.+)$/m)?.[1];
  check(target, 'security.txt', 'security.txt vorhanden (Meldestelle für Sicherheitslücken, RFC 9116)', 'hinweis', sec.status === 200 && /^Contact:/m.test(sec.body), `${sec.status}`);
  if (expires) check(target, 'security.txt-ablauf', 'security.txt noch mindestens 30 Tage gültig', 'mittel', new Date(expires).getTime() - Date.now() > 30 * 86_400_000, expires);
}

// --- Lokaler Server --------------------------------------------------------------------------

async function startLocal() {
  const dataDir = mkdtempSync(join(tmpdir(), 'leyonet-angriff-'));
  const port = 20_000 + Math.floor(Math.random() * 20_000);
  const child = spawn(process.execPath, [join(ROOT, 'server', 'start.cjs')], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ADMIN_PASSWORD: LOCAL_ADMIN_PASSWORD },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    const res = await request(`${base}/healthz`);
    if (res.status === 200) return { base, stop: () => (child.kill(), rmSync(dataDir, { recursive: true, force: true })), stderr: () => stderr };
    await sleep(100);
  }
  child.kill();
  throw new Error(`Server startet nicht: ${stderr}`);
}

// --- Ablauf ----------------------------------------------------------------------------------

function report() {
  const failed = results.filter((r) => !r.ok);
  const serious = failed.filter((r) => r.level !== 'hinweis');
  const lines = [
    `# Sicherheitsprüfung von aussen (${LIVE ? 'live, nur lesend' : 'lokal, alle Angriffe'})`,
    '',
    `${new Date().toISOString()} · ${results.length} Prüfungen · ${serious.length} Befunde · ${failed.length - serious.length} Hinweise`,
    '',
  ];
  for (const target of [...new Set(results.map((r) => r.target))]) {
    const own = results.filter((r) => r.target === target);
    lines.push(`## ${target}`, '', '| | Stufe | Prüfung | Detail |', '|---|---|---|---|');
    for (const r of own.sort((a, b) => Number(a.ok) - Number(b.ok))) lines.push(`| ${r.ok ? '✅' : r.level === 'hinweis' ? 'ℹ️' : '❌'} | ${r.level} | ${r.title} | ${String(r.detail).replace(/\|/g, '/').slice(0, 160)} |`);
    lines.push('');
  }
  return { text: lines.join('\n'), serious };
}

async function main() {
  const apps = listOf('--app');
  const sites = listOf('--site');
  let local;
  if (!LIVE && apps.length === 0) {
    local = await startLocal();
    apps.push(local.base);
  }
  try {
    for (const app of apps) await attackApp(app);
    for (const site of sites) await attackSite(site);
  } finally {
    local?.stop();
  }
  if (local && /Serverfehler/.test(local.stderr())) check(local.base, 'serverfehler', 'Kein Serverfehler (500) während der Angriffe', 'hoch', false, local.stderr().slice(0, 300));
  const { text, serious } = report();
  writeFileSync(join(process.cwd(), 'sicherheit-bericht.md'), text);
  console.log(serious.length ? text : text.split('\n').slice(0, 3).join('\n'));
  if (serious.length) {
    console.error(`\n${serious.length} Sicherheitsbefund(e), siehe sicherheit-bericht.md`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
