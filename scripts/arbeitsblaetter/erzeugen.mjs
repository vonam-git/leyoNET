// Erzeugt die ausfüllbaren Arbeitsblätter (PDF mit Formularfeldern) zu den
// Übungen im Aufgaben-Katalog. Inhalt: inhalt.mjs. Je Blatt entstehen zwei
// Dateien in docs/arbeitsblaetter/: <Name>.pdf für die Lernenden und
// <Name>_mL.pdf mit Musterlösung für die Lehrperson.
//
// Aufruf: npm run arbeitsblaetter
// Die Ausgabe ist reproduzierbar (feste Datumsangaben); ein Test prüft, dass
// die eingecheckten Dateien zum Inhalt passen.
//
// Schrift: Helvetica, eine der 14 Standardschriften jedes PDF-Programms; sie
// wird nicht eingebettet. Zeichen ausserhalb von WinAnsi (z.B. Pfeile) sind
// darum nicht erlaubt; der Erzeuger bricht dann mit einer Meldung ab.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { SHEETS } from './inhalt.mjs';

const A4 = [595.28, 841.89];
const MARGIN = { left: 56, right: 56, top: 78, bottom: 64 };
const WIDTH = A4[0] - MARGIN.left - MARGIN.right;
const STAMP = new Date('2026-11-02T00:00:00Z');

const BLUE = rgb(0.11, 0.25, 0.55);
const TEXT = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.38, 0.4, 0.45);
const LINE = rgb(0.72, 0.74, 0.78);
const FIELD_BG = rgb(0.94, 0.96, 1);
const BOX_BG = rgb(0.95, 0.96, 0.98);
const STAR = rgb(0.96, 0.62, 0.04);
const STAR_OFF = rgb(0.82, 0.84, 0.88);
const STAR_PATH = 'M 5 0 L 6.18 3.38 L 9.76 3.45 L 6.9 5.62 L 7.94 9.05 L 5 7 L 2.06 9.05 L 3.1 5.62 L 0.24 3.45 L 3.82 3.38 Z';

class Writer {
  /** @param {PDFDocument} doc */
  constructor(doc, fonts, sheet, solution) {
    this.doc = doc;
    this.font = fonts.regular;
    this.bold = fonts.bold;
    this.italic = fonts.italic;
    this.mono = fonts.mono;
    this.form = doc.getForm();
    this.sheet = sheet;
    this.solution = solution;
    this.pages = [];
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage(A4);
    this.pages.push(this.page);
    this.y = A4[1] - MARGIN.top;
  }

  /** Platz für `height` Punkte; sonst neue Seite. */
  need(height) {
    if (this.y - height < MARGIN.bottom) this.newPage();
  }

  /** Text mit **fett** in Wörter zerlegen. */
  words(text) {
    const out = [];
    let bold = false;
    for (const part of text.split('**')) {
      for (const w of part.split(/(\s+)/)) if (w) out.push({ text: w, bold });
      bold = !bold;
    }
    return out;
  }

  /** Umbrochene Zeilen (Liste von Wortfolgen) für die Breite. */
  wrap(text, size, width, baseFont = this.font) {
    const lines = [];
    let line = [];
    let w = 0;
    for (const word of this.words(text)) {
      const f = word.bold ? this.bold : baseFont;
      const ww = f.widthOfTextAtSize(word.text, size);
      if (/^\s+$/.test(word.text)) {
        if (line.length) {
          line.push(word);
          w += ww;
        }
        continue;
      }
      if (w + ww > width && line.length) {
        while (line.length && /^\s+$/.test(line.at(-1).text)) line.pop();
        lines.push(line);
        line = [];
        w = 0;
      }
      line.push(word);
      w += ww;
    }
    if (line.length) lines.push(line);
    return lines;
  }

  drawLine(line, x, y, size, color = TEXT, baseFont = this.font) {
    let cx = x;
    for (const word of line) {
      const f = word.bold ? this.bold : baseFont;
      this.page.drawText(word.text, { x: cx, y, size, font: f, color });
      cx += f.widthOfTextAtSize(word.text, size);
    }
  }

  paragraph(text, { size = 10.5, indent = 0, color = TEXT, gap = 6, font } = {}) {
    const lead = size * 1.38;
    const lines = this.wrap(text, size, WIDTH - indent, font);
    // Kurze Absätze nicht trennen (keine einzelne Zeile auf der nächsten Seite).
    if (lines.length <= 4) this.need(lines.length * lead);
    for (const line of lines) {
      this.need(lead);
      this.drawLine(line, MARGIN.left + indent, this.y - size, size, color, font);
      this.y -= lead;
    }
    this.y -= gap;
  }

