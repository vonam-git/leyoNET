<script lang="ts">
  import { emptyTopology, serializeProject, type TagColor } from '../../core';
  import { t } from '../../i18n';
  import { EXAM_PRESETS, EXAM_POINTS, buildExamSolution, buildExamTasks, checkExamSpec, examSheetHtml, parseFixed, randomExam, siteFacts, type ExamSpec } from '../exam';
  import { usedFeatures } from '../features';
  import { downloadText } from '../persist/files';
  import { editor } from '../state/editor.svelte';
  import { ui } from '../state/ui.svelte';
  import Modal from './Modal.svelte';

  /**
   * Für Lehrpersonen: Prüfung «Firmennetz mit drei Standorten» erstellen.
   * Eine der fünf Varianten wählen oder würfeln, Werte anpassen, dann die
   * Prüfungsdatei (für die Lernenden), die Musterlösung und das Aufgabenblatt
   * speichern. «Laden» öffnet die Prüfung zum Weiterbearbeiten im Aufgabeneditor.
   */
  let { onclose }: { onclose: () => void } = $props();

  const COLORS: TagColor[] = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'gray'];
  type Draft = Omit<ExamSpec, 'sites'> & { sites: (Omit<ExamSpec['sites'][number], 'fixed'> & { fixed: string })[] };

  const toDraft = (spec: ExamSpec): Draft => ({ ...structuredClone(spec), sites: spec.sites.map((s) => ({ ...s, fixed: s.fixed.join(', ') })) });
  const fromDraft = (d: Draft): ExamSpec => ({
    ...d,
    id: d.id.trim() || 'Z',
    company: d.company.trim(),
    sites: d.sites.map((s) => ({ ...s, name: s.name.trim(), dynamic: Number(s.dynamic), fixed: parseFixed(s.fixed) })) as ExamSpec['sites'],
    transfers: d.transfers.map((x) => x.trim()) as ExamSpec['transfers'],
    intranet: { ...d.intranet, domain: d.intranet.domain.trim().toLowerCase() },
  });

  let preset = $state('A');
  let draft = $state<Draft>(toDraft(EXAM_PRESETS[0]!));
  const spec = $derived(fromDraft($state.snapshot(draft) as Draft));
  const issue = $derived(checkExamSpec(spec));
  const issueText = $derived(issue ? t(`exam.issue.${issue.code}`, issue.params ?? {}) : null);
  const facts = $derived(issue ? null : spec.sites.map(siteFacts));

  function choose(id: string) {
    preset = id;
    const found = EXAM_PRESETS.find((p) => p.id === id);
    if (found) draft = toDraft(found);
  }

  function shuffle() {
    preset = '';
    draft = toDraft(randomExam(Math.floor(Math.random() * 1e9), 'Z'));
  }

  const base = () => `M117_LB3_${spec.id.replace(/[^\w-]+/g, '')}`;

  function saveExam() {
    if (issue) return;
    downloadText(`${base()}.json`, serializeProject(emptyTopology(), buildExamTasks(spec)) + '\n');
  }
  function saveSolution() {
    if (issue) return;
    downloadText(`${base()}_mL.json`, serializeProject(buildExamSolution(spec), buildExamTasks(spec)) + '\n');
  }
  function saveSheet() {
    if (issue) return;
    downloadText(`${base()}.html`, examSheetHtml(spec), 'text/html');
  }
  function open(withSolution: boolean) {
    if (issue) return;
    const solution = buildExamSolution(spec);
    editor.setMode('design');
    editor.replace(withSolution ? solution : emptyTopology(), { undoable: true, tasks: buildExamTasks(spec), snapshots: [] });
    ui.ensure(usedFeatures(solution));
    editor.notify(t('exam.opened', { title: buildExamTasks(spec).title }));
    onclose();
  }
  const invalid = (field: string) => issue?.field === field;
</script>

