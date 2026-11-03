// Prüfungen: Die Lernenden erhalten eine Prüfungsdatei ohne Prüfbausteine
// (nur Vorgabe, Startnetz, Punkteraster und allenfalls Fragen ohne Lösung).
// Die Lehrperson behält den Prüfungsschlüssel mit allen Prüfbausteinen und
// wertet damit die Abgaben aus. Mehrere Varianten (z.B. eine je Platz) stehen
// in einer einzigen Prüfungsdatei; beim Öffnen wählt man seinen Platz.
//
// Die Prüfungsdatei sperrt in leyoNET Katalog, Aufgabeneditor, Generator und
// Auswertung, bis die Lehrperson den Prüfungsmodus mit ihrem Code beendet.
// Gespeichert wird nur ein Prüfwert (SHA-256) des Codes, nicht der Code.

import { emptyTopology } from '../model/topology';
import type { Topology } from '../model/types';
import type { Goal, TaskSet } from './tasks';

export const EXAM_KEY_FORMAT = 'netzwerk-simulator-pruefungsschluessel';
export const EXAM_KEY_VERSION = 1;
export const MAX_EXAM_VARIANTS = 60;
export const MAX_EXAM_MINUTES = 600;

export interface RasterRow {
  label: string;
  points: number;
}

export interface ExamVariant {
  /** z.B. «07» (Platz 7). */
  id: string;
  title: string;
  description?: string;
  /** Nur Fragen (ohne Lösung). */
  goals?: Goal[];
  /** Startnetz dieser Variante (z.B. Fehlersuche); fehlt = Startnetz der Datei. */
  topology?: Topology;
  raster?: RasterRow[];
}

export interface ExamInfo {
  /** Zufällige Kennung; verbindet Prüfungsdatei, Abgaben und Schlüssel. */
  id: string;
  /** Gewählte Variante (Platz). */
  variant?: string;
  /** Varianten zur Auswahl; nach der Wahl entfernt. */
  variants?: ExamVariant[];
  /** SHA-256 (hex) des Codes, mit dem die Lehrperson den Prüfungsmodus beendet. */
  unlock?: string;
  /** Vorgesehene Dauer in Minuten (nur Anzeige). */
  minutes?: number;
  /** Punkte je Teil, ohne die Prüfbausteine zu verraten. */
  raster?: RasterRow[];
}

export interface ExamKeyVariant {
  id: string;
  /** Vollständige Aufgabe mit allen Prüfbausteinen. */
  tasks: TaskSet;
  /** Startnetz war vorgegeben (Fehlersuche): gleiche Positionen sind kein Hinweis auf Abschreiben. */
  prebuilt?: boolean;
  /** Hinweise für die Lehrperson, z.B. eingebaute Fehler. */
  notes?: string[];
}

export interface ExamKey {
  id: string;
  title: string;
  /** Code zum Beenden des Prüfungsmodus (nur im Schlüssel, im Klartext). */
  code: string;
  minutes?: number;
  variants: ExamKeyVariant[];
}

// --- Bauen ------------------------------------------------------------------------

/** Punkteraster aus den Teilen (`section`) der Ziele; ohne Teile eine Zeile mit dem Total. */
export function rasterOf(tasks: TaskSet, totalLabel: string): RasterRow[] {
  const rows = new Map<string, number>();
  for (const g of tasks.goals) rows.set(g.section ?? totalLabel, (rows.get(g.section ?? totalLabel) ?? 0) + (g.points ?? 1));
  return [...rows].map(([label, points]) => ({ label, points }));
}

/** Für die Prüfungsdatei: nur Fragen, ohne Lösungen. */
export function learnerGoals(tasks: TaskSet): Goal[] {
  return tasks.goals.flatMap((g) => {
    if (g.check.type !== 'answer') return [];
    const { accept: _accept, ...check } = g.check;
    const { hint: _hint, ...rest } = g;
    return [{ ...rest, check }];
  });
}

export interface ExamBuildVariant {
  id: string;
  tasks: TaskSet;
  topology: Topology;
  prebuilt?: boolean;
  notes?: string[];
}

export interface ExamBuildInput {
  id: string;
  title: string;
  /** Text vor der Platzwahl (bei mehreren Varianten). */
  description?: string;
  minutes?: number;
  code: string;
  totalLabel: string;
  variants: ExamBuildVariant[];
}

