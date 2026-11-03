// Prüfungsdateien erzeugen und speichern: Prüfungsdatei für die Lernenden
// (ohne Prüfbausteine) und Schlüssel für die Lehrperson. Gemeinsam für den
// Generator «Firmennetz mit drei Standorten» und «Als Prüfung speichern».

import {
  DEVICE_SPECS,
  addDevice,
  buildExam,
  emptyTopology,
  injectFaults,
  serializeExamKey,
  serializeProject,
  type ExamBuildVariant,
  type ExamKey,
  type FaultKind,
  type Goal,
  type TaskSet,
  type Topology,
} from '../core';
import { t } from '../i18n';
import { downloadText } from './persist/files';

export interface BuiltExam {
  learner: { topology: Topology; tasks: TaskSet };
  key: ExamKey;
  base: string;
}

/** Dateiname aus einem Titel: ASCII, ohne Sonderzeichen. */
export function fileBase(title: string): string {
  const ascii = title
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return ascii.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'Pruefung';
}

export async function prepareExam(input: { id: string; title: string; description?: string; minutes?: number; code: string; variants: ExamBuildVariant[] }): Promise<BuiltExam> {
  const built = await buildExam({ ...input, totalLabel: t('exam.rasterTotal') });
  return { ...built, base: fileBase(input.title) };
}

export function downloadLearnerFile(exam: BuiltExam) {
  downloadText(`${exam.base}.json`, serializeProject(exam.learner.topology, exam.learner.tasks));
}

export function downloadKeyFile(exam: BuiltExam) {
  downloadText(`${exam.base}_Schluessel.json`, serializeExamKey(exam.key));
}

/** Nur die Geräte (Typ, Name, Platz, Anzahl Anschlüsse), ohne Kabel, Adressen und Dienste. */
export function stripConfiguration(topology: Topology): Topology {
  let out = emptyTopology();
  for (const d of topology.devices) {
    const spec = DEVICE_SPECS[d.type];
    const ports = spec.maxInterfaces > spec.minInterfaces ? { ports: d.interfaces.length } : {};
    const r = addDevice(out, d.type, d.name, d.position, ports);
    if (r.ok) out = r.value.topology;
  }
  return out;
}

/**
 * Fehlersuche: je Platz ein eigenes Netz mit `count` zufälligen Fehlern. Zu den
 * Zielen der Aufgabe kommt je Fehler ein Ziel (2 Punkte, Teil «Fehler»).
 */
export function faultVariants(solution: Topology, tasks: TaskSet, options: { seats: number; count: number; seed: number; kinds?: readonly FaultKind[] }): ExamBuildVariant[] {
  return Array.from({ length: options.seats }, (_, i) => {
    const id = String(i + 1).padStart(2, '0');
    const { topology, faults } = injectFaults(solution, { seed: options.seed + i * 7919, count: options.count, ...(options.kinds ? { kinds: options.kinds } : {}) });
    const section = t('exam.export.faultSection');
    const faultGoals: Goal[] = faults.map((f, k) => ({ id: `fehler-${k + 1}`, text: t(`fault.goal.${f.kind}`, { device: f.device, ...f.params }), check: f.check, points: 2, section }));
    return {
      id,
      tasks: { ...tasks, title: `${tasks.title} – ${t('exam.mode.seat', { seat: id })}`, grading: true, goals: [...tasks.goals, ...faultGoals] },
      topology,
      prebuilt: true,
      notes: faults.map((f) => t(`fault.note.${f.kind}`, { device: f.device, ...f.params })),
    };
  });
}
