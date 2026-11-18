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

/** Adresse, bei der SEB sich beendet (quitURL), z.B. nach der Abgabe: «?seb-ende». */
export const SEB_QUIT_PARAM = 'seb-ende';

/** Läuft die Seite im Safe Exam Browser? (SEB meldet sich im User-Agent mit «SEB/x.y».) */
export const inSeb = () => typeof navigator !== 'undefined' && /\bSEB\/\d/.test(navigator.userAgent);

/** «?seb=<Schlüssel>» aus der Adresse lesen und aus der Adresszeile entfernen (auch «?seb-ende»). */
export function takeSebKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    const key = url.searchParams.get('seb');
    const quit = url.searchParams.has(SEB_QUIT_PARAM);
    if (key === null && !quit) return null;
    url.searchParams.delete('seb');
    url.searchParams.delete(SEB_QUIT_PARAM);
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    return key !== null && SEB_KEY.test(key) ? key : null;
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

/** Ein Passwort oder ein schon berechneter SHA-256-Hash (64 Hex-Zeichen, wie SEB ihn speichert)? */
export const isSebHash = (value: string) => /^[0-9a-fA-F]{64}$/.test(value.trim());

/** Hash für hashedAdminPassword/hashedQuitPassword: einen fertigen Hash übernehmen, sonst berechnen. */
export async function sebPasswordHash(value: string | undefined): Promise<string> {
  const v = value?.trim() ?? '';
  if (!v) return '';
  return isSebHash(v) ? v.toLowerCase() : sha256Hex(v);
}

/**
 * Einstellbare Schlüssel (Namen wie in der SEB-Spezifikation). Eine Grenze für Passwort-Versuche
 * kennt SEB nicht; leyoNET begrenzt dafür die Versuche beim eigenen Code zum Beenden.
 */
export interface SebSettings {
  /** SEB darf beendet werden (mit Beenden-Passwort, falls gesetzt): allowQuit. */
  allowQuit: boolean;
  /** Nach der Abgabe ein Knopf «Safe Exam Browser beenden» (quitURL). */
  quitLink: boolean;
  /** Vor dem Beenden über den Knopf nachfragen: quitURLConfirm. */
  quitConfirm: boolean;
  /** Tastenkürzel zum Beenden (Alt+F4, Cmd+Q) sperren: ignoreExitKeys. */
  ignoreExitKeys: boolean;
  /** Neu laden erlaubt und Knopf dafür: browserWindowAllowReload, showReloadButton. */
  reload: boolean;
  /** Taskleiste und Uhr: showTaskBar, showTime. */
  taskbar: boolean;
  clock: boolean;
  /** Zoom (Seite und Text): enableZoomPage, enableZoomText. */
  zoom: boolean;
  /** Rechtschreibprüfung und Wörterbuch: allowSpellCheck, allowDictionaryLookup. */
  spellCheck: boolean;
  /** Eigene Zwischenablage nur in SEB: enablePrivateClipboard. */
  privateClipboard: boolean;
  /** Prüft, ob andere Programme nach vorne kommen (Windows): enableAppSwitcherCheck. */
  appSwitcherCheck: boolean;
  /** Start in einer virtuellen Maschine erlauben: allowVirtualMachine. */
  virtualMachine: boolean;
  /** Bildschirm teilen (macOS): allowScreenSharing. */
  screenSharing: boolean;
  /** Höchstzahl Bildschirme: allowedDisplaysMaxNumber. */
  displays: number;
  /** WLAN-Steuerung in der Taskleiste: allowWlan. */
  wlan: boolean;
  /** Mikrofon und Kamera: allowAudioCapture, allowVideoCapture. */
  audio: boolean;
  video: boolean;
  /** Weitere erlaubte Adressen (Host oder Host/Pfad), z.B. eine Formelsammlung. */
  extraHosts: string[];
}

export const SEB_DEFAULTS: SebSettings = {
  allowQuit: true,
  quitLink: true,
  quitConfirm: true,
  ignoreExitKeys: true,
  reload: true,
  taskbar: true,
  clock: true,
  zoom: true,
  spellCheck: false,
  privateClipboard: true,
  appSwitcherCheck: true,
  virtualMachine: false,
  screenSharing: false,
  displays: 1,
  wlan: false,
  audio: false,
  video: false,
  extraHosts: [],
};

