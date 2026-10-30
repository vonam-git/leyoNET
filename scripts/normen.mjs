// Normenverzeichnis (docs/normen.json): findet alle in Code, Texten und Doku
// zitierten Normen und prüft, ob sie im Verzeichnis stehen und ob die
// Prüfung der Nicht-RFC-Normen (IEEE, ITU-T, CableLabs) aktuell ist.
//
// Offline, läuft in npm run release (scripts/release-checks.mjs).
// Der Abgleich mit dem RFC-Index im Internet: scripts/normen-online.mjs.
// Direkt aufrufen: node scripts/normen.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

export function loadRegistry() {
  return JSON.parse(read('docs/normen.json'));
}

function files(dir, pattern) {
  const out = [];
  for (const name of readdirSync(join(root, dir))) {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) out.push(...files(path, pattern));
    else if (pattern.test(name)) out.push(path);
  }
  return out;
}

/** Alle Stellen, an denen eine Norm zitiert wird: Map Kennung → Dateien. */
export function scanReferences() {
  const sources = [...files('src', /\.(ts|svelte|json)$/), ...files('docs', /\.md$/), 'README.md'];
  const found = new Map();
  const note = (id, file) => {
    if (!found.has(id)) found.set(id, new Set());
    found.get(id).add(file);
  };
  for (const file of sources) {
    const text = read(file);
    for (const m of text.matchAll(/\bRFC ?(\d{3,5})\b/g)) note(`RFC ${Number(m[1])}`, file);
    for (const m of text.matchAll(/\b802\.(\d+)([A-Za-z]{0,3})\b/g)) note(`IEEE 802.${m[1]}${m[2]}`, file);
    for (const m of text.matchAll(/\bG\.(9\d\d(?:\.\d+)?)\b/g)) note(`ITU-T G.${m[1]}`, file);
    for (const m of text.matchAll(/\bDOCSIS (\d\.\d)\b/g)) note(`DOCSIS ${m[1]}`, file);
  }
  return found;
}

const monthsSince = (date, now) => (now - Date.parse(date)) / (30.44 * 24 * 3600 * 1000);

/** Ergebnis der Offline-Prüfung: fehlende Einträge und überfällige Prüfungen. */
export function checkRegistry(now = Date.now()) {
  const registry = loadRegistry();
  const known = new Set(Object.keys(registry.rfc).map((n) => `RFC ${n}`));
  for (const entry of registry.weitere) {
    known.add(entry.id);
    for (const alias of entry.auch ?? []) known.add(alias);
  }
  const references = scanReferences();
  const missing = [...references.keys()].filter((id) => !known.has(id)).map((id) => `${id} (${[...references.get(id)].join(', ')})`);
  const limit = registry.pruefintervallMonate ?? 12;
  const overdue = registry.weitere.filter((e) => !e.geprueft || monthsSince(e.geprueft, now) > limit).map((e) => `${e.id} (zuletzt ${e.geprueft ?? 'nie'})`);
  const unused = [...known].filter((id) => !references.has(id));
  return { registry, references, missing, overdue, unused, limit };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { references, missing, overdue, unused, limit } = checkRegistry();
  console.log(`${references.size} zitierte Normen gefunden.`);
  if (unused.length) console.log(`Im Verzeichnis, aber nicht mehr zitiert: ${unused.join(', ')}`);
  if (overdue.length) console.log(`Prüfung älter als ${limit} Monate: ${overdue.join(', ')}`);
  if (missing.length) {
    console.error(`Nicht in docs/normen.json eingetragen: ${missing.join('; ')}`);
    process.exit(1);
  }
}
