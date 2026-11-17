<script lang="ts">
  import { locale, t } from '../../i18n';

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
  <div class="tiles">
    <div class="tile"><span class="big">{stats.total}</span><span>{t('admin.stats.active')}</span></div>
    <div class="tile live"><span class="big">{c.connected}</span><span>{t('admin.stats.connected')}</span></div>
    <div class="tile"><span class="big">{c.changed24h}</span><span>{t('admin.stats.changed24h')}</span></div>
    <div class="tile"><span class="big">{c.created24h}</span><span>{t('admin.stats.created24h', { week: c.created7d })}</span></div>
    <div class="tile"><span class="big">{kb(c.bytes)}</span><span>{t('admin.stats.size')}</span></div>
  </div>
  <div class="split" aria-label={t('admin.stats.byKind')}>
    {#each [['single', c.single], ['class', c.class], ['exam', c.exam]] as const as [k, n] (k)}
      {#if n > 0}<span class="part {k}" style:flex={n}>{t(`admin.stats.kind.${k}`)} {n}</span>{/if}
    {/each}
  </div>
  {#if stats.storage}
    {@const st = stats.storage}
    <p class="muted">{t('admin.storage', { mb: (st.bytes / 1048576).toFixed(1), max: Math.round(st.maxBytes / 1048576), n: st.sessions, maxN: st.maxSessions })}</p>
  {/if}

  <div class="tools">
    <div class="chips" role="radiogroup" aria-label={t('admin.stats.filter')}>
      {#each ['all', 'connected', 'single', 'class', 'exam'] as const as f (f)}
        <button role="radio" aria-checked={filter === f} class:on={filter === f} onclick={() => (filter = f)}>{t(`admin.stats.filter.${f}`)}</button>
      {/each}
    </div>
    <input type="search" bind:value={search} placeholder={t('admin.stats.search')} aria-label={t('admin.stats.search')} />
    <button class="ghost" onclick={() => void load()}>↻ {t('admin.refresh')}</button>
  </div>

  {#if rows.length === 0}
    <p class="muted">{t('admin.stats.none')}</p>
  {:else}
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>{t('admin.sessionCode')}</th><th>{t('admin.stats.kindCol')}</th><th>{t('admin.stats.group')}</th><th>{t('admin.stats.created')}</th><th>{t('admin.changed')}</th><th>{t('admin.until')}</th><th>{t('admin.stats.sizeCol')}</th><th></th>
          </tr>
        </thead>
        <tbody>
          {#each rows as r (r.code)}
            <tr>
              <td class="code">
                {#if r.connected}<span class="dot" title={t('admin.stats.connectedNow')} aria-label={t('admin.stats.connectedNow')}>●</span>{/if}
                {r.code}
                {#if r.locked}<span title={t('admin.stats.locked')} aria-label={t('admin.stats.locked')}>🔒</span>{/if}
              </td>
              <td><span class="kind {r.kind}">{t(`admin.stats.kind.${r.kind}`)}</span></td>
              <td>
                {r.group ?? ''}{#if r.seat !== null}<span class="muted"> · {t('exam.seatWord')} {r.seat}</span>{/if}
                {#if r.submitted}<span class="ok"> ✓ {t('admin.exams.seat.submittedAt', { time: fmt(r.submitted) })}</span>{/if}
              </td>
              <td>{fmt(r.created)}</td>
              <td>{fmt(r.updated)}</td>
              <td>{fmt(r.expires)}</td>
              <td>{kb(r.size)}</td>
              <td class="actions">
                <button title={t('admin.exams.watchHint')} onclick={() => onwatch(r.code, label(r))}>👁 {t('admin.exams.watch')}</button>
                {#if r.kind !== 'exam'}
                  <button title={t('admin.stats.openHint')} onclick={() => onopen(r.code)}>{t('admin.open')}</button>
                  <button title={t('admin.stats.extendHint', { n: 1 })} onclick={() => extend(r, 24)}>+1 {t('admin.stats.day')}</button>
                  <button title={t('admin.stats.extendHint', { n: 7 })} onclick={() => extend(r, 24 * 7)}>+7</button>
                  <button class="danger" title={t('admin.stats.deleteHint')} onclick={() => remove(r)}>{t('inspector.delete')}</button>
                {:else}
                  <span class="muted small">{t('admin.stats.examOnly')}</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if stats.total > stats.sessions.length}<p class="muted">{t('admin.stats.limited', { n: stats.sessions.length, total: stats.total })}</p>{/if}
  {/if}
  <p class="muted small">{t('admin.stats.privacy')}</p>
{:else}
  <p class="muted">…</p>
{/if}

<style>
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
    margin-bottom: 10px;
  }
  .tile {
    display: grid;
    gap: 2px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    font-size: 0.8rem;
    color: var(--muted);
  }
  .tile .big {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .tile.live .big {
    color: #15803d;
  }
  .split {
    display: flex;
    gap: 2px;
    height: 22px;
    border-radius: 6px;
    overflow: hidden;
    font-size: 0.72rem;
    margin-bottom: 6px;
  }
  .part {
    display: flex;
    align-items: center;
    padding: 0 6px;
    white-space: nowrap;
    overflow: hidden;
    color: #fff;
  }
  .part.single,
  .kind.single {
    background: #64748b;
  }
  .part.class,
  .kind.class {
    background: #2563eb;
  }
  .part.exam,
  .kind.exam {
    background: #7c3aed;
  }
  .kind {
    color: #fff;
    border-radius: 999px;
    padding: 1px 8px;
    font-size: 0.72rem;
    white-space: nowrap;
  }
  .tools {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin: 10px 0;
  }
  .tools input {
    flex: 1;
    min-width: 160px;
  }
  .chips {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .chips button {
    border-radius: 999px;
    font-size: 0.8rem;
    padding: 3px 10px;
  }
  .chips .on {
    background: var(--selected-soft);
    border-color: var(--accent);
  }
  .scroll {
    overflow: auto;
    max-height: 60vh;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }
  th {
    position: sticky;
    top: 0;
    background: var(--surface);
    text-align: left;
  }
  th,
  td {
    padding: 4px 6px;
    border-bottom: 1px solid var(--border);
  }
  .code {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    white-space: nowrap;
  }
  .dot {
    color: #16a34a;
  }
  .ok {
    color: #15803d;
    font-weight: 600;
  }
  .actions {
    white-space: nowrap;
    text-align: right;
  }
  .actions button {
    font-size: 0.75rem;
    padding: 2px 7px;
  }
  .danger {
    color: var(--danger);
    border-color: var(--danger);
  }
  .ghost {
    border-style: dashed;
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 0.75rem;
  }
</style>
