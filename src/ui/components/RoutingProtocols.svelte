<script lang="ts">
  import { buildRoutes, formatIp, ipv6Links, maskToText, parseMask, type BgpConfig, type Device, type Ospf6Config, type OspfConfig, type RedistributeSource, type RipConfig, type RipngConfig, type RoutedNetwork } from '../../core';
  import { t } from '../../i18n';
  import { interfaceLabel } from '../labels';
  import { editor } from '../state/editor.svelte';
  import { ui } from '../state/ui.svelte';

  /**
   * Dynamisches Routing: OSPF, RIP und BGP einrichten. Für Einsteiger gibt es
   * «alle eigenen Netze aufnehmen»; Fortgeschrittene setzen Netze, Areas,
   * passive Interfaces, Kosten und Redistribution selbst.
   */
  let { device }: { device: Device } = $props();

  type Protocol4 = 'ospf' | 'rip' | 'bgp';
  type Protocol = Protocol4 | 'ospf6' | 'ripng';
  let error = $state<{ protocol: Protocol; text: string } | null>(null);
  let netDraft = $state<Record<Protocol4, { network: string; mask: string; area: string }>>({
    ospf: { network: '', mask: '', area: '0' },
    rip: { network: '', mask: '', area: '' },
    bgp: { network: '', mask: '', area: '' },
  });
  let neighborDraft = $state({ ip: '', remoteAs: '' });
  let asnDraft = $state('65001');

  /** Direkt angeschlossene Netze (Vorschlag für «network»-Einträge). */
  const ownNetworks = $derived(
    buildRoutes(device)
      .routes.filter((r) => r.kind === 'connected')
      .map((r): RoutedNetwork => ({ network: formatIp(r.network), mask: maskToText(r.prefix) })),
  );
  const ifaces = $derived(device.interfaces.filter((i) => i.ip));
  const SOURCES: RedistributeSource[] = ['connected', 'static', 'ospf', 'rip', 'bgp'];

  function apply(protocol: Protocol, result: ReturnType<typeof editor.setOspf>) {
    error = result ? { protocol, text: t(`error.${result.code}`, result.params) } : null;
  }

  const setOspf = (c: OspfConfig | null) => apply('ospf', editor.setOspf(device.id, c));
  const setRip = (c: RipConfig | null) => apply('rip', editor.setRip(device.id, c));
  const setBgp = (c: BgpConfig | null) => apply('bgp', editor.setBgp(device.id, c));

  function update(protocol: Protocol4, change: <T extends { networks: RoutedNetwork[]; redistribute?: RedistributeSource[]; passive?: number[]; defaultOriginate?: boolean }>(c: T) => T) {
    if (protocol === 'ospf' && device.ospf) setOspf(change(device.ospf));
    if (protocol === 'rip' && device.rip) setRip(change(device.rip));
    if (protocol === 'bgp' && device.bgp) setBgp(change(device.bgp));
  }

  function addNetwork(event: SubmitEvent, protocol: Protocol4) {
    event.preventDefault();
    const d = netDraft[protocol];
    const net = { network: d.network.trim(), mask: d.mask.trim() || '24' };
    if (protocol === 'ospf' && device.ospf) setOspf({ ...device.ospf, networks: [...device.ospf.networks, { ...net, area: Number(d.area) || 0 }] });
    if (protocol === 'rip' && device.rip) setRip({ ...device.rip, networks: [...device.rip.networks, net] });
    if (protocol === 'bgp' && device.bgp) setBgp({ ...device.bgp, networks: [...device.bgp.networks, net] });
    if (!error) netDraft[protocol] = { network: '', mask: '', area: d.area };
  }

  function addOwn(protocol: Protocol4) {
    const has = (list: RoutedNetwork[], n: RoutedNetwork) => list.some((x) => x.network === n.network && x.mask === n.mask);
    if (protocol === 'ospf' && device.ospf) setOspf({ ...device.ospf, networks: [...device.ospf.networks, ...ownNetworks.filter((n) => !has(device.ospf!.networks, n)).map((n) => ({ ...n, area: 0 }))] });
    if (protocol === 'rip' && device.rip) setRip({ ...device.rip, networks: [...device.rip.networks, ...ownNetworks.filter((n) => !has(device.rip!.networks, n))] });
    if (protocol === 'bgp' && device.bgp) setBgp({ ...device.bgp, networks: [...device.bgp.networks, ...ownNetworks.filter((n) => !has(device.bgp!.networks, n))] });
  }

  function removeNetwork(protocol: Protocol4, index: number) {
    update(protocol, (c) => ({ ...c, networks: c.networks.filter((_, i) => i !== index) }));
  }

  function togglePassive(protocol: 'ospf' | 'rip', index: number, on: boolean) {
    update(protocol, (c) => ({ ...c, passive: on ? [...(c.passive ?? []), index] : (c.passive ?? []).filter((p) => p !== index) }));
  }

  function toggleSource(protocol: Protocol4, source: RedistributeSource, on: boolean) {
    update(protocol, (c) => ({ ...c, redistribute: on ? [...(c.redistribute ?? []), source] : (c.redistribute ?? []).filter((s) => s !== source) }));
  }

  function addNeighbor(event: SubmitEvent) {
    event.preventDefault();
    if (!device.bgp) return;
    setBgp({ ...device.bgp, neighbors: [...device.bgp.neighbors, { ip: neighborDraft.ip.trim(), remoteAs: Number(neighborDraft.remoteAs) }] });
    if (!error) neighborDraft = { ip: '', remoteAs: neighborDraft.remoteAs };
  }

  const enabled = (p: Protocol) => !!device[p];

  // --- IPv6: OSPFv3 und RIPng nehmen Anschlüsse auf, nicht Netze. -------------
  const links6 = $derived(ipv6Links(device).filter((l) => l.ipv6));
  const setOspf6 = (c: Ospf6Config | null) => apply('ospf6', editor.setOspf6(device.id, c));
  const setRipng = (c: RipngConfig | null) => apply('ripng', editor.setRipng(device.id, c));
  /** Im Modell heissen die IPv6-Quellen «ospf» (OSPFv3) und «rip» (RIPng). */
  const SOURCES6: { source: RedistributeSource; label: string }[] = [
    { source: 'connected', label: 'routing.source.connected' },
    { source: 'static', label: 'routing.source.static' },
    { source: 'ospf', label: 'routing.source.ospf6' },
    { source: 'rip', label: 'routing.source.ripng' },
  ];

  function ospf6Iface(index: number, on: boolean, area = 0) {
    const c = device.ospf6;
    if (c) setOspf6({ ...c, interfaces: [...c.interfaces.filter((e) => e.iface !== index), ...(on ? [{ iface: index, area }] : [])] });
  }

  function ripngIface(index: number, on: boolean) {
    const c = device.ripng;
    if (c) setRipng({ ...c, interfaces: on ? [...c.interfaces, index] : c.interfaces.filter((i) => i !== index) });
  }

  function toggle6<T extends { passive?: number[]; redistribute?: RedistributeSource[] }>(c: T, key: 'passive', value: number, on: boolean): T;
  function toggle6<T extends { passive?: number[]; redistribute?: RedistributeSource[] }>(c: T, key: 'redistribute', value: RedistributeSource, on: boolean): T;
  function toggle6<T extends { passive?: number[]; redistribute?: RedistributeSource[] }>(c: T, key: 'passive' | 'redistribute', value: number | RedistributeSource, on: boolean): T {
    const list = (c[key] ?? []) as (number | RedistributeSource)[];
    return { ...c, [key]: on ? [...list, value] : list.filter((x) => x !== value) };
  }
