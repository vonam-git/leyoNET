<script lang="ts">
  import { MAX_PORT_MACS, setDhcpSnooping, setDhcpTrusted, setPortSecurity, type Device } from '../../core';
  import { t } from '../../i18n';
  import { interfaceLabel } from '../labels';
  import { editor } from '../state/editor.svelte';
  import { simStore } from '../state/sim.svelte';

  /**
   * Schutz am Switch: DHCP-Snooping (nur vertrauenswürdige Ports dürfen als DHCP-Server antworten,
   * RFC 7513) und Port-Sicherheit (höchstens n MAC-Adressen je Port). Gegen falsche DHCP-Server
   * und DHCP Starvation. Dasselbe geht auf der Befehlszeile («ip dhcp snooping», «switchport port-security»).
   */
  let { device }: { device: Device } = $props();
  const ports = $derived(device.interfaces.filter((i) => !i.sfpSlot || i.sfp));
  const live = $derived((simStore.tick, editor.acting ? (simStore.sim?.getDeviceState(device.id) as { violations?: { port: number; portSecurity: number; dhcp: number }[] } | undefined)?.violations : undefined));
  let error = $state<string | null>(null);

  function apply(result: ReturnType<typeof setDhcpSnooping>) {
    error = result.ok ? null : t(`error.${result.error.code}`, result.error.params);
    if (result.ok) editor.applyConfig(result.value);
  }
  const limit = (iface: number, value: string) => apply(setPortSecurity(editor.topology, device.id, iface, value.trim() ? Number(value) : null));
</script>

<h3 data-help="l2security">{t('l2sec.title')}</h3>
<label class="switch">
  <input type="checkbox" checked={!!device.dhcpSnooping} disabled={editor.viewOnly} onchange={(e) => apply(setDhcpSnooping(editor.topology, device.id, e.currentTarget.checked))} />
  <span><b>{t('l2sec.snooping')}</b><small>{t('l2sec.snoopingHint')}</small></span>
</label>
{#if error}<p class="error" role="alert">{error}</p>{/if}
<table>
  <thead>
    <tr>
      <th>{t('l2sec.port')}</th>
      <th title={t('l2sec.trustedHint')}>{t('l2sec.trusted')}</th>
      <th title={t('l2sec.maxHint', { max: MAX_PORT_MACS })}>{t('l2sec.max')}</th>
      {#if live}<th>{t('l2sec.dropped')}</th>{/if}
    </tr>
  </thead>
  <tbody>
    {#each ports as p (p.index)}
      {@const v = live?.find((x) => x.port === p.index)}
      <tr>
        <td>{interfaceLabel(device, p.index)}</td>
        <td><input type="checkbox" aria-label={t('l2sec.trustedFor', { port: interfaceLabel(device, p.index) })} checked={!!p.dhcpTrusted} disabled={editor.viewOnly || !device.dhcpSnooping} onchange={(e) => apply(setDhcpTrusted(editor.topology, device.id, p.index, e.currentTarget.checked))} /></td>
        <td><input type="number" min="1" max={MAX_PORT_MACS} placeholder="–" aria-label={t('l2sec.maxFor', { port: interfaceLabel(device, p.index) })} value={p.portSecurity ?? ''} disabled={editor.viewOnly} onchange={(e) => limit(p.index, e.currentTarget.value)} /></td>
        {#if live}<td class:bad={!!v}>{v ? t('l2sec.droppedCount', { mac: v.portSecurity, dhcp: v.dhcp }) : '–'}</td>{/if}
      </tr>
    {/each}
  </tbody>
</table>
<p class="muted small">{t('l2sec.cli')}</p>

<style>
  .switch {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    margin-bottom: 10px;
  }
  small {
    display: block;
    color: var(--muted);
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th,
  td {
    text-align: left;
    padding: 3px 8px;
    border-bottom: 1px solid var(--border);
  }
  input[type='number'] {
    width: 5em;
  }
  .bad {
    color: var(--danger);
  }
  .error {
    color: var(--danger);
  }
</style>
