'use strict';
/**
 * Server der Webversion von leyoNET.
 *
 * Liefert die fertige Datei release/leyonet.html aus und bietet eine
 * kleine JSON-API für
 *   - Sessions: technische Projektstände unter einem Zufallscode, die nach
 *     einer einstellbaren Zeit automatisch gelöscht werden,
 *   - Klassen-Sessions: Lehrpersonen sehen die Sessions ihrer Klasse,
 *   - Prüfungen: Plätze mit eigenem Code, laufendes Speichern, Ende und
 *     Nachteilsausgleich je Platz, Abgaben für die automatische Auswertung,
 *   - Rückmeldungen (Probleme, Ideen) an den Admin,
 *   - das Admin-Dashboard (Einstellungen, Klassen, Rückmeldungen).
 *
 * Datenschutz (revDSG / DSGVO): Es gibt keine Konten, keine Namen, keine
 * E-Mail-Adressen. Gespeichert werden nur Netzwerk-Konfigurationen. IP-Adressen
 * werden nicht gespeichert und nicht protokolliert; die Ratenbegrenzung hält
 * nur einen gesalzenen Hash für wenige Minuten im Arbeitsspeicher.
 *
 * Nur Node.js-Bordmittel, keine Abhängigkeiten. Start: node server/start.cjs
 * Umgebung: PORT, ADMIN_PASSWORD (ohne: Admin gesperrt), DATA_DIR,
 * MAX_SESSIONS (Standard 5000), MAX_STORAGE_MB (Standard 1024), LEYONET_CHANNEL=beta (Testumgebung).
 */

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const RELEASE_FILE = path.join(ROOT, 'release', 'leyonet.html');
const NOTICES_FILE = path.join(ROOT, 'release', 'THIRD_PARTY_NOTICES.md');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
/**
 * «beta»: Testumgebung (z.B. beta.leyonet.ch mit Branch develop). Die Oberfläche zeigt
 * «Testversion», Suchmaschinen sollen nichts aufnehmen. Alles andere gilt als stabil.
 */
const CHANNEL = String(process.env.LEYONET_CHANNEL || '').trim().toLowerCase() === 'beta' ? 'beta' : 'stable';
/** Grösste Anfrage bzw. grösstes Projekt (Webserver-Bilder sind auf 160 KB je Datei begrenzt). */
const MAX_BODY = 1024 * 1024;
/** Prüfungsdatei samt Schlüssel (bis 60 Varianten). */
const MAX_EXAM_BODY = 12 * 1024 * 1024;
const MAX_FEEDBACK_TEXT = 2000;
/**
 * Schutz gegen Überlastung ohne Anmeldung: Gesamtzahl der Sessions und Platz für
 * Sessions und Rückmeldungen. Darüber gibt es «507 storageFull» für neue Daten;
 * Prüfungsplätze und Admin-Funktionen sind ausgenommen. Mit Umgebungsvariablen anpassbar.
 */
const MAX_SESSIONS = Math.max(1, Number(process.env.MAX_SESSIONS) || 5000);
const MAX_STORAGE_BYTES = Math.max(1, Number(process.env.MAX_STORAGE_MB) || 1024) * 1024 * 1024;
const MAX_FEEDBACK = 500;
/** Neue Sessions je Adresse und Minute (eine Klasse tritt auf einmal bei). */
const NEW_SESSIONS_PER_MINUTE = 60;
const ADMIN_TOKEN_HOURS = 8;

/** Feature-IDs dürfen nur aus Buchstaben, Ziffern und Punkten bestehen (Liste in src/ui/features.ts). */
const FEATURE_ID = /^[a-z]+\.[A-Za-z0-9]+$/;
const CHECKS_FILE = path.join(ROOT, 'release', 'checks.json');

const DEFAULT_SETTINGS = {
  modes: { design: true, simulation: true },
  /** Funktionsumfang: höchstes und voreingestelltes Profil (1 = 1. Lehrjahr … 5 = Studium), gesperrte Funktionen. */
  maxLevel: 5,
  defaultLevel: 2,
  disabled: [],
  sessionHours: 24,
  feedbackEnabled: true,
  feedbackDays: 30,
  classHours: 24 * 14,
};

// --- Speicher ------------------------------------------------------------------

const dirs = {
  sessions: path.join(DATA_DIR, 'sessions'),
  feedback: path.join(DATA_DIR, 'feedback'),
  classes: path.join(DATA_DIR, 'classes'),
  exams: path.join(DATA_DIR, 'exams'),
};

/** Prüfungen: Aufbewahrung der Abgaben, Gnadenfrist fürs letzte Speichern, Grenzen. */
const EXAM_DAYS = 60;
const EXAM_GRACE_MS = 30_000;
/** Ein Gerät gilt als verbunden, solange es sich innerhalb dieser Zeit gemeldet hat (Speichern oder Ping alle 20 s). */
const LEASE_MS = 60_000;
/** PIN zum Sperren einer Session: 4 bis 8 Ziffern. */
const PIN = /^\d{4,8}$/;
const PIN_FAILS = 5;
const PIN_WINDOW_MS = 10 * 60_000;
const MAX_EXAM_SEATS = 60;
const MAX_EXAM_MINUTES = 600;

