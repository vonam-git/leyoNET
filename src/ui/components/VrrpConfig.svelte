<script lang="ts">
  import { interfaceAddresses, removeVrrpGroup, setVrrpGroup, decodeIface, formatIp, networkOf, vrrpMac, type Device, type VrrpGroup } from '../../core';
  import { t } from '../../i18n';
  import { interfaceLabel } from '../labels';
  import { editor } from '../state/editor.svelte';
  import { simStore } from '../state/sim.svelte';

  /**
   * VRRP (RFC 9568): redundantes Gateway. Je Interface eine oder mehrere Gruppen mit virtueller
   * Adresse; das Gerät mit der höchsten Priorität ist Master. Auch in der Simulation änderbar,
   * damit sich Übernahme und Preempt live ausprobieren lassen.
   */
  let { device }: { device: Device } = $props();

  /** Interfaces mit Adresse (ohne Loopbacks): Dort kann eine Gruppe laufen. */
  const ifaces = $derived(interfaceAddresses(device).filter((i) => decodeIface(i.index).kind !== 'loopback'));
  const groups = $derived(device.vrrp ?? []);
  const live = $derived((simStore.tick, editor.acting ? simStore.sim?.getDeviceState(device.id).vrrp : undefined));
  const stateOf = (g: VrrpGroup) => live?.find((l) => l.iface === g.iface && l.vrid === g.vrid);
  const locked = $derived(editor.viewOnly);

  let error = $state<string | null>(null);
  let draft = $state({ iface: -1, vrid: '1', ip: '', priority: '100' });

  // Vorschlag: erstes Interface, die erste Adresse im Netz als virtuelle Adresse.
  $effect(() => {
    if (draft.iface === -1 && ifaces[0]) {
      const first = ifaces[0];
      draft.iface = first.index;
      draft.ip = formatIp(networkOf(first.ip, first.prefix) + 1);
    }
  });

  function apply(result: ReturnType<typeof setVrrpGroup>): boolean {
    if (!result.ok) {
      error = t(`error.${result.error.code}`, result.error.params);
      return false;
    }
    error = null;
    editor.applyConfig(result.value);
    return true;
  }

  function change(g: VrrpGroup, patch: Partial<VrrpGroup> & { preempt?: false }, drop: (keyof VrrpGroup)[] = []) {
    const next = { ...g, ...patch } as VrrpGroup;
    for (const key of drop) delete (next as Partial<VrrpGroup>)[key];
    apply(setVrrpGroup(editor.topology, device.id, next));
  }

  function add(event: SubmitEvent) {
    event.preventDefault();
    const priority = Number(draft.priority);
    if (apply(setVrrpGroup(editor.topology, device.id, { iface: draft.iface, vrid: Number(draft.vrid), ip: draft.ip, priority }))) draft.vrid = String(Number(draft.vrid) + 1);
  }

  function setTrack(g: VrrpGroup, value: string, decrement: number) {
    if (value === '') change(g, {}, ['track']);
    else change(g, { track: { iface: Number(value), decrement } });
  }
</script>

<h3 data-help="vrrp">{t('vrrp.title')}</h3>
<p class="muted">{t('vrrp.hint')}</p>

