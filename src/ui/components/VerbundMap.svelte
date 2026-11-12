<script lang="ts">
  import { t } from '../../i18n';

  /**
   * Karte des Klassen-Verbunds: die Zentrale in der Mitte, alle Standorte im Kreis darum, die
   * Verbindungen leuchten je nach Zustand. Nachrichten fliegen als Lichtpunkt vom Absender über die
   * Zentrale zum Empfänger. Für den Beamer (Dashboard) und für die Lernenden (falls freigegeben).
   */
  export interface MapSite {
    seat: number;
    name: string;
    level: 'offline' | 'connected' | 'online' | 'services' | 'done';
    goals?: number;
    total?: number;
    /** Browser der Person gerade offen (Lebenszeichen). */
    present?: boolean;
    own?: boolean;
  }
  export interface Flight {
    id: number;
    from: number;
    /** 0 = Zentrale */
    to: number;
  }

  let { sites, hubName, flights = [], onselect }: { sites: MapSite[]; hubName: string; flights?: Flight[]; onselect?: (seat: number) => void } = $props();

  const W = 1000;
  const H = 640;
  const CX = W / 2;
  const CY = H / 2 + 10;

  const placed = $derived(
    sites.map((s, i) => {
      const n = Math.max(sites.length, 1);
      const a = (2 * Math.PI * i) / n - Math.PI / 2;
      const rx = n > 16 ? 420 : 380;
      const ry = n > 16 ? 255 : 230;
      return { ...s, x: CX + Math.cos(a) * rx, y: CY + Math.sin(a) * ry };
    }),
  );
  const bySeat = $derived(new Map(placed.map((p) => [p.seat, p])));

  // Fliegende Nachrichten: Position je Bild aus der verstrichenen Zeit (ohne SMIL, überall gleich).
  const FLIGHT_MS = 2200;
  let clock = $state(0);
  const started = new Map<number, number>();
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  $effect(() => {
    if (!flights.length || reduced) return;
    let frame = 0;
    const loop = () => {
      clock = performance.now();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  });
  const dots = $derived(
    flights.flatMap((f) => {
      if (!started.has(f.id)) started.set(f.id, performance.now());
      const p = Math.min(1, (clock - started.get(f.id)!) / FLIGHT_MS);
      if (p >= 1 || reduced) return [];
      const a = bySeat.get(f.from);
      const b = f.to === 0 ? { x: CX, y: CY } : bySeat.get(f.to);
      if (!a || !b) return [];
      // Erst zur Zentrale, dann weiter zum Ziel.
      const [x0, y0, x1, y1, q] = f.to === 0 || p < 0.5 ? [a.x, a.y, CX, CY, f.to === 0 ? p : p * 2] : [CX, CY, b.x, b.y, (p - 0.5) * 2];
      return [{ id: f.id, x: x0 + (x1 - x0) * q, y: y0 + (y1 - y0) * q }];
    }),
  );

  const online = $derived(sites.filter((s) => s.level !== 'offline' && s.level !== 'connected').length);
  const label = $derived(t('verbund.map.aria', { online, total: sites.length }));
</script>

<svg viewBox="0 0 {W} {H}" class="map" role="img" aria-label={label}>
  <defs>
    <radialGradient id="vb-bg" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#17223b" />
      <stop offset="100%" stop-color="#070b16" />
    </radialGradient>
    <radialGradient id="vb-hub" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#a78bfa" />
      <stop offset="100%" stop-color="#5b21b6" />
    </radialGradient>
    <filter id="vb-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4" result="b" />
      <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
    <pattern id="vb-dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#22304d" /></pattern>
  </defs>
  <rect width={W} height={H} fill="url(#vb-bg)" />
  <rect width={W} height={H} fill="url(#vb-dots)" />

  {#each placed as s (s.seat)}
    <line class="link {s.level}" x1={CX} y1={CY} x2={s.x} y2={s.y} />
    {#if s.level !== 'offline' && s.level !== 'connected'}
      <line class="flow {s.level}" x1={CX} y1={CY} x2={s.x} y2={s.y} />
    {/if}
  {/each}

  <g class="hub" transform="translate({CX} {CY})">
    <circle class="ring r1" r="58" />
    <circle class="ring r2" r="58" />
    <circle r="52" fill="url(#vb-hub)" filter="url(#vb-glow)" />
    <text class="hub-icon" y="-4">🌐</text>
    <text class="hub-name" y="22">{hubName}</text>
    <text class="hub-count" y="82">{online} / {sites.length} online</text>
  </g>

  {#each dots as d (d.id)}
    <circle class="msg" cx={d.x} cy={d.y} r="7" filter="url(#vb-glow)" />
  {/each}

  {#each placed as s (s.seat)}
    {@const pct = s.total ? (s.goals ?? 0) / s.total : 0}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <g
      class="site {s.level}"
      class:own={s.own}
      class:clickable={!!onselect}
      transform="translate({s.x - 78} {s.y - 30})"
      role={onselect ? 'button' : undefined}
      tabindex={onselect ? 0 : undefined}
      aria-label={onselect ? `${s.name}: ${t(`verbund.level.${s.level}`)}` : undefined}
      onclick={() => onselect?.(s.seat)}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onselect?.(s.seat)}
    >
      <rect class="card" width="156" height="60" rx="10" />
      <circle class="led" cx="16" cy="18" r="6" />
      <text class="seat" x="148" y="20">{s.seat}</text>
      <text class="name" x="30" y="23">{s.name.length > 15 ? `${s.name.slice(0, 14)}…` : s.name}</text>
      <text class="state" x="14" y="42">{t(`verbund.level.${s.level}`)}{#if s.present} · ●{/if}</text>
      {#if s.total}
        <rect class="bar" x="14" y="48" width="128" height="5" rx="2.5" />
        <rect class="bar-fill" x="14" y="48" width={128 * pct} height="5" rx="2.5" />
      {/if}
      {#if s.level === 'done'}<text class="star" x="150" y="54">★</text>{/if}
    </g>
  {/each}
</svg>

<style>
  .map {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 14px;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  .link {
    stroke-width: 2;
    stroke: #334155;
    stroke-dasharray: 4 6;
  }
  .link.connected {
    stroke: #f59e0b;
    stroke-dasharray: none;
    opacity: 0.7;
  }
  .link.online,
  .link.services,
  .link.done {
    stroke-dasharray: none;
    stroke-width: 3;
  }
  .link.online {
    stroke: #16a34a;
  }
  .link.services {
    stroke: #06b6d4;
  }
  .link.done {
    stroke: #eab308;
  }
  .flow {
    stroke-width: 4;
    stroke-linecap: round;
    stroke-dasharray: 2 26;
    animation: flow 1.6s linear infinite;
  }
  .flow.online {
    stroke: #86efac;
  }
  .flow.services {
    stroke: #a5f3fc;
    animation-duration: 1s;
  }
  .flow.done {
    stroke: #fde68a;
    animation-duration: 1.2s;
  }
  @keyframes flow {
    to {
      stroke-dashoffset: -28;
    }
  }
  .ring {
    fill: none;
    stroke: #a78bfa;
    stroke-width: 2;
    transform-origin: 0 0;
    animation: ring 3s ease-out infinite;
  }
  .r2 {
    animation-delay: 1.5s;
  }
  @keyframes ring {
    from {
      transform: scale(1);
      opacity: 0.7;
    }
    to {
      transform: scale(1.9);
      opacity: 0;
    }
  }
  .hub-icon {
    font-size: 28px;
    text-anchor: middle;
  }
  .hub-name {
    fill: #f5f3ff;
    font-size: 13px;
    font-weight: 700;
    text-anchor: middle;
  }
  .hub-count {
    fill: #c4b5fd;
    font-size: 14px;
    font-weight: 600;
    text-anchor: middle;
  }
  .msg {
    fill: #f0abfc;
  }
  .card {
    fill: #0f172a;
    stroke: #334155;
    stroke-width: 2;
  }
  .site.connected .card {
    stroke: #f59e0b;
  }
  .site.online .card {
    stroke: #22c55e;
  }
  .site.services .card {
    stroke: #06b6d4;
  }
  .site.done .card {
    stroke: #eab308;
    fill: #1c1a0e;
  }
  .site.own .card {
    stroke-width: 3.5;
  }
  .clickable {
    cursor: pointer;
  }
  .clickable:hover .card,
  .clickable:focus-visible .card {
    fill: #1e293b;
  }
  .site:focus-visible {
    outline: none;
  }
  .led {
    fill: #475569;
  }
  .site.connected .led {
    fill: #f59e0b;
  }
  .site.online .led,
  .site.services .led,
  .site.done .led {
    fill: #22c55e;
    animation: blink 1.4s ease-in-out infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0.45;
    }
  }
  .seat {
    fill: #64748b;
    font-size: 12px;
    font-weight: 700;
    text-anchor: end;
  }
  .name {
    fill: #f1f5f9;
    font-size: 14px;
    font-weight: 700;
  }
  .state {
    fill: #94a3b8;
    font-size: 11px;
  }
  .bar {
    fill: #1e293b;
  }
  .bar-fill {
    fill: #eab308;
  }
  .star {
    fill: #fde047;
    font-size: 16px;
    text-anchor: end;
  }
  @media (prefers-reduced-motion: reduce) {
    .flow,
    .ring,
    .led {
      animation: none !important;
    }
  }
</style>