function ensureDirs() {
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  // Sicherung, falls der Webserver den Datenordner doch ausliefern würde (falscher Dokumentstamm).
  const guard = path.join(DATA_DIR, '.htaccess');
  if (!fs.existsSync(guard)) fs.writeFileSync(guard, 'Require all denied\n', { mode: 0o644 });
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Atomar schreiben: erst Temporärdatei, dann umbenennen. */
function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function remove(file) {
  try {
    fs.unlinkSync(file);
  } catch {
    // schon weg
  }
}

// --- Verzeichnis der Sessions und Rückmeldungen (im Arbeitsspeicher) ------------------
//
// Damit der Server nie alle Dateien auf einmal lesen muss (das würde ihn blockieren),
// stehen Eckdaten (ohne Projekt) und Grösse jeder Datei hier. Aufgebaut beim Start
// in kleinen Stapeln, danach bei jedem Schreiben und Löschen nachgeführt.

const indexes = { sessions: new Map(), feedback: new Map() };

function metaOf(item, size) {
  const { project, ...rest } = item;
  return { ...rest, hasProject: !!project, size };
}

/** Speichert einen Eintrag und führt das Verzeichnis nach; liefert die Grösse in Bytes. */
function store(kind, key, item) {
  const text = JSON.stringify(item);
  const file = fileFor(dirs[kind], key);
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  fs.renameSync(tmp, file);
  const size = Buffer.byteLength(text);
  indexes[kind].set(key, metaOf(item, size));
  return size;
}

function drop(kind, key) {
  remove(fileFor(dirs[kind], key));
  indexes[kind].delete(key);
}

/** Gültige Einträge (ohne Projekt); das Projekt liest bei Bedarf loadSession(). */
function entries(kind) {
  const now = Date.now();
  return [...indexes[kind].values()].filter((m) => m.expires > now);
}

function usage() {
  let bytes = 0;
  for (const index of Object.values(indexes)) for (const m of index.values()) bytes += m.size || 0;
  return { bytes, sessions: indexes.sessions.size, feedback: indexes.feedback.size };
}

/** Passt ein neuer bzw. grösserer Eintrag noch in den Speicher? */
function fits(extraBytes, newSessions = 0) {
  const u = usage();
  return u.bytes + Math.max(0, extraBytes) <= MAX_STORAGE_BYTES && u.sessions + newSessions <= MAX_SESSIONS;
}

const projectSize = (project) => Buffer.byteLength(JSON.stringify(project));

async function buildIndexes() {
  const now = Date.now();
  for (const kind of Object.keys(indexes)) {
    let names = [];
    try {
      names = await fs.promises.readdir(dirs[kind]);
    } catch {
      continue;
    }
    for (let i = 0; i < names.length; i += 25) {
      await Promise.all(
        names.slice(i, i + 25).map(async (name) => {
          const file = path.join(dirs[kind], name);
          if (name.endsWith('.tmp')) return remove(file);
          if (!name.endsWith('.json')) return;
          try {
            const text = await fs.promises.readFile(file, 'utf8');
            const item = JSON.parse(text);
            const key = name.slice(0, -5);
            if (typeof item.expires !== 'number' || item.expires < now) return remove(file);
            indexes[kind].set(key, metaOf(item, Buffer.byteLength(text)));
          } catch {
            remove(file);
          }
        }),
      );
      // Zwischen den Stapeln andere Anfragen bedienen.
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
}

function settings() {
  const stored = readJson(path.join(DATA_DIR, 'settings.json')) || {};
  // Ältere Einstellungen: Modi design/action/doc und Schalter «pro».
  const modes = stored.modes || {};
  const migrated = {
    design: modes.design !== false,
    simulation: (modes.simulation !== undefined ? modes.simulation : modes.action) !== false,
  };
  const maxLevel = Number.isInteger(stored.maxLevel) ? stored.maxLevel : stored.pro === false ? 3 : DEFAULT_SETTINGS.maxLevel;
  const { pro: _pro, ...rest } = stored;
  return {
    ...DEFAULT_SETTINGS,
    ...rest,
    modes: migrated,
    maxLevel,
    defaultLevel: Math.min(Number.isInteger(stored.defaultLevel) ? stored.defaultLevel : DEFAULT_SETTINGS.defaultLevel, maxLevel),
    disabled: Array.isArray(stored.disabled) ? stored.disabled.filter((f) => typeof f === 'string' && FEATURE_ID.test(f)) : [],
  };
}

// --- Codes -----------------------------------------------------------------------

/** Ohne leicht verwechselbare Zeichen (0/O, 1/I/L). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function newCode(length = 8) {
  let code = '';
  for (let i = 0; i < length; i++) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Normalisiert Eingaben wie «k7f2 9qxm» → «K7F2-9QXM»; null bei ungültigem Format. */
function normalizeCode(raw) {
  const clean = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 8 || [...clean].some((c) => !ALPHABET.includes(c))) return null;
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

const fileFor = (dir, code) => path.join(dir, `${code}.json`);

// --- Projekte prüfen ---------------------------------------------------------------

/** Nur Projekte des Simulators annehmen; Inhalt bleibt sonst unangetastet. */
function validProject(project) {
  return (
    project &&
    typeof project === 'object' &&
    project.meta &&
    project.meta.format === 'netzwerk-simulator' &&
    project.topology &&
    Array.isArray(project.topology.devices)
  );
}

function summary(project) {
  const t = project.topology;
  return {
    devices: t.devices.length,
    cables: Array.isArray(t.cables) ? t.cables.length : 0,
    task: project.tasks && typeof project.tasks.title === 'string' ? project.tasks.title.slice(0, 120) : null,
  };
}

// --- Ratenbegrenzung (nur im Arbeitsspeicher) ----------------------------------------

const SALT = crypto.randomBytes(16);
const buckets = new Map();

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Adresse für die Ratenbegrenzung (nur gehasht im Arbeitsspeicher, nie gespeichert).
 * Hinter dem Proxy von Plesk (Verbindung von 127.0.0.1) gilt der letzte Eintrag im
 * Weiterleitungs-Kopf, den der Proxy selbst anhängt; andere Absender können ihn nicht fälschen.
 */
function clientIp(req) {
  const direct = req.socket.remoteAddress || '';
  if (!LOOPBACK.has(direct)) return direct;
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return forwarded.length ? forwarded[forwarded.length - 1] : String(req.headers['x-real-ip'] || direct);
}

function limited(req, kind, perMinute) {
  const ip = clientIp(req);
  const key = crypto.createHash('sha256').update(SALT).update(ip).update(kind).digest('base64url').slice(0, 16);
  return count(key, perMinute);
}

/** Höchstens so viele Anfragen dieser Art pro Minute insgesamt (falls Adressen gefälscht werden können). */
function limitedGlobal(kind, perMinute) {
  return count(`*${kind}`, perMinute);
}

const MAX_BUCKETS = 50_000;

function count(key, perMinute) {
  const now = Date.now();
  // Viele verschiedene Adressen auf einmal: Speicher nicht volllaufen lassen.
  if (!buckets.has(key) && buckets.size >= MAX_BUCKETS) {
    for (const [k, b] of buckets) if (now - b.start > 60_000) buckets.delete(k);
    if (buckets.size >= MAX_BUCKETS) return true;
  }
  const bucket = buckets.get(key) || { start: now, count: 0 };
  if (now - bucket.start > 60_000) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count++;
  buckets.set(key, bucket);
  return bucket.count > perMinute;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (now - bucket.start > 120_000) buckets.delete(key);
}, 60_000).unref();

// --- Admin-Anmeldung -----------------------------------------------------------------

const tokens = new Map();

function checkPassword(given) {
  if (!ADMIN_PASSWORD) return false;
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

// --- Schreibrecht einer Session ------------------------------------------------------
//
// Nur ein Gerät schreibt: Wer eine Session öffnet, erhält ein zufälliges Schreib-Token
// (nur sein Hash liegt in der Session). Ist das Gerät verbunden (meldet sich alle 20 s),
// kann kein anderes übernehmen. Eine gesperrte Session übernimmt ein anderes Gerät nur
// mit der PIN. Ansehen («watch») geht mit dem Code immer, aber nur lesend.

/** Letzte Meldung des schreibenden Geräts je Session (nur im Arbeitsspeicher). */
const leases = new Map();
const pinFails = new Map();

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();
const sameHash = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const writerHash = (token) => digest(token).toString('base64url');

function writerOf(req) {
  const token = req.headers['x-leyonet-writer'];
  return typeof token === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(token) ? token : '';
}

function isWriter(item, token) {
  return !!token && sameHash(item.writer, writerHash(token));
}

function connected(code, now = Date.now()) {
  const seen = leases.get(code);
  return seen !== undefined && now - seen < LEASE_MS;
}

function pinHash(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 32).toString('base64url');
}

/** PIN prüfen; nach zu vielen Fehlversuchen für diese Session vorübergehend gesperrt. */
function checkPin(code, item, pin) {
  if (!item.lock) return 'ok';
  const now = Date.now();
  const fails = pinFails.get(code);
  if (fails && now - fails.since < PIN_WINDOW_MS && fails.count >= PIN_FAILS) return 'tooMany';
  if (typeof pin !== 'string' || !PIN.test(pin)) return pin ? 'wrong' : 'missing';
  if (sameHash(pinHash(pin, item.lock.salt), item.lock.hash)) {
    pinFails.delete(code);
    return 'ok';
  }
  const next = fails && now - fails.since < PIN_WINDOW_MS ? { since: fails.since, count: fails.count + 1 } : { since: now, count: 1 };
  pinFails.set(code, next);
  return 'wrong';
}

/**
 * Schreibrecht holen: das eigene Token gilt weiter; sonst nur, wenn gerade kein anderes
 * Gerät verbunden ist (und bei gesperrter Session mit PIN). Liefert das (neue) Token.
 */
function claimWriter(code, item, token, pin) {
  const now = Date.now();
  if (isWriter(item, token)) {
    leases.set(code, now);
    return { token, item };
  }
  if (connected(code, now)) return { error: 'sessionInUse', status: 409 };
  const pinState = checkPin(code, item, pin);
  if (pinState === 'tooMany') return { error: 'rateLimited', status: 429 };
  if (pinState !== 'ok') return { error: pinState === 'wrong' ? 'wrongPin' : 'sessionLocked', status: 423 };
  const fresh = crypto.randomBytes(24).toString('base64url');
  const next = { ...item, writer: writerHash(fresh) };
  store('sessions', code, next);
  leases.set(code, now);
  return { token: fresh, item: next };
}

function isAdmin(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const expires = tokens.get(token);
  if (!expires || expires < Date.now()) {
    tokens.delete(token);
    return false;
  }
  return true;
}

// --- Aufräumen ---------------------------------------------------------------------

/** Abgelaufenes löschen: Sessions und Rückmeldungen über das Verzeichnis, ohne alles zu lesen. */
async function cleanup() {
  // Lebenszeichen und PIN-Fehlversuche nicht unbegrenzt behalten.
  const now = Date.now();
  for (const [code, seen] of leases) if (now - seen > LEASE_MS) leases.delete(code);
  for (const [code, f] of pinFails) if (now - f.since > PIN_WINDOW_MS) pinFails.delete(code);
  for (const kind of Object.keys(indexes)) {
    for (const [key, m] of indexes[kind]) if (!(m.expires > now)) drop(kind, key);
  }
  // Klassen und Prüfungen legt nur der Admin an; es sind wenige Dateien.
  for (const dir of [dirs.classes, dirs.exams]) {
    let names = [];
    try {
      names = await fs.promises.readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const file = path.join(dir, name);
      if (name.endsWith('.tmp')) {
        remove(file);
        continue;
      }
      try {
        const item = JSON.parse(await fs.promises.readFile(file, 'utf8'));
        if (typeof item.expires !== 'number' || item.expires < now) remove(file);
      } catch {
        remove(file);
      }
    }
  }
}

// --- HTTP-Hilfen ---------------------------------------------------------------------

// Skripte und das Stylesheet liefert der Server als eigene Dateien aus ('self'),
// damit die Seite auch läuft, wenn das Hosting zusätzlich eine strengere
// Richtlinie ohne 'unsafe-inline' setzt. Inline-Stile bleiben für style-Attribute nötig.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  'img-src data: blob:',
  "connect-src 'self'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
  // Wirkt nur über HTTPS (Plesk mit Let's Encrypt); über HTTP ignorieren Browser den Kopf.
  'Strict-Transport-Security': 'max-age=15552000',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...(CHANNEL === 'beta' ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}), ...headers });
  res.end(body);
}

