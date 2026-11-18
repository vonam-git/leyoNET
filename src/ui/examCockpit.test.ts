import { describe, expect, it } from 'vitest';
import { FAULT_GOAL_PREFIX, evaluateTasks, parseExamKey, parseProject, readTasks } from '../core';
import { setLocale } from '../i18n';
import { cockpitExam, cockpitVariants } from './examCockpit';

setLocale('de');

describe('Prüfung im Cockpit erstellen', () => {
  it('Fehlersuche: je Platz andere Fehler, ohne Hinweis im Ziel-Text', () => {
    const { variants, short } = cockpitVariants({ template: 'faults', title: 'FS', seats: 6, minutes: 30, code: 'ABCD12', seed: 4711, count: 5, hideHints: true });
    expect(short).toBeUndefined();
    expect(variants).toHaveLength(6);
    for (const v of variants) {
      expect(v.tasks.goals).toHaveLength(5);
      expect(v.tasks.goals.every((g) => g.id.startsWith(FAULT_GOAL_PREFIX) && /^Fehler \d von 5 behoben$/.test(g.text))).toBe(true);
      // Jeder Fehler ist im Startnetz wirklich offen.
      expect(evaluateTasks(v.topology, v.tasks).every((r) => !r.passed)).toBe(true);
    }
    expect(new Set(variants.map((v) => JSON.stringify(v.tasks.goals.map((g) => g.check)))).size).toBeGreaterThan(4);
  });

  it('Prüfungsdatei der Lernenden ohne Prüfbausteine und Fehlerliste; Schlüssel mit allem', async () => {
    const r = await cockpitExam({ template: 'faults', title: 'FS', seats: 3, minutes: 30, code: 'ABCD12', seed: 99, count: 4 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const learner = JSON.stringify(r.learner);
    expect(learner).not.toMatch(/"check"|"notes"|"solution"/);
    // Die Fehler («… statt …») stehen nur im Schlüssel.
    expect(learner).not.toContain(' statt ');
    expect(parseProject(learner).ok).toBe(true);
    const key = parseExamKey(JSON.stringify(r.key), readTasks);
    expect(key.ok).toBe(true);
    expect(JSON.stringify(r.key)).toContain(' statt ');
  });

  it('Aufbauen (M117): je Platz eine eigene Variante, leeres Startnetz', async () => {
    const r = await cockpitExam({ template: 'build', title: 'LB3', seats: 4, minutes: 80, code: 'ABCD12', seed: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.variants.map((v) => v.id)).toEqual(['01', '02', '03', '04']);
    expect(r.variants.every((v) => v.topology.devices.length === 0)).toBe(true);
    expect(JSON.stringify(r.learner)).not.toMatch(/"check"/);
  });
});