/** Prüfungsdatei (für die Lernenden) und Schlüssel (für die Lehrperson). */
export async function buildExam(input: ExamBuildInput): Promise<{ learner: { topology: Topology; tasks: TaskSet }; key: ExamKey }> {
  if (input.variants.length === 0 || input.variants.length > MAX_EXAM_VARIANTS) throw new Error('variants');
  const unlock = await hashCode(input.code);
  const minutes = input.minutes ? { minutes: input.minutes } : {};
  const key: ExamKey = {
    id: input.id,
    title: input.title,
    code: input.code,
    ...minutes,
    variants: input.variants.map((v) => ({
      id: v.id,
      tasks: { ...v.tasks, noSelfCheck: true, exam: { id: input.id, variant: v.id } },
      ...(v.prebuilt ? { prebuilt: true } : {}),
      ...(v.notes?.length ? { notes: v.notes } : {}),
    })),
  };
  const grading = input.variants.some((v) => v.tasks.grading) ? { grading: true } : {};
  if (input.variants.length === 1) {
    const v = input.variants[0]!;
    return {
      key,
      learner: {
        topology: v.topology,
        tasks: {
          title: v.tasks.title,
          ...(v.tasks.description ? { description: v.tasks.description } : {}),
          ...grading,
          noSelfCheck: true,
          goals: learnerGoals(v.tasks),
          exam: { id: input.id, variant: v.id, unlock, ...minutes, raster: rasterOf(v.tasks, input.totalLabel) },
        },
      },
    };
  }
  return {
    key,
    learner: {
      // Gemeinsames Startnetz in der Datei, eigene Startnetze in den Varianten.
      topology: emptyTopology(),
      tasks: {
        title: input.title,
        ...(input.description ? { description: input.description } : {}),
        ...grading,
        noSelfCheck: true,
        goals: [],
        exam: {
          id: input.id,
          unlock,
          ...minutes,
          variants: input.variants.map((v) => ({
            id: v.id,
            title: v.tasks.title,
            ...(v.tasks.description ? { description: v.tasks.description } : {}),
            ...(learnerGoals(v.tasks).length ? { goals: learnerGoals(v.tasks) } : {}),
            ...(v.topology.devices.length ? { topology: v.topology } : {}),
            raster: rasterOf(v.tasks, input.totalLabel),
          })),
        },
      },
    },
  };
}

/** Variante wählen (Platz): Aufgabe und Startnetz dieser Variante, die übrigen Varianten fallen weg. */
export function chooseVariant(tasks: TaskSet, variantId: string): { tasks: TaskSet; topology?: Topology } | null {
  const exam = tasks.exam;
  const v = exam?.variants?.find((x) => x.id === variantId);
  if (!exam || !v) return null;
  const { variants: _all, ...rest } = exam;
  return {
    tasks: {
      ...tasks,
      title: v.title,
      ...(v.description ? { description: v.description } : {}),
      goals: v.goals ?? [],
      exam: { ...rest, variant: v.id, ...(v.raster ? { raster: v.raster } : {}) },
    },
    ...(v.topology ? { topology: v.topology } : {}),
  };
}

/** Passende Variante im Schlüssel zu einer Abgabe (gleiche Prüfung, gleiche Variante). */
export function keyVariantFor(key: ExamKey, tasks: TaskSet | undefined): ExamKeyVariant | null {
  if (!tasks?.exam || tasks.exam.id !== key.id || !tasks.exam.variant) return null;
  return key.variants.find((v) => v.id === tasks.exam!.variant) ?? null;
}

// --- Code ---------------------------------------------------------------------------

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Web Crypto und TextEncoder (Browser und Node.js); der Kern kennt die DOM-Typen nicht. */
const platform = globalThis as unknown as {
  crypto: { getRandomValues(a: Uint8Array): Uint8Array; subtle: { digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer> } };
  TextEncoder: new () => { encode(text: string): Uint8Array };
};