function json(res, status, value) {
  send(res, status, JSON.stringify(value), { 'Content-Type': 'application/json; charset=utf-8' });
}

function fail(res, status, code) {
  json(res, status, { error: code });
}

function readBody(req, max = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const tooLarge = () => Object.assign(new Error('tooLarge'), { status: 413 });
    // Angekündigte Grösse zu gross: gar nicht erst lesen.
    if (Number(req.headers['content-length'] || 0) > max) return reject(tooLarge());
    let size = 0;
    let done = false;
    const chunks = [];
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > max) {
        done = true;
        chunks.length = 0;
        reject(tooLarge());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      if (size === 0) return resolve({});
      let value;
      try {
        value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return reject(Object.assign(new Error('invalidJson'), { status: 400 }));
      }
      // Nur Objekte: «null», Zahlen oder Listen würden später zu Serverfehlern führen.
      if (!value || typeof value !== 'object' || Array.isArray(value)) return reject(Object.assign(new Error('invalidJson'), { status: 400 }));
      resolve(value);
    });
    req.on('error', reject);
  });
}

/**
 * Die App mit freigegebener API: CSP erlaubt Anfragen an den eigenen Server.
 * Eingebettete Skripte und das Stylesheet werden herausgelöst und unter
 * /assets/… ausgeliefert, damit keine Inline-Skripte nötig sind.
 */
