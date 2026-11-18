/**
 * Prüfung direkt in der Admin-Konsole erstellen (Cockpit): Vorlagen «Aufbauen (M117)» und
 * «Fehlersuche». Ergebnis sind Prüfungsdatei (Lernende, ohne Prüfbausteine) und Schlüssel,
 * so wie sie der Prüfungsgenerator als Dateien speichert. Läuft im Browser der Lehrperson.
 */
import { FAULT_KINDS, emptyTopology, randomExamId, serializeExamKey, serializeProject, type ExamBuildVariant, type FaultKind } from '../core';
import { t } from '../i18n';
import { buildExamSolution, buildExamTasks, randomExam } from './exam';
import { faultVariants, prepareExam } from './examFiles';

export type CockpitTemplate = 'build' | 'faults';

/** Fehlerarten, die im Firmennetz der M117-Prüfung vorkommen (ohne VLAN und dynamisches Routing). */
export const COCKPIT_FAULT_KINDS: readonly FaultKind[] = FAULT_KINDS.filter((k) => !['accessVlan', 'trunkVlan', 'routing'].includes(k));

export interface CockpitInput {
  template: CockpitTemplate;
  title: string;
  seats: number;
  minutes: number;
  code: string;
  seed: number;
  /** Fehlersuche: Fehler pro Platz, erlaubte Arten, Ziele ohne Hinweis auf den Fehler. */
  count?: number;
  kinds?: readonly FaultKind[];
  hideHints?: boolean;
}

export type CockpitResult = { ok: true; learner: unknown; key: unknown; variants: ExamBuildVariant[] } | { ok: false; error: 'fewFaults'; found: number; wanted: number };

const seatId = (i: number) => String(i + 1).padStart(2, '0');

export function cockpitVariants(input: CockpitInput): { variants: ExamBuildVariant[]; description: string; short?: { found: number; wanted: number } } {
  if (input.template === 'build') {
    const variants = Array.from({ length: input.seats }, (_, i) => {
      const spec = randomExam((input.seed + i * 104_729) % 1e9, seatId(i));
      return { id: seatId(i), tasks: buildExamTasks(spec), topology: emptyTopology() };
    });
    return { variants, description: t('exam.chooseSeatText') };
  }
  // Ein fertiges Firmennetz, darin je Platz andere Fehler (Startwert pro Platz).
  const count = input.count ?? 5;
  const description = t('admin.build.faultsDescription', { n: count });
  const spec = randomExam(input.seed % 1e9, '1');
  const base = { title: input.title, description, goals: [], grading: true };
  let variants = faultVariants(buildExamSolution(spec), base, { seats: input.seats, count, seed: input.seed, kinds: input.kinds ?? COCKPIT_FAULT_KINDS });
  const short = variants.find((v) => (v.notes?.length ?? 0) < count);
  if (input.hideHints) {
    variants = variants.map((v) => ({ ...v, tasks: { ...v.tasks, goals: v.tasks.goals.map((g, k) => ({ ...g, text: t('fault.goal.generic', { n: k + 1, total: v.tasks.goals.length }) })) } }));
  }
  return { variants, description, ...(short ? { short: { found: short.notes?.length ?? 0, wanted: count } } : {}) };
}

/** Prüfungsdatei und Schlüssel als Objekte (wie die gespeicherten Dateien), bereit für den Server. */
export async function cockpitExam(input: CockpitInput): Promise<CockpitResult> {
  const { variants, description, short } = cockpitVariants(input);
  if (short) return { ok: false, error: 'fewFaults', ...short };
  const built = await prepareExam({ id: randomExamId(), title: input.title, description, minutes: input.minutes, code: input.code, variants });
  return { ok: true, learner: JSON.parse(serializeProject(built.learner.topology, built.learner.tasks)), key: JSON.parse(serializeExamKey(built.key)), variants };
}
