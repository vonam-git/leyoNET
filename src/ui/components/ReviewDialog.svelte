<script lang="ts">
  import {
    correctedScore,
    goalPoints,
    parseBundle,
    parseNameList,
    parseCorrections,
    parseExamKey,
    pointsOf,
    readTasks,
    reviewCsv,
    reviewSubmission,
    serializeCorrections,
    similarPairs,
    type Corrections,
    type ExamKey,
    type SubmissionReview,
  } from '../../core';
  import { t } from '../../i18n';
  import Icon from './Icon.svelte';
  import '../admin.css';
  import { pickFile } from '../actions';
  import { errorText } from '../labels';
  import { downloadText } from '../persist/files';
  import { reviewReportHtml } from '../reviewReport';
  import { editor } from '../state/editor.svelte';
  import { reviewInbox } from '../state/reviewInbox';

  /**
   * Für Lehrpersonen: Projektdateien der Klasse auf einmal öffnen und gegen die
   * Aufgabe bzw. den Prüfungsschlüssel prüfen. Punkte lassen sich von Hand
   * korrigieren und mit Bemerkungen versehen (Korrekturdatei), Berichte gibt es
   * für die Einsicht. Alles bleibt im Browser; nichts wird hochgeladen.
   */
  let { onclose }: { onclose: () => void } = $props();

  type Ok = Extract<SubmissionReview, { ok: true }>;
  let reviews = $state.raw<SubmissionReview[]>([]);
  let texts = $state.raw<{ name: string; text: string | null }[]>([]);
  let key = $state.raw<ExamKey | null>(null);
  let corrections = $state<Corrections>({});
  let selected = $state<{ file: string; goal: string | null } | null>(null);
  /** Spalte (Ziel), deren Text unten in der Legende hervorgehoben ist. */
  let column = $state<string | null>(null);
  const activeColumn = $derived(selected?.goal ?? column);
  let legend = $state<HTMLOListElement | undefined>();
  function showGoal(id: string) {
    column = id;
    // Den Text des Ziels unten zeigen, ohne die Tabelle zu verlassen.
    queueMicrotask(() => legend?.querySelector('li.active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }
  let running = $state(0);
  let total = $state(0);
  /** Namensliste der Lehrperson: bleibt nur in diesem Fenster, wird nirgends gespeichert. */
  let nameText = $state('');
  const names = $derived(parseNameList(nameText));
  const seatOf = (file: string) => file.split(/\s+/).pop()!.replace(/\.json$/i, '').toUpperCase();
  const person = (file: string) => names.get(seatOf(file)) ?? null;
  const display = (file: string) => (person(file) ? `${file} – ${person(file)}` : file);
  let dialog: HTMLDialogElement;

  // Spalten: Schlüssel, geladene Aufgabe, sonst die der ersten lesbaren Datei.
  const columns = $derived(key?.variants[0]?.tasks ?? editor.tasks ?? reviews.find((r) => r.ok)?.tasks ?? null);
  /** Kopf der Auswertung: Abgaben, Durchschnitt, genügend (Note ab 4), ungenügend. */
  const summary = $derived.by(() => {
    if (!columns) return null;
    const ok = reviews.filter((r) => r.ok);
    const grades = columns.grading ? ok.map((r) => correctedScore(r, corrections[r.name]).grade ?? 1) : [];
    return {
      total: reviews.length,
      failed: reviews.length - ok.length,
      average: grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : null,
      pass: grades.filter((g) => g >= 4).length,
      below: grades.filter((g) => g < 4).length,
    };
  });
  const withPoints = $derived(!!columns && (columns.grading || columns.goals.some((g) => g.points !== undefined)));
  const similar = $derived(similarPairs(reviews));
  const similarTo = (name: string) => similar.filter((p) => p.a === name || p.b === name).map((p) => `${p.a === name ? p.b : p.a} (${Math.round(p.score * 100)} %)`);
  const title = $derived(key?.title ?? columns?.title ?? '');

  $effect(() => {
    dialog.showModal();
    // Abgaben aus der Admin-Konsole (Server-Prüfung): sofort automatisch auswerten.
    const inbox = reviewInbox.value;
    reviewInbox.value = null;
    if (inbox) {
      if (inbox.key) useKey(inbox.key);
      texts = inbox.files;
      void evaluate();
    }
  });

  let run = 0;
  /** Eine Abgabe nach der anderen auswerten, damit Fortschritt sichtbar bleibt und der Browser nicht hängt. */
  async function evaluate() {
    const id = ++run;
    const list = texts;
    total = list.length;
    running = list.length;
    const out: SubmissionReview[] = [];
    for (const { name, text } of list) {
      await new Promise((r) => setTimeout(r, 0));
      if (id !== run) return;
      out.push(text === null ? { ok: false, name, error: { code: 'readFailed' } } : reviewSubmission(name, text, key ? null : editor.tasks, key));
      running = list.length - out.length;
    }
    reviews = out;
    running = 0;
  }

  function useKey(text: string): boolean {
    const parsed = parseExamKey(text, readTasks);
    if (!parsed.ok) {
      editor.notify(t('review.keyInvalid'), 'error');
      return false;
    }
    key = parsed.key;
    editor.notify(t('review.keyLoaded', { title: parsed.key.title, n: parsed.key.variants.length }));
    return true;
  }

  async function choose(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    input.value = '';
    if (files.length === 0) return;
    const read = await Promise.all(files.map((f) => f.text().catch(() => null)));
    // Sammeldatei einer Server-Prüfung: je Platz eine Abgabe, Schlüssel dabei.
    const bundles = read.map((text) => (text ? parseBundle(text, t('exam.seatWord')) : null));
    if (bundles.some(Boolean)) {
      const keyText = bundles.find((b) => b?.key)?.key;
      if (keyText) useKey(keyText);
    }
    texts = files.flatMap((f, i) => bundles[i]?.files ?? [{ name: f.name, text: read[i] ?? null }]);
    void evaluate();
  }

  async function loadKey() {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    if (useKey(parseBundle(file.text, '')?.key ?? file.text) && texts.length) void evaluate();
  }

  async function loadCorrections() {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    const parsed = parseCorrections(file.text);
    if (!parsed) return editor.notify(t('review.correctionsInvalid'), 'error');
    corrections = parsed;
  }

  const slug = () => title.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase() || 'auswertung';

  function saveCorrections() {
    downloadText(`korrektur-${slug()}.json`, serializeCorrections(key?.id, $state.snapshot(corrections) as Corrections));
  }

  /** Für CSV und Berichte: Namen aus der Namensliste anfügen (nur in der Datei bei der Lehrperson). */
  function labelled(): { reviews: SubmissionReview[]; corrections: Corrections } {
    const plain = $state.snapshot(corrections) as Corrections;
    if (names.size === 0) return { reviews, corrections: plain };
    return {
      reviews: reviews.map((r) => ({ ...r, name: display(r.name) })),
      corrections: Object.fromEntries(Object.entries(plain).map(([file, c]) => [display(file), c])),
    };
  }

  function saveCsv() {
    if (!columns) return;
    const out = labelled();
    const csv = reviewCsv(
      columns,
      out.reviews,
      { file: t('review.file'), score: t('review.score'), error: t('review.error'), points: t('review.points'), grade: t('review.grade'), variant: t('exam.seatWord'), comment: t('review.report.comment') },
      out.corrections,
    );
    // BOM, damit Excel Umlaute richtig liest.
    downloadText(`auswertung-${slug()}.csv`, '\ufeff' + csv, 'text/csv');
  }

  function saveReports() {
    const out = labelled();
    downloadText(`berichte-${slug()}.html`, reviewReportHtml(out.reviews, out.corrections, title), 'text/html');
  }

  function close() {
    dialog.close();
    onclose();
  }

  const mark = (review: SubmissionReview, id: string) => (review.ok ? review.marks.find((m) => m.id === id) : undefined);
  const selectedReview = $derived(selected ? (reviews.find((r) => r.ok && r.name === selected!.file) as Ok | undefined) : undefined);
  const selectedGoal = $derived(selected?.goal ? selectedReview?.tasks.goals.find((g) => g.id === selected!.goal) : undefined);
  const selectedMark = $derived(selectedReview && selected?.goal ? selectedReview.marks.find((m) => m.id === selected!.goal) : undefined);

  function correction(file: string) {
    corrections[file] ??= {};
    return corrections[file]!;
  }
  function setPoints(file: string, goal: string, value: string) {
    const c = correction(file);
    const v = value.trim() === '' ? NaN : Number(value.replace(',', '.'));
    c.points ??= {};
    if (Number.isNaN(v)) delete c.points[goal];
    else c.points[goal] = v;
  }
  function setNote(file: string, goal: string, value: string) {
    const c = correction(file);
    c.notes ??= {};
    if (value.trim()) c.notes[goal] = value;
    else delete c.notes[goal];
  }
  const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
</script>

<dialog bind:this={dialog} class="admin-look" aria-labelledby="review-title" onclose={onclose}>
  <header class="head">
    <div>
      <h2 id="review-title">{t('review.title')}</h2>
      <p class="muted">
        {#if key}{t('review.helpKey', { title: key.title, n: key.variants.length })}{:else if editor.tasks}{t('review.helpTask', { title: editor.tasks.title })}{/if}
        {t('review.help')}
      </p>
    </div>
    <button class="quiet close" onclick={close} aria-label={t('review.close')}><Icon name="close" size={18} /></button>
  </header>
  <div class="body">
  <div class="toolbar">
    <label class="choose">
      <span class="button"><Icon name="plus" size={16} />{t('review.choose')}</span>
      <input type="file" accept=".json,application/json" multiple onchange={choose} class="visually-hidden" />
    </label>
    <button onclick={loadKey}><Icon name="key" size={16} />{key ? t('review.keyOther') : t('review.loadKey')}</button>
    {#if key}<button class="quiet" onclick={() => ((key = null), texts.length && evaluate())}>{t('review.keyRemove')}</button>{/if}
    <button onclick={loadCorrections}><Icon name="download" size={16} />{t('review.loadCorrections')}</button>
  </div>
  <details class="names">
    <summary>{t('review.names')}{names.size ? ` (${names.size})` : ''}</summary>
    <p class="muted">{t('review.namesHint')}</p>
    <textarea bind:value={nameText} rows="4" placeholder={t('review.namesPlaceholder')} spellcheck="false" autocomplete="off"></textarea>
  </details>

  {#if running}
    <p role="status">{t('review.running', { n: running })} <progress max={total} value={total - running}></progress></p>
  {:else if reviews.length === 0}
    <p class="muted">{t('review.empty')}</p>
  {:else if !columns}
    <p class="error">{t('error.noTasks')}</p>
  {:else}
    {#if summary}
      <section class="figures" aria-label={t('review.summary')}>
        <div class="fig"><span class="fignum">{summary.total}</span><span class="lbl">{t('review.sumTotal')}</span></div>
        {#if summary.average !== null}
          <div class="fig"><span class="fignum">{summary.average.toFixed(2)}</span><span class="lbl">{t('review.sumAverage')}</span></div>
          <div class="fig"><span class="fignum ok">{summary.pass}</span><span class="lbl">{t('review.sumPass')}</span></div>
          <div class="fig"><span class="fignum bad">{summary.below}</span><span class="lbl">{t('review.sumBelow')}</span></div>
        {/if}
        {#if summary.failed}<div class="fig"><span class="fignum bad">{summary.failed}</span><span class="lbl">{t('review.sumError')}</span></div>{/if}
      </section>
    {/if}
    {#if similar.length}
      <p class="alert-box" role="alert">{t('review.similar', { n: similar.length })}</p>
    {/if}
    <div class="scroller">
      <table>
        <thead>
          <tr>
            <th scope="col">{t('review.file')}</th>
            {#if key}<th scope="col">{t('exam.seatWord')}</th>{/if}
            <th scope="col" class="num">{t('review.score')}</th>
            {#if withPoints}<th scope="col" class="num">{t('review.points')}</th>{/if}
            {#if columns.grading}<th scope="col" class="num">{t('review.grade')}</th>{/if}
            {#each columns.goals as goal, i (goal.id)}
              <th scope="col" class="goal" class:col={activeColumn === goal.id} title={goal.text}><button class="link" onclick={() => showGoal(goal.id)} aria-label={t('review.showGoal', { n: i + 1 })}>{i + 1}</button></th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each reviews as review, i (i)}
            {@const c = corrections[review.name]}
            <tr class:similar={similarTo(review.name).length > 0}>
              <th scope="row">
                <button class="link" onclick={() => (selected = { file: review.name, goal: null })} disabled={!review.ok} title={t('review.commentHint')}>{review.name}</button>
                {#if person(review.name)}<span class="person">{person(review.name)}</span>{/if}
                {#if c?.comment}<span class="pill" title={c.comment}>{t('review.hasComment')}</span>{/if}
                {#if similarTo(review.name).length}<span class="pill warn" title={t('review.similarTo', { list: similarTo(review.name).join(', ') })}>{t('review.similarShort')}</span>{/if}
                {#if review.ok && review.ownTasks && review.tasks.title !== columns.title}
                  <span class="muted">({t('review.ownTasks')})</span>
                {/if}
              </th>
              {#if review.ok}
                {@const score = correctedScore(review, c)}
                {#if key}<td>{review.variant ?? ''}</td>{/if}
                <td class="num">{review.passed}/{review.assessable}</td>
                {#if withPoints}<td class="num">{fmt(score.points)}/{score.max}</td>{/if}
                {#if columns.grading}<td class="num"><span class="grade" class:low={(score.grade ?? 1) < 4}>{(score.grade ?? 1).toFixed(1)}</span></td>{/if}
                {#each columns.goals as goal (goal.id)}
                  {@const m = mark(review, goal.id)}
                  {@const own = c?.points?.[goal.id] !== undefined}
                  {@const p = goalPoints(review, goal.id, c)}
                  {@const g = review.tasks.goals.find((x) => x.id === goal.id)}
                  <td
                    class="goal"
                    class:passed={p !== null && g && p >= pointsOf(g)}
                    class:partial={p !== null && g && p > 0 && p < pointsOf(g)}
                    class:failed={p === 0 && !(m && !m.skipped && m.manual && !own)}
                    class:manual={m && !m.skipped && m.manual && !own}
                    class:sel={selected?.file === review.name && selected.goal === goal.id}
                    class:col={activeColumn === goal.id}
                  >
                    <button
                      class="cell"
                      onclick={() => ((selected = { file: review.name, goal: goal.id }), showGoal(goal.id))}
                      title={m?.skipped ? t('review.skipped') : m && !m.passed && m.reason ? t(`tasks.reason.${m.reason.code}`, m.reason.params) : (g?.text ?? goal.text)}
                    >
                      {#if !m}{''}{:else if m.skipped}–{:else if m.manual && !own}✎{:else if withPoints && g}{fmt(p ?? 0)}{:else}{m.passed ? '✓' : '✗'}{/if}{own || c?.notes?.[goal.id] ? '*' : ''}
                    </button>
                  </td>
                {/each}
              {:else}
                <td colspan={columns.goals.length + 1 + (key ? 1 : 0) + (withPoints ? 1 : 0) + (columns.grading ? 1 : 0)} class="error">{review.error.code === 'otherExam' || review.error.code === 'noVariant' ? t(`review.error.${review.error.code}`) : errorText(review.error)}</td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if selected && selectedReview}
      <div class="editor" aria-label={t('review.correct')}>
        <strong>{selectedReview.name}</strong>
        {#if selectedGoal && selected.goal}
          {@const goalId = selected.goal}
          <span>– {selectedGoal.text} ({t('tasks.points', { n: pointsOf(selectedGoal) })})</span>
          {#if selectedMark && !selectedMark.skipped && !selectedMark.passed && selectedMark.reason}<p class="muted">{t(`tasks.reason.${selectedMark.reason.code}`, selectedMark.reason.params)}</p>{/if}
          <div class="fields">
            <label>{t('review.ownPoints')}<input value={corrections[selectedReview.name]?.points?.[goalId] ?? ''} placeholder={fmt(goalPoints(selectedReview, goalId) ?? 0)} inputmode="decimal" onchange={(e) => setPoints(selectedReview.name, goalId, e.currentTarget.value)} /></label>
            <label class="grow">{t('review.note')}<input value={corrections[selectedReview.name]?.notes?.[goalId] ?? ''} onchange={(e) => setNote(selectedReview.name, goalId, e.currentTarget.value)} /></label>
          </div>
        {:else}
          <label class="block">{t('review.report.comment')}<textarea value={corrections[selectedReview.name]?.comment ?? ''} onchange={(e) => (correction(selectedReview.name).comment = e.currentTarget.value)}></textarea></label>
        {/if}
      </div>
    {/if}

    <ol class="legend muted" bind:this={legend}>
      {#each columns.goals as goal (goal.id)}
        <li class:active={activeColumn === goal.id}><span>{goal.section ? `${goal.section}: ` : ''}{goal.text}{#if withPoints}<span class="pts">{t('tasks.points', { n: goal.points ?? 1 })}</span>{/if}</span></li>
      {/each}
    </ol>
  {/if}

  </div>
  <footer class="actions">
    <button onclick={saveCorrections} disabled={reviews.length === 0}>{t('review.saveCorrections')}</button>
    <span class="spacer"></span>
    <button onclick={saveReports} disabled={!columns || reviews.length === 0 || running > 0}><Icon name="book" size={16} />{t('review.reports')}</button>
    <button class="primary" onclick={saveCsv} disabled={!columns || reviews.length === 0 || running > 0}><Icon name="download" size={16} />{t('review.csv')}</button>
  </footer>
</dialog>

<style>
  dialog {
    width: min(1240px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    padding: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--bg);
    color: var(--text);
    box-shadow: 0 24px 60px -20px rgb(15 23 42 / 0.45);
  }
  dialog:not([open]) {
    display: none;
  }
  dialog::backdrop {
    background: rgb(15 23 42 / 0.45);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    padding: 20px 24px 14px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .head h2 {
    margin: 0 0 4px;
    font-size: 1.35rem;
  }
  .head p {
    margin: 0;
    max-width: 90ch;
  }
  .close {
    min-width: 34px;
    padding: 0 8px;
  }
  .body {
    padding: 18px 24px;
    overflow: auto;
    flex: 1;
  }
  .toolbar {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: 12px;
  }
  .choose .button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 34px;
    padding: 0 14px;
    border-radius: var(--a-radius-s);
    background: var(--accent);
    color: var(--on-accent);
    font-size: 0.88rem;
    font-weight: 520;
    cursor: pointer;
  }
  .choose:focus-within .button {
    outline: 3px solid var(--focus);
  }
  .names {
    font-size: 0.9rem;
  }
  .names textarea {
    width: 100%;
    margin-top: 6px;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  .figures {
    display: flex;
    flex-wrap: wrap;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--a-radius);
    margin-bottom: 12px;
  }
  .fig {
    display: flex;
    flex-direction: column;
    padding: 12px 22px;
    border-left: 1px solid var(--a-line);
  }
  .fig:first-child {
    border-left: none;
  }
  .fignum {
    font-size: 1.5rem;
    font-weight: 650;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .fignum.ok {
    color: var(--a-ok);
  }
  .fignum.bad {
    color: var(--a-alert);
  }
  .lbl {
    font-size: 0.82rem;
    color: var(--muted);
  }
  .alert-box {
    padding: 10px 14px;
    border-radius: var(--a-radius-s);
    background: var(--a-warn-soft);
    color: var(--a-warn);
    font-weight: 550;
  }
  .scroller {
    max-height: 52vh;
    overflow: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--a-radius);
  }
  table {
    border: none;
    border-radius: 0;
    margin: 0;
    overflow: visible;
    font-size: 0.86rem;
  }
  th,
  td {
    white-space: nowrap;
    padding: 8px 10px;
  }
  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
  }
  tbody th {
    text-align: left;
    font-weight: 550;
    border-bottom: 1px solid var(--a-line);
    background: var(--surface);
  }
  tbody tr:hover th {
    background: var(--hover);
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  th.goal {
    text-align: center;
    padding: 6px 4px;
  }
  th.goal .link {
    display: inline-grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    text-decoration: none;
    font-weight: 600;
  }
  th.goal .link:hover {
    background: var(--hover);
  }
  th.goal.col .link {
    background: var(--accent);
    color: var(--on-accent);
  }
  th.goal.col {
    background: color-mix(in srgb, var(--accent) 14%, var(--surface-2));
  }
  td.goal {
    padding: 4px 3px;
    text-align: center;
  }
  .cell {
    display: inline-grid;
    place-items: center;
    min-width: 30px;
    min-height: 26px;
    padding: 0 4px;
    border: 0;
    border-radius: 6px;
    background: var(--surface-2);
    color: var(--muted);
    font: inherit;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  .passed .cell {
    background: var(--a-ok-soft);
    color: var(--a-ok);
  }
  .partial .cell {
    background: var(--a-warn-soft);
    color: var(--a-warn);
  }
  .failed .cell {
    background: var(--a-alert-soft);
    color: var(--a-alert);
  }
  .manual .cell {
    background: transparent;
    border: 1px dashed var(--border);
  }
  .sel .cell {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }
  td.col {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .grade {
    display: inline-block;
    min-width: 38px;
    padding: 2px 8px;
    border-radius: 999px;
    text-align: center;
    font-weight: 650;
    background: var(--a-ok-soft);
    color: var(--a-ok);
  }
  .grade.low {
    background: var(--a-alert-soft);
    color: var(--a-alert);
  }
  .error {
    color: var(--a-alert);
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    min-height: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    text-decoration: underline dotted;
  }
  tr.similar th {
    background: var(--a-warn-soft);
  }
  .person {
    margin-left: 6px;
    font-weight: 650;
  }
  tbody th .pill {
    margin-left: 6px;
  }
  .editor {
    margin-top: 12px;
    padding: 12px 16px;
    background: var(--surface);
    border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
    border-radius: var(--a-radius);
    font-size: 0.9rem;
  }
  .editor p {
    margin: 6px 0;
  }
  .fields {
    display: flex;
    gap: 12px;
    margin-top: 8px;
  }
  .fields label,
  .block {
    display: grid;
    gap: 4px;
    font-size: 0.82rem;
    color: var(--muted);
  }
  .fields input {
    width: 8em;
  }
  .fields .grow {
    flex: 1;
  }
  .fields .grow input {
    width: 100%;
  }
  .block textarea {
    width: 100%;
    min-height: 5em;
  }
  .legend {
    margin: 14px 0 0;
    padding: 0;
    list-style: none;
    counter-reset: goal;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 4px 18px;
    font-size: 0.84rem;
  }
  .legend li {
    counter-increment: goal;
    display: flex;
    gap: 8px;
    padding: 4px 6px;
    border-radius: 6px;
  }
  .legend li::before {
    content: counter(goal);
    flex: none;
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--text);
    font-size: 0.75rem;
    font-weight: 650;
  }
  .pts {
    margin-left: 6px;
    color: var(--muted);
    white-space: nowrap;
  }
  .legend li.active {
    color: var(--text);
    background: var(--selected-soft);
  }
  .legend li.active::before {
    background: var(--accent);
    color: var(--on-accent);
  }
  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 14px 24px;
    background: var(--surface);
    border-top: 1px solid var(--border);
  }
  .spacer {
    flex: 1;
  }
</style>
