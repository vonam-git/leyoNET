import { parseProject, type Snapshot, type TaskSet, type Topology } from '../../core';
import { examMode, type SeatStatus } from './exam.svelte';

/**
 * Online-Sessions der Webversion: Der Projektstand liegt unter einem
 * Zufallscode auf dem Server und wird automatisch gelöscht. Keine Namen,
 * keine Konten; der Code steht nur im Browser (technisch notwendig) und bei
 * der Person selbst.
 */

const CODE_KEY = 'netzwerk-simulator.session';
const CLASS_KEY = 'netzwerk-simulator.class';
/** Schreib-Token der eigenen Session (zufällig, technisch notwendig: nur dieses Gerät schreibt). */
const WRITER_KEY = 'netzwerk-simulator.writer';
/** Lebenszeichen an den Server, damit kein zweites Gerät die Session übernimmt. */
export const PING_MS = 20_000;
/** Beim Ansehen einer fremden Session so oft neu laden. */
export const WATCH_MS = 5_000;

export interface ServerConfig {
  policy: { modes: { design: boolean; action: boolean; doc: boolean }; pro: boolean; sessionHours: number };
  feedbackEnabled: boolean;
  feedbackDays: number;
  admin: boolean;
  /** «beta»: Testumgebung (Server mit LEYONET_CHANNEL=beta). */
  channel?: 'beta' | 'stable';
  /** Aufgaben-Katalog: vom Hauptadmin ausgeblendete Übungen und Reihen. */
  catalog?: CatalogVisibility;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    /** Antwort des Servers (z.B. Zustand des Prüfungsplatzes). */
    readonly data: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export async function api<T>(method: string, path: string, body?: unknown, token?: string, extra: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'offline');
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data as Record<string, unknown>);
  return data;
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // ohne Speicher gilt der Code bis zum Neuladen
  }
}

/** Prüfungsplätze speichern höchstens alle 20 Sekunden (und beim Schliessen der Seite). */
export const EXAM_SAVE_MS = 20_000;

export interface ExamJoin {
  exam: SeatStatus;
  session?: string;
  fresh?: boolean;
  variant?: string | null;
  project?: unknown;
}

export interface LoadedProject {
  topology: Topology;
  tasks?: TaskSet;
  snapshots?: Snapshot[];
}

/** Fremde Session ansehen: Code, Stand und ob jemand daran arbeitet. */
export interface Watching {
  code: string;
  /** Admin-Token (Prüfungsplatz im Cockpit) oder leer (Ansehen mit dem Session-Code). */
  admin?: string;
  label?: string;
  updated: number | null;
  connected: boolean;
  error?: string;
}

/** Vom Server: Sichtbarkeit der Aufgaben (global oder je Klasse). */
export interface CatalogVisibility {
  hidden: string[];
  hiddenSeries: string[];
  verbund: boolean;
}
export interface ClassSettings {
  catalog: CatalogVisibility;
  verbund: { enabled: boolean; shareSites: boolean; showMap: boolean };
}

class SessionStore {
  code = $state<string | null>(read(CODE_KEY));
  #writer: string | null = read(WRITER_KEY);
  /** Ein anderes Gerät hat die Session übernommen: hier wird nicht mehr gespeichert. */
  takenOver = $state(false);
  locked = $state(false);
  watching = $state<Watching | null>(null);
  #watchTimer: ReturnType<typeof setInterval> | undefined;
  #onWatch: ((p: LoadedProject) => void) | null = null;
  classCode = $state<string | null>(read(CLASS_KEY));
  classLabel = $state<string | null>(null);
  /** Platz und Gruppe im Klassen-Verbund (vom Server vergeben). */
  site = $state<{ seat: number; label: string } | null>(null);
  /** Erreichte Lernziele (nach «Prüfen»), wird mit dem Projekt gespeichert. */
  progress: { goals: number; total: number } | null = null;
  /** Einstellungen der Klasse: ausgeblendete Aufgaben, Verbund freigegeben. */
  classSettings = $state.raw<ClassSettings | null>(null);
  expires = $state<number | null>(null);
  status = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
  config = $state.raw<ServerConfig | null>(null);
  #pending: string | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #busy = false;
  /** Letzter Stand einer Prüfungs-Session (für das regelmässige Speichern ohne Änderung). */
  #last: string | null = null;
  #lastSave = 0;
  lastSaved = $state<number | null>(null);
  /** Warum das Speichern gerade nicht geht (Server voll, Projekt zu gross). */
  problem = $state<'storageFull' | 'tooLarge' | null>(null);

