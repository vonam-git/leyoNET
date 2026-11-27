import { parseProject, type Snapshot, type TaskSet, type Topology, ATTACK_KINDS, type AttackEffect, type AttackKind } from '../../core';
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
/** Zufällige Kennung dieses Browsers, damit ein Gerät einer Klasse nur einmal beitritt (keine Personendaten). */
const DEVICE_KEY = 'netzwerk-simulator.device';
function deviceId(): string | null {
  let id = read(DEVICE_KEY);
  if (id && /^[A-Za-z0-9_-]{24,64}$/.test(id)) return id;
  try {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    write(DEVICE_KEY, id);
    return read(DEVICE_KEY) === id ? id : null;
  } catch {
    return null;
  }
}
/** Lebenszeichen an den Server, damit kein zweites Gerät die Session übernimmt. */
export const PING_MS = 20_000;
/** In einer Klasse öfter: Hilfe-Anfrage, «Erkennen» und Bearbeiten durch die Lehrperson kommen so rasch an. */
export const CLASS_PING_MS = 6_000;

export type IdentifyStatus = { state: 'none' | 'pending' | 'shown' | 'done' | 'missed'; left?: number };
/** Blinkdauer aus dem Lebenszeichen: 3–15 s, ohne Angabe 7 s. */
export function identifyMs(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(15_000, Math.max(3000, value)) : 7000;
}
/** Lehrperson bearbeitet eine Session: so oft «ich bin noch da» melden. */
export const EDIT_BEAT_MS = 10_000;
/** Bearbeitet die Lehrperson so lange nichts, wird wieder nur angesehen (Lernende nicht ewig gesperrt). */
export const EDIT_IDLE_MS = 10 * 60_000;
/** Beim Ansehen einer fremden Session so oft neu laden. */
export const WATCH_MS = 5_000;

export interface ServerConfig {
  /** Wie `publicConfig()` in server/app.cjs. */
  policy: { modes: { design: boolean; simulation: boolean }; maxLevel: number; defaultLevel: number; disabled: string[]; sessionHours: number };
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
  /** Klasse und Platz der angesehenen Session (für den Klassen-Verbund). */
  classCode?: string | null;
  site?: { seat: number; label: string } | null;
  /** Lehrperson bearbeitet die Session (Änderungen gehen an die Lernenden), statt nur anzusehen. */
  edit?: boolean;
  /** Lernende haben Hilfe angefordert (Zeitpunkt). */
  help?: number | null;
}

/** Vom Server: Sichtbarkeit der Aufgaben (global oder je Klasse). */
export interface CatalogVisibility {
  hidden: string[];
  hiddenSeries: string[];
  verbund: boolean;
}
export interface ClassSettings {
  catalog: CatalogVisibility;
  verbund: { enabled: boolean; shareSites: boolean; showMap: boolean; seatChoice?: boolean };
}

export class SessionStore {
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
  /** Erreichte Lernziele; `faults`: davon behobene Fehler (Fehlersuche, für das Dashboard). */
  progress: { goals: number; total: number; faults?: { fixed: number; total: number } } | null = null;
  /** Laufender Angriff der Lehrperson und ob er noch wirkt. */
  attack = $state<{ id: number; kind: AttackKind } | null>(null);
  attackEffect = $state<AttackEffect | null>(null);
  /** Hilfe bei der Lehrperson angefordert (Klasse). */
  help = $state(false);
  /** «Erkennen»: seit wann und wie lange der Bildschirm blinkt. */
  identify = $state<{ at: number; ms: number } | null>(null);
  /** Lehrperson bearbeitet diese Session gerade: hier nur zusehen. */
  teacherEditing = $state(false);
  /** Neuer Stand vom Server übernehmen (nach Änderungen der Lehrperson), von App.svelte gesetzt. */
  onRemote: ((p: LoadedProject) => void) | null = null;
  #known = 0;
  /** Hilfe-Anfrage geändert, aber noch nicht gemeldet (sonst gilt der Stand vom Server). */
  #helpChange: boolean | null = null;
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
  problem = $state<'storageFull' | 'tooLarge' | 'classFull' | null>(null);

