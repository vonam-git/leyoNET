// Erzeugt website/httpdocs/impressum.html und datenschutz.html aus den Vorlagen (*.vorlage.html).
// Die Ortsangabe (PLZ Ort) steht nie im Repository und wird nie ausgegeben. Sie kommt aus
//   1. der Umgebungsvariable LEYONET_ORT oder
//   2. der Datei ~/leyonet-privat/ort.txt (eine Zeile, z.B. «8000 Musterort»).
// Die erzeugten Dateien sind in .gitignore. Aufruf: node scripts/rechtstexte.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const dir = new URL('../website/httpdocs/', import.meta.url);
const file = join(homedir(), 'leyonet-privat', 'ort.txt');
const ort = (process.env.LEYONET_ORT ?? (existsSync(file) ? readFileSync(file, 'utf8') : '')).trim();

if (!/^\d{4,5} [\p{L} .'-]{2,60}$/u.test(ort)) {
  console.error(`Ortsangabe fehlt oder ist ungültig. LEYONET_ORT setzen oder ${file} anlegen (eine Zeile: «PLZ Ort»).`);
  process.exit(1);
}

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const PLATZHALTER = '<span class="platzhalter">[PLZ Ort]</span>';

for (const name of ['impressum', 'datenschutz']) {
  const vorlage = readFileSync(new URL(`${name}.vorlage.html`, dir), 'utf8');
  if (!vorlage.includes(PLATZHALTER)) {
    console.error(`${name}.vorlage.html: Platzhalter ${PLATZHALTER} fehlt.`);
    process.exit(1);
  }
  writeFileSync(new URL(`${name}.html`, dir), vorlage.replaceAll(PLATZHALTER, `<span>${escape(ort)}</span>`));
  console.log(`website/httpdocs/${name}.html erzeugt (nicht im Repository).`);
}
