<script lang="ts">
  import { usedFeatures } from '../features';
  import { t } from '../../i18n';
  import { CATALOG, type CatalogEntry } from '../catalog';
  import { editor } from '../state/editor.svelte';
  import { progress } from '../state/progress.svelte';
  import { ui } from '../state/ui.svelte';
  import Modal from './Modal.svelte';
  import Stars from './Stars.svelte';

  /** Aufgaben-Katalog: vorbereitete Aufgaben mit 1 bis 5 Sternen. */
  let { onclose }: { onclose: () => void } = $props();

  // Texte erst beim Öffnen erzeugen (aktuelle Sprache).
  const entries = $derived(CATALOG.map((entry) => ({ entry, preview: entry.build() })));
  /** Reihen (Module wie M117, M129) als Reiter; leer = alle Übungen. Neue Module erscheinen von selbst. */
  const SERIES = [...new Set(CATALOG.flatMap((e) => (e.series ? [e.series] : [])))].sort();
  let series = $state('');
  const inSeries = (id: string) => (id ? entries.filter((e) => e.entry.series === id) : entries);
  const doneIn = (id: string) => inSeries(id).filter((e) => progress.done[e.entry.id]).length;

  /** Reiter mit den Pfeiltasten wechseln (wie bei einer Tab-Leiste üblich). */
  function keyNav(event: KeyboardEvent) {
    const ids = ['', ...SERIES];
    const i = ids.indexOf(series);
    const next = event.key === 'ArrowRight' ? i + 1 : event.key === 'ArrowLeft' ? i - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : -2;
    if (next === -2) return;
    event.preventDefault();
    series = ids[(next + ids.length) % ids.length]!;
    (event.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-series="${series}"]`)?.focus();
  }
  const shown = $derived(series ? entries.filter((e) => e.entry.series === series) : entries);
  const doneCount = $derived(shown.filter((e) => progress.done[e.entry.id]).length);
  const when = (ms: number) => new Date(ms).toLocaleDateString();

  function resetProgress() {
    if (confirm(t('catalog.resetConfirm'))) progress.reset();
  }

  function start(entry: CatalogEntry) {
    const { topology, tasks } = entry.build();
    editor.setMode('design');
    editor.replace(topology, { undoable: true, tasks, snapshots: [] });
    ui.ensure([...(entry.features ?? []), ...usedFeatures(topology)]);
    editor.notify(t('catalog.started', { title: tasks.title }));
    onclose();
  }
</script>

<Modal title={t('catalog.title')} {onclose} width={760}>
  <p class="muted">{t('catalog.intro')}</p>
  {#if SERIES.length}
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div class="tabs" role="tablist" aria-label={t('catalog.series.label')} onkeydown={keyNav}>
      {#each ['', ...SERIES] as id (id)}
        {@const total = inSeries(id).length}
        {@const done = doneIn(id)}
        <button
          type="button"
          role="tab"
          data-series={id}
          aria-selected={series === id}
          tabindex={series === id ? 0 : -1}
          class:active={series === id}
          title={id ? t(`catalog.series.${id}`) : t('catalog.series.all')}
          onclick={() => (series = id)}
        >
          <span class="tab-name">{id ? id.toUpperCase() : t('catalog.series.allShort')}</span>
          <span class="tab-count" class:complete={total > 0 && done === total}>{done}/{total}</span>
        </button>
      {/each}
    </div>
    <p class="series-title">{series ? t(`catalog.series.${series}`) : t('catalog.series.all')}</p>
  {/if}
  <div class="progress">
    <span>{t('catalog.progress', { n: doneCount, total: shown.length })}</span>
    <progress max={shown.length} value={doneCount}></progress>
    {#if Object.keys(progress.done).length}<button class="link" onclick={resetProgress}>{t('catalog.reset')}</button>{/if}
  </div>
  <ul>
    {#each shown as { entry, preview } (entry.id)}
      {@const locked = (entry.features ?? []).some((f: string) => !ui.permitted(f))}
      {@const done = progress.done[entry.id]}
      <li class:done={!!done}>
        <div class="stars"><Stars n={entry.stars} /></div>
        <div class="text">
          <strong>{preview.tasks.title}</strong>
          {#if entry.level}<span class="badge">{t('catalog.level', { level: entry.level })}</span>{/if}
          {#if done}<span class="done-badge" title={t('catalog.doneAt', { date: when(done) })}>✓ {t('catalog.done')}</span>{/if}
          <p class="muted">{preview.tasks.description}</p>
          <span class="muted small">{t('catalog.goals', { n: preview.tasks.goals.length })}{#if entry.sheet} · {t('catalog.sheet', { name: entry.sheet })}{/if}</span>
        </div>
        <button onclick={() => start(entry)} disabled={locked} title={locked ? t('catalog.proLocked') : undefined}>{done ? t('catalog.again') : t('catalog.start')}</button>
      </li>
    {/each}
  </ul>
</Modal>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
    max-height: 62vh;
    overflow: auto;
  }
  li {
    display: grid;
    grid-template-columns: 6.5rem minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  li.done {
    border-color: color-mix(in srgb, #16a34a 55%, var(--border));
    background: color-mix(in srgb, #16a34a 7%, var(--surface));
  }
  .done-badge {
    white-space: nowrap;
    margin-left: 6px;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: 999px;
    background: #15803d;
    color: #fff;
  }
  .progress {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 10px;
    font-size: 0.85rem;
  }
  .progress progress {
    flex: 1;
    max-width: 220px;
    accent-color: #16a34a;
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    color: var(--muted);
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
  }
  .text p {
    margin: 4px 0;
    font-size: 0.82rem;
  }
  .tabs {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    padding: 4px;
    margin: 0 0 6px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--text) 6%, var(--surface));
  }
  .tabs button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }
  .tabs button:hover {
    color: var(--text);
    background: color-mix(in srgb, var(--text) 5%, transparent);
  }
  .tabs button.active {
    color: var(--text);
    background: var(--surface);
    border-color: var(--border);
    box-shadow: 0 1px 3px color-mix(in srgb, #000 12%, transparent);
  }
  .tabs button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .tab-count {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text) 10%, transparent);
    font-variant-numeric: tabular-nums;
  }
  .active .tab-count {
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent);
  }
  .tab-count.complete {
    background: #15803d;
    color: #fff;
  }
  .series-title {
    margin: 0 0 10px 4px;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .small {
    font-size: 0.75rem;
  }
  .badge {
    white-space: nowrap;
    margin-left: 6px;
    font-size: 0.7rem;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--text);
    color: var(--surface);
  }
</style>
