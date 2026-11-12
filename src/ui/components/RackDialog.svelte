<script lang="ts">
  import { tick } from 'svelte';
  import { floorsOf, linkStatus, type Cable, type Device } from '../../core';
  import { t } from '../../i18n';
  import { interfaceLabel, typeLabel } from '../labels';
  import { TAG_HEX } from '../tags';
  import { editor } from '../state/editor.svelte';
  import PortPanel from './PortPanel.svelte';

  /**
   * Rack-Ansicht: alle Netzwerkgeräte als Einschübe in einem 19-Zoll-Schrank,
   * pro Stockwerk ein Rack. Die Frontplatten zeigen Link-LEDs und Farbtags,
   * Kabel lassen sich hier direkt umstecken.
   */
  let { onclose }: { onclose: () => void } = $props();
  let dialog: HTMLDialogElement;

  $effect(() => {
    dialog.showModal();
  });

  const RACK_TYPES = new Set(['switch', 'l3switch', 'router', 'firewall', 'modem']);
  const floors = $derived(floorsOf(editor.topology));
  const byY = (a: Device, b: Device) => a.position.y - b.position.y || a.position.x - b.position.x;
  // Echte Racks von der Karte; nicht eingebaute Geräte pro Stockwerk in einem «freien» Rack.
  const racks = $derived([
    ...(editor.topology.areas ?? [])
      .filter((a) => a.kind === 'rack')
      .map((a) => ({ name: a.title, devices: editor.topology.devices.filter((d) => d.rack === a.id).sort(byY) })),
    ...floors.map((floor, index) => ({
      name: t('rack.unmounted', { floor: floor.name || t('rack.single') }),
      devices: editor.topology.devices.filter((d) => RACK_TYPES.has(d.type) && !d.rack && (d.floor ?? 0) === index).sort(byY),
    })),
  ].filter((r) => r.devices.length > 0));

  const units = (d: Device) => (d.interfaces.length > 24 ? 2 : 1);

  // --- Verkabelung ------------------------------------------------------------------------
  // Kabel zwischen zwei Geräten im selben Rack als Patchkabel über die Front, geführt durch
  // einen Kabelkanal rechts; Kabel zu Geräten ausserhalb als Hinweis am Einschub.

  const PATCH = ['#3b82f6', '#22c55e', '#ef4444', '#eab308', '#a855f7', '#f97316', '#14b8a6', '#ec4899'];
  const FIBER = '#22d3ee';
  const byId = $derived(new Map(editor.topology.devices.map((d) => [d.id, d])));

  /** Farbe wie im Schrank: Farbtag des Ports, sonst Glasfaser türkis, Kupfer im Wechsel. */
  function colorOf(cable: Cable, n: number): string {
    const tag = byId.get(cable.a.device)?.interfaces[cable.a.iface]?.color ?? byId.get(cable.b.device)?.interfaces[cable.b.iface]?.color;
    if (tag) return TAG_HEX[tag];
    return cable.medium === 'fiber' ? FIBER : PATCH[n % PATCH.length]!;
  }

  const patchCables = (devices: Device[]) => {
    const ids = new Set(devices.map((d) => d.id));
    return editor.topology.cables.filter((c) => ids.has(c.a.device) && ids.has(c.b.device) && c.a.device !== c.b.device);
  };

  /** Ports mit Kabel zu einem Gerät ausserhalb dieses Racks. */
  function outside(device: Device, devices: Device[]): { port: string; peer: string }[] {
    const ids = new Set(devices.map((d) => d.id));
    return editor.topology.cables.flatMap((c) => {
      const [own, other] = c.a.device === device.id ? [c.a, c.b] : c.b.device === device.id ? [c.b, c.a] : [null, null];
      if (!own || !other || ids.has(other.device)) return [];
      return [{ port: interfaceLabel(device, own.iface, true), peer: byId.get(other.device)?.name ?? '' }];
    });
  }

  type Drawn = { id: string; d: string; color: string; title: string; up: boolean; ends: string[] };
  let drawn = $state<Record<string, Drawn[]>>({});
  let size = $state<Record<string, { w: number; h: number }>>({});
  let hovered = $state<string | null>(null);
  const frames: Record<string, HTMLElement> = {};

  function portEl(frame: HTMLElement, device: string, iface: number): HTMLElement | null {
    return frame.querySelector(`.panel[data-device="${CSS.escape(device)}"] [data-port="${iface}"]`);
  }

  function layout() {
    const next: Record<string, Drawn[]> = {};
    const sizes: Record<string, { w: number; h: number }> = {};
    for (const rack of racks) {
      const frame = frames[rack.name];
      if (!frame) continue;
      const box = frame.getBoundingClientRect();
      sizes[rack.name] = { w: box.width, h: box.height };
      // Kabelkanal: gleich rechts neben dem breitesten Portfeld (letzter Port).
      const ports = [...frame.querySelectorAll<HTMLElement>('[data-port]')];
      const channel = Math.max(0, ...ports.map((p) => p.getBoundingClientRect().right - box.left)) + 16;
      next[rack.name] = patchCables(rack.devices).flatMap((c, n) => {
        const a = portEl(frame, c.a.device, c.a.iface);
        const b = portEl(frame, c.b.device, c.b.iface);
        if (!a || !b) return [];
        const pa = a.getBoundingClientRect();
        const pb = b.getBoundingClientRect();
        const x1 = pa.left + pa.width / 2 - box.left;
        const x2 = pb.left + pb.width / 2 - box.left;
        // Obere Portreihe: Kabel nach oben weg, untere nach unten.
        const e1 = pa.top + pa.height / 2 < (a.closest('.panel')!.getBoundingClientRect().top + a.closest('.panel')!.getBoundingClientRect().bottom) / 2 ? -1 : 1;
        const e2 = pb.top + pb.height / 2 < (b.closest('.panel')!.getBoundingClientRect().top + b.closest('.panel')!.getBoundingClientRect().bottom) / 2 ? -1 : 1;
        const y1 = (e1 < 0 ? pa.top + 6 : pa.bottom - 6) - box.top;
        const y2 = (e2 < 0 ? pb.top + 6 : pb.bottom - 6) - box.top;
        const cm = channel + (n % 8) * 6;
        const mid = (y1 + y2) / 2;
        const d = `M ${x1} ${y1} C ${x1} ${y1 + e1 * 24}, ${cm} ${y1 + e1 * 12}, ${cm} ${mid} S ${x2} ${y2 + e2 * 24}, ${x2} ${y2}`;
        const da = byId.get(c.a.device);
        const db = byId.get(c.b.device);
        const title = da && db ? `${da.name} ${interfaceLabel(da, c.a.iface, true)} ↔ ${db.name} ${interfaceLabel(db, c.b.iface, true)}` : '';
        return [{ id: c.id, d, color: colorOf(c, n), title, up: linkStatus(editor.topology, c).up, ends: [`${c.a.device}:${c.a.iface}`, `${c.b.device}:${c.b.iface}`] }];
      });
    }
    drawn = next;
    size = sizes;
  }

  // Neu zeichnen, wenn sich Netz oder Fenstergrösse ändert.
  $effect(() => {
    void editor.topology;
    void racks;
    void tick().then(layout);
    const ro = new ResizeObserver(() => layout());
    for (const f of Object.values(frames)) ro.observe(f);
    return () => ro.disconnect();
  });

  /** Port unter der Maus: sein Kabel hervorheben. */
  function hover(event: Event) {
    const port = (event.target as HTMLElement).closest<HTMLElement>('[data-port]');
    const panel = port?.closest<HTMLElement>('.panel');
    hovered = port && panel ? `${panel.dataset.device}:${port.dataset.port}` : null;
  }
