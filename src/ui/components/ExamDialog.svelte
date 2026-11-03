<script lang="ts">
  import { emptyTopology, randomCode, randomExamId, type TagColor } from '../../core';
  import { t } from '../../i18n';
  import { downloadKeyFile, downloadLearnerFile, prepareExam, type BuiltExam } from '../examFiles';
  import { EXAM_POINTS, buildExamSolution, buildExamTasks, checkExamSpec, examSheetsHtml, parseFixed, randomExam, siteFacts, type ExamSpec } from '../exam';
  import { usedFeatures } from '../features';
  import { downloadText } from '../persist/files';
  import { editor } from '../state/editor.svelte';
  import { ui } from '../state/ui.svelte';
  import Modal from './Modal.svelte';

  /**
   * Für Lehrpersonen: Prüfung «Firmennetz mit drei Standorten» erstellen.
   * Eine Variante würfeln (Startwert) und von Hand anpassen, oder für jeden
   * Platz eine eigene Variante würfeln. «Erstellen» erzeugt die Prüfungsdatei
   * (ohne Prüfbausteine, mit Platzwahl) und den Schlüssel für die Auswertung.
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

  const newSeed = () => Math.floor(Math.random() * 1e6);
  const firstSeed = newSeed();
  let seed = $state(firstSeed);
  let seats = $state(1);
  let minutes = $state('80');
  let code = $state(randomCode());
  let draft = $state<Draft>(toDraft(randomExam(firstSeed, '1')));
  let seat = $state('01');
  let built = $state<BuiltExam | null>(null);
  let busy = $state(false);

  const seatId = (i: number) => String(i + 1).padStart(2, '0');
  /** Eine Variante (von Hand anpassbar) oder je Platz eine gewürfelte. */
  const specs = $derived.by((): ExamSpec[] => {
    if (seats <= 1) return [fromDraft($state.snapshot(draft) as Draft)];
    return Array.from({ length: Math.min(seats, 40) }, (_, i) => randomExam(seed + i * 104_729, seatId(i)));
  });
  const spec = $derived(specs[0]!);
  const issue = $derived(seats <= 1 ? checkExamSpec(spec) : null);
  const issueText = $derived(issue ? t(`exam.issue.${issue.code}`, issue.params ?? {}) : null);
  const facts = $derived(issue ? null : spec.sites.map(siteFacts));
  const title = $derived(seats <= 1 ? buildExamTasks(spec).title : t('exam.manyTitle', { n: specs.length }));

  $effect(() => {
    void [specs, minutes, code];
    built = null;
  });

  function shuffle() {
    seed = newSeed();
    draft = toDraft(randomExam(seed, '1'));
  }

  async function create() {
    if (issue) return;
    busy = true;
    try {
      const m = Number(minutes);
      built = await prepareExam({
        id: randomExamId(),
        title: seats <= 1 ? title : `M117_LB3 ${t('exam.manyTitle', { n: specs.length })}`,
        description: t('exam.chooseSeatText'),
        ...(Number.isInteger(m) && m > 0 ? { minutes: m } : {}),
        code: code.trim().toUpperCase() || randomCode(),
        variants: specs.map((s, i) => ({ id: seats <= 1 ? '1' : seatId(i), tasks: buildExamTasks(s), topology: emptyTopology() })),
      });
    } finally {
      busy = false;
    }
  }

  function saveSheets() {
    if (issue) return;
    downloadText(`M117_LB3_Aufgabenblaetter_${seed}.html`, examSheetsHtml(specs), 'text/html');
  }

  /** Musterlösung (für die Lehrperson) bzw. die Aufgabe zum Bearbeiten im Aufgabeneditor laden. */
  function open(withSolution: boolean) {
    if (issue) return;
    const chosen = seats <= 1 ? spec : (specs.find((s) => s.id === seat) ?? spec);
    const solution = buildExamSolution(chosen);
    editor.setMode('design');
    editor.replace(withSolution ? solution : emptyTopology(), { undoable: true, tasks: buildExamTasks(chosen), snapshots: [] });
    ui.ensure(usedFeatures(solution));
    editor.notify(t('exam.opened', { title: buildExamTasks(chosen).title }));
    onclose();
  }
  const invalid = (field: string) => issue?.field === field;
