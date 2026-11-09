<script lang="ts">
  import { cableAt, findSwitchLoop, formatVlanList, getDevice, otherEnd, parseVlanList, vlanColor, vlanExists, vlanLabel, vlansOf, type Device } from '../../core';
  import { TAG_HEX } from '../tags';
  import { t } from '../../i18n';
  import { interfaceLabel } from '../labels';
  import { editor } from '../state/editor.svelte';
  import { ui } from '../state/ui.svelte';
  import { simStore } from '../state/sim.svelte';
  import type { ChannelMode } from '../../core';

  /** Switch: Spanning Tree (auch während der Simulation umschaltbar) und VLAN pro Port. */
  let { device }: { device: Device } = $props();

  const PRIORITIES = Array.from({ length: 16 }, (_, i) => i * 4096);

  const peerOf = (index: number) => {
    const cable = cableAt(editor.topology, { device: device.id, iface: index });
    if (!cable) return '';
    return getDevice(editor.topology, otherEnd(cable, device.id).device)?.name ?? '';
  };

  const colorOf = (iface: { trunk?: boolean; vlan?: number }) => (iface.trunk ? undefined : vlanColor(editor.topology, iface.vlan ?? 1));

  /** Schleife zwischen Switches ohne vollständigen Spanning Tree: Hier droht ein Broadcast-Sturm. */
  const loop = $derived(findSwitchLoop(editor.topology));

  function setVlan(index: number, value: string) {
    const vlan = Number(value);
    if (Number.isInteger(vlan) && vlan >= 1 && vlan <= 4094) editor.setPortVlan(device.id, index, vlan);
  }

  /** Port-Channel (Link Aggregation): nur Switch und Layer-3-Switch. */
  const canChannel = $derived((device.type === 'switch' || device.type === 'l3switch') && ui.has('net.lag'));
  const live = $derived((simStore.tick, editor.acting ? simStore.sim?.getDeviceState(device.id).channels : undefined));
  const channelStatus = (port: number) => live?.flatMap((c) => c.ports).find((p) => p.port === port);

  function setChannel(index: number, value: string, mode: ChannelMode) {
    const text = value.trim();
    report(editor.setPortChannel(device.id, index, text ? Number(text) : null, mode));
  }

  /** VLAN-Datenbank: angelegte VLANs mit Namen. */
  const known = $derived(vlansOf(device));
  const nameOf = (vlan: number) => device.vlanNames?.find((n) => n.vlan === vlan)?.name ?? '';
  let draft = $state({ vlan: '', name: '' });
  let error = $state<string | null>(null);

  function report(failure: { code: string; params?: Record<string, string | number> } | null) {
    error = failure ? t(`error.${failure.code}`, failure.params) : null;
    return !failure;
  }

  function addVlans(event: SubmitEvent) {
    event.preventDefault();
    const list = parseVlanList(draft.vlan);
    if (!list) return report({ code: 'invalidVlan' });
    for (const vlan of list) if (!report(editor.createVlan(device.id, vlan))) return;
    if (draft.name.trim() && list.length === 1 && !report(editor.setVlanName(device.id, list[0]!, draft.name))) return;
    draft = { vlan: '', name: '' };
  }

  function setAllowed(index: number, value: string) {
    const text = value.trim();
    if (!text) return report(editor.setTrunkAllowed(device.id, index, null));
    const list = text.toLowerCase() === 'none' ? [] : parseVlanList(text);
    if (!list) return report({ code: 'invalidVlan' });
    report(editor.setTrunkAllowed(device.id, index, list));
  }

  function setNative(index: number, value: string) {
    const vlan = Number(value || 1);
    if (Number.isInteger(vlan) && vlan >= 1 && vlan <= 4094) report(editor.setTrunkNative(device.id, index, vlan));
  }
</script>

