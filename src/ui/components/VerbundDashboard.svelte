<script lang="ts">
  import { Simulation, federate, parseProject, probeSites, siteName, type Topology } from '../../core';
  import { locale, t } from '../../i18n';
  import { api } from '../state/session.svelte';
  import type { VerbundMessage } from '../state/verbund.svelte';
  import VerbundMap, { type Flight, type MapSite } from './VerbundMap.svelte';

  /**
   * Dashboard für den Beamer: Alle Standorte der Klasse mit ihrem Zustand, berechnet hier im
   * Browser der Lehrperson in EINER Simulation des ganzen Verbunds (Ping und Webseite von der
   * Zentrale aus). Niemand kann «fertig» melden: grün wird nur, was wirklich funktioniert.
   */
  interface ClassSession {
    code: string;
    updated: number;
    site: { seat: number; label: string } | null;
    progress: { goals: number; total: number } | null;
    connected: boolean;
    project?: unknown;
  }
  let {
    classCode,
    label,
    call,
    onclose,
    onwatch,
  }: {
    classCode: string;
    label: string;
    call: <T>(method: string, path: string, body?: unknown) => Promise<T>;
    onclose: () => void;
    onwatch: (code: string, name: string) => void;
  } = $props();

  const PROBE_MS = 20_000;
  const MESSAGES_MS = 6_000;

  let view = $state<'map' | 'tiles' | 'both'>('both');
  let sites = $state<(MapSite & { code: string })[]>([]);
  let events = $state<{ id: number; time: number; text: string; kind: string }[]>([]);
  let flights = $state<Flight[]>([]);
  let messages = $state<VerbundMessage[]>([]);
  let infra: Topology | null = null;
  let infraSince = 0;
  let busy = $state(false);
  let lastRun = $state<number | null>(null);
  let duration = $state(0);
  let problem = $state<string | null>(null);
  let now = $state(Date.now());
  let root: HTMLDivElement | undefined = $state();
  let eventSeq = 0;
  const previous = new Map<number, MapSite['level']>();

  const time = (ms: number) => new Date(ms).toLocaleTimeString(locale() === 'en' ? 'en-GB' : 'de-CH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const rank: Record<MapSite['level'], number> = { offline: 0, connected: 1, online: 2, services: 3, done: 4 };

  function event(text: string, kind: string) {
    events = [{ id: ++eventSeq, time: Date.now(), text, kind }, ...events].slice(0, 30);
  }

  async function probe() {
    if (busy) return;
    busy = true;
    try {
      const v = await api<{ enabled: boolean; infra?: unknown; infraUpdated?: number; now?: number }>('GET', `classes/${encodeURIComponent(classCode)}/verbund?since=${infraSince}`);
      if (!v.enabled) {
        problem = t('verbund.dash.disabled');
        return;
      }
      if (v.infra) {
        const parsed = parseProject(JSON.stringify(v.infra));
        infra = parsed.ok ? parsed.topology : null;
      }
      if (v.now) infraSince = v.now;
      problem = infra ? null : t('verbund.dash.noInfra');
      const list = await call<ClassSession[]>('GET', `classes/${classCode}/sessions?projects=1`);
      const members = list.flatMap((s) => {
        if (!s.site) return [];
        const parsed = parseProject(JSON.stringify(s.project));
        return parsed.ok ? [{ ...s, site: s.site, topology: parsed.topology }] : [];
      });
      // Simulation erst nach dem Neuzeichnen («prüft …»), sie läuft synchron.
      await new Promise((r) => setTimeout(r, 30));
      const started = performance.now();
      const fed = infra ? federate(infra, members.map((m) => ({ seat: m.site.seat, label: m.site.label, topology: m.topology }))) : null;
      const probes = fed ? probeSites(fed, new Simulation(fed.topology)) : [];
      duration = Math.round(performance.now() - started);
      const next = members
        .map((m) => {
          const p = probes.find((x) => x.seat === m.site.seat);
          const goals = m.progress?.goals ?? 0;
          const total = m.progress?.total ?? 0;
          let level: MapSite['level'] = p?.level ?? (fed?.sites.find((s) => s.seat === m.site.seat)?.uplink ? 'connected' : 'offline');
          if ((level === 'online' || level === 'services') && total > 0 && goals === total) level = 'done';
          return { seat: m.site.seat, code: m.code, name: siteName(m.site.seat, m.site.label), level, goals, total, present: m.connected };
        })
        .sort((a, b) => a.seat - b.seat);
      for (const s of next) {
        const before = previous.get(s.seat);
        if (before !== undefined && before !== s.level) event(t(rank[s.level] > rank[before] ? 'verbund.dash.up' : 'verbund.dash.down', { name: s.name, level: t(`verbund.level.${s.level}`) }), rank[s.level] > rank[before] ? 'up' : 'down');
        if (before === undefined && previous.size > 0) event(t('verbund.dash.joined', { name: s.name }), 'join');
        previous.set(s.seat, s.level);
      }
      sites = next;
      lastRun = Date.now();
      // Für die Karte der Lernenden (falls die Lehrperson sie zeigt).
      await call('POST', `classes/${classCode}/status`, { sites: Object.fromEntries(next.map((s) => [s.seat, { level: s.level, goals: s.goals, total: s.total }])) }).catch(() => undefined);
    } catch {
      problem = t('verbund.dash.loadFailed');
    } finally {
      busy = false;
    }
  }

  async function pollMessages() {
    try {
      const after = messages.at(-1)?.id ?? 0;
      const fresh = await api<VerbundMessage[]>('GET', `classes/${encodeURIComponent(classCode)}/messages?after=${after}`);
      if (!fresh.length) return;
      messages = [...messages, ...fresh].slice(-100);
      for (const m of fresh) {
        const from = siteName(m.from, m.fromLabel);
        const to = m.to === 0 ? t('verbund.hub') : (sites.find((s) => s.seat === m.to)?.name ?? siteName(m.to));
        event(t('verbund.dash.message', { from, to, subject: m.subject }), 'message');
        flights = [...flights, { id: m.id, from: m.from, to: m.to }].slice(-20);
      }
    } catch {
      /* beim nächsten Mal */
    }
  }

  $effect(() => {
    void probe();
    void pollMessages();
    const a = setInterval(() => void probe(), PROBE_MS);
    const b = setInterval(() => void pollMessages(), MESSAGES_MS);
    const c = setInterval(() => (now = Date.now()), 1000);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !document.fullscreenElement && onclose();
    window.addEventListener('keydown', key);
    return () => {
      clearInterval(a);
      clearInterval(b);
      clearInterval(c);
      window.removeEventListener('keydown', key);
    };
  });

  const counts = $derived({
    total: sites.length,
    connected: sites.filter((s) => s.level !== 'offline').length,
    online: sites.filter((s) => rank[s.level] >= 2).length,
    services: sites.filter((s) => rank[s.level] >= 3).length,
    done: sites.filter((s) => s.level === 'done').length,
  });

  function fullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root?.requestFullscreen?.();
  }

  const watch = (seat: number) => {
    const s = sites.find((x) => x.seat === seat);
    if (s) onwatch(s.code, s.name);
  };
