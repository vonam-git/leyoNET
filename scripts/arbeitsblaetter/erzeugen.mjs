// Erzeugt die ausfüllbaren Arbeitsblätter (PDF mit Formularfeldern) zu den
// Übungen im Aufgaben-Katalog. Inhalt: inhalt.mjs. Je Blatt entstehen zwei
// Dateien in docs/arbeitsblaetter/: <Name>.pdf für die Lernenden und
// <Name>_mL.pdf mit Musterlösung für die Lehrperson. Die Musterlösungen liegen nie im öffentlichen
// Repository: Gibt es ~/leyonet-privat (oder LEYONET_LOESUNGEN), landen sie dort, dazu das gelöste
// Netz jeder Übung als Projektdatei; sonst in docs/arbeitsblaetter (in .gitignore).
//
// Gestaltung wie leyonet.ch: Überschriften in Courier wie das Logo, Text in Helvetica, Farben nur
// dort, wo sie etwas bedeuten (Rollen der Geräte, OSI-Schichten). Das Startnetz jeder Übung ist als
// Netzplan gezeichnet (Daten: src/ui/sheetPlans.ts).
//
// Aufruf: npm run arbeitsblaetter
// Die Ausgabe ist reproduzierbar (feste Datumsangaben); ein Test prüft, dass
// die eingecheckten Dateien zum Inhalt passen.
//
// Schrift: Helvetica und Courier, zwei der 14 Standardschriften jedes PDF-Programms; sie
// werden nicht eingebettet. Zeichen ausserhalb von WinAnsi (z.B. Pfeile) sind
// darum nicht erlaubt; der Erzeuger bricht dann mit einer Meldung ab.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LineCapStyle, PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { SHEETS } from './inhalt.mjs';

const A4 = [595.28, 841.89];
const MARGIN = { left: 56, right: 56, top: 92, bottom: 66 };
const WIDTH = A4[0] - MARGIN.left - MARGIN.right;
const STAMP = new Date('2026-11-25T00:00:00Z');

const hex = (c) => rgb(parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255);
// Farben der Website (website/httpdocs/css/site.css) und der App (src/ui/farben.css).
const INK = hex('#000000');
const TEXT = hex('#18212c');
const MUTED = hex('#55606f');
const GRAPHITE = hex('#8a8f98');
const LINE = hex('#d3d9e1');
const CABLE = hex('#4a5566');
const GRID = hex('#cfd6df');
const FIELD_BG = hex('#f5f7fa');
const FIELD_LINE = hex('#8a8f98');
const BOX_BG = hex('#eef1f5');
const CONSOLE = hex('#18212c');
const CONSOLE_TEXT = hex('#e3e9f0');
const PROMPT = hex('#8fd18f');
const ALERT = hex('#b4232a');
const ROLES = {
  endpoint: [hex('#1d5fd6'), hex('#dde8fc')],
  distribution: [hex('#067a52'), hex('#d3f2e5')],
  routing: [hex('#b4530a'), hex('#fbe6cf')],
};
/** OSI-Schichten 1 bis 7 als Farbstreifen im Fuss. */
const OSI = ['#7f8c8d', '#d68910', '#16a085', '#2e86c1', '#a569bd', '#9b59b6', '#8e44ad'].map(hex);
/** Leitungen wie in der App (CableLine.svelte): Farbe, Dicke, Strichmuster. */
const WIRES = {
  fiber: [hex('#ef6c00'), 2.2],
  wireless: [hex('#2563eb'), 1.4, [1, 5]],
  serial: [hex('#b91c1c'), 1.8, [10, 3, 2, 3]],
  coax: [hex('#374151'), 2.8],
  dsl: [hex('#15803d'), 1.4, [5, 3]],
  cellular: [hex('#7c3aed'), 1.4, [1, 5]],
};
const STAR = rgb(0.96, 0.62, 0.04);
const STAR_OFF = rgb(0.82, 0.84, 0.88);
const STAR_PATH = 'M 5 0 L 6.18 3.38 L 9.76 3.45 L 6.9 5.62 L 7.94 9.05 L 5 7 L 2.06 9.05 L 3.1 5.62 L 0.24 3.45 L 3.82 3.38 Z';