function appBundle() {
  let html = fs.readFileSync(RELEASE_FILE, 'utf8');
  const assets = new Map();
  let n = 0;
  const extract = (open, close, make) => {
    for (;;) {
      const start = html.indexOf(open);
      if (start < 0) return;
      const bodyStart = start + open.length;
      const end = html.indexOf(close, bodyStart);
      if (end < 0) return;
      const tag = make(html.slice(bodyStart, end), n++);
      html = html.slice(0, start) + tag + html.slice(end + close.length);
    }
  };
  // Modul-Skript (der Simulator) und klassische Skripte (Startanzeige); JSON-Daten bleiben eingebettet.
  extract('<script type="module" crossorigin>', '</script>', (code, i) => {
    assets.set(`/assets/app-${i}.js`, { type: 'text/javascript; charset=utf-8', body: code });
    return `<script type="module" src="/assets/app-${i}.js"></script>`;
  });
  extract('<script>', '</script>', (code, i) => {
    assets.set(`/assets/boot-${i}.js`, { type: 'text/javascript; charset=utf-8', body: code });
    return `<script src="/assets/boot-${i}.js"></script>`;
  });
  extract('<style rel="stylesheet" crossorigin>', '</style>', (css, i) => {
    assets.set(`/assets/style-${i}.css`, { type: 'text/css; charset=utf-8', body: css });
    return `<link rel="stylesheet" href="/assets/style-${i}.css" />`;
  });
  html = html
    // frame-ancestors wirkt nur als HTTP-Header; im Meta-Tag würde der Browser warnen.
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, `<meta http-equiv="Content-Security-Policy" content="${CSP.replace("; frame-ancestors 'none'", '')}" />`)
    .replace('<head>', `<head>\n    <meta name="ns-server" content="1" />${CHANNEL === 'beta' ? '\n    <meta name="robots" content="noindex, nofollow" />' : ''}`);
  return { html, assets };
}

let cached = null;
let cachedMtime = 0;
function bundle() {
  const mtime = fs.statSync(RELEASE_FILE).mtimeMs;
  if (!cached || mtime !== cachedMtime) {
    cached = appBundle();
    cachedMtime = mtime;
  }
  return cached;
}

function html() {
  return bundle().html;
}

// --- Prüfungen ----------------------------------------------------------------------

/**
 * Der Prüfungsschlüssel (Lösungen) liegt verschlüsselt auf dem Server
 * (AES-256-GCM, Schlüssel aus ADMIN_PASSWORD abgeleitet). Wer nur den
 * Datenordner hat, kann ihn nicht lesen; ausgeliefert wird er nur an den Admin.
 */