  constructor() {
    // Prüfung: alle 20 Sekunden speichern bzw. den Stand des Platzes abfragen (Zeit, Verlängerung, Ende).
    if (typeof window !== 'undefined') {
      setInterval(() => void this.#ping(), PING_MS);
      setInterval(() => {
        if (!examMode.active?.server || !this.code || examMode.active.server.state === 'closed') return;
        if (!this.#pending && this.#last) this.#pending = this.#last;
        void this.flush();
      }, EXAM_SAVE_MS);
    }
  }

  #headers(): Record<string, string> {
    return { ...(this.#writer ? { 'X-Leyonet-Writer': this.#writer } : {}), ...(this.sebKey ? { 'X-Leyonet-Seb': this.sebKey } : {}) };
  }

  /**
   * Schlüssel einer Prüfung im Safe Exam Browser (aus der Start-Adresse «?seb=…»); nur im
   * Speicher, nie im Browser abgelegt. Der Server lässt Prüfungen mit SEB-Pflicht nur damit zu.
   */
  sebKey: string | null = null;

  #setWriter(token: string | null | undefined) {
    if (token === undefined) return;
    this.#writer = token;
    write(WRITER_KEY, token);
  }

  /** Lebenszeichen: Solange es kommt, kann kein anderes Gerät die Session übernehmen. */
  async #ping() {
    if (!this.code || !this.#writer || this.takenOver || this.watching) return;
    try {
      const data = await api<{ locked: boolean }>('POST', `sessions/${this.code}/ping`, undefined, undefined, this.#headers());
      this.locked = data.locked;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'sessionTakenOver') this.takenOver = true;
    }
  }

  /** Prüfung mit Platz-Code beitreten; bei laufender Prüfung wird die Session des Platzes übernommen. */
  async joinExam(seatCode: string): Promise<ExamJoin> {
    const data = await api<ExamJoin & { writer?: string }>('POST', 'exams/join', { seatCode, ...(this.#writer ? { writer: this.#writer } : {}), ...(this.sebKey ? { sebKey: this.sebKey } : {}) });
    if (data.session) {
      this.#setWriter(data.writer);
      this.takenOver = false;
      this.code = data.session;
      this.classCode = null;
      this.classLabel = null;
      this.expires = null;
      write(CODE_KEY, data.session);
      write(CLASS_KEY, null);
    }
    return data;
  }

  async loadConfig(): Promise<ServerConfig | null> {
    try {
      this.config = await api<ServerConfig>('GET', 'config');
    } catch {
      this.config = null;
    }
    return this.config;
  }

  /** Beim Start: gespeicherte Session laden (falls noch vorhanden). */
  async restore(): Promise<LoadedProject | null> {
    if (!this.code) return null;
    try {
      return await this.open(this.code);
    } catch (error) {
      // Offen an einem anderen Gerät oder gesperrt: Code behalten, aber hier nichts speichern.
      if (error instanceof ApiError && (error.status === 409 || error.status === 423)) {
        this.takenOver = true;
        this.locked = error.data.locked === true;
        return null;
      }
      // Während einer Server-Prüfung den Code behalten (z.B. kurz offline); sonst vergessen.
      if (!(examMode.active?.server && !(error instanceof ApiError && error.status === 404))) this.#forget();
      return null;
    }
  }

  /** Session zum Weiterarbeiten öffnen (holt das Schreibrecht, bei gesperrter Session mit PIN). */
  async open(code: string, pin?: string): Promise<LoadedProject> {
    const own = code.toUpperCase().replace(/[^A-Z0-9]/g, '') === (this.code ?? '').replace('-', '');
    const headers = { ...(own ? this.#headers() : {}), ...(pin ? { 'X-Leyonet-Pin': pin } : {}) };
    const data = await api<{ code: string; expires: number; classCode: string | null; site?: { seat: number; label: string } | null; project: unknown; writer?: string; locked?: boolean }>('GET', `sessions/${encodeURIComponent(code)}`, undefined, undefined, headers);
    const parsed = parseProject(JSON.stringify(data.project));
    if (!parsed.ok) throw new ApiError(400, 'invalidProject');
    this.#setWriter(data.writer);
    this.takenOver = false;
    this.locked = !!data.locked;
    this.code = data.code;
    this.expires = data.expires;
    this.classCode = data.classCode;
    this.site = data.site ?? null;
    write(CODE_KEY, data.code);
    write(CLASS_KEY, data.classCode);
    if (data.classCode) void this.loadClassSettings(data.classCode);
    return parsed;
  }

  /** Neuer Code für den aktuellen Stand, optional einer Klasse zugeordnet. */
  async create(projectJson: string, classCode: string | null = this.classCode, site?: { seat?: number; label?: string }): Promise<string> {
    const data = await api<{ code: string; expires: number; classCode: string | null; site?: { seat: number; label: string } | null; writer?: string }>('POST', 'sessions', {
      project: JSON.parse(projectJson),
      ...(classCode ? { classCode } : {}),
      ...(classCode && site ? { site } : {}),
    });
    this.site = data.site ?? null;
    this.#setWriter(data.writer);
    this.takenOver = false;
    this.locked = false;
    this.code = data.code;
    this.expires = data.expires;
    this.classCode = data.classCode;
    write(CODE_KEY, data.code);
    write(CLASS_KEY, data.classCode);
    this.status = 'saved';
    return data.code;
  }

  async joinClass(classCode: string, projectJson: string, site?: { seat?: number; label?: string }): Promise<void> {
    const data = await api<{ classCode: string; label: string } & ClassSettings>('POST', 'classes/join', { classCode });
    this.classLabel = data.label;
    this.classSettings = { catalog: data.catalog, verbund: data.verbund };
    await this.create(projectJson, data.classCode, site);
  }

  /** Einstellungen der Klasse neu holen (nach dem Öffnen einer Session). */
  async loadClassSettings(classCode: string) {
    try {
      const data = await api<{ classCode: string; label: string } & ClassSettings>('POST', 'classes/join', { classCode });
      this.classLabel = data.label;
      this.classSettings = { catalog: data.catalog, verbund: data.verbund };
    } catch {
      /* Klasse abgelaufen: ohne Einstellungen weiter */
    }
  }

  /** Platz oder Gruppe im Verbund ändern. */
  async setSite(change: { seat?: number; label?: string }): Promise<void> {
    if (!this.code) return;
    const data = await api<{ site: { seat: number; label: string } }>('PUT', `sessions/${encodeURIComponent(this.code)}/site`, change, undefined, this.#headers());
    this.site = data.site;
  }

  /** Schreibkennung für Anfragen im Namen dieser Session (z.B. Nachrichten). */
  writerHeaders(): Record<string, string> {
    return this.#headers();
  }

  /** Änderungen gesammelt nach kurzer Pause hochladen; leere Projekte legen keine Session an. */
  schedule(projectJson: string, hasContent: boolean) {
    // Beim Ansehen oder nach Übernahme durch ein anderes Gerät nichts speichern.
    if (this.watching || this.takenOver) return;
    if (!this.code && !hasContent) return;
    this.#pending = projectJson;
    if (examMode.active?.server && this.code) {
      // Prüfung: gedrosselt auf höchstens alle 20 Sekunden.
      this.#last = projectJson;
      if (this.#timer) return;
      const wait = Math.max(0, this.#lastSave + EXAM_SAVE_MS - Date.now());
      this.#timer = setTimeout(() => {
        this.#timer = undefined;
        void this.flush();
      }, wait);
      return;
    }
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.flush(), 1500);
  }

  async flush() {
    const json = this.#pending;
    if (!json || this.#busy) return;
    this.#pending = null;
    this.#busy = true;
    this.status = 'saving';
    try {
      if (this.code) {
        const data = await api<{ expires: number; exam?: SeatStatus; writer?: string; locked?: boolean }>('PUT', `sessions/${this.code}`, { project: JSON.parse(json), ...(this.classCode && this.progress ? { progress: this.progress } : {}) }, undefined, this.#headers());
        this.#setWriter(data.writer);
        if (data.locked !== undefined) this.locked = data.locked;
        this.expires = data.expires;
        this.#lastSave = Date.now();
        this.lastSaved = this.#lastSave;
        if (data.exam) examMode.updateServer(data.exam);
      } else {
        await this.create(json);
      }
      this.status = 'saved';
      this.problem = null;
    } catch (error) {
      // Prüfung beendet: nicht mehr speichern, den Lernenden «abgegeben» zeigen.
      if (error instanceof ApiError && error.status === 423) {
        this.#pending = null;
        examMode.updateServer((error.data.exam as SeatStatus | undefined) ?? { state: 'closed', until: null, now: Date.now(), title: '', seat: '' });
        this.status = 'saved';
        return;
      }
      // Ein anderes Gerät arbeitet jetzt in dieser Session: nichts mehr überschreiben.
      if (error instanceof ApiError && error.code === 'sessionTakenOver') {
        this.#pending = null;
        this.takenOver = true;
        this.status = 'error';
        return;
      }
      if (error instanceof ApiError && (error.code === 'storageFull' || error.code === 'tooLarge')) this.problem = error.code;
      // Abgelaufene Session: mit neuem Code weiterarbeiten.
      if (error instanceof ApiError && error.status === 404 && this.code && !examMode.active?.server) {
        this.#forget();
        this.#pending = json;
      } else {
        this.status = 'error';
      }
    } finally {
      this.#busy = false;
      if (this.#pending) void this.flush();
    }
  }

  /** Eigene Session auf dem Server löschen (Recht auf Löschung). */
  async remove() {
    const code = this.code;
    if (!code) return;
    await api('DELETE', `sessions/${code}`, undefined, undefined, this.#headers()).catch(() => undefined);
    this.#forget();
  }

  /** Eigene Session mit PIN sperren: Ein anderes Gerät kann sie dann nur mit der PIN übernehmen. */
  async lock(pin: string) {
    if (!this.code) return;
    await api('POST', `sessions/${this.code}/lock`, { pin }, undefined, this.#headers());
    this.locked = true;
  }

  async unlock() {
    if (!this.code) return;
    await api('DELETE', `sessions/${this.code}/lock`, undefined, undefined, this.#headers());
    this.locked = false;
  }

  /** Nach Übernahme durch ein anderes Gerät: den eigenen Stand unter einem neuen Code sichern. */
  async saveAsNew(projectJson: string): Promise<string> {
    this.#forget();
    return this.create(projectJson, null);
  }

  // --- Ansehen (Lehrperson) -------------------------------------------------------------

  /**
   * Fremde Session nur ansehen und laufend neu laden. Mit Admin-Token über die Admin-Schnittstelle
   * (Prüfungsplatz), sonst mit dem Session-Code. Schreibt nie und verdrängt niemanden.
   */
  async watch(code: string, onLoad: (p: LoadedProject) => void, admin?: string, label?: string) {
    this.stopWatch();
    this.#onWatch = onLoad;
    this.watching = { code, updated: null, connected: false, ...(admin ? { admin } : {}), ...(label ? { label } : {}) };
    await this.#refreshWatch();
    this.#watchTimer = setInterval(() => void this.#refreshWatch(), WATCH_MS);
  }

  async #refreshWatch() {
    const w = this.watching;
    if (!w) return;
    try {
      const path = w.admin ? `admin/sessions/${encodeURIComponent(w.code)}` : `sessions/${encodeURIComponent(w.code)}?watch=1`;
      const data = await api<{ project: unknown; updated?: number; connected?: boolean }>('GET', path, undefined, w.admin);
      if (!this.watching || this.watching.code !== w.code) return;
      const changed = data.updated !== w.updated;
      this.watching = { ...w, updated: data.updated ?? null, connected: !!data.connected, error: undefined };
      if (!changed) return;
      const parsed = parseProject(JSON.stringify(data.project));
      if (parsed.ok) this.#onWatch?.(parsed);
    } catch (error) {
      if (this.watching) this.watching = { ...this.watching, error: error instanceof ApiError ? error.code : 'error' };
    }
  }

  stopWatch() {
    clearInterval(this.#watchTimer);
    this.#watchTimer = undefined;
    this.watching = null;
    this.#onWatch = null;
  }

  /** Neue, leere Session beginnen; die alte bleibt bis zum Ablauf unter ihrem Code erreichbar. */
  detach() {
    this.#forget();
  }

  #forget() {
    this.code = null;
    this.#setWriter(null);
    this.takenOver = false;
    this.locked = false;
    this.expires = null;
    this.classCode = null;
    this.classLabel = null;
    this.site = null;
    this.classSettings = null;
    this.status = 'idle';
    write(CODE_KEY, null);
    write(CLASS_KEY, null);
  }
}

export const session = new SessionStore();
