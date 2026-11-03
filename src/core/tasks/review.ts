// Auswertung von Abgaben: Lehrpersonen öffnen mehrere Projektdateien der
// Lernenden und prüfen sie gegen die Aufgabe bzw. den Prüfungsschlüssel.
// Dazu kommen Nachkorrektur (Punkte und Bemerkungen je Ziel) und ein Hinweis
// auf auffällig ähnliche Abgaben.

import { parseProject, type ParseError } from '../io/project';
import type { Topology } from '../model/types';
import { keyVariantFor, type ExamKey } from './exam';
import { earnedPoints, evaluateGoal, pointsOf, scoreOf, swissGrade, type GoalResult, type TaskSet } from './tasks';

/** Ergebnis je Ziel; "skipped": aus einer Datei nicht prüfbar (z.B. selbst ausgelöste Pakete). */
export type ReviewMark = (GoalResult & { skipped?: false }) | { id: string; passed: false; skipped: true };

export type SubmissionReview =
  | {
      ok: true;
      name: string;
      tasks: TaskSet;
      marks: ReviewMark[];
      passed: number;
      assessable: number;
      ownTasks: boolean;
      /** Erreichte und mögliche Punkte (ohne nicht prüfbare Ziele). */
      points: number;
      maxPoints: number;
      /** Note 1–6, nur bei Prüfungen mit Note. */
      grade?: number;
      /** Variante (Platz) bei Prüfungen. */
      variant?: string;
      /** Startnetz war vorgegeben (Fehlersuche): kein Ähnlichkeitsvergleich. */
      prebuilt?: boolean;
      topology: Topology;
    }
  | { ok: false; name: string; error: ParseError | { code: 'noTasks' | 'readFailed' | 'otherExam' | 'noVariant' } };

/** Nachkorrektur einer Abgabe: eigene Punkte und Bemerkungen je Ziel, Gesamtbemerkung. */
export interface Correction {
  points?: Record<string, number>;
  notes?: Record<string, string>;
  comment?: string;
}
export type Corrections = Record<string, Correction>;

export const CORRECTIONS_FORMAT = 'netzwerk-simulator-korrektur';

/**
 * Prüft eine Abgabe. Mit Schlüssel: die Variante der Abgabe aus dem Schlüssel.
 * Sonst die Aufgabe der Lehrperson (`tasks`), sonst die in der Datei mitgespeicherte.
 */
export function reviewSubmission(name: string, text: string, tasks: TaskSet | null, key: ExamKey | null = null): SubmissionReview {
  const parsed = parseProject(text);
  if (!parsed.ok) return { ok: false, name, error: parsed.error };
  let taskSet = tasks ?? parsed.tasks;
  let variant: string | undefined;
  let prebuilt = false;
  if (key) {
    if (parsed.tasks?.exam?.id !== key.id) return { ok: false, name, error: { code: 'otherExam' } };
    const v = keyVariantFor(key, parsed.tasks);
    if (!v) return { ok: false, name, error: { code: 'noVariant' } };
    taskSet = v.tasks;
    variant = v.id;
    prebuilt = !!v.prebuilt;
  }
  if (!taskSet) return { ok: false, name, error: { code: 'noTasks' } };
  // Antworten auf Fragen stehen in der Abgabe, die Lösungen im Schlüssel.
  const answers = parsed.tasks?.answers ?? {};
  const marks: ReviewMark[] = taskSet.goals.map((goal) =>
    goal.check.type === 'packetSeen' ? { id: goal.id, passed: false, skipped: true } : evaluateGoal(parsed.topology, goal, [], answers),
  );
  const assessable = marks.filter((m) => !m.skipped);
  const score = scoreOf(taskSet, marks);
  return {
    ok: true,
    points: score.points,
    maxPoints: score.max,
    ...(taskSet.grading ? { grade: swissGrade(score.points, score.max) } : {}),
    name,
    tasks: taskSet,
    marks,
    passed: assessable.filter((m) => m.passed).length,
    assessable: assessable.length,
    ownTasks: !tasks && !key,
    ...(variant ? { variant } : {}),
    ...(prebuilt ? { prebuilt: true } : {}),
    topology: parsed.topology,
  };
}

