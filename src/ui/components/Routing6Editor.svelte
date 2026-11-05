<script lang="ts">
  import { autoRoutes6, canAutoRoute, formatIp6, ipv6Links, parseCidr6, routingModeOf, type Device, type Route6 } from '../../core';
  import { t } from '../../i18n';
  import { interfaceLabel } from '../labels';
  import { editor } from '../state/editor.svelte';
  import { simStore } from '../state/sim.svelte';

  /**
   * IPv6-Routingtabelle: im Entwurf die direkt verbundenen Präfixe und
   * statischen Routen (bzw. die Vorschau des automatischen Routings), in der
   * Simulation die wirksame Tabelle samt Standardrouter aus Router Advertisements.
   */
  let { device }: { device: Device } = $props();

  const CODES: Record<string, string> = { connected: 'C', static: 'S', default: 'S*', auto: 'A' };
  const auto = $derived((canAutoRoute(device.type) && routingModeOf(device) === 'auto') || device.type === 'internet');
  const live = $derived((simStore.tick, editor.acting ? simStore.sim?.getDeviceState(device.id).ipv6?.routes6 : undefined));

  interface Row {
    kind: string;
    destination: string;
    via: string;
    iface: string;
    index?: number;
  }

  const rows = $derived.by((): Row[] => {
    const fromRoute = (r: Route6): Row => ({
      kind: r.kind === 'static' && r.prefix === 0 ? 'default' : r.kind,
      destination: `${formatIp6(r.network)}/${r.prefix}`,
      via: r.via === null ? t('routing.direct') : formatIp6(r.via),
      iface: interfaceLabel(device, r.iface),
    });
    if (live) return live.map(fromRoute);
    const connected: Row[] = ipv6Links(device).flatMap((i) => {
      const c = i.ipv6 ? parseCidr6(i.ipv6) : null;
      if (!c) return [];
      return [{ kind: 'connected', destination: `${formatIp6(c.address & ~((1n << BigInt(128 - c.prefix)) - 1n))}/${c.prefix}`, via: t('routing.direct'), iface: interfaceLabel(device, i.index) }];
    });
    if (auto) return [...connected, ...autoRoutes6(editor.topology, device.id).map(fromRoute)];
    const statics = (device.routes6 ?? []).map((r, index): Row => ({
      kind: r.network.endsWith('/0') ? 'default' : 'static',
      destination: r.network,
      via: r.gateway ?? t('routing.direct'),
      iface: r.iface !== undefined ? interfaceLabel(device, r.iface) : t('router.ifaceAuto'),
      index,
    }));
    return [...connected, ...statics];
  });

  let draft = $state({ network: '', gateway: '', iface: '' });
  let error = $state<string | null>(null);

  function add(event: SubmitEvent) {
    event.preventDefault();
    const failure = editor.addStaticRoute6(device.id, {
      network: draft.network.trim(),
      ...(draft.gateway.trim() ? { gateway: draft.gateway.trim() } : {}),
      ...(draft.iface !== '' ? { iface: Number(draft.iface) } : {}),
    });
    error = failure ? t(`error.${failure.code}`, failure.params) : null;
    if (!failure) draft = { network: '', gateway: '', iface: '' };
  }
</script>

<h3 data-help="ipv6">{t('ipv6.routes')}</h3>
<form onsubmit={add}>
  <table>
    <thead>
      <tr>
        <th scope="col" title={t('routing.codeHint')}>{t('routing.code')}</th>
        <th scope="col">{t('routing.destination')}</th>
        <th scope="col">{t('routing.gateway')}</th>
        <th scope="col">{t('routing.iface')}</th>
        <th scope="col"><span class="visually-hidden">{t('routing.actions')}</span></th>
      </tr>
    </thead>
    <tbody>
      {#if rows.length === 0}<tr><td colspan="5" class="muted">{t('routing.empty')}</td></tr>{/if}
      {#each rows as row, i (i)}
        <tr class="kind-{row.kind}" title={t(`routing.kind.${row.kind}`)}>
          <td><b>{CODES[row.kind] ?? 'S'}</b></td>
          <td class="mono">{row.destination}</td>
          <td class="mono">{row.via}</td>
          <td>{row.iface}</td>
          <td>{#if row.index !== undefined}<button type="button" class="remove" disabled={!editor.editable} onclick={() => editor.removeStaticRoute6(device.id, row.index!)} aria-label={t('router.removeRoute')}>✕</button>{/if}</td>
        </tr>
      {/each}
      {#if editor.editable && !auto}
        <tr class="add">
          <td>+</td>
          <td><input bind:value={draft.network} placeholder="2001:db8:2::/64" aria-label={t('routing.destination')} spellcheck="false" /></td>
          <td><input bind:value={draft.gateway} placeholder="2001:db8:12::2" aria-label={t('routing.gateway')} spellcheck="false" /></td>
          <td>
            <select bind:value={draft.iface} aria-label={t('routing.iface')}>
              <option value="">{t('router.ifaceAuto')}</option>
              {#each ipv6Links(device) as iface (iface.index)}<option value={String(iface.index)}>{interfaceLabel(device, iface.index)}</option>{/each}
            </select>
          </td>
          <td><button type="submit" disabled={!draft.network.trim()} aria-label={t('router.addRoute')}>+</button></td>
        </tr>
      {/if}
    </tbody>
  </table>
</form>
{#if error}<p class="error" role="alert">{error}</p>{/if}
<p class="muted hint">{auto ? t('ipv6.routesAuto') : t('ipv6.routesHint')}</p>

<style>
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
  }
  th {
    color: var(--muted);
    font-weight: normal;
  }
  .mono,
  input {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  td.mono {
    word-break: break-all;
  }
  input,
  select {
    width: 100%;
    min-width: 0;
    font-size: 0.8rem;
    padding: 3px 5px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  tbody tr:not(.add) {
    box-shadow: inset 3px 0 0 var(--k, transparent);
  }
  .kind-connected {
    --k: #0f766e;
  }
  .kind-static,
  .kind-default {
    --k: #2563eb;
  }
  .kind-auto {
    --k: #d97706;
  }
  .remove {
    padding: 0 6px;
  }
  .muted {
    color: var(--muted);
  }
  .hint {
    font-size: 0.78rem;
  }
  .error {
    color: var(--danger);
    font-size: 0.8rem;
  }
</style>