{#if groups.length}
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th scope="col">{t('vrrp.iface')}</th>
          <th scope="col">{t('vrrp.vrid')}</th>
          <th scope="col">{t('vrrp.ip')}</th>
          <th scope="col">{t('vrrp.priority')}</th>
          <th scope="col" title={t('vrrp.preemptHint')}>{t('vrrp.preempt')}</th>
          <th scope="col" title={t('vrrp.acceptHint')}>{t('vrrp.accept')}</th>
          <th scope="col" title={t('vrrp.trackHint')}>{t('vrrp.track')}</th>
          {#if live}<th scope="col">{t('vrrp.state')}</th>{/if}
          <th scope="col"><span class="visually-hidden">{t('vrrp.remove')}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each groups as g (`${g.iface}|${g.vrid}`)}
          {@const s = stateOf(g)}
          <tr>
            <th scope="row">{interfaceLabel(device, g.iface)}</th>
            <td title={vrrpMac(g.vrid).toLowerCase()}>{g.vrid}</td>
            <td><input class="ip" value={g.ip} disabled={locked} aria-label={t('vrrp.ip')} onchange={(e) => change(g, { ip: e.currentTarget.value })} /></td>
            <td><input class="num" type="number" min="1" max="254" value={g.priority ?? 100} disabled={locked} aria-label={t('vrrp.priority')} onchange={(e) => change(g, { priority: Number(e.currentTarget.value) })} /></td>
            <td><input type="checkbox" checked={g.preempt !== false} disabled={locked} aria-label={t('vrrp.preempt')} onchange={(e) => (e.currentTarget.checked ? change(g, {}, ['preempt']) : change(g, { preempt: false }))} /></td>
            <td><input type="checkbox" checked={!!g.accept} disabled={locked} aria-label={t('vrrp.accept')} onchange={(e) => (e.currentTarget.checked ? change(g, { accept: true }) : change(g, {}, ['accept']))} /></td>
            <td class="track">
              <select value={g.track ? String(g.track.iface) : ''} disabled={locked} aria-label={t('vrrp.track')} onchange={(e) => setTrack(g, e.currentTarget.value, g.track?.decrement ?? 20)}>
                <option value="">–</option>
                {#each device.interfaces.filter((i) => i.index !== g.iface) as i (i.index)}<option value={String(i.index)}>{interfaceLabel(device, i.index)}</option>{/each}
              </select>
              {#if g.track}
                <input class="num" type="number" min="1" max="253" value={g.track.decrement} disabled={locked} aria-label={t('vrrp.decrement')} title={t('vrrp.decrement')} onchange={(e) => setTrack(g, String(g.track!.iface), Number(e.currentTarget.value))} />
              {/if}
            </td>
            {#if live}
              <td><span class="state {s?.state ?? 'init'}">{t(`vrrp.state.${s?.state ?? 'init'}`)}</span>{#if s && s.priority !== (g.priority ?? 100)} <small class="muted">({s.priority})</small>{/if}</td>
            {/if}
            <td><button class="small" disabled={locked} aria-label={t('vrrp.remove')} title={t('vrrp.remove')} onclick={() => apply(removeVrrpGroup(editor.topology, device.id, g.iface, g.vrid))}>✕</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

{#if ifaces.length}
  {#if !locked}
    <form class="add" onsubmit={add}>
      <select bind:value={draft.iface} aria-label={t('vrrp.iface')}>
        {#each ifaces as i (i.index)}<option value={i.index}>{interfaceLabel(device, i.index)} ({formatIp(i.ip)}/{i.prefix})</option>{/each}
      </select>
      <label>{t('vrrp.vrid')} <input class="num" type="number" min="1" max="255" bind:value={draft.vrid} /></label>
      <label>{t('vrrp.ip')} <input class="ip" bind:value={draft.ip} spellcheck="false" autocomplete="off" /></label>
      <label>{t('vrrp.priority')} <input class="num" type="number" min="1" max="254" bind:value={draft.priority} /></label>
      <button type="submit">{t('vrrp.add')}</button>
    </form>
  {/if}
{:else}
  <p class="muted">{t('vrrp.noAddress')}</p>
{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}

<style>
  .scroll {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  th,
  td {
    padding: 3px 6px;
    text-align: left;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  .ip {
    width: 9rem;
  }
  .num {
    width: 4.2rem;
  }
  .track {
    display: flex;
    gap: 4px;
  }
  .add {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-top: 10px;
  }
  .state {
    padding: 1px 6px;
    border-radius: 8px;
    border: 1px solid var(--border);
  }
  .state.master {
    background: color-mix(in srgb, #1f8a4c 22%, transparent);
    border-color: #1f8a4c;
  }
  .state.backup {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
  }
  .error {
    color: var(--danger);
  }
</style>