  heading(text, size, color = BLUE, gap = 8) {
    this.need(size * 2.2 + 40);
    this.y -= size * 0.4;
    this.paragraph(`**${text}**`, { size, color, gap });
  }

  stars(n, x, y) {
    for (let i = 0; i < 5; i++) {
      this.page.drawSvgPath(STAR_PATH, { x: x + i * 12, y: y + 10, scale: 1, color: i < n ? STAR : STAR_OFF });
    }
  }

  section(s) {
    this.need(s.keep ?? 120);
    this.y -= 8;
    const size = 13.5;
    this.page.drawText(s.heading, { x: MARGIN.left, y: this.y - size, size, font: this.bold, color: BLUE });
    if (s.stars) this.stars(s.stars, A4[0] - MARGIN.right - 58, this.y - size);
    this.y -= size * 1.6;
    this.page.drawLine({ start: { x: MARGIN.left, y: this.y + 4 }, end: { x: A4[0] - MARGIN.right, y: this.y + 4 }, thickness: 0.6, color: LINE });
    this.y -= 6;
    if (s.catalog) this.box(`In leyoNET: **Werkzeuge » Aufgaben-Katalog**, Reiter «${this.sheet.series ?? 'M117'}», Übung **«${s.catalog}»** starten. Das Startnetz und die Lernziele sind vorbereitet; «Prüfen» zeigt, was schon erfüllt ist.`);
    for (const block of s.blocks ?? []) this.block(block, s.id);
  }

  box(text) {
    const size = 9.5;
    const lines = this.wrap(text, size, WIDTH - 20);
    const h = lines.length * size * 1.38 + 14;
    this.need(h + 8);
    this.page.drawRectangle({ x: MARGIN.left, y: this.y - h, width: WIDTH, height: h, color: BOX_BG, borderColor: LINE, borderWidth: 0.6 });
    let y = this.y - 7 - size;
    for (const line of lines) {
      this.drawLine(line, MARGIN.left + 10, y, size, TEXT);
      y -= size * 1.38;
    }
    this.y -= h + 10;
  }

  table(rows, widths) {
    const size = 9.5;
    const pad = 4;
    const total = widths.reduce((a, b) => a + b, 0);
    const cols = widths.map((w) => (w / total) * WIDTH);
    for (const [r, row] of rows.entries()) {
      const wrapped = row.map((cell, c) => this.wrap(r === 0 ? `**${cell}**` : String(cell), size, cols[c] - 2 * pad));
      const h = Math.max(...wrapped.map((l) => l.length)) * size * 1.3 + 2 * pad;
      this.need(h);
      let x = MARGIN.left;
      for (const [c, lines] of wrapped.entries()) {
        this.page.drawRectangle({ x, y: this.y - h, width: cols[c], height: h, borderColor: LINE, borderWidth: 0.6, ...(r === 0 ? { color: BOX_BG } : {}) });
        let y = this.y - pad - size;
        for (const line of lines) {
          this.drawLine(line, x + pad, y, size);
          y -= size * 1.3;
        }
        x += cols[c];
      }
      this.y -= h;
    }
    this.y -= 10;
  }

  field(name, x, y, width, height, answer, multiline = false) {
    const f = this.form.createTextField(name);
    if (multiline) f.enableMultiline();
    if (this.solution && answer !== undefined) f.setText(answer);
    f.addToPage(this.page, { x, y, width, height, font: this.font, textColor: TEXT, backgroundColor: FIELD_BG, borderColor: LINE, borderWidth: 0.6 });
    f.setFontSize(multiline ? 9.5 : 10);
  }

  /** Beschriftete Eingabefelder in zwei Spalten. */
  fields(items, prefix) {
    const label = 150;
    const h = 18;
    const colW = WIDTH / 2;
    const twoColumns = items.every((i) => !i.wide);
    // Eine Feldgruppe nicht über zwei Seiten verteilen.
    this.need(Math.ceil(items.length / (twoColumns ? 2 : 1)) * (h + 7) + 4);
    for (let i = 0; i < items.length; i += twoColumns ? 2 : 1) {
      this.need(h + 8);
      for (let k = 0; k < (twoColumns ? 2 : 1); k++) {
        const item = items[i + k];
        if (!item) continue;
        const x = MARGIN.left + k * colW;
        const lw = twoColumns ? Math.min(label, colW * 0.55) : label;
        const lines = this.wrap(item.label, 9.5, lw - 6);
        this.drawLine(lines[0], x, this.y - 13, 9.5, MUTED);
        const fw = (twoColumns ? colW : WIDTH) - lw - 10;
        this.field(`${prefix}.${item.name}`, x + lw, this.y - h, fw, h, item.answer);
      }
      this.y -= h + 7;
    }
    this.y -= 4;
  }

