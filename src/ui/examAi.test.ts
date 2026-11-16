import { describe, expect, it } from 'vitest';
import { CHECK_TYPES, extractJson, fromAiExchange, toAiExchange } from '../core';
import { buildAiPrompt } from './examAi';
import { CATALOG } from './catalog';

describe('Anleitung für eine KI', () => {
  it('enthält alle Prüfbausteine, Regeln und ein importierbares Beispiel (de und en)', () => {
    for (const lang of ['de', 'en'] as const) {
      const prompt = buildAiPrompt(lang, null, '');
      for (const type of CHECK_TYPES) expect(prompt).toContain(`\`${type}\``);
      expect(prompt).toContain('RFC 1918');
      expect(prompt).toContain('.example');
      // Das eingebaute Beispiel muss selbst gültig sein, sonst lernt die KI Falsches.
      const r = fromAiExchange(extractJson(prompt.slice(prompt.lastIndexOf('```json')))!);
      expect(r.ok ? 'ok' : JSON.stringify(r)).toBe('ok');
    }
  });

  it('nimmt den Wunsch und die offene Aufgabe als Beispiel', () => {
    const entry = CATALOG.map((e) => e.build()).find((e) => e.tasks.goals.length > 2)!;
    const exchange = toAiExchange(entry.topology, entry.tasks);
    const prompt = buildAiPrompt('de', exchange, 'Prüfung M117 mit VLANs');
    expect(prompt).toContain('Prüfung M117 mit VLANs');
    expect(prompt).toContain(JSON.stringify(entry.tasks.title));
  });

  it('Übungen aus dem Katalog lassen sich exportieren und wieder importieren', () => {
    let count = 0;
    for (const e of CATALOG) {
      const entry = { id: e.id, ...e.build() };
      const r = fromAiExchange(JSON.stringify(toAiExchange(entry.topology, entry.tasks)));
      if (r.ok) count++;
      else if (r.error?.code !== 'mediumNotSupported') throw new Error(`${entry.id}: ${r.path} ${JSON.stringify(r.error)}`);
    }
    expect(count).toBeGreaterThan(CATALOG.length / 2);
  });
});
