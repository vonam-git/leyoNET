import { describe, expect, it } from 'vitest';
import { emptyTopology, evaluateTasks } from '../core';
import { setLocale } from '../i18n';
import { CATALOG } from './catalog';
import { solveWatch1, solveWatch2 } from './catalogM117';
import { buildExamSolution, randomExam } from './exam';
import { noteValues, suggestGoals } from './suggest';
import { fromDraft } from './taskForm';

setLocale('de');

const watch = () => solveWatch2(solveWatch1(CATALOG.find((e) => e.id === 'm117-m07a')!.build().topology));

describe('Lernziele aus einem fertigen Netz', () => {
  it.each([
    ['Watch SA (UE02)', watch],
    ['Prüfungsnetz (gewürfelt)', () => buildExamSolution(randomExam(5))],
  ])('%s: Vorschläge sind gültig und das Netz erfüllt sie alle', (_name, build) => {
    const topology = build();
    const drafts = suggestGoals(topology);
    expect(drafts.length).toBeGreaterThan(10);
    const r = fromDraft({ title: 'Test', description: '', difficulty: '', grading: true, noSelfCheck: false, goals: drafts });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const failed = evaluateTasks(topology, r.tasks).filter((x) => !x.passed);
    expect(failed).toEqual([]);
    expect(new Set(r.tasks.goals.map((g) => g.section)).size).toBeGreaterThanOrEqual(4);
    expect(evaluateTasks(emptyTopology(), r.tasks).every((x) => !x.passed)).toBe(true);
  });

  it('Werte aus einer Notiz', () => {
    expect(noteValues("Netz 10.44.0.0 / 18\nMaske 255.255.192.0\nHosts 16'382\nDHCP 10.44.30.0 – 10.44.60.255")).toEqual([
      '10.44.0.0/18',
      '255.255.192.0',
      '10.44.30.0',
      '10.44.60.255',
      '16382',
    ]);
  });
});