</script>

{#snippet networks(protocol: Protocol4, list: (RoutedNetwork & { area?: number })[])}
  <ul class="list">
    {#each list as n, i (i)}
      <li>
        <span class="mono">{n.network}/{parseMask(n.mask)}{protocol === 'ospf' ? ` · Area ${n.area}` : ''}</span>
        <button class="small" disabled={!editor.editable} onclick={() => removeNetwork(protocol, i)} aria-label={t('routing.removeNetwork')}>✕</button>
      </li>
    {:else}
      <li class="muted">{t(`routing.${protocol}.noNetworks`)}</li>
    {/each}
  </ul>
  <form class="add" onsubmit={(e) => addNetwork(e, protocol)}>
    <input bind:value={netDraft[protocol].network} placeholder="10.0.0.0" aria-label={t('router.network')} disabled={!editor.editable} />
    <input bind:value={netDraft[protocol].mask} placeholder="/24" aria-label={t('config.mask')} class="short" disabled={!editor.editable} />
    {#if protocol === 'ospf'}<input bind:value={netDraft.ospf.area} placeholder="0" aria-label="Area" class="short" disabled={!editor.editable} />{/if}
    <button type="submit" disabled={!editor.editable || !netDraft[protocol].network.trim()}>+</button>
  </form>
  <button class="link" disabled={!editor.editable || ownNetworks.length === 0} onclick={() => addOwn(protocol)}>{t('routing.addOwn')}</button>
{/snippet}

{#snippet redistribute(protocol: Protocol4, selected: RedistributeSource[] | undefined)}
  <div class="sources">
    <span>{t('routing.redistribute')}</span>
    {#each SOURCES.filter((s) => s !== protocol) as source (source)}
      <label><input type="checkbox" checked={selected?.includes(source) ?? false} disabled={!editor.editable} onchange={(e) => toggleSource(protocol, source, e.currentTarget.checked)} /> {t(`routing.source.${source}`)}</label>
    {/each}
  </div>
{/snippet}

{#if ui.has('routing.ospf') && editor.ipMode !== 'ipv6'}
  <details class="proto" open={enabled('ospf')} data-help="ospf">
    <summary>OSPF {#if device.ospf}<span class="on">{t('routing.active')}</span>{/if}</summary>
    <label class="toggle"><input type="checkbox" checked={!!device.ospf} disabled={!editor.editable} onchange={(e) => setOspf(e.currentTarget.checked ? { networks: [] } : null)} /> {t('routing.ospf.enable')}</label>
    {#if device.ospf}
      <label class="field"><span>{t('routing.routerId')}</span><input value={device.ospf.routerId ?? ''} placeholder={t('routing.routerIdAuto')} disabled={!editor.editable} onchange={(e) => setOspf({ ...device.ospf!, routerId: e.currentTarget.value.trim() || undefined })} /></label>
      <h4>{t('routing.networks')}</h4>
      {@render networks('ospf', device.ospf.networks)}
      <h4>{t('routing.ospf.interfaces')}</h4>
      <table>
        <thead><tr><th>{t('router.iface')}</th><th>{t('routing.ospf.cost')}</th><th>{t('routing.passive')}</th></tr></thead>
        <tbody>
          {#each ifaces as iface (iface.index)}
            <tr>
              <td>{interfaceLabel(device, iface.index)}</td>
              <td><input class="short" type="number" min="1" max="65535" value={iface.ospfCost ?? 10} disabled={!editor.editable} onchange={(e) => editor.setOspfCost(device.id, iface.index, Number(e.currentTarget.value))} /></td>
              <td><input type="checkbox" checked={device.ospf.passive?.includes(iface.index) ?? false} disabled={!editor.editable} onchange={(e) => togglePassive('ospf', iface.index, e.currentTarget.checked)} /></td>
            </tr>
          {/each}
        </tbody>
      </table>
      <label class="toggle"><input type="checkbox" checked={!!device.ospf.defaultOriginate} disabled={!editor.editable} onchange={(e) => setOspf({ ...device.ospf!, defaultOriginate: e.currentTarget.checked || undefined })} /> {t('routing.defaultOriginate')}</label>
      {@render redistribute('ospf', device.ospf.redistribute)}
    {/if}
    {#if error?.protocol === 'ospf'}<p class="error" role="alert">{error.text}</p>{/if}
    <p class="muted">{t('routing.ospf.hint')}</p>
  </details>
{/if}

{#if ui.has('routing.rip') && editor.ipMode !== 'ipv6'}
  <details class="proto" open={enabled('rip')} data-help="rip">
    <summary>RIP v2 {#if device.rip}<span class="on">{t('routing.active')}</span>{/if}</summary>
    <label class="toggle"><input type="checkbox" checked={!!device.rip} disabled={!editor.editable} onchange={(e) => setRip(e.currentTarget.checked ? { networks: [] } : null)} /> {t('routing.rip.enable')}</label>
    {#if device.rip}
      <h4>{t('routing.networks')}</h4>
      {@render networks('rip', device.rip.networks)}
      <h4>{t('routing.passive')}</h4>
      <div class="sources">
        {#each ifaces as iface (iface.index)}
          <label><input type="checkbox" checked={device.rip.passive?.includes(iface.index) ?? false} disabled={!editor.editable} onchange={(e) => togglePassive('rip', iface.index, e.currentTarget.checked)} /> {interfaceLabel(device, iface.index)}</label>
        {/each}
      </div>
      <label class="toggle"><input type="checkbox" checked={!!device.rip.defaultOriginate} disabled={!editor.editable} onchange={(e) => setRip({ ...device.rip!, defaultOriginate: e.currentTarget.checked || undefined })} /> {t('routing.defaultOriginate')}</label>
      {@render redistribute('rip', device.rip.redistribute)}
    {/if}
    {#if error?.protocol === 'rip'}<p class="error" role="alert">{error.text}</p>{/if}
    <p class="muted">{t('routing.rip.hint')}</p>
  </details>
{/if}

{#if ui.has('routing.bgp') && editor.ipMode !== 'ipv6'}
  <details class="proto" open={enabled('bgp')} data-help="bgp">
    <summary>BGP {#if device.bgp}<span class="on">AS {device.bgp.asn}</span>{/if}</summary>
    {#if !device.bgp}
      <form class="add" onsubmit={(e) => { e.preventDefault(); setBgp({ asn: Number(asnDraft), neighbors: [], networks: [] }); }}>
        <label class="field"><span>{t('routing.bgp.asn')}</span><input bind:value={asnDraft} inputmode="numeric" disabled={!editor.editable} /></label>
        <button type="submit" disabled={!editor.editable}>{t('routing.bgp.enable')}</button>
      </form>
    {:else}
      <label class="field"><span>{t('routing.bgp.asn')}</span><input value={device.bgp.asn} inputmode="numeric" disabled={!editor.editable} onchange={(e) => setBgp({ ...device.bgp!, asn: Number(e.currentTarget.value) })} /></label>
      <label class="field"><span>{t('routing.routerId')}</span><input value={device.bgp.routerId ?? ''} placeholder={t('routing.routerIdAuto')} disabled={!editor.editable} onchange={(e) => setBgp({ ...device.bgp!, routerId: e.currentTarget.value.trim() || undefined })} /></label>
      <h4>{t('routing.bgp.neighbors')}</h4>
      <ul class="list">
        {#each device.bgp.neighbors as n, i (n.ip)}
          <li>
            <span class="mono">{n.ip} · AS {n.remoteAs} {n.remoteAs === device.bgp.asn ? '(iBGP)' : '(eBGP)'}</span>
            <button class="small" disabled={!editor.editable} onclick={() => setBgp({ ...device.bgp!, neighbors: device.bgp!.neighbors.filter((_, j) => j !== i) })} aria-label={t('routing.removeNeighbor')}>✕</button>
          </li>
        {:else}
          <li class="muted">{t('routing.bgp.noNeighbors')}</li>
        {/each}
      </ul>
      <form class="add" onsubmit={addNeighbor}>
        <input bind:value={neighborDraft.ip} placeholder="172.16.0.2" aria-label={t('routing.bgp.neighborIp')} disabled={!editor.editable} />
        <input bind:value={neighborDraft.remoteAs} placeholder="65002" aria-label={t('routing.bgp.remoteAs')} class="short" inputmode="numeric" disabled={!editor.editable} />
        <button type="submit" disabled={!editor.editable || !neighborDraft.ip.trim() || !neighborDraft.remoteAs.trim()}>+</button>
      </form>
      <h4>{t('routing.bgp.networks')}</h4>
      {@render networks('bgp', device.bgp.networks)}
      {@render redistribute('bgp', device.bgp.redistribute)}
      <button class="link danger" disabled={!editor.editable} onclick={() => setBgp(null)}>{t('routing.bgp.disable')}</button>
    {/if}
    {#if error?.protocol === 'bgp'}<p class="error" role="alert">{error.text}</p>{/if}
    <p class="muted">{t('routing.bgp.hint')}</p>
  </details>
{/if}

{#snippet sources6(protocol: 'ospf6' | 'ripng', selected: RedistributeSource[] | undefined, change: (source: RedistributeSource, on: boolean) => void)}
  <div class="sources">
    <span>{t('routing.redistribute')}</span>
    {#each SOURCES6.filter((s) => s.source !== (protocol === 'ospf6' ? 'ospf' : 'rip')) as item (item.source)}
      <label><input type="checkbox" checked={selected?.includes(item.source) ?? false} disabled={!editor.editable} onchange={(e) => change(item.source, e.currentTarget.checked)} /> {t(item.label)}</label>
    {/each}
  </div>
{/snippet}

{#if ui.has('routing.ospf') && editor.ipMode !== 'ipv4'}
  <details class="proto" open={enabled('ospf6')} data-help="ospf6">
    <summary>OSPFv3 (IPv6) {#if device.ospf6}<span class="on">{t('routing.active')}</span>{/if}</summary>
    <label class="toggle"><input type="checkbox" checked={!!device.ospf6} disabled={!editor.editable} onchange={(e) => setOspf6(e.currentTarget.checked ? { interfaces: links6.map((l) => ({ iface: l.index, area: 0 })) } : null)} /> {t('routing.ospf6.enable')}</label>
    {#if device.ospf6}
      {@const c = device.ospf6}
      <label class="field"><span>{t('routing.routerId')}</span><input value={c.routerId ?? ''} placeholder={t('routing.ospf6.routerIdAuto')} disabled={!editor.editable} onchange={(e) => setOspf6({ ...c, routerId: e.currentTarget.value.trim() || undefined })} /></label>
      <table>
        <thead><tr><th>{t('router.iface')}</th><th>OSPFv3</th><th>Area</th><th>{t('routing.passive')}</th></tr></thead>
        <tbody>
          {#each links6 as link (link.index)}
            {@const entry = c.interfaces.find((e) => e.iface === link.index)}
            <tr>
              <td>{interfaceLabel(device, link.index)}</td>
              <td><input type="checkbox" checked={!!entry} disabled={!editor.editable} aria-label={t('routing.ospf6.on', { iface: interfaceLabel(device, link.index) })} onchange={(e) => ospf6Iface(link.index, e.currentTarget.checked)} /></td>
              <td><input class="short" type="number" min="0" value={entry?.area ?? 0} disabled={!editor.editable || !entry} aria-label={t('routing.ospf6.area', { iface: interfaceLabel(device, link.index) })} onchange={(e) => ospf6Iface(link.index, true, Number(e.currentTarget.value))} /></td>
              <td><input type="checkbox" checked={c.passive?.includes(link.index) ?? false} disabled={!editor.editable || !entry} onchange={(e) => setOspf6(toggle6(c, 'passive', link.index, e.currentTarget.checked))} /></td>
            </tr>
          {:else}
            <tr><td colspan="4" class="muted">{t('routing.noIpv6')}</td></tr>
          {/each}
        </tbody>
      </table>
      <label class="toggle"><input type="checkbox" checked={!!c.defaultOriginate} disabled={!editor.editable} onchange={(e) => setOspf6({ ...c, defaultOriginate: e.currentTarget.checked || undefined })} /> {t('routing.defaultOriginate')}</label>
      {@render sources6('ospf6', c.redistribute, (source, on) => setOspf6(toggle6(c, 'redistribute', source, on)))}
    {/if}
    {#if error?.protocol === 'ospf6'}<p class="error" role="alert">{error.text}</p>{/if}
    <p class="muted">{t('routing.ospf6.hint')}</p>
  </details>
{/if}

{#if ui.has('routing.rip') && editor.ipMode !== 'ipv4'}
  <details class="proto" open={enabled('ripng')} data-help="ripng">
    <summary>RIPng (IPv6) {#if device.ripng}<span class="on">{t('routing.active')}</span>{/if}</summary>
    <label class="toggle"><input type="checkbox" checked={!!device.ripng} disabled={!editor.editable} onchange={(e) => setRipng(e.currentTarget.checked ? { interfaces: links6.map((l) => l.index) } : null)} /> {t('routing.ripng.enable')}</label>
    {#if device.ripng}
      {@const c = device.ripng}
      <table>
        <thead><tr><th>{t('router.iface')}</th><th>RIPng</th><th>{t('routing.passive')}</th></tr></thead>
        <tbody>
          {#each links6 as link (link.index)}
            {@const on = c.interfaces.includes(link.index)}
            <tr>
              <td>{interfaceLabel(device, link.index)}</td>
              <td><input type="checkbox" checked={on} disabled={!editor.editable} aria-label={t('routing.ripng.on', { iface: interfaceLabel(device, link.index) })} onchange={(e) => ripngIface(link.index, e.currentTarget.checked)} /></td>
              <td><input type="checkbox" checked={c.passive?.includes(link.index) ?? false} disabled={!editor.editable || !on} onchange={(e) => setRipng(toggle6(c, 'passive', link.index, e.currentTarget.checked))} /></td>
            </tr>
          {:else}
            <tr><td colspan="3" class="muted">{t('routing.noIpv6')}</td></tr>
          {/each}
        </tbody>
      </table>
      <label class="toggle"><input type="checkbox" checked={!!c.defaultOriginate} disabled={!editor.editable} onchange={(e) => setRipng({ ...c, defaultOriginate: e.currentTarget.checked || undefined })} /> {t('routing.defaultOriginate')}</label>
      {@render sources6('ripng', c.redistribute, (source, on) => setRipng(toggle6(c, 'redistribute', source, on)))}
    {/if}
    {#if error?.protocol === 'ripng'}<p class="error" role="alert">{error.text}</p>{/if}
    <p class="muted">{t('routing.ripng.hint')}</p>
  </details>
{/if}

<style>
  .proto {
    margin-top: 10px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 0.85rem;
  }
  .on {
    margin-left: 6px;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 999px;
    background: #16a34a;
    color: #fff;
  }
  h4 {
    margin: 8px 0 3px;
    font-size: 0.78rem;
  }
  .toggle,
  .sources label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    margin: 4px 0;
  }
  .sources {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
    font-size: 0.78rem;
    align-items: center;
  }
  .sources > span {
    width: 100%;
    color: var(--muted);
  }
  .field {
    display: grid;
    gap: 2px;
    font-size: 0.75rem;
    margin: 4px 0;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 0.8rem;
  }
  .list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2px 0;
    border-bottom: 1px solid var(--border);
  }
  .add {
    display: flex;
    gap: 4px;
    margin-top: 4px;
    align-items: end;
  }
  input:not([type='checkbox']) {
    min-width: 0;
    flex: 1;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 0.8rem;
    padding: 3px 6px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .short {
    max-width: 4.5rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.78rem;
  }
  th,
  td {
    text-align: left;
    padding: 2px 4px;
    border-bottom: 1px solid var(--border);
  }
  th {
    color: var(--muted);
    font-weight: normal;
  }
  .link {
    border: none;
    background: none;
    padding: 2px 0;
    font-size: 0.75rem;
    color: var(--accent);
    text-decoration: underline;
  }
  .danger {
    color: var(--danger);
  }
  .small {
    font-size: 0.7rem;
    padding: 1px 6px;
  }
  .mono {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  .muted {
    color: var(--muted);
    font-size: 0.72rem;
    margin: 6px 0 0;
  }
  .error {
    color: var(--danger);
    font-size: 0.78rem;
  }
</style>
