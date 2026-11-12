/**
 * Konfigurationsdatei für den Safe Exam Browser (SEB, .seb): startet die Prüfung in der
 * Webversion, sperrt alle anderen Adressen und schützt Einstellungen und Beenden mit Passwörtern.
 *
 * Aufbau nach der Dokumentation des SEB-Projekts (Dateiformat und Einstellungsschlüssel):
 * - Einstellungen als XML-Property-List (UTF-8).
 * - Ohne Konfigurationspasswort: gzip( "plnd" + gzip(XML) ).
 * - Mit Konfigurationspasswort: gzip( "pswd" + verschlüsselt(gzip(XML)) ), verschlüsselt mit
 *   AES-256-CBC (PKCS#7), Schlüssel per PBKDF2-HMAC-SHA1 (10 000 Runden, 8 Byte Salz) je für
 *   Verschlüsselung und HMAC-SHA256; Block: Version 2, Option 1, Salz, Salz, IV, Daten, HMAC.
 * - Admin- und Beenden-Passwort als SHA-256 in Kleinbuchstaben-Hex (hashedAdminPassword,
 *   hashedQuitPassword).
 * Alles läuft im Browser (Web Crypto); Passwörter verlassen das Gerät nie.
 */

/** Schlüssel einer Prüfung im SEB: 256 Bit als Hex (vom Server erzeugt). */
export const SEB_KEY = /^[0-9a-f]{64}$/;

/** «?seb=<Schlüssel>» aus der Adresse lesen und aus der Adresszeile entfernen. */
export function takeSebKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    const key = url.searchParams.get('seb');
    if (key === null) return null;
    url.searchParams.delete('seb');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    return SEB_KEY.test(key) ? key : null;
  } catch {
    return null;
  }
}

// Ohne verwechselbare Zeichen (0/O, 1/l/I).
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Zufälliges Passwort, z.B. «k7Qm-x3Pa-9TfR» (3 × 4 Zeichen, gut abzuschreiben). */
export function randomPassword(groups = 3): string {
  const bytes = crypto.getRandomValues(new Uint8Array(groups * 4 * 2));
  const chars: string[] = [];
  // Gleichverteilt: Werte ab dem grössten Vielfachen der Alphabetlänge verwerfen.
  const limit = 256 - (256 % ALPHABET.length);
  for (const b of bytes) if (b < limit && chars.length < groups * 4) chars.push(ALPHABET[b % ALPHABET.length]!);
  while (chars.length < groups * 4) chars.push(ALPHABET[crypto.getRandomValues(new Uint8Array(1))[0]! % ALPHABET.length]!);
  return Array.from({ length: groups }, (_, i) => chars.slice(i * 4, i * 4 + 4).join('')).join('-');
}

const hex = (bytes: ArrayBuffer | Uint8Array) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
const utf8 = (text: string) => new TextEncoder().encode(text);

export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', utf8(text)));
}

const xml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type Value = string | number | boolean | Uint8Array | Value[] | { [key: string]: Value };

function plistValue(v: Value, indent: string): string {
  if (typeof v === 'boolean') return `${indent}<${v}/>`;
  if (typeof v === 'number') return `${indent}<integer>${Math.trunc(v)}</integer>`;
  if (typeof v === 'string') return `${indent}<string>${xml(v)}</string>`;
  if (v instanceof Uint8Array) return `${indent}<data>${btoa(String.fromCharCode(...v))}</data>`;
  if (Array.isArray(v)) return `${indent}<array>\n${v.map((x) => plistValue(x, `${indent}\t`)).join('\n')}\n${indent}</array>`;
  const keys = Object.keys(v);
  return `${indent}<dict>\n${keys.map((k) => `${indent}\t<key>${xml(k)}</key>\n${plistValue(v[k]!, `${indent}\t`)}`).join('\n')}\n${indent}</dict>`;
}

export interface SebOptions {
  /** Adresse, die SEB öffnet, z.B. https://app.leyonet.ch/?seb=… */
  startUrl: string;
  /** Konfigurationspasswort: SEB fragt beim Öffnen der Datei danach (leer = Datei unverschlüsselt). */
  settingsPassword?: string;
  /** Admin-Passwort: zum Bearbeiten der Einstellungen. */
  adminPassword?: string;
  /** Beenden-Passwort: SEB vor Ende der Prüfung verlassen. */
  quitPassword?: string;
}

/** Einstellungen als Property-List: nur die Webversion erlaubt, keine Downloads, kein Zurück. */
export async function sebPlist(o: SebOptions): Promise<string> {
  const url = new URL(o.startUrl);
  const settings: Record<string, Value> = {
    originatorVersion: 'leyoNET',
    sebConfigPurpose: 0,
    startURL: url.href,
    hashedAdminPassword: o.adminPassword ? await sha256Hex(o.adminPassword) : '',
    hashedQuitPassword: o.quitPassword ? await sha256Hex(o.quitPassword) : '',
    allowQuit: true,
    // Zufälliges Salz: jede erzeugte Datei hat einen eigenen Browser Exam Key.
    examKeySalt: crypto.getRandomValues(new Uint8Array(32)),
    sendBrowserExamKey: false,
    URLFilterEnable: true,
    URLFilterEnableContentFilter: false,
    // Nur der eigene Server (ohne Pfad = alle Seiten darauf); alles andere sperrt SEB.
    URLFilterRules: [{ action: 1, active: true, expression: url.host, regex: false }],
    allowDownUploads: false,
    allowBrowsingBackForward: false,
    browserWindowAllowReload: true,
    showReloadButton: true,
    showReloadWarning: true,
    enableAppSwitcherCheck: true,
    allowSpellCheck: false,
    allowDictionaryLookup: false,
    enablePrivateClipboard: true,
    newBrowserWindowByLinkPolicy: 0,
    newBrowserWindowByScriptPolicy: 0,
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n${plistValue(settings, '')}\n</plist>\n`;
}

async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

async function deriveBits(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const base = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-1', salt: salt as BufferSource, iterations: 10_000 }, base, 256);
}

/** Mit Passwort verschlüsseln (Block-Format Version 2 wie im SEB). */
export async function encryptWithPassword(data: Uint8Array, password: string): Promise<Uint8Array> {
  const encSalt = crypto.getRandomValues(new Uint8Array(8));
  const hmacSalt = crypto.getRandomValues(new Uint8Array(8));
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const encKey = await crypto.subtle.importKey('raw', await deriveBits(password, encSalt), 'AES-CBC', false, ['encrypt']);
  const hmacKey = await crypto.subtle.importKey('raw', await deriveBits(password, hmacSalt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, encKey, data as BufferSource));
  const body = concat(new Uint8Array([2, 1]), encSalt, hmacSalt, iv, cipher);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, body as BufferSource));
  return concat(body, mac);
}

/** Fertige .seb-Datei. */
export async function sebFile(o: SebOptions): Promise<Uint8Array> {
  const inner = await gzip(utf8(await sebPlist(o)));
  const block = o.settingsPassword ? concat(utf8('pswd'), await encryptWithPassword(inner, o.settingsPassword)) : concat(utf8('plnd'), inner);
  return gzip(block);
}