class Writer {
  /** @param {PDFDocument} doc */
  constructor(doc, fonts, sheet, solution, plans = {}, solved = {}) {
    this.doc = doc;
    this.font = fonts.regular;
    this.bold = fonts.bold;
    this.italic = fonts.italic;
    this.mono = fonts.mono;
    this.monoBold = fonts.monoBold;
    this.plans = plans;
    this.solved = solved;
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

  /** Zwischentitel in Courier, mit Netzwerkknoten davor (wie im Logo). */
  heading(text, size, color = INK, gap = 5) {
    this.need(size * 2.2 + 70);
    this.y -= size * 0.5;
    this.page.drawCircle({ x: MARGIN.left + 3, y: this.y - size * 0.68, size: 2.6, color: GRAPHITE });
    this.paragraph(text, { size, color, gap, font: this.monoBold, indent: 12 });
  }

  /** Titel des Blatts auf Punktraster, wie die Startseite. */
  title(title, subtitle) {
    const size = 20;
    const lines = this.wrap(title, size, WIDTH - 32, this.monoBold);
    const h = lines.length * size * 1.25 + (subtitle ? 18 : 0) + 26;
    const top = this.y + 8;
    this.page.drawRectangle({ x: MARGIN.left, y: top - h, width: WIDTH, height: h, color: FIELD_BG, borderColor: LINE, borderWidth: 0.6 });
    for (let gx = MARGIN.left + 10; gx < MARGIN.left + WIDTH; gx += 12) for (let gy = top - 10; gy > top - h; gy -= 12) this.page.drawCircle({ x: gx, y: gy, size: 0.55, color: GRID });
    this.page.drawRectangle({ x: MARGIN.left, y: top - h, width: 4, height: h, color: this.solution ? ALERT : INK });
    let y = top - 12 - size;
    for (const line of lines) {
      this.drawLine(line, MARGIN.left + 18, y, size, INK, this.monoBold);
      y -= size * 1.25;
    }
    if (subtitle) this.drawLine(this.wrap(subtitle, 10.5, WIDTH - 32)[0], MARGIN.left + 18, y + 4, 10.5, MUTED);
    this.y = top - h - 14;
  }

  stars(n, x, y) {
    for (let i = 0; i < 5; i++) {
      this.page.drawSvgPath(STAR_PATH, { x: x + i * 12, y: y + 10, scale: 1, color: i < n ? STAR : STAR_OFF });
    }
  }

  section(s) {
    const entry = s.catalog ? this.sheet.entries?.[this.sheet.sections.filter((x) => x.catalog).indexOf(s)] : undefined;
    const plan = entry ? this.plans[entry] : undefined;
    // Titel, Fundort und Netzplan bleiben zusammen.
    this.need(s.keep ?? (plan ? 290 : 120));
    this.y -= 8;
    const size = 14;
    const lines = this.wrap(s.heading, size, WIDTH - (s.stars ? 70 : 0), this.monoBold);
    for (const [i, line] of lines.entries()) {
      this.drawLine(line, MARGIN.left, this.y - size, size, INK, this.monoBold);
      if (i === 0 && s.stars) this.stars(s.stars, A4[0] - MARGIN.right - 58, this.y - size);
      this.y -= size * 1.25;
    }
    this.y -= size * 0.35;
    // Leitung mit Knoten an beiden Enden statt einer einfachen Linie.
    this.page.drawLine({ start: { x: MARGIN.left, y: this.y + 4 }, end: { x: A4[0] - MARGIN.right, y: this.y + 4 }, thickness: 1.4, color: GRAPHITE });
    for (const x of [MARGIN.left + 2, A4[0] - MARGIN.right - 2]) this.page.drawCircle({ x, y: this.y + 4, size: 2.8, color: GRAPHITE });
    this.y -= 8;
    if (s.catalog) {
      this.console([`Werkzeuge » Aufgaben-Katalog » Reiter «${this.sheet.series ?? 'M117'}»`, `Übung «${s.catalog}» starten`], '«Prüfen» zeigt, was schon erfüllt ist.');
      if (plan) this.plan(plan);
    }
    for (const [i, block] of (s.blocks ?? []).entries()) {
      // Zwischentitel nicht von der folgenden Feldgruppe trennen.
      const next = s.blocks[i + 1]?.fields;
      if (block.h && next) this.need(Math.ceil(next.length / (next.some((f) => f.wide) ? 1 : 2)) * 25 + 40);
      this.block(block, s.id);
    }
    // Musterlösung: gelöstes Netz und Konfiguration (falls das Blatt sie nicht schon selbst zeigt).
    const solved = this.solution && entry ? this.solved[entry] : undefined;
    if (solved?.plan) this.plan(solved.plan, 'Musterlösung: Netz');
    if (solved?.config.length && !(s.blocks ?? []).some((b) => b.solutionCode)) this.solutionCode({ title: 'Musterlösung: Konfiguration (Änderungen gegenüber dem Startnetz)', lines: solved.config });
  }

  /** Dunkler Kasten wie die Befehlszeile: wo die Übung in leyoNET zu finden ist. */
  console(commands, note) {
    const size = 9;
    const lead = size * 1.45;
    const prompt = 'leyonet> ';
    const pw = this.monoBold.widthOfTextAtSize(prompt, size);
    const blocks = commands.map((c) => this.wrap(c, size, WIDTH - 24 - pw, this.mono));
    const h = (blocks.reduce((n, b) => n + b.length, 0) + 1) * lead + 14;
    this.need(h + 8);
    this.page.drawRectangle({ x: MARGIN.left, y: this.y - h, width: WIDTH, height: h, color: CONSOLE });
    let y = this.y - 8 - size;
    for (const lines of blocks)
      for (const [i, line] of lines.entries()) {
        if (i === 0) this.page.drawText(prompt, { x: MARGIN.left + 12, y, size, font: this.monoBold, color: PROMPT });
        this.drawLine(line, MARGIN.left + 12 + pw, y, size, CONSOLE_TEXT, this.mono);
        y -= lead;
      }
    this.page.drawText(note, { x: MARGIN.left + 12, y, size: 8.5, font: this.italic, color: GRID });
    this.y -= h + 10;
  }

  /** Netzplan des Startnetzes: Bereiche, Leitungen, Geräte mit Namen. */
  plan(plan, caption = 'Startnetz') {
    const pad = { x: 46, top: 40, bottom: 52 };
    const xs = [...plan.devices.flatMap((d) => [d.x - pad.x, d.x + pad.x]), ...plan.areas.flatMap((a) => [a.x, a.x + a.width])];
    const ys = [...plan.devices.flatMap((d) => [d.y - pad.top, d.y + pad.bottom]), ...plan.areas.flatMap((a) => [a.y, a.y + a.height])];
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    // Reicht der Rest der Seite für einen lesbaren Plan, passt er sich an; sonst neue Seite.
    const rest = this.y - MARGIN.bottom - 10;
    const maxH = rest >= 150 ? Math.min(250, rest) : 250;
    const scale = Math.min((WIDTH - 16) / (x1 - x0), (maxH - 34) / (y1 - y0), 0.62);
    // Schmale, hohe Netze in die Breite ziehen, damit sich die Namen nicht überdecken.
    const scaleX = Math.min((WIDTH - 16) / (x1 - x0), Math.max(scale, Math.min(0.62, scale * 2.2)));
    const h = (y1 - y0) * scale + 34;
    this.need(h + 10);
    const top = this.y;
    this.page.drawRectangle({ x: MARGIN.left, y: top - h, width: WIDTH, height: h, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 0.6 });
    for (let gx = MARGIN.left + 10; gx < MARGIN.left + WIDTH - 2; gx += 14) for (let gy = top - 10; gy > top - h + 2; gy -= 14) this.page.drawCircle({ x: gx, y: gy, size: 0.5, color: GRID });
    this.page.drawText(caption, { x: MARGIN.left + 8, y: top - 13, size: 8.5, font: this.monoBold, color: MUTED });
    const ox = MARGIN.left + (WIDTH - (x1 - x0) * scaleX) / 2;
    const px = (x) => ox + (x - x0) * scaleX;
    const py = (y) => top - 22 - (y - y0) * scale;
    const label = Math.max(5.5, Math.min(8.5, 15 * scale));
    for (const a of plan.areas) {
      const color = hex(a.color);
      this.page.drawRectangle({ x: px(a.x), y: py(a.y + a.height), width: a.width * scaleX, height: a.height * scale, color, opacity: 0.08, borderColor: color, borderOpacity: 0.7, borderWidth: 0.8 });
      this.page.drawText(a.title, { x: px(a.x) + 5, y: py(a.y) - label - 2, size: label, font: this.bold, color });
    }
    for (const c of plan.cables) {
      const [color, thickness, dashArray] = WIRES[c.medium] ?? [CABLE, 1.4];
      const [a, b] = [plan.devices[c.a], plan.devices[c.b]];
      this.page.drawLine({ start: { x: px(a.x), y: py(a.y) }, end: { x: px(b.x), y: py(b.y) }, thickness, color, ...(dashArray ? { dashArray } : {}) });
    }
    const k = Math.max(scale, 0.36);
    for (const d of plan.devices) {
      const [stroke, soft] = ROLES[d.role] ?? ROLES.endpoint;
      for (const s of d.shapes) this.shape(s, px(d.x), py(d.y), k, stroke, soft);
      const w = this.font.widthOfTextAtSize(d.name, label);
      const ly = py(d.y) - 24 * k - label - 1;
      this.page.drawRectangle({ x: px(d.x) - w / 2 - 2, y: ly - 1.5, width: w + 4, height: label + 1.5, color: rgb(1, 1, 1), opacity: 0.85 });
      this.page.drawText(d.name, { x: px(d.x) - w / 2, y: ly, size: label, font: this.font, color: TEXT });
    }
    this.y -= h + 12;
  }

  /** Eine Form eines Gerätesymbols (src/ui/deviceIcons.ts) um den Mittelpunkt cx/cy. */
  shape(s, cx, cy, k, stroke, soft) {
    const a = s.attrs;
    const width = 1.8 * k;
    if (s.tag === 'circle') {
      this.page.drawCircle({ x: cx + a.cx * k, y: cy - a.cy * k, size: a.r * k, ...(s.cls === 'fill' ? { color: stroke } : { color: soft, borderColor: stroke, borderWidth: width }) });
      return;
    }
    // Warnzeichen des Angreifers: orange mit hellem Ausrufezeichen (wie in der App).
    if (s.cls === 'mark') return void this.page.drawSvgPath(a.d, { x: cx, y: cy, scale: k, borderColor: rgb(1, 1, 1), borderWidth: 2.4, borderLineCap: LineCapStyle.Round });
    if (s.cls === 'warn') return void this.page.drawSvgPath(a.d, { x: cx, y: cy, scale: k, color: hex('#ef6c00'), borderColor: hex('#b4530a'), borderWidth: 1.5 });
    const d = s.tag === 'path' ? a.d : `M${a.x + a.rx} ${a.y} H${a.x + a.width - a.rx} Q${a.x + a.width} ${a.y} ${a.x + a.width} ${a.y + a.rx} V${a.y + a.height - a.rx} Q${a.x + a.width} ${a.y + a.height} ${a.x + a.width - a.rx} ${a.y + a.height} H${a.x + a.rx} Q${a.x} ${a.y + a.height} ${a.x} ${a.y + a.height - a.rx} V${a.y + a.rx} Q${a.x} ${a.y} ${a.x + a.rx} ${a.y} Z`;
    this.page.drawSvgPath(d, { x: cx, y: cy, scale: k, borderColor: stroke, borderWidth: 1.8, borderLineCap: LineCapStyle.Round, ...(s.cls === 'line' ? {} : { color: soft }) });
  }

  /** Logo leyoNET (branding/leyoNET.svg) als Vektoren, Höhe etwa 18 Punkte. */
  logo(page, x, y, k = 0.2) {
    const p = (lx, ly) => ({ x: x + (lx - 40) * k, y: y - (ly - 120) * k });
    const line = (a, b) => page.drawLine({ start: p(...a), end: p(...b), thickness: 5 * k, color: GRAPHITE, lineCap: LineCapStyle.Round });
    const dot = (a) => page.drawCircle({ ...p(...a), size: 5.5 * k, color: GRAPHITE });
    line([48, 66], [48, 116]);
    dot([48, 66]);
    dot([48, 116]);
    page.drawText('e', { ...p(76, 120), size: 88 * k, font: this.mono, color: GRAPHITE });
    line([140, 85], [158, 110]);
    line([158, 110], [180, 85]);
    line([158, 110], [144, 136]);
    for (const a of [[140, 85], [180, 85], [144, 136]]) dot(a);
    page.drawText('o', { ...p(188, 120), size: 88 * k, font: this.mono, color: GRAPHITE });
    page.drawText('NET', { ...p(244, 120), size: 112 * k, font: this.monoBold, color: INK });
  }

  box(text) {
    const size = 9.5;
    const lines = this.wrap(text, size, WIDTH - 24);
    const h = lines.length * size * 1.38 + 14;
    this.need(h + 8);
    this.page.drawRectangle({ x: MARGIN.left, y: this.y - h, width: WIDTH, height: h, color: BOX_BG });
    this.page.drawRectangle({ x: MARGIN.left, y: this.y - h, width: 3, height: h, color: GRAPHITE });
    let y = this.y - 7 - size;
    for (const line of lines) {
      this.drawLine(line, MARGIN.left + 14, y, size, TEXT);
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
        this.page.drawRectangle({ x, y: this.y - h, width: cols[c], height: h, borderColor: LINE, borderWidth: 0.6, ...(r === 0 ? { color: CONSOLE } : {}) });
        let y = this.y - pad - size;
        for (const line of lines) {
          this.drawLine(line, x + pad, y, size, r === 0 ? CONSOLE_TEXT : TEXT);
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
    f.addToPage(this.page, { x, y, width, height, font: this.font, textColor: TEXT, backgroundColor: FIELD_BG, borderColor: FIELD_LINE, borderWidth: 0.6 });
    // Lange Antworten der Musterlösung passen sich der Feldbreite an.
    const size = multiline ? 9.5 : 10;
    const text = this.solution && !multiline ? (answer ?? '') : '';
    const fit = text ? ((width - 8) / this.font.widthOfTextAtSize(text, size)) * size : size;
    f.setFontSize(Math.max(5.5, Math.min(size, fit)));
  }

  /** Beschriftete Eingabefelder in zwei Spalten. */
  fields(items, prefix) {
    const label = 140;
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
        const lw = twoColumns ? Math.min(label, colW * 0.48) : label;
        const lines = this.wrap(item.label, 9.5, lw - 6);
        // Lange Beschriftungen auf zwei Zeilen.
        if (lines.length === 1) this.drawLine(lines[0], x, this.y - 13, 9.5, MUTED);
        else this.wrap(item.label, 8, lw - 6).slice(0, 2).forEach((line, n) => this.drawLine(line, x, this.y - 7 - n * 9.5, 8, MUTED));
        const fw = (twoColumns ? colW : WIDTH) - lw - 10;
        this.field(`${prefix}.${item.name}`, x + lw, this.y - h, fw, h, item.answer);
      }
      this.y -= h + 7;
    }
    this.y -= 4;
  }

  question(q, prefix) {
    // Frage und Antwortfeld bleiben zusammen auf einer Seite. Freiwillige Fragen (z.B. Befehlszeile)
    // tragen «(optional)», damit sie bei der Bewertung nicht als Pflicht zählen.
    const text = q.optional ? `${q.text} **(optional)**` : q.text;
    const h = (q.lines ?? 2) * 14 + 8;
    this.need(this.wrap(text, 10.5, WIDTH).length * 10.5 * 1.38 + 3 + h + 12);
    this.paragraph(text, { size: 10.5, gap: 3 });
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
    this.heading(title, 11, INK, 4);
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
    if (b.h) return this.heading(b.h, 11, INK, 4);
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
      const top = A4[1] - 44;
      this.logo(page, MARGIN.left, top);
      const right = this.solution ? 'Musterlösung (Lehrperson)' : (this.sheet.label ?? 'Arbeitsblatt');
      const color = this.solution ? ALERT : INK;
      const rw = this.monoBold.widthOfTextAtSize(right, 9.5);
      page.drawText(right, { x: A4[0] - MARGIN.right - rw, y: top + 6, size: 9.5, font: this.monoBold, color });
      const module = `${this.sheet.module ?? 'Modul 117'} – ${this.sheet.block}`;
      page.drawText(module, { x: A4[0] - MARGIN.right - this.font.widthOfTextAtSize(module, 8.5), y: top - 6, size: 8.5, font: this.font, color: MUTED });
      page.drawLine({ start: { x: MARGIN.left, y: top - 16 }, end: { x: A4[0] - MARGIN.right, y: top - 16 }, thickness: 1.2, color: this.solution ? ALERT : INK });
      const bottom = 34;
      OSI.forEach((c, k) => page.drawRectangle({ x: MARGIN.left + (WIDTH / 7) * k, y: bottom + 14, width: WIDTH / 7, height: 2.4, color: c }));
      const file = `${this.sheet.file}${this.solution ? '_mL' : ''}.pdf · leyonet.ch`;
      page.drawText(file, { x: MARGIN.left, y: bottom, size: 8, font: this.font, color: MUTED });
      const n = `Seite ${i + 1} von ${total}`;
      page.drawText(n, { x: A4[0] - MARGIN.right - this.font.widthOfTextAtSize(n, 8), y: bottom, size: 8, font: this.font, color: MUTED });
    }
  }
}