/** Punkte einer Abgabe mit Nachkorrektur. */
export function correctedScore(review: Extract<SubmissionReview, { ok: true }>, correction?: Correction): { points: number; max: number; grade?: number } {
  const score = scoreOf(review.tasks, review.marks, correction?.points ?? {});
  return { ...score, ...(review.tasks.grading ? { grade: swissGrade(score.points, score.max) } : {}) };
}

/** Punkte eines Ziels in einer Abgabe (Nachkorrektur vor Automatik); null = nicht prüfbar. */
export function goalPoints(review: Extract<SubmissionReview, { ok: true }>, goalId: string, correction?: Correction): number | null {
  const goal = review.tasks.goals.find((g) => g.id === goalId);
  const mark = review.marks.find((m) => m.id === goalId);
  if (!goal || !mark || mark.skipped) return null;
  const own = correction?.points?.[goalId];
  return own !== undefined ? Math.min(Math.max(own, 0), pointsOf(goal)) : earnedPoints(goal, mark);
}

/**
 * Ähnlichkeit zweier Abgaben (0–1): Anteil Geräte gleichen Typs an genau
 * derselben Stelle. Wer selbst aufbaut, setzt Geräte kaum je auf dieselben
 * Punkte; gleiche Positionen deuten auf eine kopierte Datei.
 */
export function similarity(a: Topology, b: Topology): number {
  if (a.devices.length < 3 || b.devices.length < 3) return 0;
  const key = (d: Topology['devices'][number]) => `${d.type}|${Math.round(d.position.x)}|${Math.round(d.position.y)}`;
  const seen = new Map<string, number>();
  for (const d of a.devices) seen.set(key(d), (seen.get(key(d)) ?? 0) + 1);
  let same = 0;
  for (const d of b.devices) {
    const n = seen.get(key(d)) ?? 0;
    if (n > 0) {
      same++;
      seen.set(key(d), n - 1);
    }
  }
  return same / Math.max(a.devices.length, b.devices.length);
}

/** Auffällig ähnliche Paare (ab `threshold`), ohne vorgegebene Startnetze. */
export function similarPairs(reviews: readonly SubmissionReview[], threshold = 0.8): { a: string; b: string; score: number }[] {
  const ok = reviews.filter((r): r is Extract<SubmissionReview, { ok: true }> => r.ok && !r.prebuilt);
  const out: { a: string; b: string; score: number }[] = [];
  for (let i = 0; i < ok.length; i++) {
    for (let j = i + 1; j < ok.length; j++) {
      const score = similarity(ok[i]!.topology, ok[j]!.topology);
      if (score >= threshold) out.push({ a: ok[i]!.name, b: ok[j]!.name, score });
    }
  }
  return out;
}

