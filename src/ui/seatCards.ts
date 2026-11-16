import { parseInline, parseRich, type Inline } from './richText';
import { t } from '../i18n';

/** Druckbare Platzkarten mit den Platz-Codes einer Server-Prüfung (eine Karte je Platz, zum Ausschneiden). */
export function seatCardsHtml(exam: { title: string; label: string; minutes: number; url: string; seats: { id: string; code: string; extra: number }[] }): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const cards = exam.seats
    .map(
      (s) => `<div class="card">
<div class="head"><span>${esc(exam.label)}</span><strong>${esc(t('exam.seatWord'))} ${esc(s.id)}</strong></div>
<div class="title">${esc(exam.title)}</div>
<div class="code">${esc(s.code)}</div>
<ol>
<li>${esc(t('seatCards.step1', { url: exam.url }))}</li>
<li>${esc(t('seatCards.step2'))}</li>
<li>${esc(t('seatCards.step3', { min: exam.minutes + s.extra }))}</li>
</ol>
<div class="name">${esc(t('seatCards.name'))} ________________________</div>
</div>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="${esc(t('seatCards.lang'))}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${esc(t('seatCards.title', { label: exam.label }))}</title>
<style>
body{font-family:system-ui,sans-serif;margin:10mm;color:#111}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
.card{border:1px dashed #555;border-radius:3mm;padding:5mm;break-inside:avoid}
.head{display:flex;justify-content:space-between;font-size:10pt;color:#444}
.head strong{font-size:14pt;color:#111}
.title{font-weight:600;margin:2mm 0}
.code{font-family:ui-monospace,Consolas,monospace;font-size:24pt;letter-spacing:.12em;text-align:center;margin:4mm 0;padding:2mm;border:1px solid #111;border-radius:2mm}
ol{font-size:9pt;margin:0;padding-left:5mm}
.name{margin-top:4mm;font-size:9pt;color:#444}
.note{font-size:9pt;color:#444;margin-bottom:5mm}
@media print{.note{display:none}}
</style></head><body>
<p class="note">${esc(t('seatCards.note'))}</p>
<div class="grid">
${cards}
</div>
</body></html>
`;
}

export interface SheetSeat {
  id: string;
  code: string;
  extra: number;
  sheet: { title: string; description: string; goals: { text: string; points?: number; section?: string }[]; raster: { label: string; points: number }[] } | null;
}

/**
 * Prüfungsblätter zum Drucken: je Platz eine Seite mit Kopf (Prüfung, Platz, Platz-Code,
 * Zeit, Ablauf, Regeln) und dem Aufgabentext dieses Platzes, gegliedert wie im Aufgabenfenster
 * (Absätze, Listen, fett, Befehle). Alles als Text, kein HTML aus der Prüfungsdatei.
 */
export function examSheetsHtml(exam: { title: string; label: string; minutes: number; url: string; seats: SheetSeat[] }): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const parts = (items: Inline[]) => items.map((p) => (p.kind === 'bold' ? `<strong>${esc(p.text)}</strong>` : p.kind === 'text' ? esc(p.text) : `<code>${esc(p.text)}</code>`)).join('');
  const inline = (text: string) => parts(parseInline(text));
  const rich = (text: string) =>
    parseRich(text)
      .map((b) => (b.kind === 'p' ? `<p>${parts(b.parts)}</p>` : `<${b.kind}>${b.items.map((i) => `<li>${parts(i)}</li>`).join('')}</${b.kind}>`))
      .join('\n');
  const page = (s: SheetSeat) => {
    const sheet = s.sheet;
    const total = sheet ? (sheet.raster.length ? sheet.raster.reduce((a, r) => a + r.points, 0) : sheet.goals.reduce((a, g) => a + (g.points ?? 1), 0)) : 0;
    const goals = sheet?.goals.length
      ? `<h2>${esc(t('examSheets.goals'))}</h2><ol class="goals">${sheet.goals.map((g) => `<li>${inline(g.text)}${g.points !== undefined ? ` <span class="pts">(${g.points} ${esc(t('examSheets.pointsShort'))})</span>` : ''}</li>`).join('')}</ol>`
      : '';
    const raster = sheet?.raster.length
      ? `<h2>${esc(t('exam.sheet.raster'))}</h2><table class="raster"><tr><th>${esc(t('exam.sheet.part'))}</th><th class="num">${esc(t('exam.sheet.possible'))}</th><th class="num">${esc(t('exam.sheet.reached'))}</th></tr>${sheet.raster.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${r.points}</td><td></td></tr>`).join('')}<tr class="sum"><th>Total</th><th class="num">${total}</th><td></td></tr></table>`
      : '';
    return `<section class="page">
