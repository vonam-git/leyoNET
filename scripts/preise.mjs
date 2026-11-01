// Preisverzeichnis (docs/preise.json): Wann wurden die Richtpreise zuletzt
// von Hand mit dem Markt verglichen? Ob jeder Preis im plausiblen Bereich
// liegt, prüft src/core/model/prices.test.ts bei jedem npm test.
//
// Offline, läuft in npm run release (Hinweis) und in der wöchentlichen Prüfung.
// Direkt aufrufen: node scripts/preise.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function checkPrices(now = Date.now()) {
  const registry = JSON.parse(readFileSync(join(root, 'docs', 'preise.json'), 'utf8'));
  const limit = registry.pruefintervallMonate ?? 6;
  const months = (now - Date.parse(registry.geprueft)) / (30.44 * 24 * 3600 * 1000);
  return { registry, limit, geprueft: registry.geprueft, count: Object.keys(registry.preise).length, overdue: !(months <= limit) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { count, geprueft, limit, overdue } = checkPrices();
  console.log(`${count} Richtpreise, zuletzt geprüft am ${geprueft} (Intervall ${limit} Monate).`);
  if (overdue) {
    console.error('Prüfung der Richtpreise ist fällig: docs/preise.json mit aktuellen Marktpreisen vergleichen und «geprueft» nachführen.');
    process.exit(1);
  }
}