/** Tabelle für Excel (Semikolon als Trennzeichen, wie in der Schweiz üblich). */
export function reviewCsv(
  tasks: TaskSet,
  reviews: SubmissionReview[],
  labels: { file: string; score: string; error: string; points?: string; grade?: string; variant?: string; comment?: string },
  corrections: Corrections = {},
): string {
  // Zellen, die mit = + - @ beginnen, würde Excel als Formel ausführen (CSV-Injektion): mit ' entschärfen.
  const quote = (s: string) => `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  // Mit Punkten: je Ziel die erreichten Punkte, dazu Total und Note (Dezimalkomma für Excel in der Schweiz).
  const withPoints = tasks.grading || tasks.goals.some((g) => g.points !== undefined);
  const decimal = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
  const variants = reviews.some((r) => r.ok && r.variant);
  const extra = [
    ...(variants ? [labels.variant ?? 'Variante'] : []),
    ...(withPoints ? [labels.points ?? 'Punkte', ...(tasks.grading ? [labels.grade ?? 'Note'] : [])] : []),
  ];
  const goalHeader = tasks.goals.map((g) => (withPoints ? `${g.text} (${pointsOf(g)})` : g.text));
  const header = [labels.file, labels.score, ...extra, ...goalHeader, labels.comment ?? 'Bemerkung'].map(quote).join(';');
  const lines = reviews.map((r) => {
    if (!r.ok) return [quote(r.name), quote(labels.error)].join(';');
    const c = corrections[r.name];
    const marks = tasks.goals.map((g) => {
      const p = goalPoints(r, g.id, c);
      if (p === null) return r.marks.some((m) => m.id === g.id) ? '–' : '';
      if (withPoints) return decimal(p);
      return p >= pointsOf(g) ? '1' : '0';
    });
    const score = correctedScore(r, c);
    const totals = [...(variants ? [r.variant ?? ''] : []), ...(withPoints ? [`${decimal(score.points)}/${score.max}`, ...(tasks.grading ? [decimal(score.grade ?? 1)] : [])] : [])];
    return [quote(r.name), quote(`${r.passed}/${r.assessable}`), ...totals.map(quote), ...marks, quote(c?.comment ?? '')].join(';');
  });
  return [header, ...lines].join('\r\n') + '\r\n';
}

export function serializeCorrections(examId: string | undefined, corrections: Corrections): string {
  return JSON.stringify({ meta: { format: CORRECTIONS_FORMAT, version: 1 }, ...(examId ? { examId } : {}), corrections }, null, 2) + '\n';
}

/** Liest eine Korrekturdatei; nur Zahlen und Texte werden übernommen. */
export function parseCorrections(text: string): Corrections | null {
  try {
    const data = JSON.parse(text) as { meta?: { format?: string }; corrections?: Record<string, Correction> };
    if (data.meta?.format !== CORRECTIONS_FORMAT || typeof data.corrections !== 'object' || !data.corrections) return null;
    const out: Corrections = {};
    for (const [file, c] of Object.entries(data.corrections)) {
      const points = Object.fromEntries(Object.entries(c.points ?? {}).filter(([, v]) => typeof v === 'number' && v >= 0 && v <= 1000));
      const notes = Object.fromEntries(Object.entries(c.notes ?? {}).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, (v as string).slice(0, 2000)]));
      out[file] = { ...(Object.keys(points).length ? { points } : {}), ...(Object.keys(notes).length ? { notes } : {}), ...(typeof c.comment === 'string' ? { comment: c.comment.slice(0, 4000) } : {}) };
    }
    return out;
  } catch {
    return null;
  }
}

/** Abgaben einer Server-Prüfung als eine Datei (Webversion → Download für die Lehrperson). */
export const BUNDLE_FORMAT = 'netzwerk-simulator-abgaben';

export interface SubmissionBundle {
  title: string;
  label?: string;
  /** Prüfungsschlüssel als Text (Datei der Lehrperson), falls hinterlegt. */
  key: string | null;
  submissions: { seat: string; updated: number; project: unknown }[];
}

export function serializeBundle(bundle: SubmissionBundle): string {
  const { key, ...rest } = bundle;
  return JSON.stringify({ meta: { format: BUNDLE_FORMAT, version: 1 }, ...rest, key: key ? JSON.parse(key) : null }, null, 1) + '\n';
}

/** Liest eine Abgabe-Sammlung; liefert je Platz eine «Datei» (Name = Präfix + Platz). */
export function parseBundle(text: string, prefix: string): { title: string; key: string | null; files: { name: string; text: string }[] } | null {
  try {
    const data = JSON.parse(text) as { meta?: { format?: string }; title?: unknown; key?: unknown; submissions?: unknown };
    if (data.meta?.format !== BUNDLE_FORMAT || !Array.isArray(data.submissions)) return null;
    const files = (data.submissions as { seat?: unknown; project?: unknown }[])
      .filter((s) => typeof s.seat === 'string' && s.project && typeof s.project === 'object')
      .map((s) => ({ name: `${prefix} ${s.seat as string}`, text: JSON.stringify(s.project) }));
    return { title: typeof data.title === 'string' ? data.title : '', key: data.key && typeof data.key === 'object' ? JSON.stringify(data.key) : null, files };
  } catch {
    return null;
  }
}

/**
 * Namensliste der Lehrperson (nur im Browser): Zeilen wie «07 Anna Muster»,
 * «07; Anna Muster» oder «Platz 07: Anna Muster». Schlüssel = Platz.
 */
export function parseNameList(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:\p{L}+\s+)?([A-Za-z0-9-]{1,12})\s*[:;,=\t ]\s*(.+?)\s*$/u.exec(line);
    if (m) out.set(m[1]!.toUpperCase(), m[2]!);
  }
  return out;
}
