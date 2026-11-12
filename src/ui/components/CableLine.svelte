<script lang="ts">
  import { isSwitchType, linkStatus, mediumOf, vlanColor, type Cable, type Device } from '../../core';
  import { t } from '../../i18n';
  import { interfaceLabel } from '../labels';
  import { ui } from '../state/ui.svelte';
  import { editor } from '../state/editor.svelte';
  import { simStore } from '../state/sim.svelte';
  import { TAG_HEX } from '../tags';
  import { parallelOffset, rackSlot } from '../cableGeometry';

  let { cable, a, b, faded = false }: { cable: Cable; a: Device; b: Device; faded?: boolean } = $props();

  /** Abstand der Status-LED vom Gerätemittelpunkt. */
  const LED_DISTANCE = 40;

  const medium = $derived(mediumOf(cable));
  /** Endpunkte, bei mehreren Kabeln zwischen denselben Geräten parallel versetzt. */
  const shift = $derived(parallelOffset(editor.topology, cable, a.position, b.position));
  const pa = $derived({ x: a.position.x + shift.x, y: a.position.y + shift.y });
  const pb = $derived({ x: b.position.x + shift.x, y: b.position.y + shift.y });
  const status = $derived(linkStatus(editor.topology, cable));

  /** Abstand der Port-Beschriftung vom Gerätemittelpunkt, ausserhalb des Gerätenamens. */
  const LABEL_DISTANCE = 76;

  const selected = $derived(editor.selection?.kind === 'cable' && editor.selection.id === cable.id);

  /** Port-Beschriftung mit VLAN bzw. Trunk, damit die Aufteilung auf der Zeichenfläche sichtbar ist. */
  function portLabel(device: Device, index: number, short = false): string {
    const base = interfaceLabel(device, index, short);
    const iface = device.interfaces[index];
    if (!isSwitchType(device.type) || !iface) return base;
    if (iface.channel) return `${base} · Po${iface.channel}`;
    if (iface.trunk) return `${base} · ${t('switch.trunkShort')}`;
    return iface.vlan ? `${base} · V${iface.vlan}` : base;
  }

  /** Farbe eines Port-Endes: eigenes Farbtag, sonst die Farbe seines VLANs (Access-Port am Switch). */
  function endColor(device: Device, index: number): string | undefined {
    const iface = device.interfaces[index];
    if (!iface) return undefined;
    if (iface.color) return TAG_HEX[iface.color];
    if (!isSwitchType(device.type) || iface.trunk) return undefined;
    const color = vlanColor(editor.topology, iface.vlan ?? 1);
    return color ? TAG_HEX[color] : undefined;
  }

  const labelA = $derived(portLabel(a, cable.a.iface));
  const labelB = $derived(portLabel(b, cable.b.iface));
  /** Knapp auf der Zeichenfläche (P1 statt Port 1). */
  const shortA = $derived(portLabel(a, cable.a.iface, true));
  const shortB = $derived(portLabel(b, cable.b.iface, true));

  // Im Simulation: Ist ein Ende durch Spanning Tree blockiert?
  const blocked = $derived.by(() => {
    if (!editor.acting) return false;
    void simStore.tick;
    return ([['a', a], ['b', b]] as const).some(([end, device]) => {
      if (!isSwitchType(device.type) || !device.stp) return false;
      const port = simStore.sim?.getDeviceState(device.id).stp?.ports.find((p) => p.port === cable[end].iface);
      return port?.state === 'blocking';
    });
  });

  /**
   * Beide Geräte im selben Rack: als Patchkabel vom rechten Rand der Frontplatte durch den
   * Kabelkanal neben dem Rack zum anderen Gerät, statt quer über Symbole und Namen.
   */
  const PLATE_EDGE = 86;
  const PATCH_COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#eab308', '#a855f7', '#f97316'];
  const patch = $derived.by(() => {
    if (!a.rack || a.rack !== b.rack) return null;
    const lane = editor.topology.cables.filter((c) => {
      const da = editor.topology.devices.find((d) => d.id === c.a.device);
      const db = editor.topology.devices.find((d) => d.id === c.b.device);
      return da?.rack === a.rack && db?.rack === a.rack;
    }).findIndex((c) => c.id === cable.id);
    const x1 = a.position.x + PLATE_EDGE;
    const x2 = b.position.x + PLATE_EDGE;
    // Ausgänge je Gerät nach Port übereinander (gleiche Rechnung wie die Beschriftung am Gerät).
    const y1 = a.position.y + rackSlot(editor.topology, a.id, cable.id);
    const y2 = b.position.y + rackSlot(editor.topology, b.id, cable.id);
    const channel = Math.max(x1, x2) + 12 + (lane % 4) * 4;
    return {
      d: `M ${x1 - 8} ${y1} H ${x1} C ${channel} ${y1}, ${channel} ${y2}, ${x2} ${y2} H ${x2 - 8}`,
      color: PATCH_COLORS[lane % PATCH_COLORS.length]!,
      // LED gleich am Kabelausgang (die Frontplatte liegt über den Kabeln); den Port schreibt das Gerät.
      a: { x: x1 + 4, y: y1 },
      b: { x: x2 + 4, y: y2 },
      mid: { x: channel - 2, y: (y1 + y2) / 2 },
    };
  });

  const geometry = $derived.by(() => {
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const length = Math.hypot(dx, dy);
    // Liegen die Geräte zu nah beieinander, hätten die Beschriftungen keinen Platz.
    const ux = length ? dx / length : 0;
    const uy = length ? dy / length : 0;
    const leds =
      length > LED_DISTANCE * 2.4
        ? {
            a: { x: pa.x + ux * LED_DISTANCE, y: pa.y + uy * LED_DISTANCE },
            b: { x: pb.x - ux * LED_DISTANCE, y: pb.y - uy * LED_DISTANCE },
          }
        : null;
    if (length < LABEL_DISTANCE * 2.2) return { length, labels: null, leds };
    return {
      length,
      leds,
      labels: {
        a: { x: pa.x + ux * LABEL_DISTANCE, y: pa.y + uy * LABEL_DISTANCE },
        b: { x: pb.x - ux * LABEL_DISTANCE, y: pb.y - uy * LABEL_DISTANCE },
      },
    };
  });

  /**
   * Verkehr auf der Leitung: Die LEDs leuchten orange, solange Rahmen
   * unterwegs sind (und kurz danach), sonst grün bei bestehender Verbindung.
   */
  const ACTIVITY_HOLD_MS = 450;
  let lastActivity = $state(0);
  const busy = $derived.by(() => {
    if (!editor.acting) return false;
    void simStore.tick;
    return simStore.sim?.getInFlight().some((e) => e.cable === cable.id) ?? false;
  });
  $effect(() => {
    if (busy) lastActivity = performance.now();
  });
  const traffic = $derived((simStore.tick, editor.acting && (busy || performance.now() - lastActivity < ACTIVITY_HOLD_MS)));

  const ledEnds = $derived(
    geometry.leds
      ? [
          { end: 'a' as const, device: a, p: geometry.leds.a },
          { end: 'b' as const, device: b, p: geometry.leds.b },
        ]
      : [],
  );

  function select(event: Event) {
    event.stopPropagation();
    editor.select({ kind: 'cable', id: cable.id });
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select(event);
    }
  }