<Modal title={t('exam.dialogTitle')} {onclose} width={1000}>
  <p class="muted">{t('exam.dialogIntro', { total: EXAM_POINTS.total, site: EXAM_POINTS.site, services: EXAM_POINTS.services })}</p>

  <div class="row">
    <label>
      {t('exam.variant')}
      <select value={preset} onchange={(e) => choose(e.currentTarget.value)}>
        {#each EXAM_PRESETS as p (p.id)}<option value={p.id}>{p.id} – {p.company}</option>{/each}
        {#if !preset}<option value="">{t('exam.custom')}</option>{/if}
      </select>
    </label>
    <button onclick={shuffle}>🎲 {t('exam.shuffle')}</button>
    <label class="short">{t('exam.id')}<input bind:value={draft.id} maxlength="12" /></label>
    <label class="grow">{t('exam.company')}<input bind:value={draft.company} aria-invalid={invalid('company')} /></label>
  </div>

  <table>
    <thead>
      <tr>
        <th scope="col"></th>
        <th scope="col">{t('exam.col.name')}</th>
        <th scope="col">{t('exam.col.network')}</th>
        <th scope="col">{t('exam.col.range')}</th>
        <th scope="col">{t('exam.col.dynamic')}</th>
        <th scope="col">{t('exam.col.fixed')}</th>
        <th scope="col">{t('exam.col.color')}</th>
      </tr>
    </thead>
    <tbody>
      {#each draft.sites as site, i (i)}
        <tr>
          <th scope="row">{t(i === 0 ? 'exam.seatShort' : 'exam.branchShort', { n: i })}</th>
          <td><input bind:value={site.name} aria-label={t('exam.col.name')} aria-invalid={invalid(`sites.${i}.name`)} /></td>
          <td class="net"><input class="mono" bind:value={site.network} aria-label={t('exam.col.network')} aria-invalid={invalid(`sites.${i}.network`)} /></td>
          <td class="range">
            <input class="mono" bind:value={site.dhcpStart} aria-label={t('exam.col.rangeStart')} aria-invalid={invalid(`sites.${i}.dhcpStart`)} />
            <input class="mono" bind:value={site.dhcpEnd} aria-label={t('exam.col.rangeEnd')} aria-invalid={invalid(`sites.${i}.dhcpEnd`)} />
          </td>
          <td><input type="number" min="1" max="8" bind:value={site.dynamic} aria-label={t('exam.col.dynamic')} aria-invalid={invalid(`sites.${i}.dynamic`)} /></td>
          <td><input class="mono" bind:value={site.fixed} aria-label={t('exam.col.fixed')} aria-invalid={invalid(`sites.${i}.fixed`)} /></td>
          <td>
            <select bind:value={site.color} aria-label={t('exam.col.color')}>
              {#each COLORS as c (c)}<option value={c}>{t(`color.${c}`)}</option>{/each}
            </select>
          </td>
        </tr>
        {#if facts}
          <tr class="facts"><td></td><td colspan="6" class="muted mono">R {facts[i]!.router} · DHCP {facts[i]!.server} · {facts[i]!.mask} · {t('exam.doc.hosts')} {facts[i]!.hosts} · Broadcast {facts[i]!.broadcast}</td></tr>
        {/if}
      {/each}
    </tbody>
  </table>

  <div class="row">
    {#each draft.transfers as _, i (i)}
      <label>
        {t('exam.transfer', { n: i + 1 })}
        <input class="mono" bind:value={draft.transfers[i]} aria-invalid={invalid(`transfers.${i}`)} />
      </label>
    {/each}
  </div>
  <div class="row">
    <label>{t('exam.intranet')}<input class="mono" bind:value={draft.intranet.network} aria-invalid={invalid('intranet.network')} /></label>
    <label>{t('exam.web')}<input class="mono" bind:value={draft.intranet.web} aria-invalid={invalid('intranet.web')} /></label>
    <label class="grow">{t('exam.domain')}<input class="mono" bind:value={draft.intranet.domain} aria-invalid={invalid('intranet.domain')} /></label>
    <label>
      {t('exam.col.color')}
      <select bind:value={draft.intranet.color}>
        {#each COLORS as c (c)}<option value={c}>{t(`color.${c}`)}</option>{/each}
      </select>
    </label>
  </div>

  {#if issueText}<p class="error" role="alert">{issueText}</p>{:else}<p class="ok" role="status">✓ {t('exam.valid')}</p>{/if}
  <p class="muted">{t('exam.howto')}</p>

  {#snippet actions()}
    <button onclick={saveSheet} disabled={!!issue}>{t('exam.saveSheet')}</button>
    <button onclick={saveSolution} disabled={!!issue}>{t('exam.saveSolution')}</button>
    <button onclick={() => open(true)} disabled={!!issue}>{t('exam.openSolution')}</button>
    <button onclick={() => open(false)} disabled={!!issue}>{t('exam.open')}</button>
    <button class="primary" onclick={saveExam} disabled={!!issue}>{t('exam.saveExam')}</button>
  {/snippet}
</Modal>

<style>
  .row {
    display: flex;
    gap: 10px;
    align-items: end;
    flex-wrap: wrap;
    margin: 8px 0;
  }
  label {
    display: grid;
    gap: 2px;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .grow {
    flex: 1;
  }
  .short input {
    width: 5em;
  }
  input,
  select {
    font-size: 0.82rem;
    padding: 3px 6px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 5px;
    min-width: 0;
  }
  input[aria-invalid='true'] {
    border-color: var(--danger);
    outline: 1px solid var(--danger);
  }
  .mono {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  th,
  td {
    padding: 3px 4px;
    text-align: left;
  }
  th {
    color: var(--muted);
    font-weight: normal;
    white-space: nowrap;
  }
  td input {
    width: 100%;
  }
  td input[type='number'] {
    width: 4em;
  }
  .range {
    display: flex;
    gap: 3px;
  }
  .net input {
    min-width: 9.5em;
  }
  .range input {
    min-width: 8.5em;
  }
  .facts td {
    padding-top: 0;
    font-size: 0.72rem;
    border-bottom: 1px solid var(--border);
  }
  .muted {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .error {
    color: var(--danger);
    font-size: 0.85rem;
  }
  .ok {
    color: var(--distribution);
    font-size: 0.85rem;
  }
</style>