/** Abgabe an die Lehrperson: ausgefülltes PDF und die Projektdateien. */
function submission(w, sheet) {
  // Der ganze Abschnitt auf eine Seite.
  w.section({ id: 'abgabe', heading: 'Abgabe an die Lehrperson', keep: 200 });
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
export async function buildSheet(sheet, { solution = false, plans = {}, solved = {} } = {}) {
  const doc = await PDFDocument.create();
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    mono: await doc.embedFont(StandardFonts.Courier),
    monoBold: await doc.embedFont(StandardFonts.CourierBold),
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

  const w = new Writer(doc, fonts, sheet, solution, plans, solved);
  w.title(title, sheet.subtitle);
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
  if (!solution) submission(w, sheet);
  w.frame();
  doc.getForm().updateFieldAppearances(fonts.regular);
  return doc.save({ useObjectStreams: false });
}

export const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'arbeitsblaetter');

/** Ordner der Musterlösungen: privat, sonst neben den Blättern (dort in .gitignore). */
function solutionDir() {
  if (process.env.LEYONET_LOESUNGEN) return process.env.LEYONET_LOESUNGEN;
  const privat = join(homedir(), 'leyonet-privat');
  return existsSync(privat) ? join(privat, 'musterloesungen') : OUT_DIR;
}