{#if loop}
  <p class="warn" role="alert">⚠ {t('stp.loopWarning')}</p>
{/if}
{#if !ui.has('net.stp') && !ui.has('net.vlan')}
<p class="muted">{t('switch.basicHint')}</p>
{/if}
{#if ui.has('net.stp')}
<h3>{t('switch.stp')}</h3>
<label class="toggle">
  <input type="checkbox" checked={!!device.stp} onchange={(e) => editor.setStp(device.id, e.currentTarget.checked)} />
  {t('switch.stpEnable')}
</label>
{#if device.stp}
  <label class="row">
    <span>{t('switch.priority')}</span>
    <select value={device.stpPriority ?? 32768} disabled={!editor.editable} onchange={(e) => editor.setStpPriority(device.id, Number(e.currentTarget.value))}>
      {#each PRIORITIES as p (p)}
        <option value={p}>{p}</option>
      {/each}
    </select>
  </label>
{/if}
<p class="muted">{t('switch.stpHint')}</p>
{/if}

{#if ui.has('net.vlan')}
<h3>{t('switch.vlanDb')}</h3>
<p class="muted">{device.vlanDb ? t('switch.vlanDbHint') : t('switch.vlanDbLegacy')}</p>
<ul class="vlans">
  {#each known as vlan (vlan)}
    <li>
      <span class="swatch" style:background={vlanColor(editor.topology, vlan) ? TAG_HEX[vlanColor(editor.topology, vlan)!] : 'transparent'}></span>
      <strong>{vlan}</strong>
      {#if vlan === 1}
        <span class="muted">default</span>
      {:else}
        <input
          class="name"
          value={nameOf(vlan)}
          placeholder={`VLAN${String(vlan).padStart(4, '0')}`}
          maxlength="32"
          disabled={!editor.editable}
          aria-label={t('switch.vlanNameOf', { vlan })}
          onchange={(e) => report(editor.setVlanName(device.id, vlan, e.currentTarget.value))}
        />
        <button class="small" disabled={!editor.editable} onclick={() => report(editor.deleteVlan(device.id, vlan))} aria-label={t('switch.vlanDelete', { vlan })} title={t('switch.vlanDelete', { vlan })}>✕</button>
      {/if}
    </li>
  {/each}
</ul>
{#if editor.editable}
  <form class="add" onsubmit={addVlans}>
    <input bind:value={draft.vlan} placeholder="10 / 10,20,30-35" aria-label={t('switch.vlanNew')} inputmode="numeric" />
    <input bind:value={draft.name} placeholder={t('switch.vlanNamePlaceholder')} aria-label={t('switch.vlanNewName')} maxlength="32" />
    <button type="submit" disabled={!draft.vlan.trim()}>{t('switch.vlanCreate')}</button>
  </form>
{/if}
{#if error}<p class="warn" role="alert">{error}</p>{/if}

<h3>{t('switch.vlans')}</h3>
<table>
  <thead>
    <tr>
      <th scope="col">{t('switch.port')}</th>
      <th scope="col">{t('switch.vlan')}</th>
      <th scope="col">{t('switch.trunk')}</th>
      {#if canChannel}<th scope="col" title={t('switch.channelHint')}>{t('switch.channel')}</th>{/if}
      <th scope="col"><span class="visually-hidden">{t('switch.peer')}</span></th>
    </tr>
  </thead>
  <tbody>
    {#each device.interfaces as iface (iface.index)}
      <tr>
        <th scope="row">{interfaceLabel(device, iface.index)}</th>
        <td>
          <span class="swatch" style:background={colorOf(iface) ? TAG_HEX[colorOf(iface)!] : 'transparent'} title={colorOf(iface) ? (vlanLabel(editor.topology, iface.vlan ?? 1) ?? '') : t('switch.vlanNoColor')}></span>
          {#if iface.trunk}
            <input
              class="vlan"
              type="number"
              min="1"
              max="4094"
              value={iface.nativeVlan ?? 1}
              disabled={!editor.editable}
              title={t('switch.native')}
              aria-label={t('switch.nativeOf', { port: interfaceLabel(device, iface.index) })}
              onchange={(e) => setNative(iface.index, e.currentTarget.value)}
            />
            <input
              class="allowed"
              value={iface.allowedVlans ? formatVlanList(iface.allowedVlans) : ''}
              placeholder={t('switch.allowedAll')}
              disabled={!editor.editable}
              title={t('switch.allowedHint')}
              aria-label={t('switch.allowedOf', { port: interfaceLabel(device, iface.index) })}
              onchange={(e) => setAllowed(iface.index, e.currentTarget.value)}
            />
          {:else}
            <input
              class="vlan"
              type="number"
              min="1"
              max="4094"
              value={iface.vlan ?? 1}
              disabled={!editor.editable}
              aria-label={t('switch.vlanOf', { port: interfaceLabel(device, iface.index) })}
              onchange={(e) => setVlan(iface.index, e.currentTarget.value)}
            />
            {#if !vlanExists(device, iface.vlan ?? 1)}<span class="missing" title={t('switch.vlanMissingHint')}>{t('switch.vlanMissing')}</span>{/if}
          {/if}
        </td>
        <td>
          <input
            type="checkbox"
            checked={!!iface.trunk}
            disabled={!editor.editable}
            aria-label={t('switch.trunkOf', { port: interfaceLabel(device, iface.index) })}
            onchange={(e) => editor.setPortTrunk(device.id, iface.index, e.currentTarget.checked)}
          />
        </td>
        {#if canChannel}
          {@const status = channelStatus(iface.index)}
          <td class="channel">
            <input
              class="po"
              inputmode="numeric"
              value={iface.channel ?? ''}
              placeholder="–"
              disabled={!editor.editable}
              aria-label={t('switch.channelOf', { port: interfaceLabel(device, iface.index) })}
              onchange={(e) => setChannel(iface.index, e.currentTarget.value, iface.channelMode ?? 'active')}
            />
            {#if iface.channel}
              <select value={iface.channelMode ?? 'active'} disabled={!editor.editable} aria-label={t('switch.channelModeOf', { port: interfaceLabel(device, iface.index) })} onchange={(e) => setChannel(iface.index, String(iface.channel), e.currentTarget.value as ChannelMode)}>
                <option value="active">{t('switch.channelMode.active')}</option>
                <option value="passive">{t('switch.channelMode.passive')}</option>
                <option value="on">{t('switch.channelMode.on')}</option>
              </select>
              {#if status}<span class="po-status {status.status}" title={status.reason ? t(`switch.channelReason.${status.reason}`) : ''}>{t(`switch.channelStatus.${status.status}`)}</span>{/if}
            {/if}
          </td>
        {/if}
        <td class="muted">{peerOf(iface.index)}</td>
      </tr>
    {/each}
  </tbody>
</table>
<p class="muted">{t('switch.vlanHint')}</p>
{/if}

<style>
  h3 {
    margin: 16px 0 6px;
    font-size: 0.85rem;
  }
  .toggle,
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    margin-bottom: 6px;
  }
  .row {
    justify-content: space-between;
  }
  select,
  .vlan {
    font: inherit;
    font-size: 0.8rem;
    padding: 2px 4px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .vlan {
    width: 4.5em;
  }
  .allowed {
    width: 8em;
    font: inherit;
    font-size: 0.8rem;
    padding: 2px 4px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .channel {
    white-space: nowrap;
  }
  .po {
    width: 2.6em;
    font: inherit;
    font-size: 0.8rem;
    padding: 2px 4px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .po-status {
    font-size: 0.7rem;
    margin-left: 4px;
    padding: 0 4px;
    border-radius: 3px;
  }
  .po-status.bundled {
    color: #15803d;
    background: color-mix(in srgb, #16a34a 15%, transparent);
  }
  .po-status.suspended {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 12%, transparent);
  }
  .missing {
    color: var(--danger);
    font-size: 0.72rem;
    margin-left: 4px;
  }
  .vlans {
    list-style: none;
    margin: 0 0 6px;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 3px 10px;
    font-size: 0.8rem;
  }
  .vlans li {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .vlans .name {
    flex: 1;
    min-width: 0;
  }
  .add {
    display: flex;
    gap: 4px;
    margin-bottom: 6px;
  }
  .add input,
  .vlans .name {
    font: inherit;
    font-size: 0.8rem;
    padding: 2px 4px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    min-width: 0;
  }
  .add input:first-child {
    width: 9em;
  }
  .small {
    padding: 0 5px;
  }
  .swatch {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    border: 1px solid var(--border);
    margin-right: 4px;
    vertical-align: middle;
  }
  .warn {
    color: var(--danger);
    font-size: 0.8rem;
    margin: 4px 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  th,
  td {
    text-align: left;
    padding: 2px 4px;
    border-bottom: 1px solid var(--border);
  }
  thead th {
    color: var(--muted);
    font-weight: normal;
  }
  .muted {
    color: var(--muted);
    font-size: 0.75rem;
  }
  p.muted {
    margin: 4px 0 0;
  }
</style>
