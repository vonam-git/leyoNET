import { describe, expect, it } from 'vitest';
import { parseInline, parseRich, sentences } from './richText';

describe('Auszeichnung für Aufgabentexte', () => {
  it('erkennt fett, Code und Adressen', () => {
    expect(parseInline('**Router** `ip route` 192.168.1.0/24 und 2001:db8::1/64.')).toEqual([
      { kind: 'bold', text: 'Router' },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'ip route' },
      { kind: 'text', text: ' ' },
      { kind: 'addr', text: '192.168.1.0/24' },
      { kind: 'text', text: ' und ' },
      { kind: 'addr', text: '2001:db8::1/64' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('macht aus Zeilen Absätze und Listen', () => {
    const blocks = parseRich('Einleitung\n\n**Liste**\n- eins\n- zwei\n1. erst\n2. dann');
    expect(blocks.map((b) => b.kind)).toEqual(['p', 'p', 'ul', 'ol']);
    expect(blocks[2]).toMatchObject({ items: [[{ text: 'eins' }], [{ text: 'zwei' }]] });
  });

  it('teilt lange Absätze in Sätze, nicht nach Abkürzungen oder Adressen', () => {
    expect(sentences('Das ist z.B. ein Satz. Router 10.0.0.1 antwortet. Fertig!')).toEqual(['Das ist z.B. ein Satz.', 'Router 10.0.0.1 antwortet.', 'Fertig!']);
    const long = 'A'.repeat(150) + '. ' + 'B'.repeat(150) + '.';
    expect(parseRich(long)).toHaveLength(2);
  });

  it('lässt HTML als Text stehen', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([{ kind: 'text', text: '<img src=x onerror=alert(1)>' }]);
  });
});
