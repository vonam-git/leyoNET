// Einzelberichte für die Prüfungseinsicht: je Abgabe eine Druckseite mit
// allen Zielen, Punkten, Gründen, Bemerkungen der Lehrperson und der Note.
// Eine HTML-Datei für alle; im Browser öffnen und als PDF drucken.

import { correctedScore, goalPoints, pointsOf, type Corrections, type SubmissionReview } from '../core';
import { t } from '../i18n';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

export function reviewReportHtml(reviews: readonly SubmissionReview[], corrections: Corrections, title: string): string {
  const pages = reviews.flatMap((r) => {
    if (!r.ok) return [];
    const c = corrections[r.name];
    const score = correctedScore(r, c);
    const rows = r.tasks.goals.map((g) => {
      const mark = r.marks.find((m) => m.id === g.id);
      const p = goalPoints(r, g.id, c);
      const note = c?.notes?.[g.id] ?? (mark && !mark.passed && !mark.skipped && mark.reason ? t(`tasks.reason.${mark.reason.code}`, mark.reason.params) : '');
      const own = c?.points?.[g.id] !== undefined ? ' *' : '';
      return `<tr><td>${escape(g.section ?? '')}</td><td>${escape(g.text)}</td><td class="num">${pointsOf(g)}</td><td class="num">${p === null ? '–' : num(p) + own}</td><td>${escape(note)}</td></tr>`;
    });
    return [
      `<section>
<h1>${escape(title)}</h1>
<table class="meta"><tr><th>${escape(t('review.file'))}</th><td>${escape(r.name)}</td>${r.variant ? `<th>${escape(t('exam.seatWord'))}</th><td>${escape(r.variant)}</td>` : ''}</tr>
<tr><th>${escape(t('review.points'))}</th><td>${num(score.points)} / ${score.max}</td>${score.grade !== undefined ? `<th>${escape(t('review.grade'))}</th><td><strong>${num(score.grade)}</strong></td>` : ''}</tr></table>
<table><thead><tr><th>${escape(t('review.report.part'))}</th><th>${escape(t('review.report.goal'))}</th><th class="num">${escape(t('review.report.max'))}</th><th class="num">${escape(t('review.report.reached'))}</th><th>${escape(t('review.report.note'))}</th></tr></thead>
<tbody>${rows.join('')}</tbody></table>
${c?.comment ? `<h2>${escape(t('review.report.comment'))}</h2><p>${escape(c.comment).replace(/\n/g, '<br>')}</p>` : ''}
<p class="muted">${escape(t('review.report.footer'))}</p>
</section>`,
    ];
  });
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>
body{font:10.5pt/1.4 system-ui,sans-serif;max-width:50em;margin:2em auto;padding:0 1em;color:#111}
h1{font-size:15pt;margin:0 0 .4em}h2{font-size:11pt;margin:1em 0 .2em}
table{border-collapse:collapse;width:100%;margin:.5em 0}td,th{border:1px solid #aaa;padding:.25em .45em;text-align:left;vertical-align:top}
.meta th{width:8em;background:#f3f4f6}.num{text-align:right;white-space:nowrap}.muted{color:#555;font-size:8.5pt}
section{break-after:page;margin-bottom:3em}
@media print{body{margin:0}}
</style></head><body>
${pages.join('\n')}
</body></html>
`;
}