function encryptKey(value) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(ADMIN_PASSWORD, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

function decryptKey(box) {
  try {
    const key = crypto.scryptSync(ADMIN_PASSWORD, Buffer.from(box.salt, 'base64'), 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(box.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(box.tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(box.data, 'base64')), decipher.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

function loadExam(id) {
  if (!/^[0-9a-f]{16}$/.test(id || '')) return null;
  const item = readJson(path.join(dirs.exams, `${id}.json`));
  return item && item.expires > Date.now() ? item : null;
}

function saveExam(exam) {
  writeJson(path.join(dirs.exams, `${exam.id}.json`), exam);
}

/** Prüfung und Platz zu einem Platz-Code. */
function findSeat(seatCode) {
  for (const exam of list(dirs.exams)) {
    const seat = exam.seats.find((s) => s.code === seatCode);
    if (seat) return { exam, seat };
  }
  return null;
}

/** Zustand eines Platzes: wartet (nicht gestartet), offen (Zeit läuft) oder abgegeben. */
function seatState(exam, seat, now = Date.now()) {
  if (!exam.started) return 'waiting';
  return now <= seat.until ? 'open' : 'closed';
}

function examState(exam, now = Date.now()) {
  if (!exam.started) return 'ready';
  return exam.seats.some((s) => now <= s.until) ? 'running' : 'ended';
}

function seatStatus(exam, seat) {
  const now = Date.now();
  return { state: seatState(exam, seat, now), until: seat.until || null, now, title: exam.title, seat: seat.id };
}

/** Übersicht für den Admin (ohne Schlüssel und ohne Projekte). */
function examSummary(exam, withSeats = false) {
  const now = Date.now();
  const sessions = withSeats ? new Map(entries('sessions').filter((x) => x.exam && x.exam.id === exam.id).map((x) => [x.exam.seat, x])) : null;
  return {
    id: exam.id,
    label: exam.label,
    title: exam.title,
    minutes: exam.minutes,
    state: examState(exam, now),
    started: exam.started || null,
    created: exam.created,
    expires: exam.expires,
    hasKey: !!exam.key,
    seats: withSeats
      ? exam.seats.map((s) => {
          const session = sessions.get(s.id);
          return { id: s.id, code: s.code, extra: s.extra || 0, until: s.until || null, state: seatState(exam, s, now), joined: !!session, saved: session ? session.updated : null, online: session ? connected(session.code, now) : false, session: session ? session.code : null };
        })
      : exam.seats.length,
    joined: withSeats ? undefined : entries('sessions').filter((x) => x.exam && x.exam.id === exam.id).length,
  };
}

// --- API ---------------------------------------------------------------------------

function publicConfig() {
  const s = settings();
  return {
    policy: { modes: s.modes, maxLevel: s.maxLevel, defaultLevel: s.defaultLevel, disabled: s.disabled, sessionHours: s.sessionHours },
    feedbackEnabled: s.feedbackEnabled,
    feedbackDays: s.feedbackDays,
    admin: !!ADMIN_PASSWORD,
    channel: CHANNEL,
  };
}

function loadSession(code) {
  const item = readJson(fileFor(dirs.sessions, code));
  return item && item.expires > Date.now() ? item : null;
}

function loadClass(code) {
  const item = readJson(fileFor(dirs.classes, code));
  return item && item.expires > Date.now() ? item : null;
}

async function api(req, res, url) {
  const method = req.method || 'GET';
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // ohne «api»

  if (parts[0] === 'config' && method === 'GET') return json(res, 200, publicConfig());

  // --- Sessions ---
  if (parts[0] === 'sessions') {
    // Ganze Klassen hinter einer Schul-Adresse (NAT) speichern laufend: grosszügige Grenze.
    if (limited(req, 'sessions', 600)) return fail(res, 429, 'rateLimited');
    // Neue Sessions legen Dateien an: eigene, engere Grenze.
    if (parts.length === 1 && method === 'POST' && (limited(req, 'newSession', NEW_SESSIONS_PER_MINUTE) || limitedGlobal('newSession', 1200))) return fail(res, 429, 'rateLimited');
    const s = settings();
    const ttl = s.sessionHours * 3_600_000;

    if (parts.length === 1 && method === 'POST') {
      const body = await readBody(req);
      if (!validProject(body.project)) return fail(res, 400, 'invalidProject');
      let classCode = null;
      if (body.classCode) {
        classCode = normalizeCode(body.classCode);
        if (!classCode || !loadClass(classCode)) return fail(res, 404, 'unknownClass');
      }
      if (!fits(projectSize(body.project), 1)) return fail(res, 507, 'storageFull');
      let code = newCode();
      while (indexes.sessions.has(code) || fs.existsSync(fileFor(dirs.sessions, code))) code = newCode();
      const now = Date.now();
      const writer = crypto.randomBytes(24).toString('base64url');
      const item = { code, created: now, updated: now, expires: now + ttl, classCode, project: body.project, writer: writerHash(writer) };
      store('sessions', code, item);
      leases.set(code, now);
      return json(res, 201, { code, expires: item.expires, classCode, writer });
    }

    const code = normalizeCode(parts[1]);
    if (!code || parts.length > 3) return fail(res, 404, 'unknownSession');
    const item = loadSession(code);
    if (!item) return fail(res, 404, 'unknownSession');
    const token = writerOf(req);
    const about = (it) => ({ locked: !!it.lock, connected: connected(code) });

    // Lebenszeichen des schreibenden Geräts (alle 20 s), damit kein zweites übernimmt.
    if (parts[2] === 'ping' && method === 'POST') {
      if (!isWriter(item, token)) return json(res, 409, { error: 'sessionTakenOver', ...about(item) });
      leases.set(code, Date.now());
      return json(res, 200, { ok: true, ...about(item) });
    }
    // Sperren mit PIN (nur das schreibende Gerät); Prüfungsplätze lassen sich nicht sperren.
    if (parts[2] === 'lock') {
      if (item.exam) return fail(res, 403, 'examSession');
      if (!isWriter(item, token)) return json(res, 409, { error: 'sessionTakenOver', ...about(item) });
      if (method === 'POST') {
        const body = await readBody(req);
        if (typeof body.pin !== 'string' || !PIN.test(body.pin)) return fail(res, 400, 'invalidPin');
        const salt = crypto.randomBytes(16).toString('base64url');
        store('sessions', code, { ...item, lock: { salt, hash: pinHash(body.pin, salt) } });
        return json(res, 200, { locked: true });
      }
      if (method === 'DELETE') {
        const { lock: _lock, ...rest } = item;
        store('sessions', code, rest);
        return json(res, 200, { locked: false });
      }
      return fail(res, 405, 'methodNotAllowed');
    }
    if (parts.length !== 2) return fail(res, 404, 'unknownSession');

    if (method === 'GET') {
      const base = { code, expires: item.expires, classCode: item.classCode, project: item.project };
      // Nur ansehen (z.B. Lehrperson): kein Schreibrecht, verdrängt niemanden.
      if (url.searchParams.get('watch') === '1') return json(res, 200, { ...base, updated: item.updated, watch: true, ...about(item) });
      const pin = req.headers['x-leyonet-pin'];
      const claimed = claimWriter(code, item, token, typeof pin === 'string' ? pin : '');
      if (claimed.error) return json(res, claimed.status, { error: claimed.error, ...about(item) });
      return json(res, 200, { ...base, writer: claimed.token, ...about(claimed.item) });
    }
    if (method === 'PUT') {
      const body = await readBody(req);
      if (!validProject(body.project)) return fail(res, 400, 'invalidProject');
      // Ältere Sessions ohne Schreib-Token übernimmt das erste Gerät, das speichert.
      if (item.writer && !isWriter(item, token)) return json(res, 409, { error: 'sessionTakenOver', ...about(item) });
      let writer = null;
      if (!item.writer) {
        writer = crypto.randomBytes(24).toString('base64url');
        item.writer = writerHash(writer);
      }
      leases.set(code, Date.now());
      const now = Date.now();
      // Prüfungs-Session: nur speichern, solange die Zeit des Platzes läuft (plus kurze Gnadenfrist).
      if (item.exam) {
        const exam = loadExam(item.exam.id);
        const seat = exam && exam.seats.find((s) => s.id === item.exam.seat);
        if (!exam || !seat) return fail(res, 404, 'unknownSession');
        if (!exam.started || now > seat.until + EXAM_GRACE_MS) return json(res, 423, { error: 'examClosed', exam: seatStatus(exam, seat) });
        store('sessions', code, { ...item, project: body.project, updated: now });
        return json(res, 200, { code, expires: item.expires, exam: seatStatus(exam, seat), ...(writer ? { writer } : {}) });
      }
      // Die Frist läuft ab der letzten Änderung (Arbeit geht nicht mitten in der Lektion verloren).
      const before = indexes.sessions.get(code);
      if (!fits(projectSize(body.project) - (before ? before.size : 0))) return fail(res, 507, 'storageFull');
      const next = { ...item, project: body.project, updated: now, expires: now + ttl };
      store('sessions', code, next);
      return json(res, 200, { code, expires: next.expires, ...(writer ? { writer } : {}), ...about(next) });
    }
    if (method === 'DELETE') {
      // Abgaben einer Prüfung löscht nur der Admin.
      if (item.exam) return fail(res, 403, 'examSession');
      // Löschen darf nur das schreibende Gerät (sonst könnte jeder mit dem Code fremde Arbeit löschen).
      if (item.writer && !isWriter(item, token)) return json(res, 409, { error: 'sessionTakenOver', ...about(item) });
      drop('sessions', code);
      leases.delete(code);
      return json(res, 200, { deleted: true });
    }
    return fail(res, 405, 'methodNotAllowed');
  }

  // --- Prüfung beitreten (mit Platz-Code) ---
  if (parts[0] === 'exams' && parts[1] === 'join' && method === 'POST') {
    if (limited(req, 'examJoin', 600)) return fail(res, 429, 'rateLimited');
    const body = await readBody(req);
    const seatCode = normalizeCode(body.seatCode);
    const found = seatCode && findSeat(seatCode);
    if (!found) return fail(res, 404, 'unknownSeat');
    const { exam, seat } = found;
    const status = seatStatus(exam, seat);
    if (status.state === 'waiting') return json(res, 200, { exam: status });
    // Weiterarbeiten: vorhandene Session des Platzes; sonst neue mit der Prüfungsdatei.
    const known = entries('sessions').find((x) => x.exam && x.exam.id === exam.id && x.exam.seat === seat.id);
    let session = known ? loadSession(known.code) : null;
    let fresh = false;
    if (!session) {
      if (status.state === 'closed') return json(res, 200, { exam: status });
      let code = newCode();
      while (indexes.sessions.has(code) || fs.existsSync(fileFor(dirs.sessions, code))) code = newCode();
      const now = Date.now();
      session = { code, created: now, updated: now, expires: exam.expires, classCode: null, exam: { id: exam.id, seat: seat.id }, project: exam.learner };
      // Prüfungsplätze zählen nicht zur Grenze: Eine Prüfung darf nie an vollem Speicher scheitern.
      store('sessions', code, session);
      fresh = true;
    }
    // Ein Platz ist nur an einem Gerät offen; ein zweiter Browser wartet, bis die Lehrperson freigibt.
    const claimed = claimWriter(session.code, session, typeof body.writer === 'string' ? body.writer : '', '');
    if (claimed.error) return json(res, 409, { error: 'seatInUse', exam: status });
    return json(res, 200, { exam: status, session: session.code, fresh, variant: seat.variant || null, project: claimed.item.project, writer: claimed.token });
  }

  // --- Klassen beitreten ---
  if (parts[0] === 'classes' && parts[1] === 'join' && method === 'POST') {
    if (limited(req, 'join', 30)) return fail(res, 429, 'rateLimited');
    const body = await readBody(req);
    const code = normalizeCode(body.classCode);
    const item = code && loadClass(code);
    if (!item) return fail(res, 404, 'unknownClass');
    return json(res, 200, { classCode: code, label: item.label });
  }

  // --- Rückmeldungen ---
  if (parts[0] === 'feedback' && parts.length === 1 && method === 'POST') {
    if (limited(req, 'feedback', 5) || limitedGlobal('feedback', 60)) return fail(res, 429, 'rateLimited');
    const s = settings();
    if (!s.feedbackEnabled) return fail(res, 403, 'feedbackDisabled');
    const body = await readBody(req);
    const kind = ['problem', 'idea', 'other'].includes(body.kind) ? body.kind : 'other';
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_FEEDBACK_TEXT) : '';
    if (!text) return fail(res, 400, 'emptyText');
    const withProject = validProject(body.project);
    if (indexes.feedback.size >= MAX_FEEDBACK || !fits((withProject ? projectSize(body.project) : 0) + text.length)) return fail(res, 507, 'storageFull');
    const id = crypto.randomUUID();
    const now = Date.now();
    const item = {
      id,
      kind,
      text,
      created: now,
      expires: now + s.feedbackDays * 86_400_000,
      status: 'open',
      // Nur technische Angaben, keine Personendaten.
      version: typeof body.version === 'string' ? body.version.slice(0, 20) : '',
      locale: typeof body.locale === 'string' ? body.locale.slice(0, 5) : '',
      project: withProject ? body.project : null,
    };
    store('feedback', id, item);
    return json(res, 201, { ok: true });
  }

  // --- Admin ---
  if (parts[0] === 'admin') return admin(req, res, parts.slice(1), method);

  return fail(res, 404, 'notFound');
}

function list(dir) {
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  const now = Date.now();
  return names.map((n) => readJson(path.join(dir, n))).filter((item) => item && item.expires > now);
}

async function admin(req, res, parts, method) {
  if (parts[0] === 'login' && method === 'POST') {
    // Auch insgesamt begrenzt: Raten des Passworts bleibt aussichtslos, selbst mit vielen Adressen.
    if (limited(req, 'login', 10) || limitedGlobal('login', 30)) return fail(res, 429, 'rateLimited');
    if (!ADMIN_PASSWORD) return fail(res, 403, 'adminDisabled');
    const body = await readBody(req);
    if (!checkPassword(body.password || '')) return fail(res, 401, 'wrongPassword');
    const token = crypto.randomBytes(32).toString('base64url');
    for (const [t, expires] of tokens) if (expires < Date.now()) tokens.delete(t);
    tokens.set(token, Date.now() + ADMIN_TOKEN_HOURS * 3_600_000);
    return json(res, 200, { token });
  }
  if (!isAdmin(req)) return fail(res, 401, 'notLoggedIn');

  if (parts[0] === 'logout' && method === 'POST') {
    tokens.delete((req.headers.authorization || '').slice(7));
    return json(res, 200, { ok: true });
  }

  if (parts[0] === 'overview' && method === 'GET') {
    const sessions = entries('sessions');
    const feedback = entries('feedback');
    const u = usage();
    return json(res, 200, {
      settings: settings(),
      sessions: sessions.length,
      storage: { bytes: u.bytes, maxBytes: MAX_STORAGE_BYTES, sessions: u.sessions, maxSessions: MAX_SESSIONS },
      classes: list(dirs.classes)
        .map((c) => ({ code: c.code, label: c.label, created: c.created, expires: c.expires, sessions: sessions.filter((s) => s.classCode === c.code).length }))
        .sort((a, b) => b.created - a.created),
      feedbackOpen: feedback.filter((f) => f.status === 'open').length,
      feedbackTotal: feedback.length,
    });
  }

  // Ergebnis der Release-Prüfungen (Datenschutz, Sicherheit, Lizenzen), erzeugt von scripts/release-checks.mjs.
  if (parts[0] === 'checks' && method === 'GET') {
    const report = readJson(CHECKS_FILE);
    return report ? json(res, 200, report) : fail(res, 404, 'noChecks');
  }

  if (parts[0] === 'settings' && method === 'PUT') {
    const body = await readBody(req);
    const current = settings();
    const int = (v, min, max, fallback) => (Number.isInteger(v) && v >= min && v <= max ? v : fallback);
    const modes = { ...current.modes };
    for (const m of ['design', 'simulation']) if (body.modes && typeof body.modes[m] === 'boolean') modes[m] = body.modes[m];
    if (!modes.design && !modes.simulation) modes.design = true;
    const maxLevel = int(body.maxLevel, 1, 5, current.maxLevel);
    const next = {
      modes,
      maxLevel,
      defaultLevel: Math.min(int(body.defaultLevel, 1, 5, current.defaultLevel), maxLevel),
      disabled: Array.isArray(body.disabled) ? [...new Set(body.disabled.filter((f) => typeof f === 'string' && FEATURE_ID.test(f)))].slice(0, 200) : current.disabled,
      sessionHours: int(body.sessionHours, 1, 24 * 30, current.sessionHours),
      feedbackEnabled: typeof body.feedbackEnabled === 'boolean' ? body.feedbackEnabled : current.feedbackEnabled,
      feedbackDays: int(body.feedbackDays, 1, 365, current.feedbackDays),
      classHours: int(body.classHours, 1, 24 * 180, current.classHours),
    };
    writeJson(path.join(DATA_DIR, 'settings.json'), next);
    return json(res, 200, next);
  }

  if (parts[0] === 'feedback') {
    if (parts.length === 1 && method === 'GET') {
      return json(res, 200, entries('feedback').sort((a, b) => b.created - a.created).map(({ size, ...f }) => f));
    }
    const id = /^[0-9a-f-]{36}$/.test(parts[1] || '') ? parts[1] : null;
    const item = id && readJson(fileFor(dirs.feedback, id));
    if (!item) return fail(res, 404, 'notFound');
    if (method === 'GET') return json(res, 200, item);
    if (method === 'PATCH') {
      const body = await readBody(req);
      if (body.status === 'open' || body.status === 'done') store('feedback', id, { ...item, status: body.status });
      return json(res, 200, { ok: true });
    }
    if (method === 'DELETE') {
      drop('feedback', id);
      return json(res, 200, { ok: true });
    }
  }

  if (parts[0] === 'exams') return adminExams(req, res, parts.slice(1), method);

  if (parts[0] === 'classes') {
    if (parts.length === 1 && method === 'POST') {
      const body = await readBody(req);
      const label = typeof body.label === 'string' ? body.label.trim().slice(0, 40) : '';
      if (!label) return fail(res, 400, 'labelRequired');
      const s = settings();
      let code = newCode();
      while (fs.existsSync(fileFor(dirs.classes, code))) code = newCode();
      const now = Date.now();
      const item = { code, label, created: now, expires: now + s.classHours * 3_600_000 };
      writeJson(fileFor(dirs.classes, code), item);
      return json(res, 201, item);
    }
    const code = normalizeCode(parts[1]);
    const item = code && loadClass(code);
    if (!item) return fail(res, 404, 'unknownClass');
    if (parts[2] === 'sessions' && method === 'GET') {
      const sessions = entries('sessions')
        .filter((s) => s.classCode === code)
        .sort((a, b) => a.created - b.created)
        .map((m) => loadSession(m.code))
        .filter(Boolean)
        .map((s) => ({ code: s.code, created: s.created, updated: s.updated, expires: s.expires, ...summary(s.project) }));
      return json(res, 200, sessions);
    }
    if (parts.length === 2 && method === 'DELETE') {
      // Klasse schliessen: auch alle ihre Sessions löschen.
      for (const s of entries('sessions')) if (s.classCode === code) drop('sessions', s.code);
      remove(fileFor(dirs.classes, code));
      return json(res, 200, { ok: true });
    }
  }

  if (parts[0] === 'sessions') {
    if (parts.length === 1 && method === 'DELETE') {
      // Abgaben von Prüfungen bleiben (sie werden mit der Prüfung gelöscht).
      for (const s of entries('sessions')) if (!s.exam) drop('sessions', s.code);
      return json(res, 200, { ok: true });
    }
    const code = normalizeCode(parts[1]);
    const item = code && loadSession(code);
    if (!item) return fail(res, 404, 'unknownSession');
    if (method === 'GET') return json(res, 200, { code, project: item.project, classCode: item.classCode, updated: item.updated, connected: connected(code), locked: !!item.lock });
    if (method === 'DELETE') {
      leases.delete(code);
      drop('sessions', code);
      return json(res, 200, { ok: true });
    }
  }

  return fail(res, 404, 'notFound');
}

async function adminExams(req, res, parts, method) {
  if (parts.length === 0 && method === 'GET') {
    return json(res, 200, list(dirs.exams).sort((a, b) => b.created - a.created).map((e) => examSummary(e)));
  }
  if (parts.length === 0 && method === 'POST') {
    const body = await readBody(req, MAX_EXAM_BODY);
    const learner = body.learner;
    const info = learner && learner.tasks && learner.tasks.exam;
    if (!validProject(learner) || !info || typeof info.id !== 'string') return fail(res, 400, 'notAnExam');
    const label = typeof body.label === 'string' ? body.label.trim().slice(0, 60) : '';
    if (!label) return fail(res, 400, 'labelRequired');
    // Plätze: je Variante einer, bei nur einer Variante so viele wie gewünscht.
    const variants = Array.isArray(info.variants) ? info.variants.map((v) => String(v.id)) : null;
    const count = variants ? variants.length : Number.isInteger(body.seats) && body.seats >= 1 && body.seats <= MAX_EXAM_SEATS ? body.seats : 0;
    if (!count || count > MAX_EXAM_SEATS) return fail(res, 400, 'badSeats');
    let key = null;
    if (body.key !== undefined && body.key !== null) {
      if (!body.key.meta || body.key.meta.format !== 'netzwerk-simulator-pruefungsschluessel' || !body.key.key || body.key.key.id !== info.id) return fail(res, 400, 'keyMismatch');
      key = encryptKey(body.key);
    }
    const minutes = Number.isInteger(body.minutes) && body.minutes > 0 && body.minutes <= MAX_EXAM_MINUTES ? body.minutes : Number.isInteger(info.minutes) ? info.minutes : 60;
    const used = new Set(list(dirs.exams).flatMap((e) => e.seats.map((s) => s.code)));
    const seats = Array.from({ length: count }, (_, i) => {
      let code = newCode();
      while (used.has(code)) code = newCode();
      used.add(code);
      return { id: variants ? variants[i] : String(i + 1).padStart(2, '0'), variant: variants ? variants[i] : null, code, extra: 0, until: 0 };
    });
    const now = Date.now();
    const exam = {
      id: crypto.randomBytes(8).toString('hex'),
      examId: info.id,
      label,
      title: typeof learner.tasks.title === 'string' ? learner.tasks.title.slice(0, 160) : label,
      minutes,
      created: now,
      started: 0,
      expires: now + EXAM_DAYS * 86_400_000,
      learner,
      key,
      seats,
    };
    saveExam(exam);
    return json(res, 201, examSummary(exam, true));
  }
  const exam = loadExam(parts[0]);
  if (!exam) return fail(res, 404, 'unknownExam');
  const now = Date.now();
  if (parts.length === 1 && method === 'GET') return json(res, 200, examSummary(exam, true));
  if (parts.length === 1 && method === 'DELETE') {
    for (const s of entries('sessions')) if (s.exam && s.exam.id === exam.id) drop('sessions', s.code);
    remove(path.join(dirs.exams, `${exam.id}.json`));
    return json(res, 200, { ok: true });
  }
  if (parts[1] === 'start' && method === 'POST') {
    if (exam.started) return fail(res, 409, 'alreadyStarted');
    exam.started = now;
    for (const s of exam.seats) s.until = now + (exam.minutes + (s.extra || 0)) * 60_000;
    saveExam(exam);
    return json(res, 200, examSummary(exam, true));
  }
  if (parts[1] === 'end' && method === 'POST') {
    if (!exam.started) return fail(res, 409, 'notStarted');
    for (const s of exam.seats) s.until = Math.min(s.until, now);
    saveExam(exam);
    return json(res, 200, examSummary(exam, true));
  }
  // Nachteilsausgleich: Minuten für einen Platz dazugeben (vor dem Start oder später; ein abgegebener Platz öffnet wieder).
  if (parts[1] === 'seats' && parts[3] === 'extra' && method === 'POST') {
    const seat = exam.seats.find((s) => s.id === parts[2]);
    if (!seat) return fail(res, 404, 'unknownSeat');
    const body = await readBody(req);
    const minutes = Number.isInteger(body.minutes) && Math.abs(body.minutes) <= MAX_EXAM_MINUTES && body.minutes !== 0 ? body.minutes : null;
    if (minutes === null) return fail(res, 400, 'badMinutes');
    seat.extra = Math.max(0, (seat.extra || 0) + minutes);
    if (exam.started) seat.until = minutes > 0 ? Math.max(seat.until, now) + minutes * 60_000 : Math.max(exam.started, seat.until + minutes * 60_000);
    saveExam(exam);
    return json(res, 200, examSummary(exam, true));
  }
  // Platz freigeben: z.B. Browser abgestürzt, die Person arbeitet an einem anderen Gerät weiter.
  if (parts[1] === 'seats' && parts[3] === 'release' && method === 'POST') {
    const seat = exam.seats.find((s) => s.id === parts[2]);
    if (!seat) return fail(res, 404, 'unknownSeat');
    const known = entries('sessions').find((x) => x.exam && x.exam.id === exam.id && x.exam.seat === seat.id);
    const item = known && loadSession(known.code);
    if (item) {
      const { writer: _w, ...rest } = item;
      store('sessions', item.code, rest);
      leases.delete(item.code);
    }
    return json(res, 200, examSummary(exam, true));
  }
  // Abgaben für die Auswertung, mit entschlüsseltem Schlüssel.
  if (parts[1] === 'submissions' && method === 'GET') {
    const key = exam.key ? decryptKey(exam.key) : null;
    const submissions = entries('sessions')
      .filter((s) => s.exam && s.exam.id === exam.id)
      .map((m) => loadSession(m.code))
      .filter(Boolean)
      .sort((a, b) => a.exam.seat.localeCompare(b.exam.seat))
      .map((s) => ({ seat: s.exam.seat, code: exam.seats.find((x) => x.id === s.exam.seat)?.code || '', updated: s.updated, project: s.project }));
    return json(res, 200, { id: exam.id, examId: exam.examId, title: exam.title, label: exam.label, key, keyError: exam.key && !key ? 'unreadable' : null, submissions });
  }
  return fail(res, 404, 'notFound');
}

// --- Server ------------------------------------------------------------------------

function createServer() {
  ensureDirs();
  // Verzeichnis im Hintergrund aufbauen, danach regelmässig aufräumen.
  const ready = buildIndexes()
    .then(cleanup)
    .catch((error) => console.error('Verzeichnis:', error && error.message));
  const timer = setInterval(() => void cleanup().catch(() => undefined), 10 * 60_000);
  timer.unref();

  const server = http.createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url || '/', 'http://localhost');
    } catch {
      return fail(res, 400, 'badRequest');
    }
    try {
      if (url.pathname.startsWith('/api/')) {
        // Nur JSON von der eigenen Seite (Schutz gegen fremde Formulare).
        const hasBody = Number(req.headers['content-length'] || 0) > 0 || !!req.headers['transfer-encoding'];
        if (hasBody && !(req.headers['content-type'] || '').startsWith('application/json')) {
          return fail(res, 415, 'jsonOnly');
        }
        return await api(req, res, url);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'methodNotAllowed');
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return send(res, 200, req.method === 'HEAD' ? '' : html(), { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP });
      }
      const asset = url.pathname.startsWith('/assets/') ? bundle().assets.get(url.pathname) : undefined;
      if (asset) return send(res, 200, req.method === 'HEAD' ? '' : asset.body, { 'Content-Type': asset.type });
      if (url.pathname === '/THIRD_PARTY_NOTICES.md') {
        return send(res, 200, fs.readFileSync(NOTICES_FILE), { 'Content-Type': 'text/markdown; charset=utf-8' });
      }
      // Testumgebung: Suchmaschinen sollen nichts aufnehmen; die stabile Version darf gefunden werden.
      if (url.pathname === '/robots.txt') {
        return send(res, 200, CHANNEL === 'beta' ? 'User-agent: *\nDisallow: /\n' : 'User-agent: *\nAllow: /\n', { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      if (url.pathname === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });
      return fail(res, 404, 'notFound');
    } catch (error) {
      const status = error && error.status ? error.status : 500;
      // Keine Anfragedaten ins Log: nur der Fehlercode.
      if (status === 500) console.error('Serverfehler:', error && error.message);
      // Platte voll (z.B. durch andere Programme): sauber melden statt Serverfehler.
      if (error && error.code === 'ENOSPC') return fail(res, 507, 'storageFull');
      // Zu gross: Rest verwerfen (bis 16 MB, damit der Absender die Antwort sicher erhält),
      // bei noch grösseren Anfragen die Verbindung nach der Antwort schliessen.
      if (status === 413) {
        const declared = Number(req.headers['content-length'] || 0);
        if (declared > 0 && declared <= 16 * 1024 * 1024) req.resume();
        else res.on('finish', () => req.destroy());
        return send(res, 413, JSON.stringify({ error: 'tooLarge' }), { 'Content-Type': 'application/json; charset=utf-8', Connection: 'close' });
      }
      return fail(res, status, error && error.status ? error.message : 'serverError');
    }
  });
  // Langsame oder hängende Verbindungen nicht ewig offen halten (Slowloris).
  server.headersTimeout = 20_000;
  server.requestTimeout = 120_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 60;
  server.ready = ready;
  return server;
}

// `_leases` nur für Tests (Gerät «verschwindet»).
module.exports = { createServer, normalizeCode, newCode, cleanup, DATA_DIR, ADMIN_PASSWORD, _leases: leases };