  question(q, prefix) {
    // Frage und Antwortfeld bleiben zusammen auf einer Seite.
    const h = (q.lines ?? 2) * 14 + 8;
    this.need(this.wrap(q.text, 10.5, WIDTH).length * 10.5 * 1.38 + 3 + h + 12);
    this.paragraph(q.text, { size: 10.5, gap: 3 });
    this.field(`${prefix}.${q.name}`, MARGIN.left, this.y - h, WIDTH, h, q.answer, (q.lines ?? 2) > 1);
    this.y -= h + 12;
  }

  selfCheck(check, prefix) {
    const h = 18;
    this.need(h + 12);
    const points = typeof check === 'object';
    const goals = points ? check.points : check;
    const text = points ? 'Punkte nach «Prüfen» in leyoNET:' : 'Erfüllte Lernziele nach «Prüfen» in leyoNET:';
    this.page.drawText(text, { x: MARGIN.left, y: this.y - 13, size: 9.5, font: this.bold, color: TEXT });
    const x = MARGIN.left + this.bold.widthOfTextAtSize(text, 9.5) + 8;
    this.field(`${prefix}.lernziele`, x, this.y - h, 40, h, this.solution ? String(goals) : undefined);
    this.page.drawText(`von ${goals}`, { x: x + 46, y: this.y - 13, size: 9.5, font: this.font, color: TEXT });
    this.y -= h + 14;
  }

  list(items, ordered = false) {
    for (const [i, item] of items.entries()) {
      const size = 10.5;
      const marker = ordered ? `${i + 1}.` : '•';
      const lines = this.wrap(item, size, WIDTH - 18);
      for (const [k, line] of lines.entries()) {
        this.need(size * 1.38);
        if (k === 0) this.page.drawText(marker, { x: MARGIN.left + 2, y: this.y - size, size, font: this.font, color: TEXT });
        this.drawLine(line, MARGIN.left + 18, this.y - size, size);
        this.y -= size * 1.38;
      }
    }
    this.y -= 6;
  }

  /** Konfiguration der Musterlösung in Festbreitenschrift; nur in der _mL-Fassung. */
  solutionCode({ title, lines }) {
    if (!this.solution) return;
    this.heading(title, 11, BLUE, 4);
    const size = 8.5;
    const lead = size * 1.3;
    for (const line of lines) {
      this.need(lead);
      // Lange Zeilen hart umbrechen (Festbreite: Zeichen zählen).
      const max = Math.floor(WIDTH / this.mono.widthOfTextAtSize('M', size));
      for (let i = 0; i === 0 || i < line.length; i += max) {
        this.need(lead);
        this.page.drawText(line.slice(i, i + max), { x: MARGIN.left, y: this.y - size, size, font: this.mono, color: TEXT });
        this.y -= lead;
      }
    }
    this.y -= 6;
  }

  block(b, prefix) {
    if (b.solutionCode) return this.solutionCode(b.solutionCode);
    if (b.p) return this.paragraph(b.p);
    if (b.tip) return this.paragraph(b.tip, { size: 9.5, color: MUTED, font: this.italic });
    if (b.h) return this.heading(b.h, 11, TEXT, 4);
    if (b.box) return this.box(b.box);
    if (b.table) return this.table(b.table, b.widths ?? b.table[0].map(() => 1));
    if (b.fields) return this.fields(b.fields, prefix);
    if (b.question) return this.question(b.question, prefix);
    if (b.check) return this.selfCheck(b.check, prefix);
    if (b.list) return this.list(b.list, b.ordered);
    throw new Error(`Unbekannter Block: ${JSON.stringify(b)}`);
  }

  /** Kopf (Modul, Blatt) und Fuss (Datei, Seite) auf allen Seiten. */
  frame() {
    const total = this.pages.length;
    for (const [i, page] of this.pages.entries()) {
      const top = A4[1] - 40;
      page.drawText(`leyoNET · ${this.sheet.module ?? 'Modul 117'} – ${this.sheet.block}`, { x: MARGIN.left, y: top, size: 8.5, font: this.font, color: MUTED });
      const right = this.solution ? 'Musterlösung (Lehrperson)' : (this.sheet.label ?? 'Arbeitsblatt');
      page.drawText(right, { x: A4[0] - MARGIN.right - this.font.widthOfTextAtSize(right, 8.5), y: top, size: 8.5, font: this.solution ? this.bold : this.font, color: this.solution ? rgb(0.75, 0.1, 0.1) : MUTED });
      page.drawLine({ start: { x: MARGIN.left, y: top - 6 }, end: { x: A4[0] - MARGIN.right, y: top - 6 }, thickness: 0.6, color: LINE });
      const bottom = 36;
      page.drawLine({ start: { x: MARGIN.left, y: bottom + 12 }, end: { x: A4[0] - MARGIN.right, y: bottom + 12 }, thickness: 0.6, color: LINE });
      const file = `${this.sheet.file}${this.solution ? '_mL' : ''}.pdf`;
      page.drawText(file, { x: MARGIN.left, y: bottom, size: 8, font: this.font, color: MUTED });
      const n = `Seite ${i + 1} von ${total}`;
      page.drawText(n, { x: A4[0] - MARGIN.right - this.font.widthOfTextAtSize(n, 8), y: bottom, size: 8, font: this.font, color: MUTED });
    }
  }
}

