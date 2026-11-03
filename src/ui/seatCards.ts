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
