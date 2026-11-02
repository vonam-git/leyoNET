import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHECK_TYPES, parseProject } from '../core';
import de from '../i18n/de.json';
import { setLocale } from '../i18n';
import { CHECK_FIELDS, emptyGoal, fromDraft, suggestedText, toDraft } from './taskForm';

// Node meldet «en-US» als Sprache; die erwarteten Texte sind deutsch.
setLocale('de');

const parsed = parseProject(readFileSync(join(__dirname, '../../docs/aufgaben/zwei-subnetze.json'), 'utf8'));
const tasks = parsed.ok ? parsed.tasks! : null;

describe('Aufgaben-Formular', () => {
  it('übersetzt eine Aufgabe verlustfrei hin und zurück', () => {
    const back = fromDraft(toDraft(tasks!));
    expect(back).toEqual({ ok: true, tasks });
  });

  it('ergänzt fehlende Lernziel-Texte und wandelt Zahlen und Gerätelisten', () => {
    const draft = { title: 'Test', description: '', difficulty: '', grading: false, noSelfCheck: false, goals: [] as ReturnType<typeof emptyGoal>[] };
    draft.goals.push({ ...emptyGoal(draft), fields: { from: 'PC 1', to: 'PC 2' } });
    draft.goals.push({ ...emptyGoal(draft, 'deviceCount'), fields: { min: '3' } });
    draft.goals.push({ ...emptyGoal(draft, 'sameNetwork'), fields: { devices: 'PC 1,  PC 2 ,' } });
    const result = fromDraft(draft);
    expect(result.ok && result.tasks.goals).toEqual([
      { id: 'ziel-1', text: 'PC 1 erreicht PC 2 per Ping.', check: { type: 'ping', from: 'PC 1', to: 'PC 2' } },
      { id: 'ziel-2', text: expect.any(String), check: { type: 'deviceCount', min: 3 } },
      { id: 'ziel-3', text: expect.any(String), check: { type: 'sameNetwork', devices: ['PC 1', 'PC 2'] } },
    ]);
  });

  it('meldet fehlende Pflichtfelder und falsche Zahlen', () => {
    const draft = { title: 'Test', description: '', difficulty: '', grading: false, noSelfCheck: false, goals: [] as ReturnType<typeof emptyGoal>[] };
    expect(fromDraft({ ...draft, title: ' ' })).toEqual({ ok: false, error: { field: 'title', code: 'required' } });
    expect(fromDraft(draft)).toMatchObject({ ok: false, error: { code: 'noGoals' } });
    draft.goals.push({ ...emptyGoal(draft), fields: { from: 'PC 1' } });
    expect(fromDraft(draft)).toEqual({ ok: false, error: { goal: 0, field: 'to', code: 'required' } });
    draft.goals[0] = { ...emptyGoal(draft, 'http'), fields: { from: 'PC 1', url: 'http://a/', status: 'ok' } };
    expect(fromDraft(draft)).toEqual({ ok: false, error: { goal: 0, field: 'status', code: 'notANumber' } });
  });

  it('hat für jeden Prüfbaustein Felder und Texte', () => {
    for (const type of CHECK_TYPES) {
      // Nur «kein Broadcast-Sturm» und «keine doppelten Adressen» kommen ohne Felder aus.
      if (type !== 'noStorm' && type !== 'noDuplicateIp') expect(CHECK_FIELDS[type].length).toBeGreaterThan(0);
      expect(de).toHaveProperty([`taskForm.type.${type}`]);
      expect(de).toHaveProperty([`taskForm.text.${type}`]);
      for (const spec of CHECK_FIELDS[type]) expect(de).toHaveProperty([`taskForm.field.${spec.label ?? spec.key}`]);
      expect(suggestedText({ id: 'x', text: '', hint: '', type, fields: {}, points: '' })).not.toMatch(/\{/);
    }
  });
});

describe('Aufgaben-Formular: Prüfung mit Punkten', () => {
  it('übernimmt Sterne, Note und Punkte hin und zurück', () => {
    const draft = { title: 'Prüfung', description: '', difficulty: '4', grading: true, noSelfCheck: true, goals: [] as ReturnType<typeof emptyGoal>[] };
    draft.goals.push({ ...emptyGoal(draft, 'address'), fields: { device: 'R_Bern', address: '1.2.3.1/24' }, points: '3' });
    draft.goals.push({ ...emptyGoal(draft, 'area'), fields: { title: 'Bern', color: 'green' } });
    const result = fromDraft(draft);
    expect(result.ok && result.tasks).toMatchObject({ difficulty: 4, grading: true, noSelfCheck: true, goals: [{ points: 3 }, { check: { type: 'area', color: 'green' } }] });
    if (result.ok) expect(fromDraft(toDraft(result.tasks))).toEqual(result);
    expect(fromDraft({ ...draft, goals: [{ ...draft.goals[0]!, points: 'x' }] })).toMatchObject({ ok: false, error: { field: 'points' } });
  });
});