/** Abgabe an die Lehrperson: ausgefülltes PDF und die Projektdateien. */
function submission(w, sheet) {
  // Der ganze Abschnitt auf eine Seite.
  w.section({ id: 'abgabe', heading: 'Abgabe an die Lehrperson', keep: 250 });
  w.list(
    [
      `Fülle dieses Arbeitsblatt direkt im PDF aus (im Browser, in Adobe Acrobat Reader oder einer anderen PDF-App) und speichere es als **${sheet.file}_Nachname.pdf**.`,
      `Speichere in leyoNET jedes Projekt mit **Strg+S**. Als Projektnamen (oben links) verwendest du: ${sheet.projects.map((p) => `**${p}_Nachname**`).join(', ')}.`,
      'Gib das PDF und die Projektdateien (.json) so ab, wie es deine Lehrperson vorgibt, z.B. im Abgabeordner von Teams oder Moodle.',
    ],
    true,
  );
  w.paragraph('Die Lehrperson öffnet in leyoNET **«Abgaben auswerten …»**, wählt alle Projektdateien der Klasse und erhält die erfüllten Lernziele als Tabelle (CSV). leyoNET selbst speichert keine Namen: Dein Name steht nur in deinen Dateien.', { size: 9.5, color: MUTED });
}

/** Ein Blatt als PDF-Bytes. */
export async function buildSheet(sheet, { solution = false } = {}) {
  const doc = await PDFDocument.create();
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    // Courier nur in der Musterlösung (Konfiguration), damit die Blätter der Lernenden gleich bleiben.
    ...(solution ? { mono: await doc.embedFont(StandardFonts.Courier) } : {}),
  };
  const title = `${sheet.title}${solution ? ' – Musterlösung' : ''}`;
  doc.setTitle(title);
  doc.setSubject(`${sheet.module ?? 'Modul 117'} – ${sheet.block}`);
  doc.setAuthor('leyoNET');
  doc.setCreator('leyoNET (scripts/arbeitsblaetter)');
  doc.setProducer('leyoNET');
  doc.setLanguage('de-CH');
  doc.setCreationDate(STAMP);
  doc.setModificationDate(STAMP);

  const w = new Writer(doc, fonts, sheet, solution);
  w.paragraph(`**${title}**`, { size: 19, color: BLUE, gap: 4 });
  if (sheet.subtitle) w.paragraph(sheet.subtitle, { size: 11, color: MUTED, gap: 10 });
  w.fields(
    [
      { label: 'Name', name: 'name', answer: solution ? 'Musterlösung' : undefined },
      { label: 'Klasse', name: 'klasse' },
      { label: 'Datum', name: 'datum' },
      { label: 'Lehrperson', name: 'lehrperson' },
    ],
    'kopf',
  );
  for (const b of sheet.intro ?? []) w.block(b, 'intro');
  for (const s of sheet.sections) w.section(s);
  submission(w, sheet);
  w.frame();
  doc.getForm().updateFieldAppearances(fonts.regular);
  return doc.save({ useObjectStreams: false });
}

export const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'arbeitsblaetter');

/**
 * Blätter zu den Übungen ohne Modulreihe entstehen aus dem Katalog (TypeScript,
 * src/ui/catalogSheets.ts); geladen über Vite wie im Test.
 */
async function catalogSheets() {
  const { createServer } = await import('vite');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const server = await createServer({ root, configFile: join(root, 'vite.config.ts'), logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null } });
  try {
    const i18n = await server.ssrLoadModule('/src/i18n/index.ts');
    i18n.setLocale('de');
    const mod = await server.ssrLoadModule('/src/ui/catalogSheets.ts');
    return mod.catalogSheets();
  } finally {
    await server.close();
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const sheet of [...SHEETS, ...(await catalogSheets())]) {
    writeFileSync(join(OUT_DIR, `${sheet.file}.pdf`), await buildSheet(sheet));
    writeFileSync(join(OUT_DIR, `${sheet.file}_mL.pdf`), await buildSheet(sheet, { solution: true }));
    console.log(`${sheet.file}.pdf, ${sheet.file}_mL.pdf`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
