import { hashCode, type TaskSet } from '../../core';

/**
 * Prüfungsmodus: Sobald eine Prüfungsdatei geöffnet ist, sperrt leyoNET
 * Katalog, Demos, Aufgabeneditor, Prüfungsgenerator, Auswertung, Funktionsumfang,
 * «Neu» und das Öffnen anderer Dateien. Der Modus bleibt über ein Neuladen
 * hinaus bestehen (Browser-Speicher) und endet nur mit dem Code der Lehrperson.
 *
 * Das ist eine Hürde für den Unterricht, kein Schutz gegen Absicht: Wer die
 * Browserdaten löscht oder eine andere Kopie von leyoNET nutzt, umgeht ihn.
 * Darum gehören Prüfungsrechner bzw. ein abgesicherter Browser dazu (docs/pruefungen.md).
 */
export interface ActiveExam {
  id: string;
  title: string;
  variant?: string;
  /** Prüfwert des Codes zum Beenden; fehlt = ohne Code beendbar. */
  unlock?: string;
  minutes?: number;
  /** Beginn (ms seit 1970). */
  started: number;
  /** Prüfung über den Server (Webversion): Platz-Code, Ende des Platzes, Zustand. */
  server?: { seatCode: string; until: number | null; offset: number; state: SeatStatus['state'] };
}

/** Zustand eines Prüfungsplatzes laut Server. */
export interface SeatStatus {
  state: 'waiting' | 'open' | 'closed';
  until: number | null;
  /** Server-Zeit, um die Uhr abzugleichen. */
  now: number;
  title: string;
  seat: string;
}

const KEY = 'netzwerk-simulator.exam';

/** Gesperrte Dialoge und Befehle während einer Prüfung. */
export const EXAM_BLOCKED_DIALOGS = new Set(['examJoin', 'catalog', 'demos', 'taskEditor', 'exam', 'examExport', 'review', 'features', 'admin', 'session']);
export const EXAM_BLOCKED_COMMANDS = new Set([
  'file.new',
  'file.demos',
  'file.session',
  'file.examJoin',
  'tool.catalog',
  'tool.taskEditor',
  'tool.exam',
  'tool.examExport',
  'tool.review',
  'tool.features',
  'tool.loadFeatures',
  'tool.admin',
]);

function load(): ActiveExam | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<ActiveExam>;
    return typeof v.id === 'string' && typeof v.title === 'string' && typeof v.started === 'number' ? (v as ActiveExam) : null;
  } catch {
    return null;
  }
}

class ExamMode {
  active = $state<ActiveExam | null>(load());
  /** Für die Zeitanzeige, einmal pro Sekunde erneuert. */
  now = $state(Date.now());

  constructor() {
    if (typeof window !== 'undefined') setInterval(() => (this.now = Date.now()), 1000);
  }

  #store(value: ActiveExam | null) {
    this.active = value;
    try {
      if (value) localStorage.setItem(KEY, JSON.stringify(value));
      else localStorage.removeItem(KEY);
    } catch {
      // Ohne Browser-Speicher gilt der Modus bis zum Neuladen.
    }
  }

  /** Prüfung beginnen bzw. fortsetzen (Datei mit gewählter Variante). */
  enter(tasks: TaskSet) {
    const exam = tasks.exam;
    if (!exam || exam.variants) return;
    if (this.active?.id === exam.id) return;
    this.#store({
      id: exam.id,
      title: tasks.title,
      ...(exam.variant ? { variant: exam.variant } : {}),
      ...(exam.unlock ? { unlock: exam.unlock } : {}),
      ...(exam.minutes ? { minutes: exam.minutes } : {}),
      started: Date.now(),
    });
  }

  /** Prüfung über den Server beginnen bzw. fortsetzen. */
  enterServer(tasks: TaskSet, seatCode: string, status: SeatStatus) {
    const exam = tasks.exam;
    if (!exam) return;
    this.#store({
      id: exam.id,
      title: tasks.title,
      variant: status.seat,
      ...(exam.unlock ? { unlock: exam.unlock } : {}),
      started: this.active?.id === exam.id ? this.active.started : Date.now(),
      server: { seatCode, until: status.until, offset: status.now - Date.now(), state: status.state },
    });
  }

  /** Neuer Stand vom Server: Verlängerung (Nachteilsausgleich), Ende. */
  updateServer(status: SeatStatus) {
    const a = this.active;
    if (!a?.server) return;
    this.#store({ ...a, server: { ...a.server, until: status.until, offset: status.now - Date.now(), state: status.state } });
  }

  /** Nach der Abgabe (Server meldet «abgegeben») ohne Code verlassen. */
  leaveClosed() {
    if (this.active?.server?.state === 'closed') this.#store(null);
  }

  /** Darf diese Datei während der Prüfung geöffnet werden? Nur dieselbe Prüfung. */
  allows(tasks: TaskSet | undefined): boolean {
    return !this.active || tasks?.exam?.id === this.active.id;
  }

  blocksDialog(name: string): boolean {
    return !!this.active && EXAM_BLOCKED_DIALOGS.has(name);
  }

  /** Mit dem Code der Lehrperson beenden; true = beendet. */
  async end(code: string): Promise<boolean> {
    const active = this.active;
    if (!active) return true;
    if (active.unlock && (await hashCode(code)) !== active.unlock) return false;
    this.#store(null);
    return true;
  }

  /** Verbleibende bzw. vergangene Zeit in Minuten:Sekunden. */
  get clock(): { text: string; over: boolean } {
    const a = this.active;
    if (!a) return { text: '', over: false };
    const elapsed = Math.max(0, Math.floor((this.now - a.started) / 1000));
    const serverLeft = a.server?.until ? Math.floor((a.server.until - (this.now + a.server.offset)) / 1000) : null;
    const left = serverLeft ?? (a.minutes ? a.minutes * 60 - elapsed : null);
    const s = Math.abs(left ?? elapsed);
    const text = `${left !== null && left < 0 ? '+' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    return { text, over: left !== null && left < 0 };
  }
}

export const examMode = new ExamMode();
