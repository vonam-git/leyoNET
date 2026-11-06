<script lang="ts">
  import { untrack } from 'svelte';
  import { getDevice, type Device, type DocArea, type Point, type TagColor } from '../../core';
  import { t } from '../../i18n';
  import { presetArea } from '../areaPresets';
  import { SHOP_MIME } from '../dnd';
  import { SHOP } from '../shop';
  import { protocolClass, protocolOf } from '../packets';
  import { layersOf } from '../osiSteps';
  import { DEVICE_SPECS, hasCli } from '../../core';
  import { openCli } from '../state/cli.svelte';
  import { openDesktop } from '../state/desktop.svelte';
  import { dialogs } from '../state/dialogs.svelte';
  import { GRID, editor } from '../state/editor.svelte';
  import { shop } from '../state/shop.svelte';
  import { simStore } from '../state/sim.svelte';
  import { ui } from '../state/ui.svelte';
  import { TAG_ORDER } from '../tags';
  import AreaShape from './AreaShape.svelte';
  import CableLine from './CableLine.svelte';
  import DeviceNode from './DeviceNode.svelte';
  import HoverCard from './HoverCard.svelte';
  import PortPicker from './PortPicker.svelte';
  import TourPanel from './TourPanel.svelte';
  import { tour } from '../state/tour.svelte';

  let svg: SVGSVGElement;
  let width = $state(0);
  let height = $state(0);
  let pointer = $state<Point | null>(null);
  let panFrom = $state<Point | null>(null);
  /** Abstand Gerätemitte – Mauszeiger beim Greifen, damit das Gerät nicht springt. */
  let drag: { id: string; offset: Point } | null = null;
  /** Bereich verschieben oder in der Grösse ändern (Dokumentationsmodus). */
  let areaDrag: { id: string; kind: 'move' | 'resize'; start: Point; origin: DocArea } | null = null;
  /** Neuer Bereich, der gerade aufgezogen wird. */
  let drawing = $state<{ from: Point; to: Point } | null>(null);
  /** Auswahlrahmen (Entwurf): alles darin wählen; `click` gilt, solange die Maus kaum bewegt wurde. */
  let frame = $state<{ from: Point; to: Point; additive: boolean; screen: Point; click?: () => void } | null>(null);
  /** Mehrere Geräte und Bereiche gemeinsam ziehen (Auswahl oder Bereich mit Inhalt). */
  let groupDrag: { start: Point; devices: string[]; areas: string[] } | null = null;
  /** Leertaste gedrückt: Ziehen verschiebt die Ansicht. */
  let spaceHeld = $state(false);

  const visibleFloor = (floor: number | undefined) => ui.floor === 'all' || floor === undefined || floor === ui.floor;

  /** Liegt ein Gerät auf einem anderen als dem gewählten Stockwerk? */
  const offFloor = (d: Device) => ui.floor !== 'all' && (d.floor ?? 0) !== ui.floor;
  const areaOffFloor = (a: DocArea) => ui.floor !== 'all' && a.floor !== undefined && a.floor !== ui.floor;
  const areas = $derived(editor.topology.areas ?? []);

  // untrack: setCanvasSize liest und verschiebt die Ansicht, das darf diesen Effekt nicht erneut auslösen.
  $effect(() => {
    const size = { width, height };
    untrack(() => editor.setCanvasSize(size.width, size.height));
  });

  // Wheel-Listener müssen aktiv (nicht passiv) sein, damit die Seite nicht scrollt.
  $effect(() => {
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const p = local(event);
      editor.zoomAt(Math.exp(-event.deltaY * 0.0015), p.x, p.y);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  });

  const view = $derived(editor.view);
  const source = $derived(editor.cableSource ? getDevice(editor.topology, editor.cableSource) : undefined);
  const cables = $derived(
    editor.topology.cables.flatMap((cable) => {
      const a = getDevice(editor.topology, cable.a.device);
      const b = getDevice(editor.topology, cable.b.device);
      return a && b ? [{ cable, a, b }] : [];
    }),
  );

  /**
   * Rahmen unterwegs als kleine Pakete, die vom Sender zum Empfänger wandern.
   * Läuft die Simulation, sind sie nach Protokoll gefärbt. Im Einzelschritt
   * (angehalten) zeigen sie ihre OSI-Schichten ineinander geschachtelt; ein
   * ankommender Rahmen wird beim Empfänger Schicht für Schicht ausgepackt.
   */
  const osiView = $derived(simStore.paused);
  const packets = $derived.by(() => {
    void simStore.tick;
    const sim = simStore.sim;
    if (!editor.acting || !sim) return [];
    const unpackingId = simStore.unpacking?.entryId;
    return sim.getInFlight().flatMap((entry) => {
      if (entry.id === unpackingId) return [];
      const from = getDevice(editor.topology, entry.from.device);
      const to = getDevice(editor.topology, entry.to.device);
      if (!from || !to) return [];
      const raw = Math.min(1, Math.max(0, (sim.now - entry.sent) / (entry.arrives - entry.sent)));
      // Nicht unter den Gerätesymbolen verschwinden: Weg zwischen den Rändern der Symbole.
      const length = Math.hypot(to.position.x - from.position.x, to.position.y - from.position.y);
      const edge = length > 110 ? 42 / length : 0;
      const progress = edge + (1 - 2 * edge) * raw;
      return [
        {
          id: entry.id,
          x: from.position.x + (to.position.x - from.position.x) * progress,
          y: from.position.y + (to.position.y - from.position.y) * progress,
          protocol: protocolClass(protocolOf(entry.frame)),
          label: protocolOf(entry.frame),
          layers: osiView ? layersOf(editor.topology, entry).layers : [],
        },
      ];
    });
  });

  /** Paket, das gerade beim Empfänger ausgepackt wird (Einzelschritt). */
  const unpack = $derived.by(() => {
    const u = simStore.unpacking;
    if (!u || !editor.acting) return null;
    const device = getDevice(editor.topology, u.deviceId);
    if (!device) return null;
    const layer = u.layers[u.index]!;
    return { ...u, x: device.position.x, y: device.position.y - 64, layer, visible: u.layers.slice(u.index), last: u.index === u.layers.length - 1 };
  });

  /** Mauszeiger über Gerät, Kabel oder Paket (nur Simulation): Details-Karte. */
  let hover = $state<{ target: string; x: number; y: number } | null>(null);
  function onHoverMove(event: PointerEvent) {
    if (!editor.acting || event.buttons) {
      hover = null;
      return;
    }
    const el = (event.target as Element | null)?.closest('[data-hover]');
    const target = el?.getAttribute('data-hover');
    if (!target) {
      hover = null;
      return;
    }
    const p = local(event);
    hover = { target, x: p.x, y: p.y };
  }

  /**
   * Doppelklick auf ein Gerät: in der Simulation Desktop des Endgeräts; Router
   * und Switches öffnen ihre Befehlszeile, sonst die erweiterten Einstellungen.
   * Am SVG behandelt, weil die Zeigererfassung beim Ziehen Klicks dorthin lenkt.
   */
  function onDblClick(event: MouseEvent) {
    const el = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-hover^="device:"]');
    const device = el ? getDevice(editor.topology, el.getAttribute('data-hover')!.slice(7)) : undefined;
    if (!device) return;
    if (editor.acting && DEVICE_SPECS[device.type].role === 'endpoint') openDesktop(device.id);
    else if (hasCli(device.type) && ui.has('net.cli')) openCli(device.id);
    else dialogs.showDevice(device.id);
  }

  /** Geschachtelte Rechtecke: äusserste Schicht zuerst. */
  const shell = (i: number, w: number, h: number) => ({ x: -w / 2 + i * 3, y: -h / 2 + i * 2.6, width: Math.max(6, w - i * 6), height: Math.max(5, h - i * 5.2) });

  function local(event: { clientX: number; clientY: number }): Point {
    const rect = svg.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function world(event: { clientX: number; clientY: number }): Point {
    const p = local(event);
    return editor.screenToWorld(p.x, p.y);
  }

  function startGroupDrag(event: PointerEvent, devices: string[], areas: string[]) {
    groupDrag = { start: world(event), devices, areas };
    editor.beginDrag();
    svg.setPointerCapture(event.pointerId);
  }

  function onDevicePointerDown(event: PointerEvent, device: Device) {
    if (event.button !== 0 || spaceHeld) return;
    event.stopPropagation();
    if (offFloor(device)) return;
    if (editor.tool === 'cable') {
      editor.cableClick(device.id);
      return;
    }
    // Umschalt+Klick: zur Auswahl hinzufügen oder entfernen.
    if (event.shiftKey && editor.editable) {
      editor.toggleSelected('device', device.id);
      return;
    }
    // Teil einer Mehrfachauswahl: alle zusammen ziehen.
    if (editor.editable && editor.selection?.kind === 'group' && editor.isSelected('device', device.id)) {
      startGroupDrag(event, editor.selectedDeviceIds, editor.selectedAreaIds);
      return;
    }
    editor.select({ kind: 'device', id: device.id });
    // Auch in der Simulation verschiebbar: WLAN-Geräte wechseln dann den Access Point (Roaming).
    const p = world(event);
    drag = { id: device.id, offset: { x: device.position.x - p.x, y: device.position.y - p.y } };
    editor.beginDrag();
    svg.setPointerCapture(event.pointerId);
  }

  function onAreaPointerDown(event: PointerEvent, area: DocArea, kind: 'move' | 'resize') {
    if (event.button !== 0 || spaceHeld) return;
    event.stopPropagation();
    if (kind === 'move') {
      // Umschalt: Rahmen aufziehen (auch innerhalb eines Bereichs); ohne Bewegung Bereich zur Auswahl dazu.
      if (event.shiftKey) {
        startFrame(event, true, () => editor.toggleSelected('area', area.id));
        return;
      }
      if (editor.selection?.kind === 'group' && editor.isSelected('area', area.id)) {
        startGroupDrag(event, editor.selectedDeviceIds, editor.selectedAreaIds);
        return;
      }
    }
    editor.select({ kind: 'area', id: area.id });
    areaDrag = { id: area.id, kind, start: world(event), origin: area };
    editor.beginDrag();
    svg.setPointerCapture(event.pointerId);
  }

  function startFrame(event: PointerEvent, additive: boolean, click?: () => void) {
    const p = world(event);
    frame = { from: p, to: p, additive, screen: local(event), ...(click ? { click } : {}) };
    svg.setPointerCapture(event.pointerId);
  }

  function onBackgroundPointerDown(event: PointerEvent) {
    if (event.button > 2) return;
    // Ansicht verschieben: mittlere oder rechte Maustaste, Leertaste + Ziehen.
    if (event.button !== 0 || spaceHeld) {
      panFrom = local(event);
      svg.setPointerCapture(event.pointerId);
      return;
    }
    if (editor.tool === 'area') {
      const p = world(event);
      drawing = { from: p, to: p };
      svg.setPointerCapture(event.pointerId);
      return;
    }
    if (editor.cableSource) {
      editor.cancel();
    } else if (editor.editable && editor.tool === 'select') {
      // Entwurf: Ziehen auf freier Fläche zieht einen Auswahlrahmen auf.
      startFrame(event, event.shiftKey, event.shiftKey ? undefined : () => editor.select(null));
      return;
    } else {
      editor.select(null);
    }
    panFrom = local(event);
    svg.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    const p = world(event);
    pointer = p;
    if (frame) {
      frame = { ...frame, to: p };
    } else if (groupDrag) {
      editor.dragGroup({ x: p.x - groupDrag.start.x, y: p.y - groupDrag.start.y }, groupDrag.devices, groupDrag.areas);
    } else if (drawing) {
      drawing = { ...drawing, to: p };
    } else if (areaDrag) {
      const dx = Math.round((p.x - areaDrag.start.x) / GRID) * GRID;
      const dy = Math.round((p.y - areaDrag.start.y) / GRID) * GRID;
      const o = areaDrag.origin;
      if (areaDrag.kind === 'move') editor.dragArea(areaDrag.id, { x: o.x + dx, y: o.y + dy });
      else editor.dragArea(areaDrag.id, { width: Math.max(80, o.width + dx), height: Math.max(60, o.height + dy) });
    } else if (drag) {
      editor.dragTo(drag.id, { x: p.x + drag.offset.x, y: p.y + drag.offset.y });
    } else if (panFrom) {
      const now = local(event);
      editor.panBy(now.x - panFrom.x, now.y - panFrom.y);
      panFrom = now;
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (frame) {
      const f = frame;
      frame = null;
      const now = local(event);
      if (Math.hypot(now.x - f.screen.x, now.y - f.screen.y) < 4) f.click?.();
      else
        editor.selectRect(
          { x: Math.min(f.from.x, f.to.x), y: Math.min(f.from.y, f.to.y), width: Math.abs(f.to.x - f.from.x), height: Math.abs(f.to.y - f.from.y) },
          f.additive,
          visibleFloor,
        );
      return;
    }
    if (groupDrag) {
      groupDrag = null;
      editor.endDrag();
      return;
    }
    if (drawing) {
      const { from, to } = drawing;
      drawing = null;
      const x = Math.min(from.x, to.x);
      const y = Math.min(from.y, to.y);
      const width = Math.abs(to.x - from.x);
      const height = Math.abs(to.y - from.y);
      if (width >= 40 && height >= 40) {
        const color: TagColor = TAG_ORDER[areas.length % TAG_ORDER.length]!;
        editor.addArea({
          title: t('area.defaultTitle', { n: areas.length + 1 }),
          color,
          x: Math.round(x / GRID) * GRID,
          y: Math.round(y / GRID) * GRID,
          width: Math.round(width / GRID) * GRID,
          height: Math.round(height / GRID) * GRID,
          ...(ui.floor !== 'all' ? { floor: ui.floor } : {}),
        });
        editor.setTool('select');
      }
      return;
    }
    if (areaDrag) {
      editor.endDrag();
      areaDrag = null;
    }
    if (drag) {
      editor.endDeviceDrag(drag.id);
      drag = null;
    }
    panFrom = null;
  }

  function onSpace(event: KeyboardEvent) {
    if (event.key !== ' ') return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable], button, .device-window, .desktop')) return;
    if (event.type === 'keyup') spaceHeld = false;
    else if (editor.editable) {
      spaceHeld = true;
      event.preventDefault();
    }
  }

  function onDragOver(event: DragEvent) {
    const types = event.dataTransfer?.types ?? [];
    if (!editor.editable || !types.includes(SHOP_MIME) || !event.dataTransfer) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  /** Gerät unter einem Punkt (für SFP-Module, die auf ein Gerät gezogen werden). */
  function deviceAt(p: Point): Device | undefined {
    return editor.topology.devices.find((d) => !offFloor(d) && Math.abs(d.position.x - p.x) <= 40 && Math.abs(d.position.y - p.y) <= 34);
  }

  /** Artikel aus dem Shop an der Mausposition einsetzen (Module auf das Gerät darunter). */
  function onDrop(event: DragEvent) {
    const data = event.dataTransfer;
    if (!data) return;
    const item = SHOP.find((i) => i.id === data.getData(SHOP_MIME));
    if (!item) return;
    event.preventDefault();
    const p = world(event);
    const floor = ui.floor === 'all' ? undefined : ui.floor;
    if (item.kind === 'device') {
      editor.addDevice(item.type, p, floor ?? 0, item.options ?? {}, item.prepare, item.options?.groupSize ? t('defaultName.clientgroup') : undefined);
    } else if (item.kind === 'sfp') {
      const target = deviceAt(p);
      if (target) editor.insertSfp(item.module, target.id);
      else editor.notify(t('sfp.dropOnDevice'), 'error');
    } else if (item.kind === 'area') {
      editor.addArea(presetArea(item.preset, p, areas.length + 1, floor));
    }
    shop.close();
  }
</script>

<svelte:window onkeydown={onSpace} onkeyup={onSpace} onblur={() => (spaceHeld = false)} />

<!-- Hover-Details sind eine Ergänzung; dieselben Angaben stehen im Inspektor. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="canvas" class:acting={editor.acting} class:stepping={editor.acting && simStore.paused} class:cable-mode={editor.tool === 'cable'} bind:clientWidth={width} bind:clientHeight={height} onpointermove={onHoverMove} onpointerleave={() => (hover = null)}>
  <svg
    bind:this={svg}
    class:panning={panFrom !== null}
    class:pan-ready={spaceHeld || editor.acting}
    class:cable-tool={editor.tool === 'cable' || editor.tool === 'area'}
    role="application"
    aria-label={t('canvas.label')}
    onpointerdown={onBackgroundPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    ondblclick={onDblClick}
    onpointercancel={onPointerUp}
    onpointerleave={() => (pointer = null)}
    oncontextmenu={(e) => e.preventDefault()}
    ondragover={onDragOver}
    ondrop={onDrop}
  >
    <defs>
      <pattern
        id="grid"
        width={GRID * 2}
        height={GRID * 2}
        patternUnits="userSpaceOnUse"
        patternTransform="translate({view.x} {view.y}) scale({view.scale})"
      >
        <circle class="dot" cx="1" cy="1" r="1" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#grid)" />

    <g transform="translate({view.x} {view.y}) scale({view.scale})">
      {#each areas as area (area.id)}
        <AreaShape
          {area}
          interactive={editor.editable && editor.tool === 'select'}
          faded={areaOffFloor(area)}
          onmove={(e, a) => onAreaPointerDown(e, a, 'move')}
          onresize={(e, a) => onAreaPointerDown(e, a, 'resize')}
        />
      {/each}
      {#if drawing}
        <rect
          class="drawing"
          x={Math.min(drawing.from.x, drawing.to.x)}
          y={Math.min(drawing.from.y, drawing.to.y)}
          width={Math.abs(drawing.to.x - drawing.from.x)}
          height={Math.abs(drawing.to.y - drawing.from.y)}
          rx="12"
        />
      {/if}
      {#if frame}
        <rect
          class="frame"
          x={Math.min(frame.from.x, frame.to.x)}
          y={Math.min(frame.from.y, frame.to.y)}
          width={Math.abs(frame.to.x - frame.from.x)}
          height={Math.abs(frame.to.y - frame.from.y)}
        />
      {/if}
      {#each cables as { cable, a, b } (cable.id)}
        <CableLine {cable} {a} {b} faded={offFloor(a) && offFloor(b)} />
      {/each}
      {#if source && pointer}
        <line class="rubber" x1={source.position.x} y1={source.position.y} x2={pointer.x} y2={pointer.y} />
      {/if}
      {#if tour.highlight}
        {@const target = getDevice(editor.topology, tour.highlight)}
        {#if target}
          <circle class="tour-ring" cx={target.position.x} cy={target.position.y} r="46" />
        {/if}
      {/if}
      {#each editor.topology.devices as device (device.id)}
        <DeviceNode {device} onpointerdown={onDevicePointerDown} faded={offFloor(device)} racked={!!device.rack} />
      {/each}
      {#each packets as p (p.id)}
        <g class="packet proto-{p.protocol}" transform="translate({p.x} {p.y})" data-hover="packet:{p.id}">
          {#if p.layers.length > 0}
            {#each p.layers as layer, i (layer)}
              {@const r = shell(i, 30, 22)}
              <rect class="shell" x={r.x} y={r.y} width={r.width} height={r.height} rx="3" style:fill="var(--osi-{layer})" />
            {/each}
          {:else}
            <rect class="envelope" x="-10" y="-7" width="20" height="14" rx="2.5" />
            <path class="flap" d="M-10 -6 L0 1 L10 -6" />
          {/if}
        </g>
      {/each}
      {#if unpack}
        <g class="unpack" transform="translate({unpack.x} {unpack.y})">
          <line class="unpack-link" x1="0" y1="18" x2="0" y2="34" />
          {#each unpack.visible as layer, i (layer)}
            {@const r = shell(i, 46, 32)}
            <rect class="shell" class:current={i === 0} x={r.x} y={r.y} width={r.width} height={r.height} rx="4" style:fill="var(--osi-{layer})" />
          {/each}
          <g class="unpack-label" transform="translate(30 -6)">
            <text class="l1" style:fill="var(--osi-{unpack.layer})">{t('unpack.layer', { n: unpack.layer, name: t(`osi.${unpack.layer}.name`) })}</text>
            <text class="l2" y="14">{unpack.names[unpack.layer] ?? ''}</text>
            {#if unpack.last}<text class="l3" y="28">{t(`unpack.${unpack.outcome}`)}</text>{/if}
          </g>
        </g>
      {/if}
    </g>
  </svg>

  {#if editor.topology.devices.length === 0 && !(editor.topology.areas ?? []).length}
    <p class="empty">{t('canvas.empty')}</p>
  {/if}
  <TourPanel />
  {#if hover && editor.acting}
    <HoverCard target={hover.target} x={hover.x} y={hover.y} {width} />
  {/if}
  {#if editor.acting && osiView && (unpack || packets.length > 0)}
    <div class="osi-legend" aria-label={t('unpack.legend')}>
      <strong>{t('unpack.legend')}</strong>
      <ol>
        {#each [1, 2, 3, 4, 5, 6, 7] as n (n)}
          <li class:current={unpack?.layer === n} class:done={!!unpack && unpack.layers.slice(0, unpack.index).includes(n as 1)} title={t(`osi.${n}.tip`)}>
            <span class="sw" style:background="var(--osi-{n})"></span>{n}<span class="nm">{t(`osi.${n}.name`)}</span>
          </li>
        {/each}
      </ol>
      <span class="muted">{t('unpack.hint')}</span>
    </div>
  {/if}
  {#if editor.acting && simStore.paused}
    <div class="step-banner" role="status">
      <strong>⏸ {t('canvas.stepMode')}</strong>
      <span>{t('canvas.stepModeHint')}</span>
      <button type="button" onclick={() => simStore.step()}>⏭ {t('sim.step')} (N)</button>
      <button type="button" onclick={() => simStore.togglePause()}>▶ {t('sim.resume')}</button>
    </div>
  {/if}
  {#if editor.tool === 'cable'}
    <div class="hint cable-hint">
      <p class="mode-title"><span class="mode-badge">🔌 {t('canvas.cableMode')}</span> <button type="button" class="exit" onclick={() => editor.setTool('select')}>{t('canvas.cableExit')} (Esc)</button></p>
      <p role="status">{source ? t('canvas.cableTarget', { name: source.name }) : t(`canvas.cableStart.${editor.medium}`)}</p>
      <fieldset class="choice">
        <legend>{t('portPicker.mode')}</legend>
        <label><input type="radio" name="port-choice" checked={editor.portChoice === 'auto'} onchange={() => editor.setPortChoice('auto')} /> {t('portPicker.auto')}</label>
        <label><input type="radio" name="port-choice" checked={editor.portChoice === 'ask'} onchange={() => editor.setPortChoice('ask')} /> {t('portPicker.ask')}</label>
      </fieldset>
    </div>
    <PortPicker />
  {:else if editor.tool === 'area'}
    <p class="hint" role="status">{t('canvas.areaDraw')}</p>
  {/if}
</div>

<style>
  .canvas {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--bg);
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: default;
  }
  svg.pan-ready {
    cursor: grab;
  }
  svg.panning {
    cursor: grabbing;
  }
  svg.cable-tool {
    cursor: crosshair;
  }
  .dot {
    fill: var(--grid);
  }
  .acting :global(.device:hover .hit) {
    stroke: var(--accent);
    stroke-width: 2;
    filter: drop-shadow(0 0 6px var(--selected-soft));
  }
  .acting :global(.cable:hover .wire) {
    stroke-width: 5;
  }
  .tour-ring {
    fill: none;
    stroke: #f59e0b;
    stroke-width: 4;
    pointer-events: none;
    animation: tour-pulse 1.4s ease-in-out infinite;
    transform-box: fill-box;
    transform-origin: center;
  }
  @keyframes tour-pulse {
    50% {
      transform: scale(1.12);
      opacity: 0.55;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tour-ring {
      animation: none;
    }
  }
  .packet .envelope {
    fill: var(--dot, var(--accent));
    stroke: var(--bg);
    stroke-width: 1.5;
  }
  .packet .flap {
    fill: none;
    stroke: var(--bg);
    stroke-width: 1.4;
    stroke-linejoin: round;
  }
  .packet {
    cursor: help;
  }
  .packet:hover {
    filter: drop-shadow(0 0 3px var(--accent));
  }
  .shell {
    stroke: var(--bg);
    stroke-width: 1.2;
  }
  .unpack {
    pointer-events: none;
  }
  .unpack .shell.current {
    stroke: var(--text);
    stroke-width: 2;
  }
  .unpack-link {
    stroke: var(--muted);
    stroke-width: 1.5;
    stroke-dasharray: 3 3;
  }
  .unpack-label text {
    font-size: 12px;
    paint-order: stroke;
    stroke: var(--bg);
    stroke-width: 4px;
    stroke-linejoin: round;
  }
  .unpack-label .l1 {
    font-weight: 700;
  }
  .unpack-label .l2 {
    fill: var(--text);
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 11px;
  }
  .unpack-label .l3 {
    fill: var(--muted);
    font-size: 11px;
  }
  .drawing {
    fill: var(--selected-soft);
    stroke: var(--accent);
    stroke-width: 2;
    stroke-dasharray: 8 5;
    pointer-events: none;
  }
  .frame {
    fill: color-mix(in srgb, var(--accent) 10%, transparent);
    stroke: var(--accent);
    stroke-width: 1.5;
    stroke-dasharray: 5 4;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  .rubber {
    stroke: var(--accent);
    stroke-width: 2;
    stroke-dasharray: 6 5;
    pointer-events: none;
  }
  .empty,
  .hint {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    margin: 0;
    pointer-events: none;
    text-align: center;
  }
  .empty {
    top: 45%;
    color: var(--muted);
    font-size: 1.1rem;
  }
  .osi-legend {
    position: absolute;
    left: 50%;
    bottom: 10px;
    transform: translateX(-50%);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 4px 10px;
    padding: 5px 10px;
    font-size: 0.72rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: var(--shadow);
    pointer-events: none;
    max-width: calc(100% - 24px);
  }
  .osi-legend ol {
    display: flex;
    gap: 2px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .osi-legend .nm {
    display: none;
  }
  .osi-legend li.current .nm {
    display: inline;
    margin-left: 2px;
  }
  .osi-legend li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 1px 4px;
    border-radius: 4px;
  }
  .osi-legend li.current {
    font-weight: 700;
    background: var(--selected-soft);
  }
  .osi-legend li.done {
    opacity: 0.45;
    text-decoration: line-through;
  }
  .osi-legend .sw {
    width: 12px;
    height: 10px;
    border-radius: 2px;
  }
  .osi-legend .muted {
    color: var(--muted);
  }
  /* Einzelschritt: oranger Rahmen und Hinweis oben, damit man sieht, dass die Zeit steht. */
  .canvas.stepping::after,
  .canvas.cable-mode::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    border: 4px solid #f59e0b;
    border-radius: 2px;
  }
  .canvas.cable-mode::after {
    border-color: var(--accent);
    border-style: dashed;
  }
  .cable-mode :global(.device) {
    cursor: crosshair;
  }
  .cable-mode :global(.device:hover .hit) {
    stroke: var(--accent);
    stroke-width: 3;
    stroke-dasharray: 6 4;
  }
  .step-banner {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 6px 10px;
    max-width: calc(100% - 32px);
    padding: 6px 12px;
    font-size: 0.85rem;
    color: #78350f;
    background: #fef3c7;
    border: 1px solid #f59e0b;
    border-radius: 8px;
    box-shadow: var(--shadow);
  }
  .step-banner button {
    font-size: 0.8rem;
    padding: 2px 10px;
    color: #78350f;
    background: #fff;
    border-color: #f59e0b;
  }
  .mode-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .mode-badge {
    font-weight: 700;
    color: var(--accent);
  }
  .exit {
    font-size: 0.78rem;
    padding: 1px 8px;
  }
  .cable-hint {
    pointer-events: auto;
    display: grid;
    gap: 4px;
    justify-items: center;
  }
  .cable-hint p {
    margin: 0;
  }
  .choice {
    display: flex;
    gap: 12px;
    align-items: center;
    margin: 0;
    padding: 0;
    border: none;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .choice legend {
    float: left;
    margin-right: 4px;
  }
  .choice label {
    display: flex;
    align-items: center;
    gap: 3px;
    cursor: pointer;
  }
  .hint {
    top: 12px;
    padding: 6px 12px;
    border-radius: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
    max-width: calc(100% - 32px);
  }
</style>