  constructor() {
    // Prüfung: alle 20 Sekunden speichern bzw. den Stand des Platzes abfragen (Zeit, Verlängerung, Ende).
    if (typeof window !== 'undefined') {
      // Alle 2 s nachsehen, ob ein Lebenszeichen fällig ist: in einer Klasse alle 6 s, sonst alle 20 s
      // (auch gleich nach dem Beitreten, nicht erst nach dem alten Takt).
      let last = Date.now();
      let running = false;
      setInterval(() => {
        if (running || Date.now() - last < (this.classCode ? CLASS_PING_MS : PING_MS)) return;
        running = true;
        last = Date.now();
        void this.#ping().finally(() => (running = false));
      }, 2000);
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
    const code = this.code;
    const change = this.#helpChange;
    this.#helpChange = null;
    try {
      // In einer Klasse: Fortschritt und Hilfe-Anfrage mitschicken; zurück kommen «Erkennen» und ob die Lehrperson bearbeitet.
      const effect = this.attack && this.attackEffect ? { attack: { id: this.attack.id, effect: this.attackEffect } } : {};
      const body = this.classCode ? { ...(this.progress ? { progress: this.progress } : {}), ...(change !== null ? { help: change } : {}), ...effect } : undefined;
      const data = await api<{ locked: boolean; help?: boolean; identify?: boolean | number; teacher?: boolean; updated?: number; attack?: { id: number; kind: string } | null }>('POST', `sessions/${code}/ping`, body, undefined, this.#headers());
      if (code !== this.code) return;
      this.locked = data.locked;
      if (!this.classCode) return;
      // Die Lehrperson kann die Hilfe-Anfrage erledigen: Stand vom Server übernehmen (ausser es wurde inzwischen neu geklickt).
      if (data.help !== undefined && this.#helpChange === null) this.help = data.help;
      // Der Server stellt «Erkennen» nur einmal zu (Blinkdauer in ms; ältere Server: true).
      if (data.identify) this.identify = { at: Date.now(), ms: identifyMs(data.identify) };
      // Sicherheits-Szenario der Lehrperson: ein simulierter Angriff auf das eigene Netz (nur in der Simulation).
      const attack = data.attack && (ATTACK_KINDS as readonly string[]).includes(data.attack.kind) ? { id: data.attack.id, kind: data.attack.kind as AttackKind } : null;
      if (attack?.id !== this.attack?.id) {
        this.attack = attack;
        this.attackEffect = null;
      }
      const was = this.teacherEditing;
      this.teacherEditing = !!data.teacher;
      // Die Lehrperson hat geändert (oder bearbeitet noch): neuen Stand holen und zeigen.
      if (data.updated && data.updated > this.#known && (this.teacherEditing || was)) await this.#pullRemote();
      else if (data.updated) this.#known = Math.max(this.#known, data.updated);
    } catch (error) {
      if (change !== null && this.#helpChange === null) this.#helpChange = change;
      if (error instanceof ApiError && error.code === 'sessionTakenOver') this.takenOver = true;
    }
  }

  async #pullRemote() {
    if (!this.code) return;
    try {
      const data = await api<{ project: unknown; updated?: number }>('GET', `sessions/${encodeURIComponent(this.code)}?watch=1`);
      const parsed = parseProject(JSON.stringify(data.project));
      if (!parsed.ok) return;
      this.#known = data.updated ?? Date.now();
      this.#pending = null;
      clearTimeout(this.#timer);
      this.onRemote?.(parsed);
    } catch {
      /* beim nächsten Lebenszeichen wieder */
    }
  }

  /** Hilfe bei der Lehrperson anfordern oder zurückziehen (gleich melden, nicht erst beim nächsten Lebenszeichen). */
  async requestHelp(on: boolean) {
    this.help = on;
    this.#helpChange = on;
    await this.#ping();
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
  /** Beim Beitreten: Dieses Gerät war schon in der Klasse, die bisherige Session ist wieder offen (Projekt dazu). */
  rejoined: LoadedProject | null = null;

  async create(projectJson: string, classCode: string | null = this.classCode, site?: { seat?: number; label?: string }): Promise<string> {
    const device = classCode ? deviceId() : null;
    const data = await api<{ code: string; expires: number; classCode: string | null; site?: { seat: number; label: string } | null; writer?: string; existing?: boolean; project?: unknown }>('POST', 'sessions', {
      project: JSON.parse(projectJson),
      ...(classCode ? { classCode } : {}),
      ...(classCode && site ? { site } : {}),
      ...(device ? { device } : {}),
    });
    this.rejoined = null;
    if (data.existing && data.project) {
      const parsed = parseProject(JSON.stringify(data.project));
      if (parsed.ok) this.rejoined = parsed;
    }
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

  /** Klasse nachschlagen, ohne beizutreten (Bezeichnung, ob Platz und Gruppe selbst gewählt werden). */
  async checkClass(classCode: string): Promise<{ classCode: string; label: string } & ClassSettings> {
    return api<{ classCode: string; label: string } & ClassSettings>('POST', 'classes/join', { classCode });
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

  /** Eingabe der Lehrperson beim Bearbeiten (Klick, Taste): hält «Bearbeiten» offen, auch ohne Änderung am Netz. */
  noteInput() {
    if (this.watching?.edit) this.#editAt = Date.now();
  }

  /** Änderungen gesammelt nach kurzer Pause hochladen; leere Projekte legen keine Session an. */
  schedule(projectJson: string, hasContent: boolean) {
    // Lehrperson bearbeitet eine Session ihrer Klasse: dorthin speichern.
    if (this.watching?.edit) {
      this.#editAt = Date.now();
      this.#editPending = projectJson;
      clearTimeout(this.#editTimer);
      this.#editTimer = setTimeout(() => void this.#flushEdit(), 1200);
      return;
    }
    // Beim Ansehen, nach Übernahme durch ein anderes Gerät oder solange die Lehrperson bearbeitet nichts speichern.
    if (this.watching || this.takenOver || this.teacherEditing) return;
    // Nach der Abgabe: nichts mehr speichern, auch keine neue Session anlegen.
    if (examMode.active?.server?.state === 'closed') return;
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

  /**
   * Prüfung abgeben (von Hand oder am Ende der Zeit): letzten Stand mitsenden, der Server schliesst
   * den Platz sofort und hält den Zeitpunkt fest. Gibt den neuen Zustand zurück oder null, wenn die
   * Abgabe nicht ankam (dann bleibt alles, wie es ist, und es kann erneut versucht werden).
   */
  async submitExam(projectJson?: string): Promise<SeatStatus | null> {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (!this.code) return null;
    const json = projectJson ?? this.#pending ?? this.#last;
    try {
      const data = await api<{ exam: SeatStatus }>('POST', `sessions/${this.code}/submit`, json ? { project: JSON.parse(json) } : {}, undefined, this.#headers());
      this.#pending = null;
      this.#last = null;
      this.lastSaved = Date.now();
      examMode.updateServer(data.exam);
      return data.exam;
    } catch (error) {
      if (error instanceof ApiError && error.status === 423) {
        const status = (error.data.exam as SeatStatus | undefined) ?? { state: 'closed', until: null, now: Date.now(), title: '', seat: '' };
        this.#pending = null;
        examMode.updateServer(status);
        return status;
      }
      this.status = 'error';
      return null;
    }
  }

  /** Code zum Beenden des Prüfungsmodus auf dem Server prüfen (begrenzte Versuche). */
  async unlockExam(code: string): Promise<'ok' | 'wrong' | 'locked' | 'error'> {
    if (!this.code) return 'error';
    try {
      const data = await api<{ ok: boolean; exam: SeatStatus }>('POST', `sessions/${this.code}/unlock`, { code }, undefined, this.#headers());
      examMode.updateServer(data.exam);
      return 'ok';
    } catch (error) {
      if (error instanceof ApiError && (error.status === 403 || error.status === 423) && error.data.exam) {
        examMode.updateServer(error.data.exam as SeatStatus);
        return error.status === 423 ? 'locked' : 'wrong';
      }
      return 'error';
    }
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
        this.#known = Math.max(this.#known, this.#lastSave);
        if (data.exam) examMode.updateServer(data.exam);
      } else {
        await this.create(json);
      }
      this.status = 'saved';
      this.problem = null;
    } catch (error) {
      // Die Lehrperson bearbeitet gerade: nichts überschreiben, ihren Stand übernehmen.
      if (error instanceof ApiError && error.code === 'teacherEditing') {
        this.#pending = null;
        this.teacherEditing = true;
        this.status = 'saved';
        void this.#pullRemote();
        return;
      }
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
      if (error instanceof ApiError && (error.code === 'storageFull' || error.code === 'tooLarge' || error.code === 'classFull')) this.problem = error.code;
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
  async watch(code: string, onLoad: (p: LoadedProject) => void, admin?: string, label?: string, edit = false): Promise<boolean> {
    // Jeder Aufruf bekommt eine Nummer. Klickt die Lehrperson schnell nacheinander zwei Sessions an,
    // gewinnt der letzte Klick: Ein älterer Aufruf, der später fertig wird, ändert nichts mehr.
    const run = ++this.#watchRun;
    await this.stopWatch(run);
    if (run !== this.#watchRun) return false;
    this.#onWatch = onLoad;
    this.watching = { code, updated: null, connected: false, ...(admin ? { admin } : {}), ...(label ? { label } : {}), ...(edit && admin ? { edit: true } : {}) };
    await this.#refreshWatch();
    if (run !== this.#watchRun) return false;
    if (this.watching?.edit) {
      if (this.watching.updated === null) return true;
      // Bearbeiten: Lernende sehen nur zu, solange die Lehrperson sich meldet.
      this.#editAt = Date.now();
      await this.#beat(true);
      if (run !== this.#watchRun) return false;
      this.#watchTimer = setInterval(() => {
        // Lange nichts geändert (z.B. Tab am Beamer vergessen): zurück zu «nur ansehen».
        if (Date.now() - this.#editAt > EDIT_IDLE_MS) {
          void this.#beat(false);
          if (this.watching) this.watching = { ...this.watching, edit: false };
          this.#editIdle?.();
          clearInterval(this.#watchTimer);
          this.#watchTimer = setInterval(() => void this.#refreshWatch(), WATCH_MS);
          return;
        }
        void this.#beat(true);
        void this.#refreshWatch();
      }, EDIT_BEAT_MS);
      return true;
    }
    this.#watchTimer = setInterval(() => void this.#refreshWatch(), WATCH_MS);
    return true;
  }

  /** Laufnummer des aktuellen Ansehens (siehe watch). */
  #watchRun = 0;

  #editPending: string | null = null;
  #editAt = 0;
  #editIdle: (() => void) | null = null;
  set onEditIdle(fn: (() => void) | null) {
    this.#editIdle = fn;
  }
  /** Meldung, wenn eine Änderung der Lehrperson verworfen wurde (von watch.ts gesetzt). */
  #editConflict: (() => void) | null = null;
  set onEditConflict(fn: (() => void) | null) {
    this.#editConflict = fn;
  }
  #editTimer: ReturnType<typeof setTimeout> | undefined;

  async #beat(active: boolean) {
    const w = this.watching;
    if (!w?.edit || !w.admin) return;
    await api('POST', `admin/sessions/${encodeURIComponent(w.code)}/edit`, { active }, w.admin).catch(() => undefined);
  }

  /** Änderungen der Lehrperson an der Session der Lernenden speichern. */
  async #flushEdit() {
    const w = this.watching;
    const json = this.#editPending;
    if (!w?.edit || !w.admin || !json) return;
    this.#editPending = null;
    this.status = 'saving';
    try {
      const data = await api<{ updated: number }>('PUT', `admin/sessions/${encodeURIComponent(w.code)}`, { project: JSON.parse(json), ...(w.updated !== null ? { base: w.updated } : {}) }, w.admin);
      if (this.watching?.code === w.code) this.watching = { ...this.watching, updated: data.updated };
      this.status = 'saved';
    } catch (error) {
      // Die Lernenden haben inzwischen gespeichert (z.B. Tab der Lehrperson lange im Hintergrund):
      // nichts überschreiben, ihren Stand neu laden und Bescheid geben.
      if (error instanceof ApiError && error.code === 'sessionChanged' && this.watching?.code === w.code) {
        this.status = 'saved';
        this.watching = { ...this.watching, updated: null };
        this.#editConflict?.();
        await this.#refreshWatch();
        return;
      }
      this.status = 'error';
      if (this.watching?.code === w.code) this.watching = { ...this.watching, error: error instanceof ApiError ? error.code : 'error' };
    }
  }

  /** Lehrperson: Lernende einer Klasse erkennen (Bildschirm blinkt) oder ihre Hilfe-Anfrage erledigen. */
  static async signal(admin: string, code: string, kind: 'identify' | 'help', seconds?: number): Promise<void> {
    await api('POST', `admin/sessions/${encodeURIComponent(code)}/${kind}`, kind === 'identify' && seconds ? { seconds } : {}, admin);
  }

  /** Lehrperson: simulierten Angriff auf das Netz dieser Session starten oder beenden (null). */
  static async launchAttack(admin: string, code: string, kind: AttackKind | null): Promise<void> {
    await api('POST', `admin/sessions/${encodeURIComponent(code)}/attack`, { kind }, admin);
  }

  /** Lehrperson: Stand von «Erkennen» (wartet, blinkt noch so lange, nicht erreicht). */
  static async identifyStatus(admin: string, code: string): Promise<IdentifyStatus> {
    return api<IdentifyStatus>('GET', `admin/sessions/${encodeURIComponent(code)}/identify`, undefined, admin);
  }

  async #refreshWatch() {
    const w = this.watching;
    if (!w) return;
    try {
      const path = w.admin ? `admin/sessions/${encodeURIComponent(w.code)}` : `sessions/${encodeURIComponent(w.code)}?watch=1`;
      const data = await api<{ project: unknown; updated?: number; connected?: boolean; classCode?: string | null; site?: { seat: number; label: string } | null; help?: number | null }>('GET', path, undefined, w.admin);
      if (!this.watching || this.watching.code !== w.code) return;
      const cur = this.watching;
      const changed = data.updated !== cur.updated;
      this.watching = { ...cur, updated: data.updated ?? null, connected: !!data.connected, error: undefined, classCode: data.classCode ?? null, site: data.site ?? null, help: data.help ?? null };
      // Beim Bearbeiten nur den ersten Stand laden: Danach ist die Lehrperson massgebend.
      if (!changed || (cur.edit && cur.updated !== null)) return;
      const parsed = parseProject(JSON.stringify(data.project));
      if (parsed.ok) this.#onWatch?.(parsed);
    } catch (error) {
      // Nur der eigenen Session den Fehler anhängen, nicht einer inzwischen geöffneten anderen.
      if (this.watching?.code === w.code) this.watching = { ...this.watching, error: error instanceof ApiError ? error.code : 'error' };
    }
  }

  /**
   * Ansehen beenden. Ohne Nummer (Knopf «Beenden») gilt auch ein noch laufendes Öffnen als
   * abgebrochen; watch() übergibt seine eigene Nummer.
   */
  async stopWatch(run = ++this.#watchRun) {
    clearInterval(this.#watchTimer);
    this.#watchTimer = undefined;
    const w = this.watching;
    if (w?.edit) {
      clearTimeout(this.#editTimer);
      await this.#flushEdit();
      await this.#beat(false);
    }
    // Nur aufräumen, wenn inzwischen nicht schon eine andere Session geöffnet wurde.
    if (run !== this.#watchRun && this.watching !== w) return;
    this.watching = null;
    this.#onWatch = null;
  }

  /** Klasse und Platz, die gerade angezeigt werden (beim Ansehen die der angesehenen Session). */
  get viewClass(): string | null {
    return this.watching ? (this.watching.classCode ?? null) : this.classCode;
  }
  get viewSite(): { seat: number; label: string } | null {
    return this.watching ? (this.watching.site ?? null) : this.site;
  }
  /** Verbund für die angezeigte Session abfragen (beim Ansehen entscheidet der Server, ob er freigegeben ist). */
  get viewVerbund(): boolean {
    return this.watching ? !!this.watching.classCode : !!this.classSettings?.verbund.enabled;
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
    this.help = false;
    this.identify = null;
    this.teacherEditing = false;
    this.status = 'idle';
    write(CODE_KEY, null);
    write(CLASS_KEY, null);
  }
}

export const session = new SessionStore();
