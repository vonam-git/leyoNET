import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { CATALOG } from './catalog';
import { OUT_DIR, buildSheet } from '../../scripts/arbeitsblaetter/erzeugen.mjs';
import { SHEETS } from '../../scripts/arbeitsblaetter/inhalt.mjs';

setLocale('de');

interface Section {
  catalog?: string;
  stars?: number;
  blocks?: { check?: number | { points: number } }[];
}
interface Sheet {
  file: string;
  entries: string[];
  sections: Section[];
}
const sheets = SHEETS as Sheet[];

describe('Arbeitsblätter (PDF) zu den Katalog-Übungen', () => {
  it('jede Übung mit Arbeitsblatt hat ein Blatt, jedes Blatt passt zu seinen Übungen', () => {
    const withSheet = CATALOG.filter((e) => e.sheet);
    expect(withSheet.length).toBeGreaterThan(0);
    for (const entry of withSheet) {
      const sheet = sheets.find((s) => s.file === entry.sheet);
      expect(sheet?.entries, entry.id).toContain(entry.id);
    }
    for (const sheet of sheets) {
      const sections = sheet.sections.filter((s) => s.catalog);
      expect(sections.length).toBe(sheet.entries.length);
      sheet.entries.forEach((id, i) => {
        const entry = CATALOG.find((e) => e.id === id)!;
        expect(entry.sheet).toBe(sheet.file);
        const { tasks } = entry.build();
        const section = sections[i]!;
        // Titel im Blatt = Titel im Katalog, Sterne und Anzahl Lernziele bzw. Punkte stimmen.
        expect(section.catalog).toBe(tasks.title);
        expect(section.stars).toBe(entry.stars);
        const check = section.blocks?.find((b) => b.check !== undefined)?.check;
        const expected = typeof check === 'object' ? tasks.goals.reduce((s, g) => s + (g.points ?? 1), 0) : tasks.goals.length;
        expect(typeof check === 'object' ? check.points : check).toBe(expected);
      });
    }
  });

  it.each(sheets.map((s) => s.file))('%s: eingechecktes PDF passt zum Inhalt (npm run arbeitsblaetter), Musterlösung lässt sich erzeugen', async (file) => {
    const sheet = sheets.find((s) => s.file === file)!;
    const onDisk = readFileSync(join(OUT_DIR, `${file}.pdf`));
    expect(Buffer.from(await buildSheet(sheet)).equals(onDisk)).toBe(true);
    // Die Musterlösung liegt bewusst nicht im öffentlichen Repo.
    expect((await buildSheet(sheet, { solution: true })).length).toBeGreaterThan(10_000);
  });
});
