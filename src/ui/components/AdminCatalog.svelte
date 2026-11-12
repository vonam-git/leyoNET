<script lang="ts">
  import { t } from '../../i18n';
  import { CATALOG } from '../catalog';
  import type { CatalogVisibility } from '../state/session.svelte';

  /**
   * Aufgaben ein- und ausblenden (Webversion): ganze Reihen (Module), einzelne Übungen und die
   * Verbund-Aufgaben. Global (Hauptadmin, Einstellungen) oder je Klasse (Lehrperson).
   */
  let { value, onchange, scope }: { value: CatalogVisibility; onchange: (v: CatalogVisibility) => void; scope: 'global' | 'class' } = $props();

  const groups = (() => {
    const byKey = new Map<string, { id: string; title: string; stars: number; verbund: boolean }[]>();
    for (const e of CATALOG) {
      const key = e.verbund ? '#verbund' : (e.series ?? '');
      const list = byKey.get(key) ?? [];
      list.push({ id: e.id, title: e.build().tasks.title, stars: e.stars, verbund: !!e.verbund });
      byKey.set(key, list);
    }
    return [...byKey.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
  })();

  const seriesHidden = (s: string) => value.hiddenSeries.includes(s);
  const toggleSeries = (s: string, show: boolean) => onchange({ ...value, hiddenSeries: show ? value.hiddenSeries.filter((x) => x !== s) : [...value.hiddenSeries, s] });
  const toggleEntry = (id: string, show: boolean) => onchange({ ...value, hidden: show ? value.hidden.filter((x) => x !== id) : [...value.hidden, id] });
  const setAll = (ids: string[], show: boolean) => onchange({ ...value, hidden: show ? value.hidden.filter((x) => !ids.includes(x)) : [...new Set([...value.hidden, ...ids])] });
  const shownCount = $derived(CATALOG.filter((e) => !value.hidden.includes(e.id) && !(e.series && value.hiddenSeries.includes(e.series)) && (!e.verbund || value.verbund)).length);
</script>

<p class="muted">{t(scope === 'global' ? 'admin.catalog.hintGlobal' : 'admin.catalog.hintClass')} <strong>{t('admin.catalog.count', { n: shownCount, total: CATALOG.length })}</strong></p>
<label class="verbund"><input type="checkbox" checked={value.verbund} onchange={(e) => onchange({ ...value, verbund: e.currentTarget.checked })} /> 🌐 {t('admin.catalog.verbund')}</label>
{#each groups as [key, list] (key)}
  {@const isSeries = key !== '' && key !== '#verbund'}
  {@const off = isSeries && seriesHidden(key)}
  <details class="group" class:off>
    <summary>
      {#if isSeries}
        <input type="checkbox" checked={!off} onclick={(e) => e.stopPropagation()} onchange={(e) => toggleSeries(key, e.currentTarget.checked)} aria-label={t('admin.catalog.series', { id: key.toUpperCase() })} />
      {/if}
      <strong>{key === '' ? t('catalog.series.all') : key === '#verbund' ? t('admin.catalog.verbundGroup') : `${key.toUpperCase()} – ${t(`catalog.series.${key}`)}`}</strong>
      <span class="muted">({list.filter((x) => !value.hidden.includes(x.id)).length}/{list.length})</span>
    </summary>
    <div class="row">
      <button type="button" class="small" onclick={() => setAll(list.map((x) => x.id), true)}>{t('admin.catalog.showAll')}</button>
      <button type="button" class="small" onclick={() => setAll(list.map((x) => x.id), false)}>{t('admin.catalog.hideAll')}</button>
    </div>
    <ul>
      {#each list as x (x.id)}
        <li>
          <label>
            <input type="checkbox" checked={!value.hidden.includes(x.id)} disabled={off || (x.verbund && !value.verbund)} onchange={(e) => toggleEntry(x.id, e.currentTarget.checked)} />
            {x.title} <span class="stars" aria-label={t('catalog.stars', { n: x.stars })}>{'★'.repeat(x.stars)}</span>
          </label>
        </li>
      {/each}
    </ul>
  </details>
{/each}

<style>
  .muted {
    color: var(--muted);
    font-size: 0.82rem;
  }
  .verbund {
    display: flex;
    gap: 6px;
    align-items: center;
    margin: 6px 0 10px;
  }
  .group {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 10px;
    margin: 4px 0;
  }
  .group.off summary strong {
    text-decoration: line-through;
    color: var(--muted);
  }
  summary {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 4px 0;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 4px 0 8px;
    columns: 2 260px;
  }
  li {
    break-inside: avoid;
    font-size: 0.85rem;
    padding: 1px 0;
  }
  .stars {
    color: #eab308;
    font-size: 0.7rem;
  }
  .row {
    display: flex;
    gap: 6px;
  }
  .small {
    font-size: 0.75rem;
    padding: 1px 8px;
  }
</style>
