<script lang="ts">
  import { DEVICE_SPECS, cablesOf, getCable, getDevice, linkStatus, mediumOf, otherEnd, parseMask } from '../../core';
  import { t } from '../../i18n';
  import { interfaceLabel, typeLabel } from '../labels';
  import { layersOf } from '../osiSteps';
  import { protocolOf, toRow } from '../packets';
  import { duplicates } from '../state/duplicates.svelte';
  import { editor } from '../state/editor.svelte';
  import { simStore } from '../state/sim.svelte';

  /**
   * Details beim Überfahren mit der Maus (Simulation): Geräte zeigen Adressen
   * und Tabellen, Kabel ihren Zustand und Verkehr, Pakete Protokoll, Quelle,
   * Ziel und OSI-Schichten.
   */
  let { target, x, y, width }: { target: string; x: number; y: number; width: number } = $props();

  const [kind, id] = $derived(target.split(':') as [string, string]);

  interface Card {
    title: string;
    subtitle?: string;
    rows: [string, string][];
    layers?: number[];
    warning?: string;
  }

  const card = $derived.by((): Card | null => {
    void simStore.tick;
    const sim = simStore.sim;
    const topology = editor.topology;
    if (kind === 'device') {
      const d = getDevice(topology, id);
      if (!d) return null;
      const state = sim?.getDeviceState(d.id);
      const rows: [string, string][] = [];
      const endpoint = DEVICE_SPECS[d.type].role === 'endpoint';
      if (endpoint && d.dhcp) {
        const a = state?.address;
        rows.push([t('hover.address'), a?.ip ? `${a.ip}/${parseMask(a.mask ?? '') ?? ''} (DHCP)` : t('hover.dhcpPending')]);
      }
      for (const i of d.interfaces) {
        if (!i.ip || (endpoint && d.dhcp)) continue;
        const prefix = i.mask ? parseMask(i.mask) : null;
        rows.push([interfaceLabel(d, i.index), `${i.ip}${prefix !== null ? `/${prefix}` : ''}`]);
      }
      if (endpoint && d.interfaces[0]?.mac) rows.push(['MAC', d.interfaces[0].mac]);
      if (endpoint && (d.gateway || state?.address?.gateway)) rows.push([t('config.gateway'), (d.dhcp ? state?.address?.gateway : d.gateway) ?? '–']);
      const cables = cablesOf(topology, d.id);
      const up = cables.filter((c) => linkStatus(topology, c).up).length;
      rows.push([t('hover.links'), t('hover.linksValue', { up, total: cables.length })]);
      if (state?.arp) rows.push([t('hover.arp'), String(state.arp.length)]);
      if (state?.macTable) rows.push([t('hover.mac'), String(state.macTable.length)]);
      if (state?.routes) rows.push([t('hover.routes'), String(state.routes.length)]);
      if (state?.nat?.length) rows.push(['NAT', String(state.nat.length)]);
      const dup = duplicates.of(d.id);
      return { title: d.name, subtitle: typeLabel(d.type), rows, ...(dup.length ? { warning: t('canvas.duplicateIp', { ip: dup.join(', ') }) } : {}) };
    }
    if (kind === 'cable') {
      const c = getCable(topology, id);
      if (!c) return null;
      const a = getDevice(topology, c.a.device);
      const b = getDevice(topology, c.b.device);
      if (!a || !b) return null;
      const status = linkStatus(topology, c);
      const frames = sim?.getPacketLog().filter((e) => e.cable === c.id).length ?? 0;
      const busy = sim?.getInFlight().some((e) => e.cable === c.id) ?? false;
      const rows: [string, string][] = [
        [t('hover.medium'), t(`medium.${mediumOf(c)}`)],
        [t('hover.state'), status.up ? (busy ? t('link.traffic') : t('link.up')) : t(`link.down.${status.reason ?? 'unknown'}`)],
        [t('hover.frames'), String(frames)],
      ];
      if (status.signal !== undefined) rows.push([t('hover.signal'), `${status.signal} %`]);
      if (c.loss) rows.push([t('hover.loss'), `${c.loss} %`]);
      return { title: `${a.name} ↔ ${b.name}`, subtitle: `${interfaceLabel(a, c.a.iface)} ↔ ${interfaceLabel(b, c.b.iface)}`, rows };
    }
    if (kind === 'packet') {
      const entry = sim?.getInFlight().find((e) => e.id === Number(id));
      if (!entry) return null;
      const row = toRow(topology, entry);
      const from = getDevice(topology, entry.from.device);
      const to = getDevice(topology, entry.to.device);
      return {
        title: `#${entry.id} ${protocolOf(entry.frame)}`,
        subtitle: row.info,
        rows: [
          [t('hover.source'), row.source],
          [t('hover.destination'), row.destination],
          [t('hover.path'), `${from?.name ?? '?'} → ${to?.name ?? '?'}`],
        ],
        layers: layersOf(topology, entry).layers,
      };
    }
    return null;
  });

  // Nicht über den Rand hinaus: nahe am rechten Rand links vom Zeiger zeigen.
  const left = $derived(x + 280 > width ? x - 276 : x + 16);
</script>

{#if card}
  <div class="hover-card" style:left="{left}px" style:top="{y + 14}px" role="tooltip">
    <strong>{card.title}</strong>
    {#if card.subtitle}<span class="sub">{card.subtitle}</span>{/if}
    {#if card.warning}<p class="warn">❗ {card.warning}</p>{/if}
    <dl>
      {#each card.rows as [k, v], i (i)}
        <dt>{k}</dt>
        <dd>{v}</dd>
      {/each}
    </dl>
    {#if card.layers}
      <div class="layers">
        {#each card.layers as n (n)}<span style:background="var(--osi-{n})" title={t(`osi.${n}.name`)}>{n}</span>{/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .hover-card {
    position: absolute;
    z-index: 9;
    width: 260px;
    padding: 8px 10px;
    font-size: 0.78rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.22);
    pointer-events: none;
    user-select: none;
    animation: appear 0.12s ease-out;
  }
  @keyframes appear {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
  strong {
    display: block;
    font-size: 0.85rem;
  }
  .sub {
    display: block;
    color: var(--muted);
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    margin: 4px 0 0;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    overflow-wrap: anywhere;
  }
  .warn {
    margin: 4px 0;
    color: var(--danger);
    font-weight: 600;
  }
  .layers {
    display: flex;
    gap: 3px;
    margin-top: 6px;
  }
  .layers span {
    min-width: 18px;
    text-align: center;
    border-radius: 3px;
    color: #fff;
    font-weight: 700;
    font-size: 0.7rem;
  }
</style>
