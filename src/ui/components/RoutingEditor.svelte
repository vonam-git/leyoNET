<script lang="ts">
  import { autoRoutes, buildRoutes, routingModeOf, formatIp, logicalInterfaces, maskToText, parseIp, parseMask, type Device, type Route, type StaticRoute } from '../../core';
  import { t } from '../../i18n';
  import { interfaceLabel } from '../labels';
  import { editor } from '../state/editor.svelte';
  import { simStore } from '../state/sim.svelte';
  import { ui } from '../state/ui.svelte';

  /**
   * Routing-Tabelle zum Bearbeiten (erweiterte Einstellungen): alle Routen in
   * einer Tabelle, farbig nach Herkunft. Statische Routen lassen sich direkt in
   * der letzten Zeile hinzufügen und pro Zeile entfernen. In der Simulation
   * zeigt sie die wirksame Tabelle inklusive gelernter Routen (OSPF, RIP, BGP).
   */
  let { device }: { device: Device } = $props();

  type Kind = Route['kind'];
  const CODES: Record<Kind, string> = { connected: 'C', static: 'S', default: 'S*', ospf: 'O', rip: 'R', bgp: 'B', auto: 'A' };
  const auto = $derived(routingModeOf(device) === 'auto');
  const KINDS = $derived<Kind[]>(auto ? ['connected', 'auto'] : ['connected', 'static', 'default', 'ospf', 'rip', 'bgp']);

  interface Row {
    kind: Kind;
    destination: string;
    prefix: number | null;
    via: string;
    iface: string;
    metric?: string;
    /** Index in device.routes (nur statische Routen, entfernbar). */
    index?: number;
    unusable?: boolean;
  }

  const configured = $derived(buildRoutes(device));
  const live = $derived((simStore.tick, editor.acting ? simStore.sim?.getDeviceState(device.id).routes : undefined));

  const rows = $derived.by((): Row[] => {
    const fromRoute = (r: Route): Row => ({
      kind: r.kind === 'static' && r.prefix === 0 ? 'default' : r.kind,
      destination: formatIp(r.network),
      prefix: r.prefix,
      via: r.via === null ? t('routing.direct') : formatIp(r.via),
      iface: interfaceLabel(device, r.iface),
      ...(r.distance !== undefined ? { metric: `[${r.distance}/${r.metric ?? 0}]` } : {}),
    });
    if (live) return live.map(fromRoute);
    const unusable = new Set(configured.unusable);
    const connected = configured.routes.filter((r) => r.kind === 'connected').map(fromRoute);
    const statics = (device.routes ?? []).map((r: StaticRoute, index): Row => {
      const prefix = parseMask(r.mask);
      return {
        kind: prefix === 0 ? 'default' : 'static',
        destination: r.network,
        prefix,
        via: r.gateway ?? t('routing.direct'),
        iface: r.iface !== undefined ? interfaceLabel(device, r.iface) : t('router.ifaceAuto'),
        metric: '[1/0]',
        index,
        unusable: unusable.has(index),
      };
    });
    // Automatisches Routing: Vorschau der berechneten Routen; eigene statische ruhen.
    if (auto) return [...connected, ...autoRoutes(editor.topology, device.id).map(fromRoute)];
    return [...connected, ...statics];
  });

  const used = $derived(new Set(rows.map((r) => r.kind)));
  const showMetric = $derived(rows.some((r) => r.metric));

  // --- Neue statische Route (letzte Zeile der Tabelle) -------------------------

  let draft = $state({ network: '', mask: '', gateway: '', iface: '' });
  let error = $state<{ field?: string; text: string } | null>(null);
  const canAdd = $derived(editor.editable && !!draft.network.trim() && !!draft.mask.trim());

  /** Vorschau der Maske in der anderen Schreibweise. */
  const maskHint = $derived.by(() => {
    const p = draft.mask.trim() ? parseMask(draft.mask) : null;
    if (p === null) return '';
    return draft.mask.includes('.') ? `/${p}` : maskToText(p);
  });

  function add(event: SubmitEvent) {
    event.preventDefault();
    if (!canAdd) return;
    const input: StaticRoute = { network: draft.network.trim(), mask: draft.mask.trim() };
    if (draft.gateway.trim()) input.gateway = draft.gateway.trim();
    if (draft.iface !== '') input.iface = Number(draft.iface);
    const failure = editor.addStaticRoute(device.id, input);
    error = failure ? { field: failure.field, text: t(`error.${failure.code}`, failure.params) } : null;
    if (!failure) draft = { network: '', mask: '', gateway: '', iface: '' };
  }

  /** Standardroute vorbereiten: 0.0.0.0/0. */
  function prepareDefault() {
    draft = { ...draft, network: '0.0.0.0', mask: '/0' };
    error = null;
  }

  const invalid = (field: string) => error?.field === field || (field === 'network' && !!draft.network.trim() && parseIp(draft.network.trim()) === null);
