// Gleicht die Normen aus docs/normen.json mit dem offiziellen RFC-Index ab
// (https://www.rfc-editor.org/rfc-index.xml): Ist ein RFC abgelöst («obsoleted
// by»), kam eine Aktualisierung dazu («updated by»), oder ist die Prüfung einer
// IEEE-/ITU-T-/CableLabs-Norm überfällig?
//
// Läuft wöchentlich in .github/workflows/normen.yml (braucht Internet, deshalb
// nicht Teil von npm run release). Schreibt einen Bericht nach normen-bericht.md
// und endet mit Code 1, wenn Handlungsbedarf besteht.
//
// Aufruf: node scripts/normen-online.mjs [--index <rfc-index.xml>] [--schreiben]
//   --schreiben  trägt die aktuellen «updated by»-Listen als Ausgangsstand
//                (aktualisiertDurch) in docs/normen.json ein. Danach meldet die
//                Prüfung nur noch neu hinzugekommene Aktualisierungen.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkRegistry, root } from './normen.mjs';

const INDEX_URL = 'https://www.rfc-editor.org/rfc-index.xml';

async function loadIndex() {
  const i = process.argv.indexOf('--index');
  if (i > 0) return readFileSync(process.argv[i + 1], 'utf8');
  const response = await fetch(INDEX_URL, { headers: { 'user-agent': 'leyoNET-Normenpruefung (github.com/vonam-git/leyoNET)' } });
  if (!response.ok) throw new Error(`RFC-Index nicht erreichbar: HTTP ${response.status}`);
  return response.text();
}

/** Liest aus dem RFC-Index Titel, Status, «obsoleted by» und «updated by» je RFC. */
export function parseIndex(xml) {
  const entries = new Map();
  for (const [, body] of xml.matchAll(/<rfc-entry>([\s\S]*?)<\/rfc-entry>/g)) {
    const id = body.match(/<doc-id>RFC0*(\d+)<\/doc-id>/)?.[1];
    if (!id) continue;
    const list = (tag) => {
      const block = body.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? '';
      return [...block.matchAll(/<doc-id>RFC0*(\d+)<\/doc-id>/g)].map((m) => m[1]);
    };
    entries.set(id, {
      title: body.match(/<title>([\s\S]*?)<\/title>/)?.[1].trim(),
      status: body.match(/<current-status>([\s\S]*?)<\/current-status>/)?.[1].trim(),
      obsoletedBy: list('obsoleted-by'),
      updatedBy: list('updated-by'),
    });
  }
  return entries;
}

export function compare(registry, index) {
  const obsolete = [];
  const updated = [];
  const unknown = [];
  for (const [number, entry] of Object.entries(registry.rfc)) {
    const info = index.get(number);
    if (!info) {
      unknown.push(number);
      continue;
    }
    const accepted = new Set(entry.abgeloestAkzeptiert ?? []);
    const replacements = info.obsoletedBy.filter((n) => !accepted.has(n));
    if (replacements.length) obsolete.push({ number, title: info.title, by: replacements });
    const known = new Set(entry.aktualisiertDurch ?? []);
    const fresh = info.updatedBy.filter((n) => !known.has(n));
    if (entry.aktualisiertDurch && fresh.length) updated.push({ number, title: info.title, by: fresh });
  }
  return { obsolete, updated, unknown };
}

const rfcLink = (n) => `[RFC ${n}](https://www.rfc-editor.org/info/rfc${n})`;

export function report({ obsolete, updated, unknown }, { missing, overdue, limit }) {
  const lines = ['# Normen-Prüfung', '', `Stand: ${new Date().toISOString().slice(0, 10)}`, ''];
  const section = (title, items) => {
    if (!items.length) return;
    lines.push(`## ${title}`, '', ...items.map((x) => `- ${x}`), '');
  };
  section('Abgelöste RFCs (Handlungsbedarf)', obsolete.map((o) => `${rfcLink(o.number)} (${o.title}) ist abgelöst durch ${o.by.map(rfcLink).join(', ')}. Code, Texte und docs/normen.json nachführen.`));
  section('Nicht im RFC-Index gefunden', unknown.map((n) => `RFC ${n}: Nummer in docs/normen.json prüfen.`));
  section('Nicht im Normenverzeichnis eingetragen', missing);
  section(`Prüfung älter als ${limit} Monate (IEEE, ITU-T, CableLabs)`, overdue.map((o) => `${o}: aktuelle Ausgabe prüfen, \`aktuell\` und \`geprueft\` in docs/normen.json nachführen.`));
  section('Neue Aktualisierungen (zur Information)', updated.map((u) => `${rfcLink(u.number)} wird zusätzlich aktualisiert durch ${u.by.map(rfcLink).join(', ')}.`));
  const action = obsolete.length + unknown.length + missing.length + overdue.length > 0;
  if (!action && !updated.length) lines.push('Alle Normen sind aktuell.', '');
  return { text: lines.join('\n'), action };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const local = checkRegistry();
  const index = parseIndex(await loadIndex());
  console.log(`RFC-Index: ${index.size} Einträge.`);
  if (process.argv.includes('--schreiben')) {
    for (const [number, entry] of Object.entries(local.registry.rfc)) {
      const info = index.get(number);
      if (info) entry.aktualisiertDurch = info.updatedBy;
    }
    writeFileSync(join(root, 'docs', 'normen.json'), JSON.stringify(local.registry, null, 2) + '\n');
    console.log('Ausgangsstand in docs/normen.json eingetragen.');
  }
  const result = report(compare(local.registry, index), local);
  writeFileSync(join(root, 'normen-bericht.md'), result.text);
  console.log(result.text);
  if (result.action) process.exit(1);
}