/** Zufälliger Code ohne verwechselbare Zeichen, z.B. «K7Q2MX». */
export function randomCode(length = 6): string {
  const bytes = new Uint8Array(length);
  platform.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** Zufällige Kennung einer Prüfung. */
export function randomExamId(): string {
  return `P-${randomCode(8)}`;
}

/** Prüfwert des Codes (SHA-256, hex); Gross-/Kleinschreibung und Leerzeichen egal. */
export async function hashCode(code: string): Promise<string> {
  const data = new platform.TextEncoder().encode(`leyonet-pruefung:${code.replace(/\s+/g, '').toUpperCase()}`);
  const digest = await platform.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// --- Dateien ------------------------------------------------------------------------

export function serializeExamKey(key: ExamKey): string {
  return JSON.stringify({ meta: { format: EXAM_KEY_FORMAT, version: EXAM_KEY_VERSION }, key }, null, 2) + '\n';
}

export type ExamKeyResult = { ok: true; key: ExamKey } | { ok: false; error: 'invalidJson' | 'notAKey' | 'invalidStructure'; path?: string };

/** Liest einen Prüfungsschlüssel. `readTasks` kommt von aussen (vermeidet einen Ring zwischen den Modulen). */
export function parseExamKey(text: string, readTasks: (value: unknown, invalid: (path: string) => never) => TaskSet): ExamKeyResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalidJson' };
  }
  const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  if (!obj(data) || !obj(data.meta) || data.meta.format !== EXAM_KEY_FORMAT || !obj(data.key)) return { ok: false, error: 'notAKey' };
  class Bad extends Error {
    constructor(readonly path: string) {
      super(path);
    }
  }
  const invalid = (path: string): never => {
    throw new Bad(path);
  };
  try {
    const k = data.key;
    const str = (v: unknown, path: string) => (typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : invalid(path));
    const variants = Array.isArray(k.variants) && k.variants.length > 0 && k.variants.length <= MAX_EXAM_VARIANTS ? k.variants : invalid('key.variants');
    const minutes = k.minutes === undefined ? undefined : typeof k.minutes === 'number' && Number.isInteger(k.minutes) && k.minutes > 0 && k.minutes <= MAX_EXAM_MINUTES ? k.minutes : invalid('key.minutes');
    const key: ExamKey = {
      id: str(k.id, 'key.id'),
      title: str(k.title, 'key.title'),
      code: str(k.code, 'key.code'),
      ...(minutes ? { minutes } : {}),
      variants: variants.map((raw, i) => {
        const v = obj(raw) ? raw : invalid(`key.variants[${i}]`);
        const notes = v.notes === undefined ? undefined : Array.isArray(v.notes) ? v.notes.map((n, j) => str(n, `key.variants[${i}].notes[${j}]`)) : invalid(`key.variants[${i}].notes`);
        return {
          id: str(v.id, `key.variants[${i}].id`),
          tasks: readTasks(v.tasks, (path) => invalid(`key.variants[${i}].${path}`)),
          ...(v.prebuilt === true ? { prebuilt: true } : {}),
          ...(notes?.length ? { notes } : {}),
        };
      }),
    };
    return { ok: true, key };
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: 'invalidStructure', path: e.path };
    throw e;
  }
}

/** Liest `tasks.exam` einer Projektdatei (Aufruf aus readTasks). */
export function readExamInfo(
  value: unknown,
  invalid: (path: string) => never,
  readGoals: (list: unknown[], base: string) => Goal[],
  readTopology?: (raw: unknown, path: string) => Topology,
): ExamInfo {
  const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const e = obj(value) ? value : invalid('tasks.exam');
  const str = (v: unknown, path: string, max = 200) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : invalid(path));
  const raster = (v: unknown, path: string): RasterRow[] =>
    Array.isArray(v) && v.length <= 40
      ? v.map((r, i) =>
          obj(r) && typeof r.points === 'number' && r.points >= 0 && r.points <= 10_000 ? { label: str(r.label, `${path}[${i}].label`, 80), points: r.points } : invalid(`${path}[${i}]`),
        )
      : invalid(path);
  const minutes = e.minutes === undefined ? undefined : typeof e.minutes === 'number' && Number.isInteger(e.minutes) && e.minutes > 0 && e.minutes <= MAX_EXAM_MINUTES ? e.minutes : invalid('tasks.exam.minutes');
  const unlock = e.unlock === undefined ? undefined : typeof e.unlock === 'string' && /^[0-9a-f]{64}$/.test(e.unlock) ? e.unlock : invalid('tasks.exam.unlock');
  const variants =
    e.variants === undefined
      ? undefined
      : Array.isArray(e.variants) && e.variants.length > 0 && e.variants.length <= MAX_EXAM_VARIANTS
        ? e.variants.map((raw, i): ExamVariant => {
            const p = `tasks.exam.variants[${i}]`;
            const v = obj(raw) ? raw : invalid(p);
            return {
              id: str(v.id, `${p}.id`, 20),
              title: str(v.title, `${p}.title`),
              ...(v.description !== undefined ? { description: typeof v.description === 'string' ? v.description : invalid(`${p}.description`) } : {}),
              ...(v.goals !== undefined ? { goals: Array.isArray(v.goals) ? readGoals(v.goals, `${p}.goals`) : invalid(`${p}.goals`) } : {}),
              ...(v.topology !== undefined ? { topology: readTopology ? readTopology(v.topology, `${p}.topology`) : invalid(`${p}.topology`) } : {}),
              ...(v.raster !== undefined ? { raster: raster(v.raster, `${p}.raster`) } : {}),
            };
          })
        : invalid('tasks.exam.variants');
  if (variants && new Set(variants.map((v) => v.id)).size !== variants.length) invalid('tasks.exam.variants');
  return {
    id: str(e.id, 'tasks.exam.id', 40),
    ...(e.variant !== undefined ? { variant: str(e.variant, 'tasks.exam.variant', 20) } : {}),
    ...(variants ? { variants } : {}),
    ...(unlock ? { unlock } : {}),
    ...(minutes ? { minutes } : {}),
    ...(e.raster !== undefined ? { raster: raster(e.raster, 'tasks.exam.raster') } : {}),
  };
}