<header>
  <div><div class="label">${esc(exam.label)}</div><h1>${esc(sheet?.title || exam.title)}</h1></div>
  <div class="seat"><span>${esc(t('exam.seatWord'))}</span><strong>${esc(s.id)}</strong></div>
</header>
<table class="facts">
<tr><th>${esc(t('examSheets.code'))}</th><td class="code">${esc(s.code)}</td></tr>
<tr><th>${esc(t('exam.sheet.duration'))}</th><td>${exam.minutes + s.extra} min${s.extra ? ` (${esc(t('examSheets.extra', { min: s.extra }))})` : ''}</td></tr>
${total ? `<tr><th>${esc(t('exam.sheet.points'))}</th><td>${total}</td></tr>` : ''}
<tr><th>${esc(t('examSheets.start'))}</th><td>${esc(t('seatCards.step1', { url: exam.url }))}<br>${esc(t('seatCards.step2'))}</td></tr>
<tr><th>${esc(t('examSheets.rules'))}</th><td>${esc(t('examSheets.rulesText'))}</td></tr>
<tr><th>${esc(t('exam.sheet.name'))}</th><td class="line"></td></tr>
</table>
${sheet?.description ? `<h2>${esc(t('examSheets.task'))}</h2><div class="task">${rich(sheet.description)}</div>` : ''}
${goals}
${raster}
<footer>${esc(t('examSheets.footer'))}</footer>
</section>`;
  };
  return `<!doctype html>
<html lang="${esc(t('seatCards.lang'))}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${esc(t('examSheets.title', { label: exam.label }))}</title>
<style>
@page{size:A4;margin:16mm 15mm}
body{font:10.5pt/1.45 system-ui,'Segoe UI',sans-serif;color:#111;margin:0}
.note{max-width:46em;margin:1.5em auto;padding:.8em 1em;background:#f4f6f8;border-radius:6px;font-size:10pt}
.page{max-width:46em;margin:0 auto 2em;break-after:page}
.page:last-child{break-after:auto}
header{display:flex;justify-content:space-between;align-items:flex-start;gap:1em;border-bottom:2px solid #111;padding-bottom:.4em;margin-bottom:.7em}
.label{font-size:9pt;color:#555;text-transform:uppercase;letter-spacing:.05em}
h1{font-size:15pt;margin:.1em 0 0}
.seat{text-align:center;border:2px solid #111;border-radius:6px;padding:.2em .7em;min-width:4.5em}
.seat span{display:block;font-size:8pt;color:#555}.seat strong{font-size:20pt}
table{border-collapse:collapse;width:100%;margin:.4em 0 .8em}
th,td{border:1px solid #bbb;padding:.3em .5em;text-align:left;vertical-align:top}
.facts th{width:9em;background:#f4f6f8;font-weight:600}
.code{font:600 15pt ui-monospace,Consolas,monospace;letter-spacing:.12em}
.line{height:1.6em}
h2{font-size:11.5pt;margin:1em 0 .3em;padding-bottom:.15em;border-bottom:1px solid #ccc}
.task p{margin:0 0 .5em}.task ul,.task ol,.goals{margin:0 0 .6em;padding-left:1.4em}
code{font-family:ui-monospace,Consolas,monospace;font-size:.92em;background:#f1f3f5;padding:0 .2em;border-radius:3px}
.pts{color:#555;font-size:9pt;white-space:nowrap}
.num{text-align:right;width:7em}.raster .sum th{background:#f4f6f8}
footer{margin-top:1em;font-size:8.5pt;color:#555}
@media print{.note{display:none}.page{margin:0}}
</style></head><body>
<p class="note">${esc(t('examSheets.note'))}</p>
${exam.seats.map(page).join('\n')}
</body></html>
`;
}