</script>

<div class="dash" bind:this={root} role="dialog" aria-modal="true" aria-label={t('verbund.dash.title', { label })}>
  <header>
    <div class="title">
      <span class="logo">🌐</span>
      <div>
        <h2>{t('verbund.dash.title', { label })}</h2>
        <p>{t('verbund.dash.sub', { code: classCode })} · {time(now)}</p>
      </div>
    </div>
    <div class="counters">
      <div class="counter"><strong>{counts.connected}</strong><span>{t('verbund.level.connected')}</span></div>
      <div class="counter on"><strong>{counts.online}</strong><span>{t('verbund.level.online')}</span></div>
      <div class="counter svc"><strong>{counts.services}</strong><span>{t('verbund.level.services')}</span></div>
      <div class="counter gold"><strong>{counts.done}</strong><span>{t('verbund.level.done')}</span></div>
      <div class="counter"><strong>{counts.total}</strong><span>{t('verbund.dash.sites')}</span></div>
    </div>
    <div class="tools">
      <div class="seg" role="group" aria-label={t('verbund.dash.view')}>
        {#each ['map', 'tiles', 'both'] as const as v (v)}
          <button class:active={view === v} aria-pressed={view === v} onclick={() => (view = v)}>{t(`verbund.dash.view.${v}`)}</button>
        {/each}
      </div>
      <button onclick={() => void probe()} disabled={busy} title={t('verbund.dash.refreshHint')}>{busy ? '…' : '⟳'}</button>
      <button onclick={fullscreen} title={t('verbund.dash.fullscreen')}>⛶</button>
      <button onclick={onclose} aria-label={t('about.close')}>✕</button>
    </div>
  </header>

  {#if problem}<p class="problem" role="status">{problem}</p>{/if}

  <main class="view-{view}">
    {#if view !== 'tiles'}
      <section class="map-wrap"><VerbundMap {sites} hubName={t('verbund.hub')} {flights} onselect={watch} /></section>
    {/if}
    {#if view !== 'map'}
      <section class="tiles" aria-label={t('verbund.dash.sites')}>
        {#each sites as s (s.seat)}
          <button class="tile {s.level}" onclick={() => watch(s.seat)} title={t('verbund.dash.watchHint')}>
            <span class="tile-seat">{s.seat}</span>
            <span class="tile-name">{s.name}</span>
            <span class="tile-state"><i></i>{t(`verbund.level.${s.level}`)}</span>
            {#if s.total}<span class="tile-goals">{t('verbund.goals', { n: s.goals ?? 0, total: s.total })}</span>{/if}
            {#if s.present}<span class="tile-present" title={t('verbund.dash.present')}>●</span>{/if}
          </button>
        {:else}
          <p class="empty">{t('verbund.dash.empty')}</p>
        {/each}
      </section>
    {/if}
  </main>

  <footer>
    <ol class="ticker" aria-live="polite">
      {#each events.slice(0, 6) as e (e.id)}
        <li class={e.kind}><time>{time(e.time)}</time> {e.text}</li>
      {/each}
    </ol>
    <span class="meta">{lastRun ? t('verbund.dash.lastRun', { time: time(lastRun), ms: duration }) : t('verbund.dash.checking')}</span>
  </footer>
</div>

<style>
  .dash {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 18px;
    color: #e2e8f0;
    background: radial-gradient(ellipse at top, #111c35, #050811 70%);
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  header {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1 1 260px;
  }
  .logo {
    font-size: 2.2rem;
    filter: drop-shadow(0 0 10px #7c3aed);
  }
  h2 {
    margin: 0;
    font-size: 1.6rem;
    letter-spacing: -0.01em;
  }
  .title p {
    margin: 2px 0 0;
    color: #94a3b8;
    font-size: 0.9rem;
  }
  .counters {
    display: flex;
    gap: 10px;
  }
  .counter {
    min-width: 84px;
    padding: 6px 12px;
    border-radius: 12px;
    background: #0f172a;
    border: 1px solid #1e293b;
    text-align: center;
  }
  .counter strong {
    display: block;
    font-size: 1.8rem;
    line-height: 1.1;
  }
  .counter span {
    font-size: 0.75rem;
    color: #94a3b8;
  }
  .counter.on strong {
    color: #4ade80;
  }
  .counter.svc strong {
    color: #22d3ee;
  }
  .counter.gold strong {
    color: #facc15;
  }
  .tools {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .tools button {
    border: 1px solid #334155;
    background: #0f172a;
    color: #e2e8f0;
    border-radius: 8px;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 0.95rem;
  }
  .seg {
    display: flex;
  }
  .seg button {
    border-radius: 0;
  }
  .seg button:first-child {
    border-radius: 8px 0 0 8px;
  }
  .seg button:last-child {
    border-radius: 0 8px 8px 0;
  }
  .seg button.active {
    background: #7c3aed;
    border-color: #7c3aed;
  }
  .problem {
    margin: 0;
    padding: 8px 12px;
    border-radius: 8px;
    background: #422006;
    color: #fde68a;
  }
  main {
    flex: 1;
    min-height: 0;
    display: grid;
    gap: 14px;
  }
  main.view-both {
    grid-template-columns: minmax(0, 3fr) minmax(260px, 2fr);
  }
  .map-wrap {
    min-height: 0;
    display: flex;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    grid-auto-rows: min-content;
    gap: 10px;
    overflow: auto;
    align-content: start;
  }
  .tile {
    position: relative;
    display: grid;
    gap: 2px;
    text-align: left;
    padding: 10px 12px 10px 14px;
    border-radius: 12px;
    border: 2px solid #334155;
    background: #0b1222;
    color: inherit;
    cursor: pointer;
    font: inherit;
    transition: transform 0.15s, border-color 0.3s;
  }
  .tile:hover,
  .tile:focus-visible {
    transform: translateY(-2px);
  }
  .tile-seat {
    position: absolute;
    top: 8px;
    right: 10px;
    color: #475569;
    font-weight: 800;
    font-size: 1.1rem;
  }
  .tile-name {
    font-weight: 700;
    font-size: 1.05rem;
    padding-right: 26px;
  }
  .tile-state {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    color: #94a3b8;
  }
  .tile-state i {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #475569;
  }
  .tile-goals {
    font-size: 0.8rem;
    color: #facc15;
  }
  .tile-present {
    position: absolute;
    bottom: 8px;
    right: 10px;
    color: #22c55e;
    font-size: 0.7rem;
  }
  .tile.connected {
    border-color: #b45309;
  }
  .tile.connected i {
    background: #f59e0b;
  }
  .tile.online {
    border-color: #16a34a;
    box-shadow: 0 0 18px -6px #22c55e;
  }
  .tile.online i,
  .tile.services i,
  .tile.done i {
    background: #22c55e;
  }
  .tile.services {
    border-color: #0891b2;
    box-shadow: 0 0 18px -6px #06b6d4;
  }
  .tile.done {
    border-color: #ca8a04;
    background: #1a1605;
    box-shadow: 0 0 22px -6px #eab308;
  }
  .empty {
    color: #94a3b8;
  }
  footer {
    display: flex;
    gap: 12px;
    align-items: flex-end;
    justify-content: space-between;
  }
  .ticker {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    font-size: 0.9rem;
    min-height: 1.4em;
  }
  .ticker li {
    padding: 2px 10px;
    border-radius: 999px;
    background: #0f172a;
    border: 1px solid #1e293b;
  }
  .ticker li.up {
    border-color: #166534;
  }
  .ticker li.down {
    border-color: #7f1d1d;
  }
  .ticker li.message {
    border-color: #86198f;
  }
  .ticker time {
    color: #64748b;
    margin-right: 4px;
  }
  .meta {
    color: #64748b;
    font-size: 0.8rem;
    white-space: nowrap;
  }
  @media (max-width: 900px) {
    main.view-both {
      grid-template-columns: 1fr;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tile {
      transition: none;
    }
  }
</style>