/**
 * Blätter zu den Übungen ohne Modulreihe, Netzpläne und gelöste Projekte entstehen aus dem Katalog
 * (TypeScript: src/ui/catalogSheets.ts, sheetPlans.ts, catalogSolutions.ts); geladen über Vite wie im Test.
 */
async function catalogData() {
  const { createServer } = await import('vite');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const server = await createServer({ root, configFile: join(root, 'vite.config.ts'), logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null } });
  try {
    const i18n = await server.ssrLoadModule('/src/i18n/index.ts');
    i18n.setLocale('de');
    const { catalogSheets, solutionLines } = await server.ssrLoadModule('/src/ui/catalogSheets.ts');
    const { planOf, sheetPlans } = await server.ssrLoadModule('/src/ui/sheetPlans.ts');
    const sheets = catalogSheets();
    const plans = sheetPlans();
    const { CATALOG } = await server.ssrLoadModule('/src/ui/catalog.ts');
    const { SOLUTIONS } = await server.ssrLoadModule('/src/ui/catalogSolutions.ts');
    const { serializeProject } = await server.ssrLoadModule('/src/core/index.ts');
    const projects = CATALOG.flatMap((e) => {
      const { topology, tasks } = e.build();
      const solve = SOLUTIONS[e.id];
      return solve ? [{ id: e.id, sheet: e.sheet, json: serializeProject(solve(topology), tasks) }] : [];
    });
    // Gelöste Netze: Plan nur, wenn Geräte oder Kabel dazukommen; Konfiguration als Unterschied zum Startnetz.
    const solved = {};
    for (const e of CATALOG) {
      const solve = SOLUTIONS[e.id];
      if (!solve) continue;
      const { topology } = e.build();
      const done = solve(topology);
      const changed = done.devices.length !== topology.devices.length || done.cables.length !== topology.cables.length;
      solved[e.id] = { plan: changed ? planOf(done) : null, config: solutionLines(topology, done) };
    }
    return { sheets, plans, projects, solved };
  } finally {
    await server.close();
  }
}

async function main() {
  const { sheets, plans, projects, solved } = await catalogData();
  const solutions = solutionDir();
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(solutions, { recursive: true });
  for (const sheet of [...SHEETS, ...sheets]) {
    writeFileSync(join(OUT_DIR, `${sheet.file}.pdf`), await buildSheet(sheet, { plans }));
    writeFileSync(join(solutions, `${sheet.file}_mL.pdf`), await buildSheet(sheet, { solution: true, plans, solved }));
    console.log(`${sheet.file}.pdf, ${sheet.file}_mL.pdf`);
  }
  if (solutions !== OUT_DIR) {
    const dir = join(solutions, 'projekte');
    mkdirSync(dir, { recursive: true });
    for (const p of projects) writeFileSync(join(dir, `${p.id}_mL.json`), p.json);
    console.log(`Musterlösungen und ${projects.length} gelöste Projekte: ${solutions}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
