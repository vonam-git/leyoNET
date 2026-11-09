/**
 * Einfache Auszeichnung für Aufgabentexte, ohne HTML: Absätze (Leerzeile),
 * Listen («- » bzw. «1. »), **fett**, `Befehl` und automatisch hervorgehobene
 * IP-Adressen. Lange Absätze ohne Umbruch werden in Sätze geteilt, damit
 * grosse Aufträge lesbar bleiben. Das Ergebnis sind Bausteine, die Svelte als
 * Text ausgibt (nie {@html}), damit fremde Aufgabendateien kein HTML einschleusen.
 */

export type Inline = { kind: 'text' | 'bold' | 'code' | 'addr'; text: string };
export type Block = { kind: 'p'; parts: Inline[] } | { kind: 'ul' | 'ol'; items: Inline[][] };

/** Längere Absätze werden in Sätze geteilt. */
const SPLIT_FROM = 220;
/** Abkürzungen, nach denen kein Satz endet. */
const ABBREVIATIONS = /(?:z\.B|d\.h|u\.a|bzw|ca|Nr|usw|evtl|inkl|max|min|z\. B|e\.g|i\.e|etc|vs)\.$/i;

// IPv4 mit optionaler Präfixlänge, IPv6 mit mindestens zwei Doppelpunkten (z.B. 2001:db8::1/64), URLs.
const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s,;)»]+|\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b|\b[0-9a-f]{1,4}(?::[0-9a-f]{0,4}){2,7}(?:\/\d{1,3})?(?![\w:]))/gi;

export function parseInline(text: string): Inline[] {
  const parts: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const value = match[0];
    const at = match.index ?? 0;
    if (at > last) parts.push({ kind: 'text', text: text.slice(last, at) });
    if (value.startsWith('**')) parts.push({ kind: 'bold', text: value.slice(2, -2) });
    else if (value.startsWith('`')) parts.push({ kind: 'code', text: value.slice(1, -1) });
    else parts.push({ kind: value.startsWith('http') ? 'code' : 'addr', text: value });
    last = at + value.length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

/** Sätze trennen: Punkt, Ausrufe- oder Fragezeichen, dann Leerzeichen und Grossbuchstabe. */
export function sentences(text: string): string[] {
  const result: string[] = [];
  let start = 0;
  for (const match of text.matchAll(/[.!?](?=\s+[A-ZÄÖÜ«(])/g)) {
    const end = (match.index ?? 0) + 1;
    const piece = text.slice(start, end);
    if (ABBREVIATIONS.test(piece.trimEnd()) || /\d\.$/.test(piece) && /\d/.test(text[end + 1] ?? '')) continue;
    result.push(piece.trim());
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest) result.push(rest);
  return result;
}

export function parseRich(text: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of text.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());
    if (!lines.length) continue;
    let list: Extract<Block, { kind: 'ul' | 'ol' }> | null = null;
    let paragraph: string[] = [];
    const flush = () => {
      if (!paragraph.length) return;
      const joined = paragraph.join(' ');
      const pieces = joined.length > SPLIT_FROM && paragraph.length === 1 ? sentences(joined) : [joined];
      for (const piece of pieces) blocks.push({ kind: 'p', parts: parseInline(piece) });
      paragraph = [];
    };
    for (const line of lines) {
      const bullet = /^\s*[-•]\s+(.*)$/.exec(line);
      const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
      const item = bullet?.[1] ?? numbered?.[1];
      if (item !== undefined) {
        flush();
        const kind = bullet ? 'ul' : 'ol';
        if (!list || list.kind !== kind) {
          list = { kind, items: [] };
          blocks.push(list);
        }
        list.items.push(parseInline(item));
      } else {
        list = null;
        paragraph.push(line.trim());
      }
    }
    flush();
  }
  return blocks;
}
