<script lang="ts">
  import { locale, t } from '../../i18n';
  import Icon from './Icon.svelte';

  /**
   * Admin-Konsole, Bereich «Website und Downloads» (nur Hauptadmin): Aufrufe von leyonet.ch,
   * Herkunft, Länder (aus der Zeitzone), Geräte, Klicks auf Downloads und die Zähler der
   * GitHub-Releases. Alles nur Tageszähler ohne Personenbezug (siehe server/sitestats.cjs).
   */
  let { call, version = 0 }: { call: <T>(method: string, path: string, body?: unknown) => Promise<T>; version?: number } = $props();

  interface Entry {
    key: string;
    value: number;
  }
  interface Day {
    day: string;
    views: number;
    visits: number;
    app: number;
    clicks: number;
  }
  interface Release {
    tag: string;
    published: string | null;
    prerelease: boolean;
    assets: { name: string; count: number; platform: string }[];
  }
  interface Downloads {
    disabled?: boolean;
    error?: string;
    repo?: string;
    fetched?: number;
    total?: number;
    platforms?: Record<string, number>;
    releases?: Release[];
    stale?: Downloads;
  }
  interface Report {
    days: number;
    from: string;
    to: string;
    totals: { views: number; visits: number; app: number; clicks: number };
    daily: Day[];
    top: { pages: Entry[]; referrers: Entry[]; countries: Entry[]; langs: Entry[]; devices: Entry[]; clicks: Entry[] };
    origins: string[];
    downloads: Downloads;
  }

  const RANGES = [7, 30, 90, 365];
  let range = $state(30);
  let data = $state<Report | null>(null);
  let failed = $state(false);
  let loading = $state(false);

  async function load() {
    loading = true;
    try {
      data = await call<Report>('GET', `website?days=${range}`);
      failed = false;
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void range;
    void version;
    void load();
    const timer = setInterval(() => void load(), 5 * 60_000);
    return () => clearInterval(timer);
  });

  const lang = $derived(locale() === 'en' ? 'en' : 'de');
  const num = (n: number) => n.toLocaleString(lang === 'en' ? 'en-GB' : 'de-CH');
  const regionNames = $derived.by(() => {
    try {
      return new Intl.DisplayNames([lang], { type: 'region' });
    } catch {
      return null;
    }
  });
  const languageNames = $derived.by(() => {
    try {
      return new Intl.DisplayNames([lang], { type: 'language' });
    } catch {
      return null;
    }
  });
  const CONTINENTS = ['Europe', 'America', 'Asia', 'Africa', 'Australia', 'Pacific', 'Atlantic', 'Indian', 'Antarctica'];

  function label(kind: keyof Report['top'], key: string): string {
    if (key === '~') return t('admin.web.other');
    if (key === '?') return t('admin.web.unknown');
    if (kind === 'referrers') return key === '-' ? t('admin.web.direct') : key;
    if (kind === 'countries') {
      if (CONTINENTS.includes(key)) return t(`admin.web.continent.${key}`);
      try {
        return regionNames?.of(key) ?? key;
      } catch {
        return key;
      }
    }
    if (kind === 'langs') {
      try {
        return languageNames?.of(key) ?? key;
      } catch {
        return key;
      }
    }
    if (kind === 'devices') return t(`admin.web.device.${key}`);
    if (kind === 'clicks') return t(`admin.web.click.${key}`);
    return key;
  }

  /** Kurzes Datum für die Achse («3.12.» bzw. «3 Dec»). */
  function short(day: string): string {
    const d = new Date(`${day}T12:00:00Z`);
    return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'de-CH', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  }

  // Säulen: bei mehr als 90 Tagen wochenweise zusammengefasst, damit sie lesbar bleiben.
  const bars = $derived.by(() => {
    if (!data) return [];
    const daily = data.daily;
    const size = daily.length > 90 ? 7 : 1;
    const out: { from: string; to: string; views: number; visits: number }[] = [];
    for (let i = 0; i < daily.length; i += size) {
      const chunk = daily.slice(i, i + size);
      out.push({ from: chunk[0]!.day, to: chunk[chunk.length - 1]!.day, views: chunk.reduce((a, d) => a + d.views, 0), visits: chunk.reduce((a, d) => a + d.visits, 0) });
    }
    return out;
  });
  const maxBar = $derived(Math.max(1, ...bars.map((b) => b.views)));
  const W = 720;
  const H = 180;
  const barW = $derived(bars.length ? W / bars.length : W);

  const downloads = $derived(data?.downloads.error ? data.downloads.stale : data?.downloads);
  const platformList = $derived(Object.entries(downloads?.platforms ?? {}).sort((a, b) => b[1] - a[1]));
  const when = (ms: number) => new Date(ms).toLocaleString(lang === 'en' ? 'en-GB' : 'de-CH', { dateStyle: 'short', timeStyle: 'short' });
  const tables: { kind: keyof Report['top']; title: string }[] = [
    { kind: 'pages', title: 'admin.web.pages' },
    { kind: 'referrers', title: 'admin.web.referrers' },
    { kind: 'countries', title: 'admin.web.countries' },
    { kind: 'clicks', title: 'admin.web.clicks' },
    { kind: 'langs', title: 'admin.web.langs' },
    { kind: 'devices', title: 'admin.web.devices' },
  ];
