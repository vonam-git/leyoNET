import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProject } from '../io/project';
import { serializeProject } from '../io/project';
import { buildExam, parseExamKey, serializeExamKey } from './exam';
import { readTasks } from './tasks';
import { correctedScore, parseCorrections, reviewCsv, reviewSubmission, serializeCorrections, similarPairs } from './review';

const file = (name: string) => readFileSync(join(__dirname, '../../../docs/aufgaben', name), 'utf8');
const start = file('zwei-subnetze.json');
const solution = file('zwei-subnetze-loesung.json');
const parsed = parseProject(start);
const tasks = parsed.ok ? parsed.tasks! : null;

describe('Abgaben auswerten', () => {
  it('prüft Abgaben gegen die Aufgabe und überspringt selbst ausgelöste Ziele', () => {
    const good = reviewSubmission('anna.json', solution, tasks);
    const empty = reviewSubmission('ben.json', start, tasks);
    expect(good).toMatchObject({ ok: true, passed: 8, assessable: 8 });
    expect(empty).toMatchObject({ ok: true, passed: 0, assessable: 8 });
    expect(good.ok && good.marks.at(-1)).toEqual({ id: 'selbst-gepingt', passed: false, skipped: true });
  });

  it('nimmt ohne geladene Aufgabe die aus der Datei', () => {
    expect(reviewSubmission('anna.json', solution, null)).toMatchObject({ ok: true, ownTasks: true, passed: 8 });
  });

  it('meldet kaputte Dateien und solche ohne Aufgabe', () => {
    expect(reviewSubmission('x.json', '{kaputt', tasks)).toMatchObject({ ok: false, error: { code: 'invalidJson' } });
    const plain = readFileSync(join(__dirname, '../../../docs/beispiele/zwei-subnetze.json'), 'utf8');
    expect(reviewSubmission('y.json', plain, null)).toMatchObject({ ok: false, error: { code: 'noTasks' } });
  });

  it('erzeugt eine CSV-Tabelle für Excel', () => {
    const reviews = [reviewSubmission('anna.json', solution, tasks), reviewSubmission('x.json', '{', tasks)];
    const csv = reviewCsv(tasks!, reviews, { file: 'Datei', score: 'Punkte', error: 'Fehler' });
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toMatch(/^"Datei";"Punkte";"PC 1 ist mit Router 1 verkabelt\."/);
    expect(lines[1]).toBe('"anna.json";"8/8";1;1;1;1;1;1;1;1;–;""');
    expect(lines[2]).toBe('"x.json";"Fehler"');
  });

  it('Prüfung: wertet mit dem Schlüssel aus, erkennt fremde Prüfungen, Nachkorrektur und Ähnlichkeit', async () => {
    const solved = parseProject(solution);
    if (!solved.ok || !tasks) throw new Error('Testdaten');
    const goals = [...tasks.goals.filter((g) => g.check.type !== 'packetSeen'), { id: 'lp', text: 'Darstellung', check: { type: 'manual' as const }, points: 2 }];
    const exam = await buildExam({ id: 'P-R', title: 'Test', code: 'CODE42', totalLabel: 'Total', variants: [{ id: '1', tasks: { ...tasks, grading: true, goals }, topology: parsed.ok ? parsed.topology : solved.topology }] });
    const key = parseExamKey(serializeExamKey(exam.key), readTasks);
    if (!key.ok) throw new Error('Schlüssel');
    // Abgabe: die Lösung, gespeichert mit der Aufgabe aus der Prüfungsdatei.
    const submission = serializeProject(solved.topology, exam.learner.tasks);
    const r = reviewSubmission('anna.json', submission, null, key.key);
    expect(r).toMatchObject({ ok: true, variant: '1', passed: 8, points: 8, maxPoints: 10 });
    if (!r.ok) return;
    expect(correctedScore(r, { points: { lp: 2 } })).toEqual({ points: 10, max: 10, grade: 6 });
    expect(reviewSubmission('x.json', solution, null, key.key)).toMatchObject({ ok: false, error: { code: 'otherExam' } });
    // Zwei identische Abgaben fallen auf, eine selbst gebaute nicht.
    const copy = reviewSubmission('ben.json', submission, null, key.key);
    expect(similarPairs([r, copy])).toEqual([{ a: 'anna.json', b: 'ben.json', score: 1 }]);
    const moved = JSON.parse(submission);
    for (const d of moved.topology.devices) d.position.x += 37;
    expect(similarPairs([r, reviewSubmission('cem.json', JSON.stringify(moved), null, key.key)])).toEqual([]);
    // Korrekturdatei hin und zurück.
    const corrections = { 'anna.json': { points: { lp: 2 }, notes: { lp: 'sauber' }, comment: 'Gut gemacht' } };
    expect(parseCorrections(serializeCorrections('P-R', corrections))).toEqual(corrections);
  });
});