</script>

<div class="legend" aria-label={t('routing.legend')}>
  {#each KINDS as kind (kind)}
    <span class="chip kind-{kind}" class:dim={!used.has(kind)} title={t(`routing.kind.${kind}`)}><b>{CODES[kind]}</b> {t(`routing.kind.${kind}`)}</span>
  {/each}
</div>

<form onsubmit={add}>
  <table class="routes">
    <thead>
      <tr>
        <th scope="col" title={t('routing.codeHint')}>{t('routing.code')}</th>
        <th scope="col">{t('routing.destination')}</th>
        <th scope="col">{t('routing.gateway')}</th>
        <th scope="col">{t('routing.iface')}</th>
        {#if showMetric}<th scope="col" title={t('routing.metricHint')}>[AD/{t('routing.metric')}]</th>{/if}
        <th scope="col"><span class="visually-hidden">{t('routing.actions')}</span></th>
      </tr>
    </thead>
    <tbody>
      {#if rows.length === 0}
        <tr><td colspan="6" class="muted">{t('routing.empty')}</td></tr>
      {/if}
      {#each rows as row, i (i)}
        <tr class="kind-{row.kind}" class:unusable={row.unusable} title={row.unusable ? t('router.routeUnusable') : t(`routing.kind.${row.kind}`)}>
          <td><span class="code">{CODES[row.kind]}</span></td>
          <td class="mono">
            {row.destination}{row.prefix !== null ? `/${row.prefix}` : ''}
            {#if row.prefix !== null}<span class="mask">{maskToText(row.prefix)}</span>{/if}
          </td>
          <td class="mono">{row.via}</td>
          <td>{row.iface}</td>
          {#if showMetric}<td class="mono">{row.metric ?? ''}</td>{/if}
          <td class="act">
            {#if row.index !== undefined}
              <button type="button" class="remove" disabled={!editor.editable} onclick={() => editor.removeStaticRoute(device.id, row.index!)} aria-label={t('router.removeRoute')} title={t('router.removeRoute')}>✕</button>
            {/if}
          </td>
        </tr>
        {#if row.unusable}
          <tr class="reason"><td></td><td colspan="5">⚠ {t('router.routeUnusable')}</td></tr>
        {/if}
      {/each}
      {#if editor.editable && ui.has('routing.static') && !auto}
        <tr class="add">
          <td><span class="code">+</span></td>
          <td>
            <div class="pair">
              <input placeholder="10.1.0.0" autocomplete="off" spellcheck="false" bind:value={draft.network} aria-label={t('router.network')} aria-invalid={invalid('network')} />
              <input class="mask-in" placeholder="/16" autocomplete="off" spellcheck="false" bind:value={draft.mask} aria-label={t('config.mask')} aria-invalid={invalid('mask')} />
            </div>
            {#if maskHint}<span class="mask">= {maskHint}</span>{/if}
          </td>
          <td><input placeholder="172.16.0.2" autocomplete="off" spellcheck="false" bind:value={draft.gateway} aria-label={t('router.via')} aria-invalid={invalid('gateway')} /></td>
          <td>
            <select bind:value={draft.iface} aria-label={t('router.iface')}>
              <option value="">{t('router.ifaceAuto')}</option>
              {#each logicalInterfaces(device) as id (id)}<option value={String(id)}>{interfaceLabel(device, id)}</option>{/each}
            </select>
          </td>
          {#if showMetric}<td></td>{/if}
          <td class="act"><button type="submit" class="primary" disabled={!canAdd} title={t('router.addRoute')} aria-label={t('router.addRoute')}>+</button></td>
        </tr>
      {/if}
    </tbody>
  </table>
  {#if error}<p class="error" role="alert">{error.text}</p>{/if}
  {#if auto}
    <p class="muted hint">{t('routingMode.preview')}</p>
  {:else if editor.editable}
    <p class="muted hint">{t('routing.addHint')} <button type="button" class="link" onclick={prepareDefault}>{t('routing.prepareDefault')}</button></p>
  {/if}
</form>


<style>
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 4px 0 8px;
  }
  .chip {
    font-size: 0.72rem;
    padding: 1px 7px;
    border-radius: 999px;
    border: 1px solid var(--k);
    color: var(--k);
    background: color-mix(in srgb, var(--k) 10%, transparent);
  }
  .chip.dim {
    opacity: 0.35;
  }
  .kind-connected {
    --k: #0f766e;
  }
  .kind-static {
    --k: #2563eb;
  }
  .kind-default {
    --k: #4f46e5;
  }
  .kind-ospf {
    --k: #ea580c;
  }
  .kind-rip {
    --k: #0891b2;
  }
  .kind-bgp {
    --k: #9333ea;
  }
  .kind-auto {
    --k: #d97706;
  }
  :global([data-theme='dark']) .kind-static,
  :global([data-theme='dark']) .kind-default {
    --k: #7aa2ff;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  th,
  td {
    text-align: left;
    padding: 4px 6px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  th {
    color: var(--muted);
    font-weight: normal;
  }
  tbody tr:not(.add):not(.reason) {
    box-shadow: inset 3px 0 0 var(--k, transparent);
  }
  tbody tr:not(.add):not(.reason):hover {
    background: color-mix(in srgb, var(--k, var(--accent)) 9%, transparent);
  }
  .code {
    display: inline-block;
    min-width: 1.8em;
    text-align: center;
    font-weight: 700;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    color: var(--k, var(--muted));
  }
  .mono {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  .mask {
    display: block;
    color: var(--muted);
    font-size: 0.72rem;
  }
  tr.unusable td {
    color: var(--danger);
  }
  tr.unusable .mono {
    text-decoration: line-through;
  }
  tr.reason td {
    padding-top: 0;
    font-size: 0.72rem;
    color: var(--danger);
    border-bottom: 1px solid var(--border);
  }
  tr.add td {
    background: var(--surface-2);
    border-bottom: none;
  }
  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 4rem;
    gap: 4px;
  }
  input,
  select {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 0.8rem;
    padding: 4px 6px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  select {
    font-family: inherit;
  }
  input[aria-invalid='true'] {
    border-color: var(--danger);
  }
  .act {
    width: 2.2rem;
    text-align: right;
  }
  .remove {
    padding: 1px 7px;
    font-size: 0.75rem;
  }
  .primary {
    padding: 2px 9px;
    font-weight: 700;
  }
  .muted {
    color: var(--muted);
  }
  .hint {
    font-size: 0.75rem;
    margin: 6px 0 0;
  }
  .link {
    border: none;
    background: none;
    padding: 0;
    color: var(--accent);
    text-decoration: underline;
    font-size: inherit;
  }
  .error {
    margin: 6px 0 0;
    font-size: 0.8rem;
    color: var(--danger);
  }
</style>