/** Erlaubte Zusatzadresse: Host mit optionalem Port und Pfad, ohne Schema, Leerzeichen oder Platzhalter. */
export const validSebHost = (value: string) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?(\/[\w\-./%]*)?$/i.test(value.trim()) && value.trim().length <= 200;

/** Gespeicherte Einstellungen bereinigen (fehlende Werte aus den Vorgaben). */
export function cleanSebSettings(raw: unknown): SebSettings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = { ...SEB_DEFAULTS };
  for (const key of Object.keys(SEB_DEFAULTS) as (keyof SebSettings)[]) {
    const v = r[key];
    if (typeof SEB_DEFAULTS[key] === 'boolean' && typeof v === 'boolean') (out as Record<string, unknown>)[key] = v;
  }
  out.displays = Number.isInteger(r.displays) && (r.displays as number) >= 1 && (r.displays as number) <= 4 ? (r.displays as number) : SEB_DEFAULTS.displays;
  out.extraHosts = Array.isArray(r.extraHosts) ? r.extraHosts.filter((h): h is string => typeof h === 'string' && validSebHost(h)).map((h) => h.trim()).slice(0, 10) : [];
  return out;
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
  /** Weitere Einstellungen; fehlt: Vorgaben (SEB_DEFAULTS). */
  settings?: Partial<SebSettings>;
}

/** Einstellungen als Property-List: nur die Webversion erlaubt, keine Downloads, kein Zurück. */
export async function sebPlist(o: SebOptions): Promise<string> {
  const url = new URL(o.startUrl);
  const c = cleanSebSettings({ ...SEB_DEFAULTS, ...o.settings });
  // Beenden-Link: dieselbe Seite mit «?seb-ende» (gehört zum eigenen Server, der Filter lässt ihn zu).
  const quit = new URL(url.origin + url.pathname);
  quit.searchParams.set(SEB_QUIT_PARAM, '1');
  const rules = [url.host, ...c.extraHosts].map((expression) => ({ action: 1, active: true, expression, regex: false }));
  const settings: Record<string, Value> = {
    originatorVersion: 'leyoNET',
    sebConfigPurpose: 0,
    startURL: url.href,
    hashedAdminPassword: await sebPasswordHash(o.adminPassword),
    hashedQuitPassword: await sebPasswordHash(o.quitPassword),
    allowQuit: c.allowQuit,
    ignoreExitKeys: c.ignoreExitKeys,
    quitURL: c.allowQuit && c.quitLink ? quit.href : '',
    quitURLConfirm: c.quitConfirm,
    // Zufälliges Salz: jede erzeugte Datei hat einen eigenen Browser Exam Key.
    examKeySalt: crypto.getRandomValues(new Uint8Array(32)),
    sendBrowserExamKey: false,
    URLFilterEnable: true,
    URLFilterEnableContentFilter: false,
    // Nur der eigene Server (ohne Pfad = alle Seiten darauf) und die freigegebenen Adressen; alles andere sperrt SEB.
    URLFilterRules: rules,
    allowDownUploads: false,
    allowBrowsingBackForward: false,
    browserWindowAllowReload: c.reload,
    newBrowserWindowAllowReload: c.reload,
    showReloadButton: c.reload,
    showReloadWarning: true,
    showTaskBar: c.taskbar,
    showTime: c.taskbar && c.clock,
    enableZoomPage: c.zoom,
    enableZoomText: c.zoom,
    enableAppSwitcherCheck: c.appSwitcherCheck,
    allowSpellCheck: c.spellCheck,
    allowDictionaryLookup: c.spellCheck,
    enablePrivateClipboard: c.privateClipboard,
    allowVirtualMachine: c.virtualMachine,
    allowScreenSharing: c.screenSharing,
    allowedDisplaysMaxNumber: c.displays,
    allowWlan: c.wlan,
    allowAudioCapture: c.audio,
    allowVideoCapture: c.video,
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
