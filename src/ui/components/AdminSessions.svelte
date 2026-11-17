<script lang="ts">
  import { locale, t } from '../../i18n';
  import Icon from './Icon.svelte';

  /**
   * Admin-Konsole, Bereich «Sessions»: Kennzahlen und alle aktiven Sessions (ohne Inhalte).
   * Ansehen (live, nur lesen), im Editor öffnen, verlängern, löschen. Prüfungsplätze nur
   * ansehen: Sie gelten so lange wie die Prüfung und werden mit ihr gelöscht.
   */
  let {
    call,
    notify,
    version = 0,
    onopen,
    onwatch,
  }: {
    call: <T>(method: string, path: string, body?: unknown) => Promise<T>;
    notify: (kind: 'ok' | 'error', text: string) => void;
    version?: number;
    onopen: (code: string) => void;
    onwatch: (code: string, label: string) => void;
  } = $props();

  type Kind = 'single' | 'class' | 'exam';
  interface Row {
    code: string;
    kind: Kind;
    group: string | null;
    seat: string | number | null;
    created: number | null;
    updated: number | null;
    expires: number;
    size: number;
    connected: boolean;
    locked: boolean;
    submitted: number | null;
  }
  interface Stats {
    total: number;
    counts: { single: number; class: number; exam: number; connected: number; changed24h: number; created24h: number; created7d: number; bytes: number };
    storage: { bytes: number; maxBytes: number; sessions: number; maxSessions: number } | null;
    sessions: Row[];
  }

  let stats = $state<Stats | null>(null);
  let failed = $state(false);
  let filter = $state<'all' | Kind | 'connected'>('all');
  let search = $state('');

  async function load() {
    try {
      stats = await call<Stats>('GET', 'stats');
      failed = false;
    } catch {
      failed = true;
    }
  }

  $effect(() => {
    void version;
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  });

  const rows = $derived(
    (stats?.sessions ?? []).filter((r) => {
      if (filter === 'connected' ? !r.connected : filter !== 'all' && r.kind !== filter) return false;
      const q = search.trim().toLowerCase();
      return !q || r.code.toLowerCase().replace('-', '').includes(q.replace('-', '')) || (r.group ?? '').toLowerCase().includes(q);
    }),
  );

  const fmt = (ms: number | null) =>
    ms ? new Date(ms).toLocaleString(locale() === 'en' ? 'en-GB' : 'de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';
  const kb = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`);
  const label = (r: Row) => (r.group ? `${r.group} · ${r.code}` : r.code);

  async function extend(r: Row, hours: number) {
    try {
      const next = await call<{ expires: number }>('PATCH', `sessions/${r.code}`, { extendHours: hours });
      notify('ok', t('admin.stats.extended', { code: r.code, until: fmt(next.expires) }));
      await load();
    } catch {
      notify('error', t('admin.loadFailed'));
    }
  }

  async function remove(r: Row) {
    if (!confirm(t('admin.stats.deleteConfirm', { code: r.code }))) return;
    try {
      await call('DELETE', `sessions/${r.code}`);
      notify('ok', t('admin.stats.deleted', { code: r.code }));
      await load();
    } catch {
      notify('error', t('admin.loadFailed'));
    }
  }
</script>

{#if failed && !stats}
  <p class="muted">{t('admin.loadFailed')}</p>
{:else if stats}
  {@const c = stats.counts}
  {@const kinds = [['single', c.single], ['class', c.class], ['exam', c.exam]] as const}
  <section class="figures" aria-label={t('admin.stats.active')}>
    <div class="fig main">
      <span class="num">{stats.total}</span>
      <span class="lbl">{t('admin.stats.active')}</span>
      <div class="split" role="img" aria-label={`${t('admin.stats.byKind')}: ${kinds.map(([k, n]) => `${t(`admin.stats.kind.${k}`)} ${n}`).join(', ')}`}>
        {#each kinds as [k, n] (k)}
          {#if n > 0}<span class="part {k}" style:flex={n}></span>{/if}
        {/each}
      </div>
      <div class="legend">
        {#each kinds as [k, n] (k)}<span><i class="sw {k}"></i>{t(`admin.stats.kind.${k}`)} {n}</span>{/each}
      </div>
    </div>
    <div class="fig"><span class="num"><span class="led" class:ok={c.connected > 0}></span>{c.connected}</span><span class="lbl">{t('admin.stats.connected')}</span></div>
    <div class="fig"><span class="num">{c.changed24h}</span><span class="lbl">{t('admin.stats.changed24h')}</span></div>
    <div class="fig"><span class="num">{c.created24h}</span><span class="lbl">{t('admin.stats.created24h', { week: c.created7d })}</span></div>
    <div class="fig"><span class="num">{kb(c.bytes)}</span><span class="lbl">{t('admin.stats.size')}</span></div>
  </section>
  {#if stats.storage}
    {@const st = stats.storage}
    <p class="muted small">{t('admin.storage', { mb: (st.bytes / 1048576).toFixed(1), max: Math.round(st.maxBytes / 1048576), n: st.sessions, maxN: st.maxSessions })}</p>
  {/if}

  <div class="tools">
    <div class="seg" role="radiogroup" aria-label={t('admin.stats.filter')}>
      {#each ['all', 'connected', 'single', 'class', 'exam'] as const as f (f)}
        <button role="radio" aria-checked={filter === f} class:on={filter === f} onclick={() => (filter = f)}>{t(`admin.stats.filter.${f}`)}</button>
      {/each}
    </div>
    <label class="search">
      <Icon name="search" size={16} />
      <input type="search" bind:value={search} placeholder={t('admin.stats.search')} aria-label={t('admin.stats.search')} />
    </label>
  </div>

  {#if rows.length === 0}
    <p class="empty">{t('admin.stats.none')}</p>
  {:else}
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>{t('admin.sessionCode')}</th><th>{t('admin.stats.group')}</th><th>{t('admin.changed')}</th><th>{t('admin.until')}</th><th class="num-col">{t('admin.stats.sizeCol')}</th><th><span class="visually-hidden">{t('admin.stats.actions')}</span></th>
          </tr>
        </thead>
        <tbody>
          {#each rows as r (r.code)}
            <tr>
              <td>
                <div class="who">
                  <span class="led" class:ok={r.connected} title={r.connected ? t('admin.stats.connectedNow') : undefined}></span>
                  <code>{r.code}</code>
                  {#if r.locked}<span class="lock" title={t('admin.stats.locked')}><Icon name="lock" size={14} title={t('admin.stats.locked')} /></span>{/if}
                </div>
              </td>
              <td>
                <div class="group">
                  <span class="pill kind {r.kind}">{t(`admin.stats.kind.${r.kind}`)}</span>
                  <span>{r.group ?? ''}{#if r.seat !== null}<span class="muted"> · {t('exam.seatWord')} {r.seat}</span>{/if}</span>
                  {#if r.submitted}<span class="pill ok">✓ {t('admin.exams.seat.submittedAt', { time: fmt(r.submitted) })}</span>{/if}
                </div>
              </td>
              <td class="muted nowrap">{fmt(r.updated)}</td>
              <td class="muted nowrap">{fmt(r.expires)}</td>
              <td class="num-col muted">{kb(r.size)}</td>
              <td class="actions">
                <button class="icon" title={t('admin.exams.watchHint')} aria-label={`${t('admin.exams.watch')} ${r.code}`} onclick={() => onwatch(r.code, label(r))}><Icon name="eye" size={16} /></button>
                {#if r.kind !== 'exam'}
                  <button class="icon" title={t('admin.stats.openHint')} aria-label={`${t('admin.open')} ${r.code}`} onclick={() => onopen(r.code)}><Icon name="external" size={16} /></button>
                  <button class="small" title={t('admin.stats.extendHint', { n: 1 })} onclick={() => extend(r, 24)}>+1 {t('admin.stats.day')}</button>
                  <button class="small" title={t('admin.stats.extendHint', { n: 7 })} onclick={() => extend(r, 24 * 7)}>+7</button>
                  <button class="icon danger" title={t('admin.stats.deleteHint')} aria-label={`${t('inspector.delete')} ${r.code}`} onclick={() => remove(r)}><Icon name="trash" size={16} /></button>
                {:else}
                  <span class="muted small hint">{t('admin.stats.examOnly')}</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if stats.total > stats.sessions.length}<p class="muted small">{t('admin.stats.limited', { n: stats.sessions.length, total: stats.total })}</p>{/if}
  {/if}
  <p class="muted small">{t('admin.stats.privacy')}</p>
{:else}
  <p class="muted">…</p>
{/if}

<style>
  .figures {
    display: grid;
    grid-template-columns: minmax(260px, 2fr) repeat(4, minmax(120px, 1fr));
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--a-radius);
    margin-bottom: 10px;
  }
  .fig {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 16px 20px;
    border-left: 1px solid var(--a-line);
  }
  .fig.main {
    border-left: none;
  }
  .num {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.7rem;
    font-weight: 650;
    letter-spacing: -0.02em;
  }
  .lbl {
    font-size: 0.82rem;
    color: var(--muted);
  }
  .split {
    display: flex;
    gap: 2px;
    height: 8px;
    margin-top: 10px;
    border-radius: 999px;
    overflow: hidden;
    background: var(--surface-2);
  }
  .part.single,
  .sw.single {
    background: var(--a-idle);
  }
  .part.class,
  .sw.class {
    background: var(--accent);
  }
  .part.exam,
  .sw.exam {
    background: #7c4dcc;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin-top: 8px;
    font-size: 0.8rem;
    color: var(--muted);
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
  .tools {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    margin: 18px 0 12px;
  }
  .seg {
    display: inline-flex;
    padding: 3px;
    gap: 2px;
    background: var(--surface-2);
    border-radius: 10px;
  }
  .seg button {
    min-height: 30px;
    border: none;
    background: transparent;
    color: var(--muted);
  }
  .seg button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 2px rgb(15 23 42 / 0.12);
  }
  .search {
    flex: 1;
    min-width: 200px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--a-radius-s);
    color: var(--muted);
  }
  .search input {
    flex: 1;
    border: none;
    background: transparent;
    padding-left: 0;
  }
  .search:focus-within {
    outline: 2px solid var(--accent);
    border-color: var(--accent);
  }
  .search input:focus-visible {
    outline: none;
  }
  .scroll {
    overflow: auto;
    max-height: 62vh;
    border-radius: var(--a-radius);
  }
  .scroll table {
    margin: 0;
  }
  .scroll th {
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .who,
  .group {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .who {
    white-space: nowrap;
  }
  .group {
    flex-wrap: wrap;
  }
  .nowrap,
  .num-col {
    white-space: nowrap;
  }
  .lock {
    color: var(--muted);
  }
  .pill.kind.class {
    background: var(--a-live-soft);
    color: var(--a-live);
  }
  .pill.kind.exam {
    background: color-mix(in srgb, #7c4dcc 14%, var(--surface));
    color: #7c4dcc;
  }
  .num-col {
    text-align: right;
  }
  .icon {
    min-width: 32px;
    padding: 0 8px;
  }
  .hint {
    padding-right: 4px;
  }
  .empty {
    padding: 28px;
    text-align: center;
    color: var(--muted);
    border: 1px dashed var(--border);
    border-radius: var(--a-radius);
  }
  @media (max-width: 900px) {
    .figures {
      grid-template-columns: repeat(2, 1fr);
    }
    .fig.main {
      grid-column: 1 / -1;
    }
    .fig:nth-child(2) {
      border-left: none;
    }
  }
</style>
