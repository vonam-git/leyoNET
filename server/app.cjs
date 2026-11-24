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
const net = require('node:net');
const { promisify } = require('node:util');
const { createSiteStats } = require('./sitestats.cjs');
const scrypt = promisify(crypto.scrypt);

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
/** Admin-Anmeldung endet nach so langer Untätigkeit (offene Konsole fragt regelmässig nach und bleibt angemeldet). */
const ADMIN_IDLE_MS = 60 * 60_000;

/** Feature-IDs dürfen nur aus Buchstaben, Ziffern und Punkten bestehen (Liste in src/ui/features.ts). */
const FEATURE_ID = /^[a-z]+\.[A-Za-z0-9]+$/;
const CHECKS_FILE = path.join(ROOT, 'release', 'checks.json');
/**
 * Website-Statistik: Adressen der Website, deren Aufrufe gezählt werden (kommagetrennt), und das
 * GitHub-Repository der Downloads («off» schaltet die Abfrage ab). Siehe server/sitestats.cjs.
 */
const STATS_ORIGINS = String(process.env.STATS_ORIGINS ?? 'https://leyonet.ch,https://www.leyonet.ch')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter((o) => /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o));
const STATS_GITHUB_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(process.env.STATS_GITHUB_REPO ?? 'vonam-git/leyoNET'))
  ? String(process.env.STATS_GITHUB_REPO ?? 'vonam-git/leyoNET')
  : null;
/** Höchstens so viele Meldungen der Website pro Minute je Adresse bzw. insgesamt. */
const HITS_PER_MINUTE = 120;
const HITS_PER_MINUTE_TOTAL = 6000;
let siteStats = null;

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
  /** Aufgaben-Katalog in der Webversion: ausgeblendete Übungen und Reihen, Verbund-Aufgaben erlaubt. */
  catalog: { hidden: [], hiddenSeries: [], verbund: true },
  /** Zwei-Faktor-Anmeldung (Authenticator-App) für alle Admin-Zugänge verlangen. */
  mfaRequired: false,
};

// --- Speicher ------------------------------------------------------------------

const dirs = {
  sessions: path.join(DATA_DIR, 'sessions'),
  feedback: path.join(DATA_DIR, 'feedback'),
  classes: path.join(DATA_DIR, 'classes'),
  tenants: path.join(DATA_DIR, 'tenants'),
  exams: path.join(DATA_DIR, 'exams'),
};

/** Prüfungen: Aufbewahrung der Abgaben, Gnadenfrist fürs letzte Speichern, Grenzen. */
const EXAM_DAYS = 60;
const EXAM_GRACE_MS = 30_000;
/** Statistik: höchstens so viele Zeilen; Sessions höchstens so lange gültig (auch verlängert). */
const MAX_STATS_ROWS = 2000;
const MAX_SESSION_DAYS = 60;
/** Ein Gerät gilt als verbunden, solange es sich innerhalb dieser Zeit gemeldet hat (Speichern oder Ping alle 20 s). */
const LEASE_MS = 60_000;
/** PIN zum Sperren einer Session: 4 bis 8 Ziffern. */
const PIN = /^\d{4,8}$/;
const PIN_FAILS = 5;
const PIN_WINDOW_MS = 10 * 60_000;
/** Ein Klassencode gilt höchstens so lange (beim Anlegen und beim Verlängern, ab heute gerechnet). */
const MAX_CLASS_DAYS = 180;
const validDays = (v) => Number.isInteger(v) && v >= 1 && v <= MAX_CLASS_DAYS;
const MAX_EXAM_SEATS = 60;
const MAX_EXAM_MINUTES = 600;
/** Code zum Beenden des Prüfungsmodus: Versuche, danach Sperre (0 Minuten = bis die Lehrperson freigibt). */
const UNLOCK_DEFAULT = { attempts: 5, lockMinutes: 10 };
const MAX_UNLOCK_ATTEMPTS = 20;
const MAX_UNLOCK_LOCK = 240;

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
    catalog: readCatalog(stored.catalog, DEFAULT_SETTINGS.catalog),
  };
}

// --- Sichtbarkeit von Aufgaben ------------------------------------------------------