</script>

<div class="head">
  <div class="seg" role="group" aria-label={t('admin.web.range')}>
    {#each RANGES as r (r)}
      <button class:on={range === r} aria-pressed={range === r} disabled={loading && range !== r} onclick={() => (range = r)}>{t('admin.web.days', { n: r })}</button>
    {/each}
  </div>
</div>

{#if failed && !data}
  <p class="muted">{t('admin.loadFailed')}</p>
{:else if data}
  <section class="figures" aria-label={t('admin.web.summary')}>
    <div class="fig"><span class="num">{num(data.totals.views)}</span><span class="lbl">{t('admin.web.views')}</span></div>
    <div class="fig"><span class="num">{num(data.totals.visits)}</span><span class="lbl">{t('admin.web.visits')}</span></div>
    <div class="fig"><span class="num">{num(data.totals.app)}</span><span class="lbl">{t('admin.web.app')}</span></div>
    <div class="fig"><span class="num">{num(data.totals.clicks)}</span><span class="lbl">{t('admin.web.clicksTotal')}</span></div>
    <div class="fig"><span class="num">{downloads?.total !== undefined ? num(downloads.total) : '–'}</span><span class="lbl">{t('admin.web.github')}</span></div>
  </section>

  <section class="card">
    <h3>{t('admin.web.chart')}</h3>
    {#if data.totals.views === 0}
      <p class="muted">{t('admin.web.empty')}</p>
    {:else}
      <svg class="chart" viewBox="0 0 {W} {H + 22}" role="img" aria-label={t('admin.web.chartSummary', { views: num(data.totals.views), visits: num(data.totals.visits), from: short(data.from), to: short(data.to) })}>
        {#each [0.5, 1] as f (f)}
          <line x1="0" x2={W} y1={H - H * f} y2={H - H * f} class="grid" />
          <text x="2" y={H - H * f + 12} class="axis">{num(Math.round(maxBar * f))}</text>
        {/each}
        {#each bars as b, i (b.from)}
          {@const h = (H * b.views) / maxBar}
          {@const hv = (H * b.visits) / maxBar}
          <g>
            <title>{b.from === b.to ? short(b.from) : `${short(b.from)} – ${short(b.to)}`}: {t('admin.web.chartLabel', { views: num(b.views), visits: num(b.visits) })}</title>
            <rect x={i * barW + barW * 0.12} y={H - h} width={Math.max(1, barW * 0.76)} height={h} class="views" rx="2" />
            <rect x={i * barW + barW * 0.12} y={H - hv} width={Math.max(1, barW * 0.76)} height={hv} class="visits" rx="2" />
          </g>
        {/each}
        <line x1="0" x2={W} y1={H} y2={H} class="base" />
        <text x="0" y={H + 16} class="axis">{short(data.from)}</text>
        <text x={W} y={H + 16} class="axis" text-anchor="end">{short(data.to)}</text>
      </svg>
      <div class="legend"><span><i class="sw views"></i>{t('admin.web.views')}</span><span><i class="sw visits"></i>{t('admin.web.visits')}</span></div>
    {/if}
  </section>

  <div class="grid-tables">
    {#each tables as table (table.kind)}
      {@const list = data.top[table.kind]}
      {@const total = list.reduce((a, e) => a + e.value, 0)}
      <section class="card">
        <h3>{t(table.title)}</h3>
        {#if list.length === 0}
          <p class="muted">{t('admin.web.none')}</p>
        {:else}
          <ul class="ranked">
            {#each list.slice(0, 12) as e (e.key)}
              <li>
                <span class="name" title={e.key}>{label(table.kind, e.key)}</span>
                <span class="bar" aria-hidden="true"><span style:width="{Math.round((100 * e.value) / total)}%"></span></span>
                <span class="val">{num(e.value)}</span>
              </li>
            {/each}
          </ul>
          {#if list.length > 12}<p class="muted small">{t('admin.web.more', { n: list.length - 12 })}</p>{/if}
        {/if}
      </section>
    {/each}
  </div>

  <section class="card">
    <h3>{t('admin.web.github')}</h3>
    {#if data.downloads.disabled}
      <p class="muted">{t('admin.web.githubOff')}</p>
    {:else if !downloads}
      <p class="muted">{t('admin.web.githubNone')}</p>
    {:else}
      {#if data.downloads.error}<p class="warn">{t('admin.web.githubError')}</p>{/if}
      <p class="muted small">{t('admin.web.githubHint', { repo: downloads.repo ?? '' })}{#if downloads.fetched} · {t('admin.web.fetched', { time: when(downloads.fetched) })}{/if}</p>
      <ul class="platforms">
        {#each platformList as [p, n] (p)}<li><strong>{num(n)}</strong> {t(`admin.web.platform.${p}`)}</li>{/each}
      </ul>
      <table>
        <thead><tr><th>{t('admin.web.release')}</th><th>{t('admin.web.published')}</th><th>{t('admin.web.files')}</th><th class="r">{t('admin.web.total')}</th></tr></thead>
        <tbody>
          {#each downloads.releases ?? [] as r (r.tag)}
            <tr>
              <td><strong>{r.tag}</strong>{#if r.prerelease} <span class="pill">{t('admin.web.pre')}</span>{/if}</td>
              <td>{r.published ? new Date(r.published).toLocaleDateString(lang === 'en' ? 'en-GB' : 'de-CH') : '–'}</td>
              <td class="files">{#each r.assets.filter((a) => a.count > 0) as a (a.name)}<span>{a.name} <strong>{num(a.count)}</strong></span>{/each}</td>
              <td class="r"><strong>{num(r.assets.reduce((s, a) => s + a.count, 0))}</strong></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <p class="muted small privacy"><Icon name="shield" size={14} /> {t('admin.web.privacy')} {t('admin.web.origins', { list: data.origins.join(', ') || '–' })}</p>
{/if}

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: flex-end;
    margin-bottom: 12px;
  }
  .seg {
    display: inline-flex;
    padding: 3px;
    gap: 2px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
  }
  .seg button {
    border: none;
    background: none;
    border-radius: 999px;
    padding: 4px 12px;
    font-size: 0.85rem;
  }
  .seg button.on {
    background: var(--accent);
    color: var(--accent-contrast, #fff);
  }
  .figures {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--a-radius, 10px);
    margin-bottom: 12px;
  }
  .fig {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 14px 18px;
    border-left: 1px solid var(--a-line, var(--border));
  }
  .fig:first-child {
    border-left: none;
  }
  .num {
    font-size: 1.6rem;
    font-weight: 650;
    letter-spacing: -0.02em;
  }
  .lbl {
    font-size: 0.82rem;
    color: var(--muted);
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--a-radius, 10px);
    padding: 14px 18px;
    margin-bottom: 12px;
  }
  .card h3 {
    margin: 0 0 10px;
    font-size: 0.95rem;
  }
  .chart {
    width: 100%;
    height: auto;
    display: block;
  }
  .chart .views {
    fill: color-mix(in srgb, var(--accent) 35%, transparent);
  }
  .chart .visits {
    fill: var(--accent);
  }
  .chart .grid {
    stroke: var(--border);
    stroke-dasharray: 3 4;
  }
  .chart .base {
    stroke: var(--muted);
  }
  .chart .axis {
    fill: var(--muted);
    font-size: 11px;
  }
  .legend {
    display: flex;
    gap: 16px;
    font-size: 0.8rem;
    color: var(--muted);
    margin-top: 6px;
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .sw {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
  .sw.views {
    background: color-mix(in srgb, var(--accent) 35%, transparent);
  }
  .sw.visits {
    background: var(--accent);
  }
  .grid-tables {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 12px;
  }
  .grid-tables .card {
    margin-bottom: 0;
  }
  .grid-tables + .card {
    margin-top: 12px;
  }
  .ranked {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .ranked li {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(40px, 1fr) auto;
    gap: 10px;
    align-items: center;
    font-size: 0.85rem;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar {
    height: 6px;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .val {
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  .platforms {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    list-style: none;
    padding: 0;
    margin: 0 0 12px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  th,
  td {
    text-align: left;
    padding: 6px 8px;
    border-top: 1px solid var(--border);
    vertical-align: top;
  }
  th {
    color: var(--muted);
    font-weight: 500;
  }
  .r {
    text-align: right;
  }
  .files {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 14px;
  }
  .files span {
    white-space: nowrap;
  }
  .pill {
    font-size: 0.72rem;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--surface-2);
  }
  .small {
    font-size: 0.78rem;
  }
  .warn {
    color: var(--danger, #c0392b);
  }
  .privacy {
    display: flex;
    gap: 6px;
    align-items: flex-start;
  }
  @media (max-width: 700px) {
    .fig {
      border-left: none;
      border-top: 1px solid var(--a-line, var(--border));
    }
  }
</style>