</script>

<g
  data-hover="cable:{cable.id}"
  class="cable medium-{medium}"
  class:selected
  class:down={!status.up}
  class:faded
  role="button"
  tabindex="0"
  aria-pressed={selected}
  aria-label={t('canvas.cable', { a: `${a.name} (${labelA})`, b: `${b.name} (${labelB})` })}
  onpointerdown={select}
  onfocus={() => editor.tool === 'select' && editor.select({ kind: 'cable', id: cable.id })}
  {onkeydown}
>
  {#if patch}
    <path class="hit" d={patch.d} />
    <path class="wire patch" class:damaged={!!cable.loss} class:blocked d={patch.d} style:stroke={cable.loss || blocked ? undefined : (endColor(a, cable.a.iface) ?? endColor(b, cable.b.iface) ?? (medium === 'fiber' ? undefined : patch.color))} />
    {#each [{ end: 'a' as const, device: a, p: patch.a }, { end: 'b' as const, device: b, p: patch.b }] as { end, device, p } (end)}
      <circle class="led" class:up={status.up} class:traffic={status.up && traffic} class:off={device.interfaces[cable[end].iface]?.shutdown} cx={p.x} cy={p.y} r="3">
        <title>{status.up ? (traffic ? t('link.traffic') : t('link.up')) : t(`link.down.${status.reason ?? 'unknown'}`)}</title>
      </circle>
    {/each}
  {:else}
  <line class="hit" x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} />
  <line class="wire" class:damaged={!!cable.loss} class:blocked x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} />
  {#if medium === 'coax'}
    <line class="core" x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} />
  {/if}
  {#if medium === 'serial' || medium === 'dsl' || medium === 'cellular' || medium === 'coax'}
    <g class="medium-badge" transform="translate({(pa.x + pb.x) / 2} {(pa.y + pb.y) / 2})">
      <rect x="-15" y="-8" width="30" height="16" rx="8" />
      <text y="1">{{ serial: 'S', dsl: 'DSL', cellular: '4G', coax: 'COAX' }[medium]}</text>
    </g>
  {/if}
  {#if medium === 'wireless'}
    <g class="wifi-badge" transform="translate({(pa.x + pb.x) / 2} {(pa.y + pb.y) / 2})">
      <circle r="11" />
      <path d="M-6 -1 Q0 -7 6 -1 M-3.5 2 Q0 -1.5 3.5 2" />
      <circle class="dotc" cy="5" r="1.4" />
      {#if status.signal !== undefined}
        <text y="22">{status.signal} %</text>
      {/if}
    </g>
  {/if}
  {#if geometry.leds}
    {#each ledEnds as { end, device, p } (end)}
      {@const tag = endColor(device, cable[end].iface)}
      <circle
        class="led"
        class:up={status.up}
        class:traffic={status.up && traffic}
        class:off={device.interfaces[cable[end].iface]?.shutdown}
        cx={p.x}
        cy={p.y}
        r="4.5"
        style:stroke={tag}
        style:stroke-width={tag ? 3.5 : undefined}
      >
        <title>{status.up ? (traffic ? t('link.traffic') : t('link.up')) : t(`link.down.${status.reason ?? 'unknown'}`)}</title>
      </circle>
    {/each}
  {/if}
  {#if blocked}
    <text class="blocked-label" x={(pa.x + pb.x) / 2} y={(pa.y + pb.y) / 2 + 14}>{t('switch.blockedCable')}</text>
  {/if}
  {#if geometry.labels && ui.showPortLabels}
    <text class="port" x={geometry.labels.a.x} y={geometry.labels.a.y} style:fill={endColor(a, cable.a.iface)}>{shortA}</text>
    <text class="port" x={geometry.labels.b.x} y={geometry.labels.b.y} style:fill={endColor(b, cable.b.iface)}>{shortB}</text>
  {/if}
  {#if cable.loss}
    <text class="loss" x={(pa.x + pb.x) / 2} y={(pa.y + pb.y) / 2 - 8}>⚡ {cable.loss} %</text>
  {/if}
  {/if}
</g>

<style>
  .patch {
    fill: none;
    stroke-linecap: round;
    stroke-width: 3;
  }
  .patch.blocked,
  .patch.damaged {
    stroke-width: 3;
  }
  .hit:is(path) {
    fill: none;
  }

  .cable {
    cursor: pointer;
    outline: none;
  }
  .hit {
    stroke: transparent;
    stroke-width: 14;
  }
  .wire {
    stroke: var(--cable);
    stroke-width: 2.5;
    stroke-linecap: round;
  }
  /* Beschädigtes Kabel: gestrichelt und in Warnfarbe, damit es bei der Fehlersuche auffallen kann. */
  .wire.damaged {
    stroke: var(--danger);
    stroke-dasharray: 8 5;
  }
  /* Von Spanning Tree blockiert: blass und fein gepunktet. */
  .wire.blocked {
    opacity: 0.45;
    stroke-dasharray: 2 6;
  }
  .blocked-label {
    font-size: 11px;
    text-anchor: middle;
    fill: var(--muted);
    paint-order: stroke;
    stroke: var(--bg);
    stroke-width: 4px;
    pointer-events: none;
  }
  .loss {
    font-size: 11px;
    font-weight: 600;
    text-anchor: middle;
    fill: var(--danger);
    paint-order: stroke;
    stroke: var(--bg);
    stroke-width: 4px;
    stroke-linejoin: round;
    pointer-events: none;
  }
  .medium-fiber .wire {
    stroke: var(--fiber, #ef6c00);
    stroke-width: 3.5;
  }
  .medium-wireless .wire {
    stroke: var(--wireless, #2563eb);
    stroke-width: 2;
    stroke-dasharray: 1 7;
    stroke-linecap: round;
  }
  .medium-serial .wire {
    stroke: var(--serial, #b91c1c);
    stroke-width: 3;
    stroke-dasharray: 14 4 3 4;
  }
  .medium-coax .wire {
    stroke: var(--coax, #374151);
    stroke-width: 5;
  }
  .core {
    stroke: #cbd5e1;
    stroke-width: 1.5;
    pointer-events: none;
  }
  .medium-dsl .wire {
    stroke: var(--dsl, #15803d);
    stroke-width: 2;
    stroke-dasharray: 6 4;
  }
  .medium-cellular .wire {
    stroke: var(--cellular, #7c3aed);
    stroke-width: 2;
    stroke-dasharray: 1 6;
    stroke-linecap: round;
  }
  .medium-badge rect {
    fill: var(--surface);
    stroke: var(--border);
  }
  .medium-badge text {
    font-size: 8.5px;
    font-weight: 700;
    text-anchor: middle;
    dominant-baseline: middle;
    fill: var(--muted);
    pointer-events: none;
  }
  .led.off {
    fill: var(--bg);
  }
  .down .wire {
    opacity: 0.5;
  }
  .faded {
    opacity: 0.15;
  }
  .wifi-badge circle:not(.dotc) {
    fill: var(--surface);
    stroke: var(--wireless, #2563eb);
    stroke-width: 1.5;
  }
  .wifi-badge path {
    fill: none;
    stroke: var(--wireless, #2563eb);
    stroke-width: 1.6;
    stroke-linecap: round;
  }
  .wifi-badge .dotc {
    fill: var(--wireless, #2563eb);
  }
  .wifi-badge text {
    font-size: 10px;
    text-anchor: middle;
    fill: var(--muted);
    paint-order: stroke;
    stroke: var(--bg);
    stroke-width: 3px;
  }
  .led {
    fill: var(--led-down, #dc2626);
    stroke: var(--bg);
    stroke-width: 1.5;
  }
  .led.traffic {
    fill: var(--led-traffic, #f97316) !important;
    animation: blink 0.28s steps(2, jump-none) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0.55;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .led.traffic {
      animation: none;
    }
  }
  .led.up {
    fill: var(--led-up, #16a34a);
  }
  .cable:hover .wire {
    stroke-width: 3.5;
  }
  .selected .wire {
    stroke: var(--accent);
    stroke-width: 4;
  }
  .cable:focus-visible .hit {
    stroke: var(--focus-soft);
  }
  .port {
    font-size: 11px;
    text-anchor: middle;
    dominant-baseline: middle;
    fill: var(--muted);
    paint-order: stroke;
    stroke: var(--bg);
    stroke-width: 4px;
    stroke-linejoin: round;
    user-select: none;
    pointer-events: none;
  }
</style>