</script>

<dialog bind:this={dialog} aria-labelledby="rack-title" onclose={onclose}>
  <h2 id="rack-title">{t('rack.title')}</h2>
  <p class="muted">{t('rack.help')}</p>

  {#if racks.length === 0}
    <p class="muted">{t('rack.empty')}</p>
  {/if}

  <div class="racks">
    {#each racks as rack (rack.name)}
      <section class="rack" aria-label={t('rack.label', { name: rack.name })}>
        <h3>{rack.name}</h3>
        <!-- svelte-ignore a11y_no_static_element_interactions (nur Hervorheben beim Überfahren) -->
        <div class="frame" bind:this={frames[rack.name]} onmouseover={hover} onfocusin={hover} onmouseleave={() => (hovered = null)}>
          {#each rack.devices as device, i (device.id)}
            {@const ext = outside(device, rack.devices)}
            <div class="unit" style:--u={units(device)}>
              <span class="ear" aria-hidden="true"><i></i><i></i></span>
              <span class="u" aria-hidden="true">{i + 1}</span>
              <div class="label">
                <strong class="tape" title={device.name}>{device.name}</strong>
                <span class="type">{typeLabel(device.type)}</span>
              </div>
              <div class="front">
                <PortPanel {device} />
                {#if ext.length}
                  <ul class="ext" aria-label={t('rack.outside')}>
                    {#each ext as e, k (k)}<li><span class="mono">{e.port}</span> → {e.peer}</li>{/each}
                  </ul>
                {/if}
              </div>
              <span class="status" aria-hidden="true"><span class="pwr"></span>PWR</span>
              <span class="ear" aria-hidden="true"><i></i><i></i></span>
            </div>
          {/each}
          <div class="blank"></div>
          {#if drawn[rack.name]?.length}
            <svg class="cables" width={size[rack.name]?.w ?? 0} height={size[rack.name]?.h ?? 0} aria-hidden="true">
              {#each drawn[rack.name] ?? [] as c (c.id)}
                {@const hot = !!hovered && c.ends.includes(hovered)}
                <path class="shadow" d={c.d} />
                <path class="cable" class:hot class:dim={!!hovered && !hot} class:down={!c.up} d={c.d} stroke={c.color}><title>{c.title}</title></path>
              {/each}
            </svg>
          {/if}
        </div>
        {#if drawn[rack.name]?.length}
          <p class="muted small">{t('rack.cables', { n: drawn[rack.name]?.length ?? 0 })}</p>
        {/if}
      </section>
    {/each}
  </div>

  <div class="actions">
    <button onclick={() => dialog.close()}>{t('about.close')}</button>
  </div>
</dialog>

<style>
  dialog {
    width: min(980px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    padding: 20px 24px;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.35);
  }
  h2 {
    margin: 0 0 4px;
    font-size: 1.15rem;
  }
  h3 {
    margin: 0 0 6px;
    font-size: 0.9rem;
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
    margin: 4px 0 12px;
  }
  .racks {
    display: grid;
    gap: 18px;
  }
  .frame {
    position: relative;
    padding: 10px 56px 10px 18px;
    border-radius: 8px;
    background: repeating-linear-gradient(to bottom, #111827 0 2px, #1f2937 2px 6px);
    border-left: 14px solid #374151;
    border-right: 14px solid #374151;
    display: grid;
    gap: 6px;
  }
  .unit {
    display: grid;
    grid-template-columns: 14px 1.2rem minmax(8rem, 11rem) minmax(0, 1fr) auto 14px;
    align-items: center;
    gap: 10px;
    min-height: calc(var(--u) * 54px);
    padding: 4px 4px;
    background: linear-gradient(to bottom, #333d4a, #2a333e);
    border: 1px solid #3c4756;
    border-radius: 4px;
    color: #e6ebf1;
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06);
  }
  /* Rack-Ohren mit Schrauben */
  .ear {
    align-self: stretch;
    display: grid;
    align-content: space-around;
    justify-items: center;
    background: #4b5563;
    border-radius: 2px;
  }
  .ear i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #1f2937;
    box-shadow: inset 0 0 0 1px #6b7280;
  }
  /* Beschriftung wie mit dem Etikettendrucker: weisses Band, dunkle Schrift */
  .tape {
    justify-self: start;
    max-width: 100%;
    padding: 2px 8px;
    border-radius: 2px;
    background: #f8fafc;
    color: #0f172a;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 0.86rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.5);
  }
  .type {
    margin-top: 3px;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.6rem;
    letter-spacing: 0.05em;
    color: #9ca3af;
  }
  .pwr {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 5px #22c55e;
  }
  .ext {
    display: flex;
    flex-wrap: wrap;
    gap: 3px 10px;
    margin: 2px 0 0;
    padding: 0 4px;
    list-style: none;
    font-size: 0.68rem;
    color: #9ca3af;
  }
  .mono {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  .cables {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: visible;
  }
  .cable {
    fill: none;
    stroke-width: 3;
    stroke-linecap: round;
    opacity: 0.9;
    transition: opacity 0.15s, stroke-width 0.15s;
  }
  .shadow {
    fill: none;
    stroke: rgb(0 0 0 / 0.45);
    stroke-width: 5;
  }
  .cable.down {
    stroke-dasharray: 6 4;
  }
  .cable.hot {
    stroke-width: 5;
    opacity: 1;
  }
  .cable.dim {
    opacity: 0.25;
  }
  .small {
    font-size: 0.75rem;
    margin: 4px 0 0;
  }
  .u {
    font-size: 0.7rem;
    color: #9ca3af;
    text-align: center;
  }
  .label {
    display: grid;
    font-size: 0.8rem;
    line-height: 1.2;
    min-width: 0;
  }
  .front {
    min-width: 0;
  }
  .front :global(.panel) {
    width: fit-content;
  }
  .label span {
    color: #9ca3af;
    font-size: 0.7rem;
  }
  .label strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    .cable {
      transition: none;
    }
  }
  .front :global(.panel) {
    padding: 4px;
  }
  .front :global(p.muted) {
    display: none;
  }
  .blank {
    height: 24px;
    border: 1px dashed #4b5563;
    border-radius: 4px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }
</style>
