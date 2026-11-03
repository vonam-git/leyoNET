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
  /** Reihen (z.B. Modul 117) als Filter; leer = alle Übungen. */
  const SERIES = [...new Set(CATALOG.flatMap((e) => (e.series ? [e.series] : [])))];
  let series = $state('');
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
    <div class="series" role="radiogroup" aria-label={t('catalog.series.label')}>
      <label><input type="radio" name="series" value="" bind:group={series} /> {t('catalog.series.all')}</label>
      {#each SERIES as id (id)}<label><input type="radio" name="series" value={id} bind:group={series} /> {t(`catalog.series.${id}`)}</label>{/each}
    </div>
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
  .series {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    margin: 0 0 10px;
    font-size: 0.85rem;
  }
  .series label {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .series input {
    width: auto;
  }
  .small {
    font-size: 0.75rem;
  }
  .badge {
    margin-left: 6px;
    font-size: 0.7rem;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--text);
    color: var(--surface);
  }
</style>