</script>

<Modal title={t('exam.dialogTitle')} {onclose} width={1000}>
  <p class="muted">{t('exam.dialogIntro', { total: EXAM_POINTS.total, site: EXAM_POINTS.site, services: EXAM_POINTS.services })}</p>

  <div class="row">
    <label class="short">{t('exam.seats')}<input type="number" min="1" max="40" bind:value={seats} /></label>
    <label class="short">{t('exam.seed')}<input type="number" bind:value={seed} onchange={() => (draft = toDraft(randomExam(seed, '1')))} /></label>
    <button onclick={shuffle}>🎲 {t('exam.shuffle')}</button>
    <label class="short">{t('exam.export.minutes')}<input bind:value={minutes} inputmode="numeric" /></label>
    <label class="short">{t('exam.export.code')}<input class="mono" bind:value={code} spellcheck="false" autocomplete="off" /></label>
    {#if seats <= 1}<label class="grow">{t('exam.company')}<input bind:value={draft.company} aria-invalid={invalid('company')} /></label>{/if}
  </div>

  {#if seats > 1}
    <p class="muted">{t('exam.seatsIntro', { n: specs.length })}</p>
    <table class="list">
      <thead><tr><th scope="col">{t('exam.seat')}</th><th scope="col">{t('exam.company')}</th>{#each [0, 1, 2] as i (i)}<th scope="col">{t(i === 0 ? 'exam.seatShort' : 'exam.branchShort', { n: i })}</th>{/each}</tr></thead>
      <tbody>
        {#each specs as s (s.id)}
          <tr><td>{s.id}</td><td>{s.company}</td>{#each s.sites as site (site.name)}<td class="mono">{site.name} {site.network}</td>{/each}</tr>
        {/each}
      </tbody>
    </table>
  {:else}
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

  {/if}

  {#if issueText}<p class="error" role="alert">{issueText}</p>{:else}<p class="ok" role="status">✓ {t('exam.valid')}</p>{/if}
  {#if built}
    <div class="done" role="status">
      <p>{t('exam.export.ready', { variants: built.key.variants.length, code: built.key.code })}</p>
      <p class="muted">{t('exam.export.keyWarning')}</p>
      <div class="buttons">
        <button class="primary" onclick={() => built && downloadLearnerFile(built)}>{t('exam.export.saveLearner')}</button>
        <button onclick={() => built && downloadKeyFile(built)}>{t('exam.export.saveKey')}</button>
      </div>
    </div>
  {/if}
  <p class="muted">{t('exam.howto')}</p>

  {#snippet actions()}
    {#if seats > 1}
      <select bind:value={seat} aria-label={t('exam.seat')}>{#each specs as s (s.id)}<option value={s.id}>{t('exam.mode.seat', { seat: s.id })}</option>{/each}</select>
    {/if}
    <button onclick={() => open(true)} disabled={!!issue}>{t('exam.openSolution')}</button>
    {#if seats <= 1}<button onclick={() => open(false)} disabled={!!issue}>{t('exam.open')}</button>{/if}
    <button onclick={saveSheets} disabled={!!issue}>{t('exam.saveSheet')}</button>
    <button class="primary" onclick={create} disabled={!!issue || busy}>{t('exam.export.create')}</button>
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
    width: 6em;
  }
  .list td {
    font-size: 0.78rem;
  }
  .done {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px;
    margin: 8px 0;
    background: color-mix(in srgb, #16a34a 8%, var(--surface));
  }
  .done p {
    margin: 4px 0;
  }
  .buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
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
