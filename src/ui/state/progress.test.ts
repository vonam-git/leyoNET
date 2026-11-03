import { describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { CATALOG } from '../catalog';
import { catalogIdOf, progress } from './progress.svelte';

describe('Erledigte Katalog-Übungen', () => {
  it('jede Übung wird an ihrem Titel erkannt (Titel eindeutig, in beiden Sprachen)', () => {
    for (const lang of ['de', 'en'] as const) {
      setLocale(lang);
      const titles = CATALOG.map((e) => e.build().tasks.title);
      expect(new Set(titles).size).toBe(titles.length);
      for (const entry of CATALOG) expect(catalogIdOf(entry.build().tasks)).toBe(entry.id);
    }
    setLocale('de');
    expect(catalogIdOf({ title: 'Eigene Aufgabe', goals: [] })).toBeNull();
  });

  it('markieren und zurücksetzen', () => {
    progress.reset();
    expect(progress.mark('x')).toBe(true);
    expect(progress.mark('x')).toBe(false);
    expect(progress.done.x).toBeTypeOf('number');
    progress.reset();
    expect(progress.done).toEqual({});
  });
});
