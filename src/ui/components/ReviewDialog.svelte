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

<dialog bind:this={dialog} aria-labelledby="review-title" onclose={onclose}>
  <h2 id="review-title">{t('review.title')}</h2>
  <p class="muted">
    {#if key}{t('review.helpKey', { title: key.title, n: key.variants.length })}{:else if editor.tasks}{t('review.helpTask', { title: editor.tasks.title })}{/if}
    {t('review.help')}
  </p>
  <div class="toolbar">
    <label class="choose">
      <span class="button">{t('review.choose')}</span>
      <input type="file" accept=".json,application/json" multiple onchange={choose} class="visually-hidden" />
    </label>
    <button onclick={loadKey}>🔑 {key ? t('review.keyOther') : t('review.loadKey')}</button>
    {#if key}<button onclick={() => ((key = null), texts.length && evaluate())}>{t('review.keyRemove')}</button>{/if}
    <button onclick={loadCorrections}>{t('review.loadCorrections')}</button>
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
    {#if similar.length}
      <p class="warn" role="alert">⚠ {t('review.similar', { n: similar.length })}</p>
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
              <th scope="col" class="goal" title={goal.text}>{i + 1}</th>
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
                {#if c?.comment}<span title={c.comment}>💬</span>{/if}
                {#if similarTo(review.name).length}<span class="warn" title={t('review.similarTo', { list: similarTo(review.name).join(', ') })}>⚠</span>{/if}
                {#if review.ok && review.ownTasks && review.tasks.title !== columns.title}
                  <span class="muted">({t('review.ownTasks')})</span>
                {/if}
              </th>
              {#if review.ok}
                {@const score = correctedScore(review, c)}
                {#if key}<td>{review.variant ?? ''}</td>{/if}
                <td class="num">{review.passed}/{review.assessable}</td>
                {#if withPoints}<td class="num">{fmt(score.points)}/{score.max}</td>{/if}
                {#if columns.grading}<td class="num grade">{(score.grade ?? 1).toFixed(1)}</td>{/if}
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
                  >
                    <button
                      class="cell"
                      onclick={() => (selected = { file: review.name, goal: goal.id })}
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

    <ol class="legend muted">
      {#each columns.goals as goal (goal.id)}
        <li>{goal.section ? `${goal.section}: ` : ''}{goal.text}{#if withPoints} ({t('tasks.points', { n: goal.points ?? 1 })}){/if}</li>
      {/each}
    </ol>
  {/if}

  <div class="actions">
    <button class="primary" onclick={saveCsv} disabled={!columns || reviews.length === 0 || running > 0}>{t('review.csv')}</button>
    <button onclick={saveReports} disabled={!columns || reviews.length === 0 || running > 0}>{t('review.reports')}</button>
    <button onclick={saveCorrections} disabled={reviews.length === 0}>{t('review.saveCorrections')}</button>
    <button onclick={close}>{t('review.close')}</button>
  </div>
</dialog>

<style>
  dialog {
    width: min(1100px, calc(100vw - 32px));
    max-height: calc(100vh - 64px);
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.3);
  }
  dialog::backdrop {
    background: rgba(15, 23, 42, 0.4);
  }
  h2 {
    margin: 0 0 6px;
    font-size: 1rem;
  }
  .choose .button {
    display: inline-block;
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface-2);
    cursor: pointer;
  }
  .choose:focus-within .button {
    outline: 2px solid var(--focus);
  }
  .scroller {
    margin-top: 10px;
    max-height: 50vh;
    overflow: auto;
  }
  table {
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  th,
  td {
    padding: 3px 8px;
    border-bottom: 1px solid var(--border);
    text-align: left;
    white-space: nowrap;
  }
  thead th {
    position: sticky;
    top: 0;
    background: var(--surface-2);
  }
  tbody th {
    font-weight: 500;
  }
  .num,
  .goal {
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .passed {
    color: var(--distribution);
    font-weight: 700;
  }
  .failed,
  .error {
    color: var(--danger);
  }
  .toolbar {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
  .cell {
    border: 0;
    background: none;
    padding: 0 2px;
    min-width: 1.6em;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    text-decoration: underline dotted;
  }
  .partial {
    color: #b45309;
    font-weight: 600;
  }
  .manual {
    color: var(--muted);
  }
  .sel {
    outline: 2px solid var(--focus);
  }
  .warn {
    color: #b45309;
  }
  tr.similar th {
    background: color-mix(in srgb, #f59e0b 12%, var(--surface));
  }
  .editor {
    margin-top: 8px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-2);
    font-size: 0.85rem;
  }
  .editor p {
    margin: 4px 0;
  }
  .fields {
    display: flex;
    gap: 8px;
    margin-top: 6px;
  }
  .fields label,
  .block {
    display: grid;
    gap: 2px;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .fields input {
    width: 7em;
  }
  .fields .grow {
    flex: 1;
  }
  .fields .grow input {
    width: 100%;
  }
  .block textarea {
    width: 100%;
    min-height: 4em;
  }
  .names {
    margin-top: 6px;
    font-size: 0.85rem;
  }
  .names textarea {
    width: 100%;
    font-family: ui-monospace, Consolas, monospace;
  }
  .person {
    margin-left: 4px;
    font-weight: 600;
  }
  .legend {
    font-size: 0.75rem;
    margin: 8px 0 0;
    padding-left: 1.6em;
  }
  .actions {
    display: flex;
    gap: 6px;
    margin-top: 10px;
  }
  .primary {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
  }
</style>
