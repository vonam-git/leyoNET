// Auswertung von Abgaben: Lehrpersonen öffnen mehrere Projektdateien der
// Lernenden und prüfen sie gegen die Aufgabe.

import { parseProject, type ParseError } from '../io/project';
import { evaluateGoal, pointsOf, scoreOf, swissGrade, type GoalResult, type TaskSet } from './tasks';

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
    }
  | { ok: false; name: string; error: ParseError | { code: 'noTasks' | 'readFailed' } };

/**
 * Prüft eine Abgabe. Verwendet wird die Aufgabe der Lehrperson (`tasks`),
 * sonst die in der Datei mitgespeicherte.
 */
export function reviewSubmission(name: string, text: string, tasks: TaskSet | null): SubmissionReview {
  const parsed = parseProject(text);
  if (!parsed.ok) return { ok: false, name, error: parsed.error };
  const taskSet = tasks ?? parsed.tasks;
  if (!taskSet) return { ok: false, name, error: { code: 'noTasks' } };
  const marks: ReviewMark[] = taskSet.goals.map((goal) =>
    goal.check.type === 'packetSeen' ? { id: goal.id, passed: false, skipped: true } : evaluateGoal(parsed.topology, goal),
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
    ownTasks: !tasks,
  };
}

/** Tabelle für Excel (Semikolon als Trennzeichen, wie in der Schweiz üblich). */
export function reviewCsv(
  tasks: TaskSet,
  reviews: SubmissionReview[],
  labels: { file: string; score: string; error: string; points?: string; grade?: string },
): string {
  const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
  // Mit Punkten: je Ziel die erreichten Punkte, dazu Total und Note (Dezimalkomma für Excel in der Schweiz).
  const withPoints = tasks.grading || tasks.goals.some((g) => g.points !== undefined);
  const decimal = (n: number) => n.toFixed(1).replace('.', ',');
  const extra = withPoints ? [labels.points ?? 'Punkte', ...(tasks.grading ? [labels.grade ?? 'Note'] : [])] : [];
  const goalHeader = tasks.goals.map((g) => (withPoints ? `${g.text} (${pointsOf(g)})` : g.text));
  const header = [labels.file, labels.score, ...extra, ...goalHeader].map(quote).join(';');
  const lines = reviews.map((r) => {
    if (!r.ok) return [quote(r.name), quote(labels.error)].join(';');
    const marks = tasks.goals.map((g) => {
      const mark = r.marks.find((m) => m.id === g.id);
      if (mark?.skipped) return '–';
      if (withPoints) return mark?.passed ? String(pointsOf(g)) : '0';
      return mark?.passed ? '1' : '0';
    });
    const totals = withPoints ? [`${r.points}/${r.maxPoints}`, ...(tasks.grading ? [decimal(r.grade ?? swissGrade(r.points, r.maxPoints))] : [])] : [];
    return [quote(r.name), quote(`${r.passed}/${r.assessable}`), ...totals.map(quote), ...marks].join(';');
  });
  return [header, ...lines].join('\r\n') + '\r\n';
}