const CATALOG_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SERIES_ID = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,31}$/;
/** Ausgeblendete Übungen und Reihen bereinigen (nur Kennungen, höchstens 500). */
function readCatalog(v, fallback) {
  const o = v && typeof v === 'object' ? v : {};
  const ids = (a, re) => (Array.isArray(a) ? [...new Set(a.filter((x) => typeof x === 'string' && re.test(x)))].slice(0, 500) : []);
  return {
    hidden: o.hidden !== undefined ? ids(o.hidden, CATALOG_ID) : fallback.hidden,
    hiddenSeries: o.hiddenSeries !== undefined ? ids(o.hiddenSeries, SERIES_ID) : fallback.hiddenSeries,
    verbund: typeof o.verbund === 'boolean' ? o.verbund : fallback.verbund,
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
  // Ohne Adresse: Unix-Socket (so bindet Phusion Passenger die App an). Dort kommt jede
  // Anfrage vom Proxy auf demselben Rechner; ohne diese Zeile teilten sich alle einen Zähler.
  if (direct && !LOOPBACK.has(direct)) return rateAddress(direct);
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return rateAddress(forwarded.length ? forwarded[forwarded.length - 1] : String(req.headers['x-real-ip'] || direct));
}

/**
 * IPv6 auf das /64-Netz kürzen: Ein Anschluss erhält meist ein ganzes /64 und könnte sonst mit
 * wechselnden Adressen jede Grenze umgehen und die Zählerliste füllen. IPv4 bleibt unverändert.
 */
function rateAddress(address) {
  const a = String(address || '').slice(0, 64).replace(/%.*$/, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(a);
  if (mapped) return mapped[1];
  if (!net.isIPv6(a)) return a;
  const [head, tail = ''] = a.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = a.includes('::') ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left;
  return `${groups.slice(0, 4).map((g) => (parseInt(g, 16) || 0).toString(16)).join(':')}::/64`;
}

function limited(req, kind, perMinute) {
  return count(bucketKey(req, kind), perMinute);
}

/**
 * Codes raten (Session- und Platz-Codes): Treffer sind normal, Fehlversuche selten. Wer viele
 * unbekannte Codes probiert, wird für den Rest der Minute gebremst. Gezählt werden nur
 * Fehlversuche, je Adresse (eine Schulklasse hinter einer Adresse vertippt sich kaum 30-mal
 * pro Minute). Bewusst ohne gesamte Grenze: sonst könnte jemand mit Fehlversuchen allen
 * anderen das Beitreten sperren.
 */
const MISSES_PER_MINUTE = 30;
function tooManyMisses(req, kind) {
  return peek(`miss:${kind}`, req, MISSES_PER_MINUTE);
}
function countMiss(req, kind) {
  limited(req, `miss:${kind}`, Infinity);
}
const bucketKey = (req, kind) => crypto.createHash('sha256').update(SALT).update(clientIp(req)).update(kind).digest('base64url').slice(0, 16);
function peek(kind, req, perMinute) {
  const b = buckets.get(bucketKey(req, kind));
  return !!b && Date.now() - b.start <= 60_000 && b.count >= perMinute;
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

// --- Zwei-Faktor-Anmeldung (TOTP, RFC 6238) --------------------------------------------
//
// Optional je Zugang (Hauptadmin, Schule, Lehrperson): Nach dem Passwort bzw. Schlüssel ein
// sechsstelliger Code aus einer Authenticator-App. Die App rechnet nur lokal (keine Verbindung,
// keine Personendaten); der Server speichert je Zugang das Geheimnis verschlüsselt (wie den
// Prüfungsschlüssel), den zuletzt verwendeten Zeitschritt (kein Code zweimal) und die Hashes von
// acht Wiederherstellungscodes. Kein Konto, keine E-Mail, keine Telefonnummer.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function unbase32(text) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of String(text).toUpperCase().replace(/[\s=]/g, '')) {
    const v = B32.indexOf(ch);
    if (v < 0) return null;
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
/** HOTP (RFC 4226): sechs Ziffern aus Geheimnis und Zähler. */
function hotp(secret, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', secret).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
const TOTP_STEP_MS = 30_000;
/** Gültiger Code im Fenster ±1 Schritt (Uhren weichen ab), nur Schritte nach dem zuletzt benutzten. */
function totpStep(secret, code, lastStep, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / TOTP_STEP_MS);
  for (const step of [current - 1, current, current + 1]) {
    if (step <= (lastStep || 0)) continue;
    if (sameHash(hotp(secret, step), code)) return step;
  }
  return null;
}
const recoveryHash = (code) => crypto.createHash('sha256').update(String(code).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');
function newRecoveryCodes() {
  return Array.from({ length: 8 }, () => {
    const c = base32(crypto.randomBytes(7)).slice(0, 10);
    return `${c.slice(0, 5)}-${c.slice(5)}`;
  });
}

const SECURITY_FILE = () => path.join(DATA_DIR, 'security.json');
/** Sicherheitsdaten eines Zugangs: Zwei-Faktor und letzte Anmeldung. Hauptadmin in security.json, Zugänge in ihrer Datei. */
function accountData(who) {
  if (who.role === 'super') return (readJson(SECURITY_FILE()) || {}).super || {};
  const t = loadTenant(who.tenant);
  return (t && t.security) || {};
}
function saveAccountData(who, data) {
  if (who.role === 'super') {
    const all = readJson(SECURITY_FILE()) || {};
    writeJson(SECURITY_FILE(), { ...all, super: data });
    return;
  }
  const t = loadTenant(who.tenant);
  if (t) saveTenant({ ...t, security: data });
}
const accountId = (who) => (who.role === 'super' ? 'super' : `t:${who.tenant}`);
/** Angefangene Einrichtungen (Geheimnis noch nicht bestätigt), nur im Arbeitsspeicher, 10 Minuten. */
const mfaPending = new Map();
/** Fehlversuche beim zweiten Faktor je Zugang: nach 5 in 15 Minuten gesperrt (Raten von 6 Ziffern). */
const mfaFails = new Map();
const MFA_FAIL_WINDOW_MS = 15 * 60_000;
function mfaLocked(id) {
  const f = mfaFails.get(id);
  if (!f) return false;
  if (Date.now() - f.since > MFA_FAIL_WINDOW_MS) {
    mfaFails.delete(id);
    return false;
  }
  return f.count >= 5;
}
function countMfaFail(id) {
  const f = mfaFails.get(id);
  if (!f || Date.now() - f.since > MFA_FAIL_WINDOW_MS) mfaFails.set(id, { since: Date.now(), count: 1 });
  else f.count++;
}

/**
 * Zweiten Faktor prüfen: TOTP-Code oder einmaliger Wiederherstellungscode. Bei Erfolg wird der
 * Zeitschritt bzw. der verbrauchte Code gespeichert. Liefert 'ok', 'wrong' oder 'unreadable'
 * (Geheimnis nicht entschlüsselbar, z.B. nach Wechsel von ADMIN_PASSWORD: dann nur noch
 * Wiederherstellungscodes).
 */
function checkSecondFactor(who, data, given) {
  const code = String(given || '').trim();
  const mfa = data.mfa;
  if (/^\d{6}$/.test(code.replace(/\s/g, ''))) {
    const box = decryptKey(mfa.secret);
    const secret = box && typeof box.secret === 'string' ? unbase32(box.secret) : null;
    if (!secret) return 'unreadable';
    const step = totpStep(secret, code.replace(/\s/g, ''), mfa.step);
    if (step === null) return 'wrong';
    saveAccountData(who, { ...data, mfa: { ...mfa, step } });
    return 'ok';
  }
  const hash = recoveryHash(code);
  const list = Array.isArray(mfa.recovery) ? mfa.recovery : [];
  const index = list.findIndex((h) => sameHash(h, hash));
  if (index < 0) return 'wrong';
  saveAccountData(who, { ...data, mfa: { ...mfa, recovery: list.filter((_, i) => i !== index) } });
  return 'ok';
}

/** Anmeldung abschliessen: Zeitpunkt merken, Token ausstellen. */
function issueToken(res, who) {
  const now = Date.now();
  const fresh = accountData(who);
  saveAccountData(who, { ...fresh, lastLogin: now, previousLogin: fresh.lastLogin || null });
  // Zwei-Faktor verlangt, aber noch nicht eingerichtet: Anmeldung nur zum Einrichten.
  const mfaSetup = !!settings().mfaRequired && !(fresh.mfa && fresh.mfa.enabled);
  const token = crypto.randomBytes(32).toString('base64url');
  for (const [k, e] of tokens) if (e.expires < now || now - (e.seen || 0) > ADMIN_IDLE_MS) tokens.delete(k);
  tokens.set(token, { ...who, created: now, seen: now, expires: now + ADMIN_TOKEN_HOURS * 3_600_000, ...(mfaSetup ? { mfaSetup: true } : {}) });
  return json(res, 200, { token, role: who.role, label: who.label, mfaSetup });
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

// --- Klassen: Signale je Session (nur im Arbeitsspeicher, keine Personendaten) ---
// help: Zeitpunkt der Hilfe-Anfrage der Lernenden; identify: bis wann der Bildschirm der
// Lernenden aufblinkt («Erkennen»); teacher: letzte Meldung der Lehrperson, die die Session
// gerade bearbeitet (solange ist die Session für die Lernenden nur lesbar).
const signals = new Map();
/** «Erkennen»: so lange wartet der Auftrag auf das nächste Lebenszeichen der Lernenden. */
const IDENTIFY_MS = 12_000;
/** Blinkdauer in Sekunden (die Lehrperson wählt; Standard 7). */
const IDENTIFY_SECONDS = { min: 3, max: 15, standard: 7 };
const TEACHER_EDIT_MS = 30_000;
const MAX_SIGNALS = 20_000;
function signalOf(code) {
  let s = signals.get(code);
  if (!s) {
    if (signals.size >= MAX_SIGNALS) {
      const now = Date.now();
      for (const [k, v] of signals) if (!v.help && v.identify < now && (v.identifyShown || 0) + (v.identifyMs || 0) < now && now - v.teacher > TEACHER_EDIT_MS) signals.delete(k);
      if (signals.size >= MAX_SIGNALS) return { help: 0, identify: 0, teacher: 0 };
    }
    s = { help: 0, identify: 0, teacher: 0 };
    signals.set(code, s);
  }
  return s;
}
const helpOf = (code) => signals.get(code)?.help || null;
/** Fortschritt: der neueste aus dem Lebenszeichen, sonst der gespeicherte. */
const progressOf = (code, stored) => signals.get(code)?.progress || stored || null;
const PROGRESS_STORE_MS = 30_000;
const teacherEditing = (code, now = Date.now()) => now - (signals.get(code)?.teacher || 0) < TEACHER_EDIT_MS;

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();
const sameHash = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// --- Safe Exam Browser ---
// Prüfung «nur im Safe Exam Browser»: Zufallsschlüssel (256 Bit) je Prüfung, steckt in der
// Start-Adresse der SEB-Datei. Gilt, solange die Prüfung läuft; beim Beenden wird er gelöscht.
const SEB_KEY = /^[0-9a-f]{64}$/;
const newSebKey = () => crypto.randomBytes(32).toString('hex');
/** Anfrage kommt aus dem SEB mit dem Schlüssel dieser Prüfung? (Kennung «SEB/x.y» im User-Agent.) */
function sebAllowed(req, exam, key) {
  if (!exam.seb) return true;
  const ua = String(req.headers['user-agent'] || '');
  return !!exam.seb.key && typeof key === 'string' && SEB_KEY.test(key) && /\bSEB\/\d/.test(ua) && sameHash(key, exam.seb.key);
}
const writerHash = (token) => digest(token).toString('base64url');

function writerOf(req) {
  const token = req.headers['x-leyonet-writer'];
  return typeof token === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(token) ? token : '';
}

function isWriter(item, token) {
  return !!token && sameHash(item.writer, writerHash(token));
}

/** Fortschritt der Lernziele aus einer Anfrage: nur ganze Zahlen 0–99, sonst null. */
function readProgress(p) {
  const count = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x <= y && y <= 99;
  if (!p || typeof p !== 'object' || !count(p.goals, p.total)) return null;
  return { goals: p.goals, total: p.total, ...(p.faults && count(p.faults.fixed, p.faults.total) && p.faults.total > 0 ? { faults: { fixed: p.faults.fixed, total: p.faults.total } } : {}) };
}

function connected(code, now = Date.now()) {
  const seen = leases.get(code);
  return seen !== undefined && now - seen < LEASE_MS;
}

/** Asynchron: scrypt kostet rund 30 ms und darf den Server nicht für alle anderen anhalten. */
async function pinHash(pin, salt) {
  return (await scrypt(String(pin), salt, 32)).toString('base64url');
}

/** PIN prüfen; nach zu vielen Fehlversuchen für diese Session vorübergehend gesperrt. */
async function checkPin(code, item, pin) {
  const now = Date.now();
  const fails = pinFails.get(code);
  if (fails && now - fails.since < PIN_WINDOW_MS && fails.count >= PIN_FAILS) return 'tooMany';
  if (typeof pin !== 'string' || !PIN.test(pin)) return pin ? 'wrong' : 'missing';
  // Vor dem Rechnen zählen: gleichzeitige Versuche dürfen die Grenze nicht umgehen.
  pinFails.set(code, fails && now - fails.since < PIN_WINDOW_MS ? { since: fails.since, count: fails.count + 1 } : { since: now, count: 1 });
  if (sameHash(await pinHash(pin, item.lock.salt), item.lock.hash)) {
    pinFails.delete(code);
    return 'ok';
  }
  return 'wrong';
}

/**
 * Schreibrecht holen: das eigene Token gilt weiter; sonst nur, wenn gerade kein anderes
 * Gerät verbunden ist (und bei gesperrter Session mit PIN). Liefert das (neue) Token.
 */
async function claimWriter(code, item, token, pin) {
  if (isWriter(item, token)) {
    leases.set(code, Date.now());
    return { token, item };
  }
  // Prüfungsplatz: Ein anderes Gerät kommt nur hinein, nachdem die Lehrperson den Platz freigegeben
  // hat (auch wenn das erste Gerät gerade still ist). Sonst könnte jemand mit dem Code der Platzkarte
  // die Arbeit lesen und das erste Gerät am Speichern hindern.
  if (item.exam && item.writer) return { error: 'sessionInUse', status: 409 };
  if (connected(code)) return { error: 'sessionInUse', status: 409 };
  let current = item;
  if (item.lock) {
    const pinState = await checkPin(code, item, pin);
    if (pinState === 'tooMany') return { error: 'rateLimited', status: 429 };
    if (pinState !== 'ok') return { error: pinState === 'wrong' ? 'wrongPin' : 'sessionLocked', status: 423 };
    // Während der Rechnung kann sich die Session geändert haben: neu lesen und nochmals prüfen.
    current = loadSession(code);
    if (!current) return { error: 'unknownSession', status: 404 };
    if (current.writer !== item.writer || connected(code)) return { error: 'sessionInUse', status: 409 };
    if (!current.lock || current.lock.hash !== item.lock.hash) return { error: 'sessionLocked', status: 423 };
  }
  const now = Date.now();
  const fresh = crypto.randomBytes(24).toString('base64url');
  const next = { ...current, writer: writerHash(fresh) };
  store('sessions', code, next);
  leases.set(code, now);
  return { token: fresh, item: next };
}

/** Angemeldete Person: { role: 'super' | 'school' | 'teacher', tenant, school } oder null. */
function principal(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const entry = tokens.get(token);
  const now = Date.now();
  if (!entry || entry.expires < now || now - (entry.seen || 0) > ADMIN_IDLE_MS) {
    tokens.delete(token);
    return null;
  }
  // Automatische Abfragen der offenen Konsole (ohne Eingabe) halten die Anmeldung nicht wach.
  if (req.headers['x-leyonet-auto'] !== '1') entry.seen = now;
  // Gelöschter Zugang: sofort abgemeldet.
  if (entry.tenant && !loadTenant(entry.tenant)) {
    tokens.delete(token);
    return null;
  }
  return entry;
}
const isAdmin = (req) => {
  const who = principal(req);
  return !!who && !who.mfaSetup;
};

// --- Zugänge (Schulen und Lehrpersonen) ----------------------------------------------
//
// Ohne Personendaten: ein Zugang hat nur eine Bezeichnung (z.B. «Schule Sursee», «LP 3»),
// eine Rolle und einen Zugangsschlüssel «LN-<id>-<geheim>». Gespeichert wird nur der Hash des
// geheimen Teils. Der Hauptadmin (ADMIN_PASSWORD) legt Schulen an, eine Schule ihre
// Lehrpersonen. Klassen und Prüfungen gehören dem Zugang, der sie angelegt hat; die Schule
// sieht die ihrer Lehrpersonen, der Hauptadmin alles.

const TENANT_ID = /^[0-9a-f]{8}$/;
const TENANT_KEY = /^LN-([0-9a-f]{8})-([A-Za-z0-9_-]{24,64})$/;
const MAX_TENANTS = 500;
const secretHash = (secret) => crypto.createHash('sha256').update(secret).digest('hex');

function loadTenant(id) {
  return TENANT_ID.test(String(id || '')) ? readJson(path.join(dirs.tenants, `${id}.json`)) : null;
}
function saveTenant(t) {
  writeJson(path.join(dirs.tenants, `${t.id}.json`), t);
}
function tenants() {
  try {
    return fs
      .readdirSync(dirs.tenants)
      .filter((n) => n.endsWith('.json'))
      .map((n) => readJson(path.join(dirs.tenants, n)))
      .filter(Boolean);
  } catch {
    return [];
  }
}
const newTenantSecret = () => crypto.randomBytes(24).toString('base64url');
const tenantKey = (t, secret) => `LN-${t.id}-${secret}`;

/** Zugangsschlüssel prüfen; liefert den Zugang oder null. */
function tenantByKey(key) {
  const m = TENANT_KEY.exec(String(key || '').trim());
  if (!m) return null;
  const t = loadTenant(m[1]);
  return t && sameHash(secretHash(m[2]), t.secret) ? t : null;
}

/** Darf diese Person ein Element (Klasse, Prüfung) mit Besitzer `owner` sehen? */
function canSee(who, owner) {
  if (!who) return false;
  if (who.role === 'super') return true;
  if (!owner) return false;
  if (owner === who.tenant) return true;
  if (who.role === 'school') return loadTenant(owner)?.school === who.tenant;
  return false;
}
const ownerOf = (who) => (who.role === 'super' ? null : who.tenant);
const tenantView = (t) => ({ id: t.id, label: t.label, role: t.role, school: t.school || null, created: t.created, mfa: !!(t.security && t.security.mfa && t.security.mfa.enabled) });

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

// Prüfungsdateien sind gross (bis 12 MB) und werden beim Warten auf den Start von jedem Platz
// alle paar Sekunden gebraucht. Darum: zuletzt gelesene Prüfungen im Arbeitsspeicher (neu gelesen,
// wenn sich die Datei geändert hat) und ein Verzeichnis Platz-Code → Prüfung. So liest eine
// Anfrage ohne Anmeldung nie alle Prüfungsdateien.
const examCache = new Map();
const MAX_EXAM_CACHE = 20;
let seatIndex = null;

const examFile = (id) => path.join(dirs.exams, `${id}.json`);

function loadExam(id) {
  if (!/^[0-9a-f]{16}$/.test(id || '')) return null;
  let stat;
  try {
    stat = fs.statSync(examFile(id));
  } catch {
    examCache.delete(id);
    return null;
  }
  let hit = examCache.get(id);
  if (!hit || hit.mtimeMs !== stat.mtimeMs || hit.size !== stat.size) {
    const exam = readJson(examFile(id));
    if (!exam) return null;
    hit = { mtimeMs: stat.mtimeMs, size: stat.size, exam };
    examCache.delete(id);
    examCache.set(id, hit);
    while (examCache.size > MAX_EXAM_CACHE) examCache.delete(examCache.keys().next().value);
  }
  // Kopie der veränderlichen Teile: Aufrufer ändern Plätze und Eckdaten und speichern danach.
  const exam = hit.exam;
  return exam.expires > Date.now() ? { ...exam, seats: exam.seats.map((s) => ({ ...s })), ...(exam.seb ? { seb: { ...exam.seb } } : {}) } : null;
}

function saveExam(exam) {
  writeJson(examFile(exam.id), exam);
  examCache.delete(exam.id);
  if (seatIndex) for (const s of exam.seats) seatIndex.set(s.code, exam.id);
}

function removeExam(exam) {
  remove(examFile(exam.id));
  examCache.delete(exam.id);
  if (seatIndex) for (const s of exam.seats) seatIndex.delete(s.code);
}

/** Platz-Code → Kennung der Prüfung; einmal aufgebaut, danach beim Speichern und Löschen nachgeführt. */
function seatCodes() {
  if (!seatIndex) {
    seatIndex = new Map();
    for (const exam of list(dirs.exams)) for (const s of exam.seats) seatIndex.set(s.code, exam.id);
  }
  return seatIndex;
}

/** Prüfung und Platz zu einem Platz-Code. */
function findSeat(seatCode) {
  const id = seatCodes().get(seatCode);
  const exam = id ? loadExam(id) : null;
  const seat = exam && exam.seats.find((s) => s.code === seatCode);
  if (!seat) {
    if (id) seatIndex.delete(seatCode);
    return null;
  }
  return { exam, seat };
}

/** Zustand eines Platzes: wartet (nicht gestartet), offen (Zeit läuft) oder abgegeben. */
function seatState(exam, seat, now = Date.now()) {
  if (!exam.started) return 'waiting';
  if (seat.submitted) return 'closed';
  return now <= seat.until ? 'open' : 'closed';
}

function examState(exam, now = Date.now()) {
  if (!exam.started) return 'ready';
  return exam.seats.some((s) => !s.submitted && now <= s.until) ? 'running' : 'ended';
}

/** Regel für den Code zum Beenden (Versuche, Sperre) aus dem Formular; ungültig: null. */
function cleanUnlockPolicy(v) {
  if (!v || typeof v !== 'object') return null;
  const attempts = Number.isInteger(v.attempts) && v.attempts >= 1 && v.attempts <= MAX_UNLOCK_ATTEMPTS ? v.attempts : null;
  const lockMinutes = Number.isInteger(v.lockMinutes) && v.lockMinutes >= 0 && v.lockMinutes <= MAX_UNLOCK_LOCK ? v.lockMinutes : null;
  return attempts === null || lockMinutes === null ? null : { attempts, lockMinutes };
}
const unlockPolicy = (exam) => exam.unlockPolicy || UNLOCK_DEFAULT;

/** Sperre des Codes zum Beenden für einen Platz: noch erlaubte Versuche und gesperrt bis (0 = nicht, -1 = bis zur Freigabe). */
function unlockState(exam, seat, now = Date.now()) {
  const policy = unlockPolicy(exam);
  const fails = seat.unlockFails || 0;
  const lockedUntil = fails >= policy.attempts ? (policy.lockMinutes === 0 ? -1 : (seat.unlockLast || 0) + policy.lockMinutes * 60_000) : 0;
  // Abgelaufene Sperre: wieder alle Versuche.
  if (lockedUntil > 0 && lockedUntil <= now) return { left: policy.attempts, lockedUntil: 0, fails: 0, expired: true };
  return { left: Math.max(0, policy.attempts - fails), lockedUntil, fails };
}

/**
 * Prüfungsdatei, wie sie ein Platz bekommt: nur seine Variante (nicht die Startnetze und Ziele
 * der anderen Plätze, aus denen sich bei einer Fehlersuche die Lösung ablesen liesse) und ohne
 * Prüfwert des Codes zum Beenden (den prüft der Server, sonst liesse er sich offline erraten).
 * Wie chooseVariant im Kern (src/core/tasks/exam.ts).
 */
function learnerProject(project, seat) {
  if (!project || typeof project !== 'object' || !project.tasks || !project.tasks.exam) return project;
  const out = { ...project, tasks: { ...project.tasks } };
  const { variants, unlock: _u, ...exam } = project.tasks.exam;
  if (Array.isArray(variants)) {
    const v = variants.find((x) => x && String(x.id) === String(seat && (seat.variant || seat.id)));
    if (v) {
      out.tasks.title = v.title;
      if (v.description) out.tasks.description = v.description;
      out.tasks.goals = Array.isArray(v.goals) ? v.goals : [];
      if (v.topology) out.topology = v.topology;
      out.tasks.exam = { ...exam, variant: v.id, ...(v.raster ? { raster: v.raster } : {}) };
      return out;
    }
  }
  out.tasks.exam = exam;
  return out;
}

function seatStatus(exam, seat) {
  const now = Date.now();
  const lock = unlockState(exam, seat, now);
  return {
    state: seatState(exam, seat, now),
    until: seat.until || null,
    submitted: seat.submitted || null,
    now,
    title: exam.title,
    seat: seat.id,
    ...(exam.seb && exam.seb.quitLink ? { sebQuit: true } : {}),
    unlock: { left: lock.left, lockedUntil: lock.lockedUntil },
  };
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
    seb: exam.seb ? { key: exam.seb.key || null, quitLink: !!exam.seb.quitLink } : null,
    unlock: unlockPolicy(exam),
    seats: withSeats
      ? exam.seats.map((s) => {
          const session = sessions.get(s.id);
          const lock = unlockState(exam, s, now);
          return {
            id: s.id,
            code: s.code,
            extra: s.extra || 0,
            until: s.until || null,
            submitted: s.submitted || null,
            state: seatState(exam, s, now),
            joined: !!session,
            saved: session ? session.updated : null,
            online: session ? connected(session.code, now) : false,
            session: session ? session.code : null,
            unlockFails: lock.fails || 0,
            unlockLocked: lock.lockedUntil !== 0,
          };
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
    catalog: s.catalog,
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

const EMPTY_CATALOG = { hidden: [], hiddenSeries: [], verbund: true };
// seatChoice: Lernende wählen Platz und Gruppe beim Beitreten selbst (sonst vergibt der Server den nächsten freien Platz).
const verbundOf = (c) => ({ enabled: false, shareSites: false, showMap: false, seatChoice: false, infra: null, infraUpdated: 0, ...(c.verbund || {}) });
function classView(c, sessions) {
  const v = verbundOf(c);
  return {
    code: c.code,
    label: c.label,
    created: c.created,
    expires: c.expires,
    owner: c.owner || null,
    sessions: sessions.filter((s) => s.classCode === c.code).length,
    catalog: c.catalog || EMPTY_CATALOG,
    verbund: { enabled: v.enabled, shareSites: v.shareSites, showMap: v.showMap, seatChoice: v.seatChoice, hasInfra: !!v.infra, infraUpdated: v.infraUpdated },
  };
}

// --- Klassen-Verbund ---------------------------------------------------------------
//
// Status je Standort (vom Dashboard der Lehrperson) und Nachrichten nur im Arbeitsspeicher:
// kurzlebig, nach einem Neustart weg. Nachrichten sind Text von Lernenden: begrenzt, ohne Protokoll.
const verbundStatus = new Map();
const messages = new Map();
const STATUS_LEVELS = ['offline', 'connected', 'online', 'services', 'done'];
const MESSAGE_TTL_MS = 30 * 60_000;
const MAX_MESSAGES = 200;
const MAX_MESSAGE_TEXT = 500;
const MAX_SEAT = 62;
const validSeat = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_SEAT;
const cleanLabel = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 30) : '');

function cleanStatus(sites) {
  const out = {};
  if (!sites || typeof sites !== 'object') return out;
  for (const [seat, v] of Object.entries(sites).slice(0, MAX_SEAT)) {
    const n = Number(seat);
    if (!validSeat(n) || !v || typeof v !== 'object') continue;
    out[n] = {
      level: STATUS_LEVELS.includes(v.level) ? v.level : 'offline',
      goals: Number.isInteger(v.goals) && v.goals >= 0 && v.goals <= 99 ? v.goals : 0,
      total: Number.isInteger(v.total) && v.total >= 0 && v.total <= 99 ? v.total : 0,
      ...(v.faults && Number.isInteger(v.faults.fixed) && Number.isInteger(v.faults.total) && v.faults.fixed >= 0 && v.faults.total > 0 && v.faults.fixed <= v.faults.total && v.faults.total <= 99
        ? { faults: { fixed: v.faults.fixed, total: v.faults.total } }
        : {}),
    };
  }
  return out;
}

/** Platz für eine neue Session in der Klasse: gewünschter, sonst der nächste freie. */
function seatFor(classCode, wanted) {
  // Platz und Gruppe stehen im Verzeichnis (alles ausser dem Projekt): keine Datei lesen.
  const taken = new Set(entries('sessions').filter((s) => s.classCode === classCode).map((s) => s.site && s.site.seat).filter(Boolean));
  if (validSeat(wanted) && !taken.has(wanted)) return wanted;
  for (let n = 1; n <= MAX_SEAT; n++) if (!taken.has(n)) return n;
  return null;
}

function classMessages(code, now = Date.now()) {
  const list = (messages.get(code) || []).filter((m) => now - m.time < MESSAGE_TTL_MS);
  messages.set(code, list);
  return list;
}

async function api(req, res, url) {
  const method = req.method || 'GET';
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // ohne «api»

  if (parts[0] === 'config' && method === 'GET') return json(res, 200, publicConfig());

  // --- Sessions ---
  if (parts[0] === 'sessions') {
    // Ganze Klassen hinter einer Schul-Adresse (NAT) speichern laufend: grosszügige Grenze.
    // Lebenszeichen kommen in Klassen alle paar Sekunden und kosten fast nichts: eigene Grenze.
    if (parts[2] === 'ping' && method === 'POST' ? limited(req, 'ping', 2400) : limited(req, 'sessions', 600)) return fail(res, 429, 'rateLimited');
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
      // Ein Gerät tritt einer Klasse nur einmal bei: Der Browser schickt eine zufällige Gerätekennung
      // (nur in seinem Speicher, keine Personendaten); gespeichert wird nur ihr Hash. Kommt dasselbe Gerät
      // wieder, bekommt es seine bisherige Session zurück (mit neuem Schreib-Token) statt einer neuen.
      const device = classCode && typeof body.device === 'string' && /^[A-Za-z0-9_-]{24,64}$/.test(body.device) ? writerHash(`device:${body.device}`) : null;
      if (device) {
        const now = Date.now();
        const known = entries('sessions').find((m) => m.classCode === classCode && m.device === device && !m.exam);
        const full = known && loadSession(known.code);
        if (full) {
          const writer = crypto.randomBytes(24).toString('base64url');
          store('sessions', full.code, { ...full, writer: writerHash(writer), expires: Math.max(full.expires, now + ttl) });
          leases.set(full.code, now);
          return json(res, 200, { code: full.code, expires: Math.max(full.expires, now + ttl), classCode, site: full.site || null, writer, existing: true, project: full.project });
        }
      }
      if (!fits(projectSize(body.project), 1)) return fail(res, 507, 'storageFull');
      let code = newCode();
      while (indexes.sessions.has(code) || fs.existsSync(fileFor(dirs.sessions, code))) code = newCode();
      const now = Date.now();
      const writer = crypto.randomBytes(24).toString('base64url');
      // In einer Klasse: Platz (gewünscht oder nächster freier) und Gruppenbezeichnung für den Verbund.
      let site = null;
      if (classCode) {
        // Platz und Gruppe nur, wenn die Lehrperson die Wahl freigibt; sonst der nächste freie Platz.
        const cls = loadClass(classCode);
        const choose = !!cls && verbundOf(cls).enabled && verbundOf(cls).seatChoice;
        const seat = seatFor(classCode, choose ? body.site && body.site.seat : undefined);
        if (seat) site = { seat, label: choose ? cleanLabel(body.site && body.site.label) : '' };
      }
      const item = { code, created: now, updated: now, expires: now + ttl, classCode, ...(site ? { site } : {}), ...(device ? { device } : {}), project: body.project, writer: writerHash(writer) };
      store('sessions', code, item);
      leases.set(code, now);
      return json(res, 201, { code, expires: item.expires, classCode, site, writer });
    }

    if (tooManyMisses(req, 'session')) return fail(res, 429, 'rateLimited');
    const code = normalizeCode(parts[1]);
    // Erst den Inhalt der Anfrage lesen (kann bei langsamer Leitung dauern), dann den Stand laden:
    // sonst überschriebe ein laufendes Speichern eine inzwischen gesetzte Sperre, eine Freigabe
    // oder brächte eine gelöschte Session zurück.
    // Lebenszeichen sind klein (Fortschritt, Hilfe): enge Grösse und eine Grenze je Session.
    const isPing = parts[2] === 'ping' && method === 'POST';
    if (isPing && code && count(`ping:${code}`, 40)) return fail(res, 429, 'rateLimited');
    const body = code && (method === 'PUT' || method === 'POST') ? await readBody(req, isPing ? 2048 : MAX_BODY) : {};
    const item = code && parts.length <= 3 ? loadSession(code) : null;
    if (!item) {
      countMiss(req, 'session');
      return fail(res, 404, 'unknownSession');
    }
    const token = writerOf(req);
    const about = (it) => ({ locked: !!it.lock, connected: connected(code) });

    // Lebenszeichen des schreibenden Geräts (alle 20 s), damit kein zweites übernimmt.
    if (parts[2] === 'ping' && method === 'POST') {
      if (!isWriter(item, token)) return json(res, 409, { error: 'sessionTakenOver', ...about(item) });
      // Abgegebener Prüfungsplatz: nicht mehr belegen.
      if (item.submitted) return json(res, 423, { error: 'examClosed' });
      const now = Date.now();
      leases.set(code, now);
      if (!item.classCode) return json(res, 200, { ok: true, ...about(item) });
      // Klasse: Fortschritt (zwei kleine Zahlen) und Hilfe-Anfrage mitschicken.
      // Den Fortschritt hält der Server im Arbeitsspeicher und schreibt ihn höchstens alle 30 s in die Datei.
      const progress = readProgress(body.progress);
      const sig = signalOf(code);
      if (progress) {
        sig.progress = progress;
        if (JSON.stringify(progress) !== JSON.stringify(item.progress || null) && now - (sig.stored || 0) >= PROGRESS_STORE_MS) {
          sig.stored = now;
          store('sessions', code, { ...item, progress });
        }
      }
      if (body.help === true && !sig.help) sig.help = now;
      if (body.help === false) sig.help = 0;
      // «Erkennen» nur einmal zustellen (als Blinkdauer in ms); die Lehrperson sieht, ab wann es blinkt.
      let identify = false;
      if (sig.identify > now && !sig.identifyShown) {
        sig.identifyShown = now;
        identify = sig.identifyMs || IDENTIFY_SECONDS.standard * 1000;
      }
      return json(res, 200, { ok: true, ...about(item), updated: item.updated, help: !!sig.help, identify, teacher: teacherEditing(code, now) });
    }
    // Platz und Gruppe im Klassen-Verbund ändern (nur das schreibende Gerät).
    if (parts[2] === 'site' && method === 'PUT') {
      if (!item.classCode) return fail(res, 400, 'notInClass');
      if (!isWriter(item, token)) return json(res, 409, { error: 'sessionTakenOver', ...about(item) });
      // Platz und Gruppe selbst ändern nur, wenn die Lehrperson die Wahl freigegeben hat.
      const cls = loadClass(item.classCode);
      if (!cls || !verbundOf(cls).seatChoice) return fail(res, 403, 'seatFixed');
      const current = item.site || {};
      let seat = current.seat;
      if (body.seat !== undefined && body.seat !== current.seat) {
        if (!validSeat(body.seat)) return fail(res, 400, 'badSeat');
        if (seatFor(item.classCode, body.seat) !== body.seat) return fail(res, 409, 'seatTaken');
        seat = body.seat;
      }
      const site = { seat: seat || seatFor(item.classCode), label: body.label !== undefined ? cleanLabel(body.label) : current.label || '' };
      if (!site.seat) return fail(res, 409, 'seatTaken');
      store('sessions', code, { ...item, site });
      return json(res, 200, { site });
    }
    // Sperren mit PIN (nur das schreibende Gerät); Prüfungsplätze lassen sich nicht sperren.
    if (parts[2] === 'lock') {
      if (item.exam) return fail(res, 403, 'examSession');
      if (!isWriter(item, token)) return json(res, 409, { error: 'sessionTakenOver', ...about(item) });
      if (method === 'POST') {
        if (typeof body.pin !== 'string' || !PIN.test(body.pin)) return fail(res, 400, 'invalidPin');
        // Sperren rechnet (scrypt): eigene, enge Grenze.
        if (limited(req, 'lock', 20)) return fail(res, 429, 'rateLimited');
        const salt = crypto.randomBytes(16).toString('base64url');
        const hash = await pinHash(body.pin, salt);
        // Nach der Rechnung neu lesen: inzwischen kann gespeichert worden sein.
        const latest = loadSession(code);
        if (!latest || !isWriter(latest, token)) return json(res, 409, { error: 'sessionTakenOver', ...about(latest || item) });
        store('sessions', code, { ...latest, lock: { salt, hash } });
        return json(res, 200, { locked: true });
      }
      if (method === 'DELETE') {
        const { lock: _lock, ...rest } = item;
        store('sessions', code, rest);
        return json(res, 200, { locked: false });
      }
      return fail(res, 405, 'methodNotAllowed');
    }
    // Prüfung abgeben: letzten Stand speichern und den Platz sofort schliessen (nur das schreibende
    // Gerät). Danach nimmt der Server nichts mehr an, auch nicht in der Gnadenfrist; der Zeitpunkt
    // steht im Cockpit der Lehrperson.
    if (parts[2] === 'submit' && method === 'POST') {
      if (!item.exam) return fail(res, 400, 'notAnExam');
      if (!isWriter(item, token)) return json(res, 409, { error: 'sessionTakenOver', ...about(item) });
      const exam = loadExam(item.exam.id);
      const seat = exam && exam.seats.find((s) => s.id === item.exam.seat);
      if (!exam || !seat) return fail(res, 404, 'unknownSession');
      if (!sebAllowed(req, exam, req.headers['x-leyonet-seb'])) return fail(res, 403, 'sebRequired');
      if (seat.submitted) return json(res, 200, { exam: seatStatus(exam, seat) });
      const now = Date.now();
      if (!exam.started || now > seat.until + EXAM_GRACE_MS) return json(res, 423, { error: 'examClosed', exam: seatStatus(exam, seat) });
      if (body.project !== undefined && !validProject(body.project)) return fail(res, 400, 'invalidProject');
      seat.submitted = now;
      seat.until = Math.min(seat.until, now);
      saveExam(exam);
      store('sessions', code, { ...item, ...(body.project !== undefined ? { project: body.project, updated: now } : {}), submitted: now });
      leases.delete(code);
      return json(res, 200, { exam: seatStatus(exam, seat) });
    }
    // Code zum Beenden des Prüfungsmodus prüfen: auf dem Server, mit begrenzten Versuchen pro Platz.
    if (parts[2] === 'unlock' && method === 'POST') {
      if (!item.exam) return fail(res, 400, 'notAnExam');
      // Zuerst das Schreib-Token: Ein fremdes Gerät (gleiche Schul-Adresse) verbraucht so kein Kontingent.
      if (!isWriter(item, token)) return json(res, 409, { error: 'sessionTakenOver', ...about(item) });
      if (limited(req, `unlock:${code}`, 10)) return fail(res, 429, 'rateLimited');
      if (typeof body.code !== 'string' || !body.code.replace(/\s+/g, '')) return fail(res, 400, 'codeRequired');
      const exam = loadExam(item.exam.id);
      const seat = exam && exam.seats.find((s) => s.id === item.exam.seat);
      if (!exam || !seat) return fail(res, 404, 'unknownSession');
      if (!sebAllowed(req, exam, req.headers['x-leyonet-seb'])) return fail(res, 403, 'sebRequired');
      const now = Date.now();
      let lock = unlockState(exam, seat, now);
      if (lock.expired) {
        delete seat.unlockFails;
        lock = unlockState(exam, seat, now);
      }
      if (lock.lockedUntil !== 0) return json(res, 423, { error: 'unlockLocked', exam: seatStatus(exam, seat) });
      const wanted = exam.learner && exam.learner.tasks && exam.learner.tasks.exam && exam.learner.tasks.exam.unlock;
      const given = typeof body.code === 'string' ? body.code.replace(/\s+/g, '').toUpperCase().slice(0, 40) : '';
      const hash = crypto.createHash('sha256').update(`leyonet-pruefung:${given}`).digest('hex');
      // Ohne Code in der Prüfungsdatei lässt sich der Modus nicht hier beenden (nur durch Ende der Prüfung).
      if (typeof wanted === 'string' && given && sameHash(hash, wanted)) {
        delete seat.unlockFails;
        delete seat.unlockLast;
        saveExam(exam);
        return json(res, 200, { ok: true, exam: seatStatus(exam, seat) });
      }
      seat.unlockFails = Math.min((seat.unlockFails || 0) + 1, MAX_UNLOCK_ATTEMPTS);
      seat.unlockLast = now;
      saveExam(exam);
      return json(res, 403, { error: 'wrongCode', exam: seatStatus(exam, seat) });
    }
    if (parts.length !== 2) return fail(res, 404, 'unknownSession');

    if (method === 'GET') {
      // Prüfungsplatz mit SEB-Pflicht: auch Lesen nur aus dem Safe Exam Browser (die Lehrperson
      // sieht Plätze über die Admin-Konsole an).
      let examSeat = null;
      if (item.exam) {
        const exam = loadExam(item.exam.id);
        if (!exam) return fail(res, 404, 'unknownSession');
        if (!sebAllowed(req, exam, req.headers['x-leyonet-seb'])) return fail(res, 403, 'sebRequired');
        examSeat = exam.seats.find((s) => s.id === item.exam.seat) || { id: item.exam.seat };
      }
      const forLearner = (project) => (examSeat ? learnerProject(project, examSeat) : project);
      const base = { code, expires: item.expires, classCode: item.classCode, site: item.site || null, project: forLearner(item.project) };
      // Nur ansehen (z.B. Lehrperson): kein Schreibrecht, verdrängt niemanden.
      // Prüfungsplätze nie über den Session-Code ansehen: Die Lehrperson sieht sie über die Admin-Konsole.
      if (url.searchParams.get('watch') === '1') {
        if (item.exam) return fail(res, 403, 'examSession');
        return json(res, 200, { ...base, updated: item.updated, watch: true, ...about(item) });
      }
      const pin = req.headers['x-leyonet-pin'];
      const claimed = await claimWriter(code, item, token, typeof pin === 'string' ? pin : '');
      if (claimed.error) return json(res, claimed.status, { error: claimed.error, ...about(item) });
      return json(res, 200, { ...base, project: forLearner(claimed.item.project), writer: claimed.token, ...about(claimed.item) });
    }
    if (method === 'PUT') {
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
        if (!exam.started || seat.submitted || now > seat.until + EXAM_GRACE_MS) return json(res, 423, { error: 'examClosed', exam: seatStatus(exam, seat) });
        if (!sebAllowed(req, exam, req.headers['x-leyonet-seb'])) return fail(res, 403, 'sebRequired');
        store('sessions', code, { ...item, project: body.project, updated: now });
        return json(res, 200, { code, expires: item.expires, exam: seatStatus(exam, seat), ...(writer ? { writer } : {}) });
      }
      // Die Lehrperson bearbeitet die Session gerade: Lernende sehen nur zu.
      if (teacherEditing(code, now)) return json(res, 423, { error: 'teacherEditing', ...about(item) });
      // Die Frist läuft ab der letzten Änderung (Arbeit geht nicht mitten in der Lektion verloren).
      const before = indexes.sessions.get(code);
      if (!fits(projectSize(body.project) - (before ? before.size : 0))) return fail(res, 507, 'storageFull');
      // Fortschritt der Lernziele (für das Dashboard), nur zwei kleine Zahlen.
      const progress = readProgress(body.progress) || item.progress;
      const next = { ...item, project: body.project, updated: now, expires: now + ttl, ...(progress ? { progress } : {}) };
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
    if (limited(req, 'examJoin', 600) || tooManyMisses(req, 'seat')) return fail(res, 429, 'rateLimited');
    const body = await readBody(req);
    const seatCode = normalizeCode(body.seatCode);
    const found = seatCode && findSeat(seatCode);
    if (!found) {
      countMiss(req, 'seat');
      return fail(res, 404, 'unknownSeat');
    }
    const { exam, seat } = found;
    if (!sebAllowed(req, exam, body.sebKey)) return fail(res, 403, 'sebRequired');
    const status = seatStatus(exam, seat);
    if (status.state === 'waiting') return json(res, 200, { exam: status });
    // Weiterarbeiten: vorhandene Session des Platzes; sonst neue mit der Prüfungsdatei.
    // Abgegeben: Die Arbeit geht nicht mehr hinaus (der Platz-Code steht auf der Platzkarte).
    // Öffnet die Lehrperson den Platz wieder (Nachteilsausgleich), geht es normal weiter.
    if (status.state === 'closed') return json(res, 200, { exam: status });
    const known = entries('sessions').find((x) => x.exam && x.exam.id === exam.id && x.exam.seat === seat.id);
    let session = known ? loadSession(known.code) : null;
    let fresh = false;
    if (!session) {
      let code = newCode();
      while (indexes.sessions.has(code) || fs.existsSync(fileFor(dirs.sessions, code))) code = newCode();
      const now = Date.now();
      session = { code, created: now, updated: now, expires: exam.expires, classCode: null, exam: { id: exam.id, seat: seat.id }, project: learnerProject(exam.learner, seat) };
      // Prüfungsplätze zählen nicht zur Grenze: Eine Prüfung darf nie an vollem Speicher scheitern.
      store('sessions', code, session);
      fresh = true;
    }
    // Ein Platz ist nur an einem Gerät offen; ein zweiter Browser wartet, bis die Lehrperson freigibt.
    const claimed = await claimWriter(session.code, session, typeof body.writer === 'string' ? body.writer : '', '');
    if (claimed.error) return json(res, 409, { error: 'seatInUse', exam: status });
    return json(res, 200, { exam: status, session: session.code, fresh, variant: seat.variant || null, project: learnerProject(claimed.item.project, seat), writer: claimed.token });
  }

  // --- Klassen beitreten ---
  if (parts[0] === 'classes' && parts[1] === 'join' && method === 'POST') {
    if (limited(req, 'join', 30)) return fail(res, 429, 'rateLimited');
    const body = await readBody(req);
    const code = normalizeCode(body.classCode);
    const item = code && loadClass(code);
    if (!item) return fail(res, 404, 'unknownClass');
    const v = verbundOf(item);
    return json(res, 200, { classCode: code, label: item.label, catalog: item.catalog || EMPTY_CATALOG, verbund: { enabled: v.enabled, shareSites: v.shareSites, showMap: v.showMap, seatChoice: v.enabled && v.seatChoice } });
  }

  // --- Klassen-Verbund (öffentlich mit Klassen-Code) ---
  if (parts[0] === 'classes' && parts[2] === 'verbund' && method === 'GET') {
    if (limited(req, 'verbund', 600) || tooManyMisses(req, 'class')) return fail(res, 429, 'rateLimited');
    const code = normalizeCode(parts[1]);
    const item = code && loadClass(code);
    if (!item) {
      countMiss(req, 'class');
      return fail(res, 404, 'unknownClass');
    }
    const v = verbundOf(item);
    if (!v.enabled) return json(res, 200, { enabled: false });
    // Nur Geändertes seit `since` mitschicken: Die ganze Klasse fragt alle paar Sekunden.
    const since = Number(new URL(req.url, 'http://x').searchParams.get('since')) || 0;
    // Eckdaten aus dem Verzeichnis; das Projekt nur von der Platte, wenn es mitgeschickt wird.
    const members = entries('sessions').filter((m) => m.classCode === code && m.site);
    const status = verbundStatus.get(code);
    return json(res, 200, {
      enabled: true,
      label: item.label,
      shareSites: v.shareSites,
      showMap: v.showMap,
      infraUpdated: v.infraUpdated,
      ...(v.infra && v.infraUpdated > since ? { infra: v.infra } : {}),
      // Andere Standorte (Netzwerk-Konfiguration) nur, wenn die Lehrperson das freigibt; nie Session-Codes.
      sites: members.map((x) => {
        const full = v.shareSites && x.updated > since ? loadSession(x.code) : null;
        return { seat: x.site.seat, label: x.site.label || '', updated: x.updated, ...(full ? { project: full.project } : {}) };
      }),
      ...(v.showMap && status ? { status: status.sites, statusTime: status.time } : {}),
      now: Date.now(),
    });
  }

  // Nachrichten im Verbund: nur Mitglieder der Klasse (Session mit Schreibrecht) senden.
  if (parts[0] === 'classes' && parts[2] === 'messages') {
    if (limited(req, 'messages', 600)) return fail(res, 429, 'rateLimited');
    const code = normalizeCode(parts[1]);
    const item = code && loadClass(code);
    if (!item || !verbundOf(item).enabled) return fail(res, 404, 'unknownClass');
    if (method === 'GET') {
      const after = Number(new URL(req.url, 'http://x').searchParams.get('after')) || 0;
      return json(res, 200, classMessages(code).filter((m) => m.id > after));
    }
    if (method === 'POST') {
      const body = await readBody(req);
      const own = normalizeCode(body.session);
      const sender = own && loadSession(own);
      if (!sender || sender.classCode !== code || !sender.site || !isWriter(sender, writerOf(req))) return fail(res, 403, 'notInClass');
      if (limited(req, `msg:${own}`, 6)) return fail(res, 429, 'rateLimited');
      const text = typeof body.text === 'string' ? body.text.replace(/\u0000/g, '').trim().slice(0, MAX_MESSAGE_TEXT) : '';
      const subject = cleanLabel(body.subject) || 'Nachricht';
      // 0 = Zentrale, -1 = alle Standorte
      const to = body.to === 0 || body.to === -1 || validSeat(body.to) ? body.to : null;
      if (!text || to === null) return fail(res, 400, 'emptyText');
      const list = classMessages(code);
      const id = (list.at(-1)?.id || 0) + 1;
      list.push({ id, time: Date.now(), from: sender.site.seat, fromLabel: sender.site.label || '', to, subject, text });
      while (list.length > MAX_MESSAGES) list.shift();
      return json(res, 201, { id });
    }
    return fail(res, 405, 'methodNotAllowed');
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
    if (!ADMIN_PASSWORD) return fail(res, 403, 'adminDisabled');
    if (limited(req, 'loginAny', 120)) return fail(res, 429, 'rateLimited');
    const body = await readBody(req, 4096);
    const given = typeof body.password === 'string' ? body.password : '';
    let who = null;
    if (TENANT_KEY.test(given.trim())) {
      // Zugangsschlüssel haben 192 Bit Zufall: Raten ist aussichtslos, darum zählt hier nicht die
      // enge Grenze der Passwörter. So sperrt niemand aus dem Schulnetz mit falschen Anmeldungen
      // die Lehrpersonen aus (z.B. vor einer Prüfung).
      const t = tenantByKey(given);
      if (t) who = { role: t.role, tenant: t.id, label: t.label };
    } else {
      // Passwort (von Menschen gewählt): je Adresse und insgesamt begrenzt. Greift die Grenze für
      // alle (viele Fehlversuche von vielen Adressen), kommt der Hauptadmin mit Zwei-Faktor trotzdem
      // hinein: nur wenn Passwort und Code zusammen stimmen, sonst ohne jeden Hinweis 429 (kein
      // Raten möglich, und die Fehlversuche sperren den Zugang nicht).
      if (limited(req, 'login', 10)) return fail(res, 429, 'rateLimited');
      if (limitedGlobal('login', 30)) {
        const data = accountData({ role: 'super' });
        const code = typeof body.code === 'string' ? body.code.slice(0, 40) : '';
        if (!(data.mfa && data.mfa.enabled) || !code.trim() || !checkPassword(given)) return fail(res, 429, 'rateLimited');
        if (checkSecondFactor({ role: 'super' }, data, code) !== 'ok') return fail(res, 429, 'rateLimited');
        return issueToken(res, { role: 'super', tenant: null, label: null });
      }
      if (checkPassword(given)) who = { role: 'super', tenant: null, label: null };
    }
    if (!who) return fail(res, 401, 'wrongPassword');
    // Zweiter Faktor (falls eingerichtet): erst nach richtigem Passwort bzw. Schlüssel gefragt.
    const data = accountData(who);
    const id = accountId(who);
    if (data.mfa && data.mfa.enabled) {
      if (typeof body.code !== 'string' || !body.code.trim()) return json(res, 401, { error: 'mfaRequired' });
      if (limited(req, 'mfa', 60) || mfaLocked(id)) return fail(res, 429, 'rateLimited');
      const result = checkSecondFactor(who, data, body.code.slice(0, 40));
      if (result !== 'ok') {
        countMfaFail(id);
        if (result === 'unreadable') console.error('Zwei-Faktor: Geheimnis nicht lesbar (ADMIN_PASSWORD geändert?). Anmeldung mit Wiederherstellungscode möglich.');
        return fail(res, 401, result === 'unreadable' ? 'mfaUnreadable' : 'wrongCode');
      }
      mfaFails.delete(id);
    }
    return issueToken(res, who);
  }
  const who = principal(req);
  if (!who) return fail(res, 401, 'notLoggedIn');
  /** Nur der Hauptadmin: sonst 403 senden und true liefern (Aufrufer bricht ab). */
  const superOnly = () => {
    if (who.role === 'super') return false;
    fail(res, 403, 'notAllowed');
    return true;
  };

  const current = (req.headers.authorization || '').slice(7);
  if (parts[0] === 'logout' && method === 'POST') {
    const body = await readBody(req, 1024);
    // «Überall abmelden»: alle Anmeldungen dieses Zugangs ausser der aktuellen beenden.
    if (body.others === true) {
      let n = 0;
      for (const [k, e] of tokens) if (k !== current && accountId(e) === accountId(who)) (tokens.delete(k), n++);
      return json(res, 200, { ok: true, ended: n });
    }
    tokens.delete(current);
    return json(res, 200, { ok: true });
  }

  // Eigene Sicherheit: Zwei-Faktor, letzte Anmeldung, offene Anmeldungen (ohne Adressen oder Geräte).
  if (parts[0] === 'me' && method === 'GET') {
    const data = accountData(who);
    const now = Date.now();
    const logins = [...tokens.values()].filter((e) => accountId(e) === accountId(who) && e.expires > now && now - (e.seen || 0) <= ADMIN_IDLE_MS).length;
    return json(res, 200, {
      role: who.role,
      label: who.label,
      mfa: { enabled: !!(data.mfa && data.mfa.enabled), recoveryLeft: data.mfa && Array.isArray(data.mfa.recovery) ? data.mfa.recovery.length : 0, required: !!settings().mfaRequired, setupNeeded: !!who.mfaSetup || (!!settings().mfaRequired && !(data.mfa && data.mfa.enabled)) },
      previousLogin: data.previousLogin || null,
      logins,
      idleMinutes: ADMIN_IDLE_MS / 60_000,
    });
  }
  if (parts[0] === 'mfa' && method === 'POST') {
    const body = await readBody(req, 2048);
    const id = accountId(who);
    const data = accountData(who);
    // Einrichten, Schritt 1: neues Geheimnis (noch nicht aktiv), für App bzw. QR-Code.
    // Ist Zwei-Faktor schon an, lässt er sich nicht einfach ersetzen (sonst bände ein entwendetes
    // Token den Zugang an eine fremde App): erst mit gültigem Code ausschalten, dann neu einrichten.
    if ((parts[1] === 'setup' || parts[1] === 'enable') && data.mfa && data.mfa.enabled) return fail(res, 409, 'mfaOn');
    // Fehlversuche mit einem Token zählen getrennt von der Anmeldung (sperren sie nicht).
    const tokenId = `${id}:token`;
    if (parts[1] === 'setup') {
      const secret = base32(crypto.randomBytes(20));
      mfaPending.set(id, { secret, expires: Date.now() + 10 * 60_000 });
      const name = who.role === 'super' ? 'Admin' : String(who.label || 'Zugang').replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 40) || 'Zugang';
      const issuer = 'leyoNET';
      return json(res, 200, { secret, uri: `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(name)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30` });
    }
    // Schritt 2: mit einem Code aus der App bestätigen, dann aktiv; Wiederherstellungscodes einmal anzeigen.
    if (parts[1] === 'enable') {
      if (limited(req, 'mfa', 60) || mfaLocked(tokenId)) return fail(res, 429, 'rateLimited');
      const pending = mfaPending.get(id);
      if (!pending || pending.expires < Date.now()) return fail(res, 409, 'mfaNoSetup');
      const step = totpStep(unbase32(pending.secret), String(body.code || '').replace(/\s/g, ''), 0);
      if (step === null) {
        countMfaFail(tokenId);
        return fail(res, 401, 'wrongCode');
      }
      mfaPending.delete(id);
      const recovery = newRecoveryCodes();
      saveAccountData(who, { ...data, mfa: { enabled: true, since: Date.now(), secret: encryptKey({ secret: pending.secret }), step, recovery: recovery.map(recoveryHash) } });
      const entry = tokens.get(current);
      if (entry) delete entry.mfaSetup;
      // Andere Anmeldungen dieses Zugangs (ohne zweiten Faktor ausgestellt) beenden.
      for (const [k, e] of tokens) if (k !== current && accountId(e) === id) tokens.delete(k);
      return json(res, 200, { enabled: true, recovery });
    }
    // Ausschalten oder neue Wiederherstellungscodes: nur mit gültigem Code (oder Wiederherstellungscode).
    if (parts[1] === 'disable' || parts[1] === 'recovery') {
      if (!data.mfa || !data.mfa.enabled) return fail(res, 409, 'mfaOff');
      if (parts[1] === 'disable' && settings().mfaRequired) return fail(res, 409, 'mfaRequired');
      if (limited(req, 'mfa', 60) || mfaLocked(tokenId)) return fail(res, 429, 'rateLimited');
      const result = checkSecondFactor(who, data, String(body.code || '').slice(0, 40));
      if (result !== 'ok') {
        countMfaFail(tokenId);
        return fail(res, 401, result === 'unreadable' ? 'mfaUnreadable' : 'wrongCode');
      }
      const after = accountData(who);
      if (parts[1] === 'disable') {
        const { mfa: _m, ...rest } = after;
        saveAccountData(who, rest);
        return json(res, 200, { enabled: false });
      }
      const recovery = newRecoveryCodes();
      saveAccountData(who, { ...after, mfa: { ...after.mfa, recovery: recovery.map(recoveryHash) } });
      return json(res, 200, { enabled: true, recovery });
    }
    return fail(res, 404, 'notFound');
  }
  // Zwei-Faktor verlangt und noch nicht eingerichtet: nur Einrichten und Abmelden.
  // Auch Anmeldungen von vor dem Einschalten von «für alle verlangen» gelten nur noch zum Einrichten.
  if (who.mfaSetup || (settings().mfaRequired && !(accountData(who).mfa && accountData(who).mfa.enabled))) return fail(res, 403, 'mfaSetupRequired');

  if (parts[0] === 'overview' && method === 'GET') {
    const sessions = entries('sessions');
    const feedback = who.role === 'super' ? entries('feedback') : [];
    const u = usage();
    return json(res, 200, {
      me: { role: who.role, label: who.label },
      settings: settings(),
      sessions: who.role === 'super' ? sessions.length : null,
      storage: who.role === 'super' ? { bytes: u.bytes, maxBytes: MAX_STORAGE_BYTES, sessions: u.sessions, maxSessions: MAX_SESSIONS } : null,
      classes: list(dirs.classes)
        .filter((c) => canSee(who, c.owner))
        .map((c) => classView(c, sessions))
        .sort((a, b) => b.created - a.created),
      feedbackOpen: feedback.filter((f) => f.status === 'open').length,
      feedbackTotal: feedback.length,
    });
  }

  // --- Zugänge ---
  if (parts[0] === 'tenants') {
    if (who.role === 'teacher') return fail(res, 403, 'notAllowed');
    const mine = (t) => who.role === 'super' || t.school === who.tenant;
    if (parts.length === 1 && method === 'GET') return json(res, 200, tenants().filter(mine).map(tenantView).sort((a, b) => a.label.localeCompare(b.label)));
    if (parts.length === 1 && method === 'POST') {
      const body = await readBody(req);
      const label = typeof body.label === 'string' ? body.label.trim().slice(0, 40) : '';
      if (!label) return fail(res, 400, 'labelRequired');
      const role = who.role === 'school' ? 'teacher' : body.role === 'teacher' ? 'teacher' : 'school';
      let school = null;
      if (role === 'teacher') {
        school = who.role === 'school' ? who.tenant : body.school ? String(body.school) : null;
        if (school && loadTenant(school)?.role !== 'school') return fail(res, 400, 'unknownSchool');
      }
      if (tenants().length >= MAX_TENANTS) return fail(res, 507, 'storageFull');
      let id = crypto.randomBytes(4).toString('hex');
      while (loadTenant(id)) id = crypto.randomBytes(4).toString('hex');
      const secret = newTenantSecret();
      const t = { id, label, role, school, secret: secretHash(secret), created: Date.now() };
      saveTenant(t);
      return json(res, 201, { ...tenantView(t), key: tenantKey(t, secret) });
    }
    const t = loadTenant(parts[1]);
    if (!t || !mine(t)) return fail(res, 404, 'unknownTenant');
    // Zwei-Faktor zurücksetzen (Handy verloren): Hauptadmin für alle, Schule für ihre Lehrpersonen.
    if (parts[2] === 'mfa' && method === 'DELETE') {
      const { mfa: _m, ...rest } = t.security || {};
      saveTenant({ ...t, security: rest });
      for (const [k, e] of tokens) if (e.tenant === t.id) tokens.delete(k);
      return json(res, 200, tenantView({ ...t, security: rest }));
    }
    if (parts[2] === 'key' && method === 'POST') {
      // Neuer Schlüssel: der alte gilt sofort nicht mehr, Anmeldungen damit enden.
      const secret = newTenantSecret();
      saveTenant({ ...t, secret: secretHash(secret) });
      for (const [k, e] of tokens) if (e.tenant === t.id) tokens.delete(k);
      return json(res, 200, { ...tenantView(t), key: tenantKey(t, secret) });
    }
    if (parts.length === 2 && method === 'PATCH') {
      const body = await readBody(req);
      const label = typeof body.label === 'string' ? body.label.trim().slice(0, 40) : '';
      if (!label) return fail(res, 400, 'labelRequired');
      saveTenant({ ...t, label });
      return json(res, 200, tenantView({ ...t, label }));
    }
    if (parts.length === 2 && method === 'DELETE') {
      // Lehrpersonen einer gelöschten Schule gleich mit; ihre Klassen und Prüfungen sieht danach nur der Hauptadmin.
      for (const x of tenants()) if (x.id === t.id || x.school === t.id) {
        remove(path.join(dirs.tenants, `${x.id}.json`));
        for (const [k, e] of tokens) if (e.tenant === x.id) tokens.delete(k);
      }
      return json(res, 200, { ok: true });
    }
    return fail(res, 405, 'methodNotAllowed');
  }

  // Ergebnis der Release-Prüfungen (Datenschutz, Sicherheit, Lizenzen), erzeugt von scripts/release-checks.mjs.
  if (parts[0] === 'checks' && method === 'GET') {
    if (superOnly()) return;
    const report = readJson(CHECKS_FILE);
    return report ? json(res, 200, report) : fail(res, 404, 'noChecks');
  }

  if (parts[0] === 'settings' && method === 'PUT') {
    if (superOnly()) return;
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
      catalog: readCatalog(body.catalog, current.catalog),
      mfaRequired: typeof body.mfaRequired === 'boolean' ? body.mfaRequired : !!current.mfaRequired,
    };
    // Wer Zwei-Faktor für alle verlangt, muss ihn selbst eingerichtet haben (sonst sperrt man sich aus).
    if (next.mfaRequired && !current.mfaRequired && !(accountData(who).mfa && accountData(who).mfa.enabled)) return fail(res, 409, 'mfaOwnFirst');
    writeJson(path.join(DATA_DIR, 'settings.json'), next);
    return json(res, 200, next);
  }

  if (parts[0] === 'feedback') {
    if (superOnly()) return;
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

  if (parts[0] === 'exams') return adminExams(req, res, parts.slice(1), method, who);

  if (parts[0] === 'classes') {
    if (parts.length === 1 && method === 'POST') {
      const body = await readBody(req);
      const label = typeof body.label === 'string' ? body.label.trim().slice(0, 40) : '';
      if (!label) return fail(res, 400, 'labelRequired');
      const s = settings();
      let code = newCode();
      while (fs.existsSync(fileFor(dirs.classes, code))) code = newCode();
      const now = Date.now();
      // Gültigkeit direkt beim Anlegen wählbar (Tage), sonst die Voreinstellung des Hauptadmins.
      const ttl = validDays(body.days) ? body.days * 86_400_000 : s.classHours * 3_600_000;
      const item = { code, label, created: now, expires: now + ttl, owner: ownerOf(who), catalog: readCatalog(body.catalog, EMPTY_CATALOG), verbund: { enabled: false, shareSites: false, infra: null, infraUpdated: 0 } };
      writeJson(fileFor(dirs.classes, code), item);
      return json(res, 201, classView(item, []));
    }
    const code = normalizeCode(parts[1]);
    // Inhalt zuerst lesen, dann den Stand laden (siehe Sessions).
    const body = code && method !== 'GET' && method !== 'DELETE' ? await readBody(req) : {};
    const item = code && loadClass(code);
    if (!item || !canSee(who, item.owner)) return fail(res, 404, 'unknownClass');
    if (parts[2] === 'sessions' && method === 'GET') {
      const withProjects = new URL(req.url, 'http://x').searchParams.get('projects') === '1';
      const sessions = entries('sessions')
        .filter((s) => s.classCode === code)
        .sort((a, b) => a.created - b.created)
        .map((m) => loadSession(m.code))
        .filter(Boolean)
        .map((s) => ({ code: s.code, created: s.created, updated: s.updated, expires: s.expires, site: s.site || null, progress: progressOf(s.code, s.progress), connected: connected(s.code), help: helpOf(s.code), teacher: teacherEditing(s.code), ...summary(s.project), ...(withProjects ? { project: s.project } : {}) }));
      return json(res, 200, sessions);
    }
    if (parts.length === 2 && method === 'PATCH') {
      const next = { ...item };
      if (typeof body.label === 'string' && body.label.trim()) next.label = body.label.trim().slice(0, 40);
      if (body.catalog !== undefined) next.catalog = readCatalog(body.catalog, item.catalog || EMPTY_CATALOG);
      // Verlängern: ab dem bisherigen Ablauf, aber nie weiter als MAX_CLASS_DAYS ab heute.
      if (body.extendDays !== undefined) {
        if (!validDays(body.extendDays)) return fail(res, 400, 'badDays');
        const now = Date.now();
        next.expires = Math.min(Math.max(item.expires, now) + body.extendDays * 86_400_000, now + MAX_CLASS_DAYS * 86_400_000);
      }
      if (body.verbund && typeof body.verbund === 'object') {
        const v = verbundOf(item);
        next.verbund = {
          ...v,
          enabled: typeof body.verbund.enabled === 'boolean' ? body.verbund.enabled : v.enabled,
          shareSites: typeof body.verbund.shareSites === 'boolean' ? body.verbund.shareSites : v.shareSites,
          showMap: typeof body.verbund.showMap === 'boolean' ? body.verbund.showMap : v.showMap,
          seatChoice: typeof body.verbund.seatChoice === 'boolean' ? body.verbund.seatChoice : v.seatChoice,
        };
      }
      writeJson(fileFor(dirs.classes, code), next);
      return json(res, 200, classView(next, entries('sessions')));
    }
    // Infrastruktur des Verbunds (Projekt der Lehrperson).
    if (parts[2] === 'infra' && method === 'PUT') {
      if (body.project !== null && !validProject(body.project)) return fail(res, 400, 'invalidProject');
      if (body.project && !fits(projectSize(body.project))) return fail(res, 507, 'storageFull');
      const next = { ...item, verbund: { ...verbundOf(item), infra: body.project || null, infraUpdated: Date.now() } };
      writeJson(fileFor(dirs.classes, code), next);
      return json(res, 200, classView(next, entries('sessions')));
    }
    // Status vom Dashboard der Lehrperson (berechnet in ihrem Browser), für die Karte der Lernenden.
    if (parts[2] === 'status' && method === 'POST') {
      verbundStatus.set(code, { time: Date.now(), sites: cleanStatus(body.sites) });
      return json(res, 200, { ok: true });
    }
    if (parts.length === 2 && method === 'DELETE') {
      // Klasse schliessen: auch alle ihre Sessions löschen.
      for (const s of entries('sessions')) if (s.classCode === code) drop('sessions', s.code);
      remove(fileFor(dirs.classes, code));
      return json(res, 200, { ok: true });
    }
  }

  // Website-Statistik und Downloads: nur der Hauptadmin (es geht um das ganze Projekt, nicht um eine Schule).
  if (parts[0] === 'website' && parts.length === 1 && method === 'GET') {
    if (superOnly()) return;
    if (!siteStats) return fail(res, 503, 'unavailable');
    const days = Number(new URL(req.url || '/', 'http://localhost').searchParams.get('days')) || 30;
    const [report, downloads] = await Promise.all([siteStats.report(days), siteStats.downloads()]);
    return json(res, 200, { ...report, downloads });
  }

  // Statistik: aktive Sessions (nur Kennzahlen, ohne Projekte). Zugänge sehen nur ihre Klassen und Prüfungen.
  if (parts[0] === 'stats' && method === 'GET') {
    const now = Date.now();
    const classes = new Map(list(dirs.classes).map((c) => [c.code, { label: c.label, owner: c.owner || null }]));
    const exams = new Map(list(dirs.exams).map((e) => [e.id, { label: e.label, owner: e.owner || null }]));
    const visible = (m) =>
      who.role === 'super' || (m.classCode && classes.has(m.classCode) && canSee(who, classes.get(m.classCode).owner)) || (m.exam && exams.has(m.exam.id) && canSee(who, exams.get(m.exam.id).owner));
    const all = entries('sessions').filter(visible);
    const kindOf = (m) => (m.exam ? 'exam' : m.classCode ? 'class' : 'single');
    const day = 86_400_000;
    const rows = all
      .sort((a, b) => (b.updated || 0) - (a.updated || 0))
      .slice(0, MAX_STATS_ROWS)
      .map((m) => ({
        code: m.code,
        kind: kindOf(m),
        group: m.exam ? (exams.get(m.exam.id) || {}).label || '' : m.classCode ? (classes.get(m.classCode) || {}).label || m.classCode : null,
        seat: m.exam ? m.exam.seat : m.site ? m.site.seat : null,
        created: m.created || null,
        updated: m.updated || null,
        expires: m.expires,
        size: m.size || 0,
        connected: connected(m.code, now),
        locked: !!m.lock,
        submitted: m.submitted || null,
      }));
    const u = usage();
    return json(res, 200, {
      total: all.length,
      counts: {
        single: all.filter((m) => kindOf(m) === 'single').length,
        class: all.filter((m) => kindOf(m) === 'class').length,
        exam: all.filter((m) => kindOf(m) === 'exam').length,
        connected: all.filter((m) => connected(m.code, now)).length,
        changed24h: all.filter((m) => now - (m.updated || 0) < day).length,
        created24h: all.filter((m) => now - (m.created || 0) < day).length,
        created7d: all.filter((m) => now - (m.created || 0) < 7 * day).length,
        bytes: all.reduce((s, m) => s + (m.size || 0), 0),
      },
      storage: who.role === 'super' ? { bytes: u.bytes, maxBytes: MAX_STORAGE_BYTES, sessions: u.sessions, maxSessions: MAX_SESSIONS } : null,
      sessions: rows,
    });
  }

  if (parts[0] === 'sessions') {
    if (parts.length === 1 && method === 'DELETE') {
      if (superOnly()) return;
      // Abgaben von Prüfungen bleiben (sie werden mit der Prüfung gelöscht).
      for (const s of entries('sessions')) if (!s.exam) drop('sessions', s.code);
      return json(res, 200, { ok: true });
    }
    const code = normalizeCode(parts[1]);
    const item = code && loadSession(code);
    // Zugänge sehen nur Sessions ihrer Klassen und Prüfungen, der Hauptadmin alle.
    const visible = item && (who.role === 'super' || (item.classCode && canSee(who, loadClass(item.classCode)?.owner)) || (item.exam && canSee(who, loadExam(item.exam.id)?.owner)));
    if (!visible) return fail(res, 404, 'unknownSession');
    if (method === 'GET' && parts.length === 2) return json(res, 200, { code, project: item.project, classCode: item.classCode, site: item.site || null, updated: item.updated, connected: connected(code), locked: !!item.lock, help: helpOf(code) });
    // Klassen: Bildschirm der Lernenden kurz aufblinken lassen, Hilfe-Anfrage erledigen,
    // Session bearbeiten (solange sehen die Lernenden nur zu). Nie für Prüfungsplätze.
    // Stand von «Erkennen»: wartet auf die Lernenden, blinkt (noch so lange), nicht erreicht.
    if (parts.length === 3 && method === 'GET' && parts[2] === 'identify') {
      const sig = signals.get(code);
      const now = Date.now();
      if (!sig || !sig.identify) return json(res, 200, { state: 'none' });
      if (sig.identifyShown) {
        const left = sig.identifyShown + (sig.identifyMs || 0) - now;
        return json(res, 200, left > 0 ? { state: 'shown', left } : { state: 'done' });
      }
      return json(res, 200, sig.identify > now ? { state: 'pending' } : { state: 'missed' });
    }
    if (parts.length === 3 && method === 'POST' && ['identify', 'help', 'edit'].includes(parts[2])) {
      if (item.exam || !item.classCode) return fail(res, 409, 'notInClass');
      const body = await readBody(req, 1024);
      const sig = signalOf(code);
      const now = Date.now();
      if (parts[2] === 'identify') {
        const seconds = Number.isInteger(body.seconds) ? Math.min(IDENTIFY_SECONDS.max, Math.max(IDENTIFY_SECONDS.min, body.seconds)) : IDENTIFY_SECONDS.standard;
        sig.identify = now + IDENTIFY_MS;
        sig.identifyMs = seconds * 1000;
        sig.identifyShown = 0;
      }
      if (parts[2] === 'help') sig.help = 0;
      if (parts[2] === 'edit') sig.teacher = body.active === false ? 0 : now;
      return json(res, 200, { ok: true, help: !!sig.help, teacher: teacherEditing(code, now), ...(parts[2] === 'identify' ? { ms: sig.identifyMs } : {}) });
    }
    if (method === 'PUT' && parts.length === 2) {
      if (item.exam || !item.classCode) return fail(res, 409, 'notInClass');
      const body = await readBody(req);
      if (!validProject(body.project)) return fail(res, 400, 'invalidProject');
      const latest = loadSession(code);
      if (!latest) return fail(res, 404, 'unknownSession');
      // Nur auf den Stand, den die Lehrperson geladen hat: Haben die Lernenden inzwischen gespeichert
      // (z.B. weil der Tab der Lehrperson im Hintergrund war), nichts überschreiben.
      if (body.base !== undefined && body.base !== latest.updated) return json(res, 409, { error: 'sessionChanged', updated: latest.updated });
      const before = indexes.sessions.get(code);
      if (!fits(projectSize(body.project) - (before ? before.size : 0))) return fail(res, 507, 'storageFull');
      const now = Date.now();
      signalOf(code).teacher = now;
      const ttl = settings().sessionHours * 3_600_000;
      store('sessions', code, { ...latest, project: body.project, updated: now, expires: Math.max(latest.expires, now + ttl) });
      return json(res, 200, { code, updated: now });
    }
    if (method === 'GET') return fail(res, 404, 'notFound');
    // Verlängern (nicht für Prüfungsplätze: die gelten so lange wie die Prüfung).
    if (method === 'PATCH') {
      const body = await readBody(req, 1024);
      if (item.exam) return fail(res, 409, 'examSession');
      if (!(Number.isInteger(body.extendHours) && body.extendHours >= 1 && body.extendHours <= 24 * 30)) return fail(res, 400, 'badHours');
      const now = Date.now();
      const latest = loadSession(code) || item;
      const expires = Math.min(Math.max(latest.expires, now) + body.extendHours * 3_600_000, now + MAX_SESSION_DAYS * 86_400_000);
      store('sessions', code, { ...latest, expires });
      return json(res, 200, { code, expires });
    }
    if (method === 'DELETE') {
      // Prüfungsabgaben nur mit der Prüfung löschen (nie versehentlich einzeln).
      if (item.exam) return fail(res, 409, 'examSession');
      leases.delete(code);
      drop('sessions', code);
      return json(res, 200, { ok: true });
    }
  }

  return fail(res, 404, 'notFound');
}

async function adminExams(req, res, parts, method, who) {
  if (parts.length === 0 && method === 'GET') {
    return json(res, 200, list(dirs.exams).filter((e) => canSee(who, e.owner)).sort((a, b) => b.created - a.created).map((e) => examSummary(e)));
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
    // Die Prüfungszeit muss angegeben sein (Formular der Admin-Konsole oder Prüfungsdatei).
    const valid = (m) => Number.isInteger(m) && m > 0 && m <= MAX_EXAM_MINUTES;
    const minutes = valid(body.minutes) ? body.minutes : valid(info.minutes) ? info.minutes : 0;
    if (!minutes) return fail(res, 400, 'badMinutes');
    const used = new Set(seatCodes().keys());
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
      owner: ownerOf(who),
      ...(body.seb === true ? { seb: { key: newSebKey(), ...(body.sebQuitLink === true ? { quitLink: true } : {}) } } : {}),
      ...(cleanUnlockPolicy(body.unlock) ? { unlockPolicy: cleanUnlockPolicy(body.unlock) } : {}),
    };
    saveExam(exam);
    return json(res, 201, examSummary(exam, true));
  }
  // Inhalt zuerst lesen, dann den Stand laden (siehe Sessions).
  const body = method === 'POST' ? await readBody(req) : {};
  const exam = loadExam(parts[0]);
  if (!exam || !canSee(who, exam.owner)) return fail(res, 404, 'unknownExam');
  const now = Date.now();
  if (parts.length === 1 && method === 'GET') return json(res, 200, examSummary(exam, true));
  if (parts.length === 1 && method === 'DELETE') {
    for (const s of entries('sessions')) if (s.exam && s.exam.id === exam.id) drop('sessions', s.code);
    removeExam(exam);
    return json(res, 200, { ok: true });
  }
  // Safe Exam Browser verlangen (neuer Schlüssel) oder nicht mehr verlangen.
  if (parts[1] === 'seb' && parts.length === 2 && method === 'POST') {
    if (examState(exam, now) === 'ended') return fail(res, 409, 'examEnded');
    // Nur den Beenden-Link (quitURL in der SEB-Datei) ein- oder ausschalten, Schlüssel bleibt.
    if (body.on !== undefined && typeof body.on !== 'boolean') return fail(res, 400, 'badRequest');
    if (body.on === undefined && typeof body.quitLink !== 'boolean') return fail(res, 400, 'badRequest');
    if (body.on === undefined) {
      if (!exam.seb || !exam.seb.key) return fail(res, 409, 'sebOff');
      exam.seb = { key: exam.seb.key, ...(body.quitLink ? { quitLink: true } : {}) };
    } else if (body.on === false) delete exam.seb;
    else exam.seb = { key: newSebKey(), ...(exam.seb && exam.seb.quitLink ? { quitLink: true } : {}) };
    saveExam(exam);
    return json(res, 200, examSummary(exam, true));
  }
  // Code zum Beenden: erlaubte Versuche und Sperrzeit (gilt sofort für alle Plätze).
  if (parts[1] === 'unlock' && parts.length === 2 && method === 'POST') {
    const policy = cleanUnlockPolicy(body);
    if (!policy) return fail(res, 400, 'badUnlockPolicy');
    exam.unlockPolicy = policy;
    saveExam(exam);
    return json(res, 200, examSummary(exam, true));
  }
  // Gesperrten Platz wieder freigeben (Fehlversuche zurücksetzen).
  if (parts[1] === 'seats' && parts[3] === 'unlock-reset' && method === 'POST') {
    const seat = exam.seats.find((s) => s.id === parts[2]);
    if (!seat) return fail(res, 404, 'unknownSeat');
    delete seat.unlockFails;
    delete seat.unlockLast;
    saveExam(exam);
    return json(res, 200, examSummary(exam, true));
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
    // Der SEB-Schlüssel gilt nur, solange die Prüfung läuft.
    if (exam.seb) exam.seb = { key: null };
    saveExam(exam);
    return json(res, 200, examSummary(exam, true));
  }
  // Nachteilsausgleich: Minuten für einen Platz dazugeben (vor dem Start oder später; ein abgegebener Platz öffnet wieder).
  if (parts[1] === 'seats' && parts[3] === 'extra' && method === 'POST') {
    const seat = exam.seats.find((s) => s.id === parts[2]);
    if (!seat) return fail(res, 404, 'unknownSeat');
    const minutes = Number.isInteger(body.minutes) && Math.abs(body.minutes) <= MAX_EXAM_MINUTES && body.minutes !== 0 ? body.minutes : null;
    if (minutes === null) return fail(res, 400, 'badMinutes');
    seat.extra = Math.max(0, (seat.extra || 0) + minutes);
    // Mehr Zeit für einen abgegebenen Platz öffnet ihn wieder (z.B. versehentlich abgegeben).
    if (minutes > 0 && seat.submitted) {
      delete seat.submitted;
      const known = entries('sessions').find((x) => x.exam && x.exam.id === exam.id && x.exam.seat === seat.id);
      const item = known && loadSession(known.code);
      if (item && item.submitted) {
        const { submitted: _s, ...rest } = item;
        store('sessions', item.code, rest);
      }
    }
    if (exam.started) seat.until = minutes > 0 ? Math.max(seat.until, now) + minutes * 60_000 : Math.max(exam.started, seat.until + minutes * 60_000);
    saveExam(exam);
    return json(res, 200, examSummary(exam, true));
  }
  // Versehentlich abgegeben: Platz wieder öffnen, mit der Zeit, die ihm regulär noch bleibt
  // (Prüfungszeit plus Nachteilsausgleich ab Start). Ist sie schon um, braucht es «+ Minuten».
  // Das Gerät der Person lädt den abgegebenen Stand von selbst wieder (oder ein anderes mit dem Platz-Code).
  if (parts[1] === 'seats' && parts[3] === 'reopen' && method === 'POST') {
    const seat = exam.seats.find((s) => s.id === parts[2]);
    if (!seat) return fail(res, 404, 'unknownSeat');
    if (!exam.started || !seat.submitted) return fail(res, 409, 'notSubmitted');
    const regular = exam.started + (exam.minutes + (seat.extra || 0)) * 60_000;
    if (regular <= now + 30_000) return fail(res, 409, 'timeOver');
    delete seat.submitted;
    seat.until = regular;
    const known = entries('sessions').find((x) => x.exam && x.exam.id === exam.id && x.exam.seat === seat.id);
    const item = known && loadSession(known.code);
    if (item) {
      const { submitted: _s, writer: _w, ...rest } = item;
      store('sessions', item.code, rest);
      leases.delete(item.code);
    }
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
  // Für die Lehrperson: Aufgabentexte je Platz (für die gedruckten Prüfungsblätter) und der
  // Code zum Beenden des Prüfungsmodus aus dem Schlüssel. Nur Text, keine Prüfbausteine.
  if (parts[1] === 'sheet' && parts.length === 2 && method === 'GET') {
    const key = exam.key ? decryptKey(exam.key) : null;
    const tasks = exam.learner && exam.learner.tasks;
    const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : undefined);
    const goals = (list) => (Array.isArray(list) ? list.slice(0, 200).map((g) => ({ text: text(g && g.text, 2000) || '', points: Number.isFinite(g && g.points) ? g.points : undefined, section: text(g && g.section, 80) })) : []);
    const raster = (list) => (Array.isArray(list) ? list.slice(0, 50).map((r) => ({ label: text(r && r.label, 120) || '', points: Number.isFinite(r && r.points) ? r.points : 0 })) : []);
    const variants = tasks && tasks.exam && Array.isArray(tasks.exam.variants) ? tasks.exam.variants : [];
    const sheetOf = (v) => ({ title: text(v.title, 160) || exam.title, description: text(v.description, 20000) || '', goals: goals(v.goals), raster: raster(v.raster) });
    const base = tasks ? sheetOf({ title: tasks.title, description: tasks.description, goals: tasks.goals, raster: tasks.exam && tasks.exam.raster }) : null;
    return json(res, 200, {
      code: key && key.key && typeof key.key.code === 'string' ? key.key.code : null,
      seats: exam.seats.map((s) => {
        const v = s.variant ? variants.find((x) => String(x.id) === s.variant) : null;
        return { id: s.id, code: s.code, extra: s.extra || 0, sheet: v ? sheetOf(v) : base };
      }),
    });
  }
  if (parts[1] === 'submissions' && method === 'GET') {
    const key = exam.key ? decryptKey(exam.key) : null;
    const submissions = entries('sessions')
      .filter((s) => s.exam && s.exam.id === exam.id)
      .map((m) => loadSession(m.code))
      .filter(Boolean)
      .sort((a, b) => a.exam.seat.localeCompare(b.exam.seat))
      .map((s) => ({ seat: s.exam.seat, code: exam.seats.find((x) => x.id === s.exam.seat)?.code || '', updated: s.updated, submitted: s.submitted || null, project: s.project }));
    return json(res, 200, { id: exam.id, examId: exam.examId, title: exam.title, label: exam.label, key, keyError: exam.key && !key ? 'unreadable' : null, submissions });
  }
  return fail(res, 404, 'notFound');
}

// --- Server ------------------------------------------------------------------------

function createServer() {
  ensureDirs();
  // Handy mit der Authenticator-App verloren und keine Wiederherstellungscodes: einmal mit
  // ADMIN_MFA_RESET=1 starten, dann ist die Zwei-Faktor-Anmeldung des Hauptadmins aus.
  if (process.env.ADMIN_MFA_RESET === '1') {
    const all = readJson(SECURITY_FILE()) || {};
    if (all.super && all.super.mfa) {
      const { mfa: _m, ...rest } = all.super;
      writeJson(SECURITY_FILE(), { ...all, super: rest });
      console.warn('Zwei-Faktor des Hauptadmins zurückgesetzt (ADMIN_MFA_RESET=1). Variable wieder entfernen.');
    }
  }
  // Verzeichnis im Hintergrund aufbauen, danach regelmässig aufräumen.
  const ready = buildIndexes()
    .then(cleanup)
    .catch((error) => console.error('Verzeichnis:', error && error.message));
  const timer = setInterval(() => void cleanup().catch(() => undefined), 10 * 60_000);
  timer.unref();
  siteStats = createSiteStats({ dataDir: DATA_DIR, origins: STATS_ORIGINS, githubRepo: STATS_GITHUB_REPO });

  const server = http.createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url || '/', 'http://localhost');
    } catch {
      return fail(res, 400, 'badRequest');
    }
    try {
      // Website meldet einen Aufruf (navigator.sendBeacon, daher text/plain und von leyonet.ch).
      // Antwortet immer gleich, damit niemand erfährt, ob gezählt wurde.
      if (url.pathname === '/api/hit') {
        if (req.method !== 'POST') return fail(res, 405, 'methodNotAllowed');
        const body = await readBody(req, 2048).catch(() => null);
        if (body && siteStats && siteStats.accepts(req) && !limited(req, 'hit', HITS_PER_MINUTE) && !limitedGlobal('hit', HITS_PER_MINUTE_TOTAL)) siteStats.record(body);
        return send(res, 204, '');
      }
      if (url.pathname.startsWith('/api/')) {
        // Nur JSON von der eigenen Seite (Schutz gegen fremde Formulare).
        const hasBody = Number(req.headers['content-length'] || 0) > 0 || !!req.headers['transfer-encoding'];
        if (hasBody && !(req.headers['content-type'] || '').startsWith('application/json')) {
          return fail(res, 415, 'jsonOnly');
        }
        return await api(req, res, url);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'methodNotAllowed');
      // Admin-Konsole als eigene Seite (eigener Tab): dieselbe App, sie erkennt die Adresse.
      if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/admin' || url.pathname === '/admin/') {
        // Aufrufe der Web-App zählen (nur die Zahl pro Tag, siehe sitestats.cjs).
        if (req.method === 'GET' && !url.pathname.startsWith('/admin') && siteStats) siteStats.countApp(req);
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
      // Meldestelle für Sicherheitslücken (RFC 9116); läuft immer ein Jahr ab heute.
      if (url.pathname === '/.well-known/security.txt') {
        const expires = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
        const host = /^[a-z0-9.-]+(:\d+)?$/i.test(String(req.headers.host || '')) ? req.headers.host : 'app.leyonet.ch';
        return send(res, 200, `Contact: https://github.com/vonam-git/leyoNET/security/advisories/new\nExpires: ${expires}T00:00:00.000Z\nPreferred-Languages: de, en\nCanonical: https://${host}/.well-known/security.txt\nPolicy: https://github.com/vonam-git/leyoNET/blob/main/SECURITY.md\n`, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
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
module.exports = { siteStats: () => siteStats, createServer, normalizeCode, newCode, cleanup, DATA_DIR, ROOT, ADMIN_PASSWORD, rateAddress, _leases: leases };
