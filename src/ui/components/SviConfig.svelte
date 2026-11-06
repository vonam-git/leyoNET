<script lang="ts">
  import { parseMask, sviId, type Device } from '../../core';
  import { t } from '../../i18n';
  import { interfaceLabel } from '../labels';
  import { editor } from '../state/editor.svelte';
  import { subnetSummary } from '../subnet';
  import { ui } from '../state/ui.svelte';
  import LoopbackConfig from './LoopbackConfig.svelte';

  /**
   * Layer-3-Switch: VLAN-Interfaces (SVIs) als Gateways der VLANs und Routing ein/aus.
   * Layer-2-Switch: Verwaltungsadresse («interface vlan 1») und Standardgateway, ohne Routing.
   */
  let { device }: { device: Device } = $props();
  const management = $derived(device.type === 'switch');
  const gateway = $derived(device.routes?.find((r) => parseMask(r.mask) === 0)?.gateway ?? '');

  function setGateway(value: string) {
    const failure = editor.setDefaultGateway(device.id, value);
    error = failure ? t(`error.${failure.code}`, failure.params) : null;
  }

  let draft = $state({ vlan: '', ip: '', mask: '' });
  let error = $state<string | null>(null);

  function add(event: SubmitEvent) {
    event.preventDefault();
    const failure = editor.setSvi(device.id, Number(draft.vlan), draft.ip, draft.mask);
    error = failure ? t(`error.${failure.code}`, failure.params) : null;
    if (!failure) draft = { vlan: '', ip: '', mask: '' };
  }
</script>

{#if management}
  <h3>{t('svi.managementTitle')}</h3>
  <p class="muted">{t('svi.managementHint')}</p>
{:else}
  <h3>{t('svi.title')}</h3>
  <label class="toggle">
    <input type="checkbox" checked={device.ipRouting !== false} onchange={(e) => editor.setIpRouting(device.id, e.currentTarget.checked)} />
    {t('svi.routing')}
  </label>
  <p class="muted">{t('svi.hint')}</p>
{/if}
{#if (device.svis ?? []).length > 0}
  <ul>
    {#each device.svis ?? [] as s (s.vlan)}
      <li>
        <span class="name">{interfaceLabel(device, sviId(s.vlan))}</span>
        <span class="mono">{[s.ip && editor.ipMode !== 'ipv6' ? `${s.ip} ${s.mask ?? ''}` : '', s.ipv6 && editor.ipMode !== 'ipv4' ? s.ipv6 : ''].filter(Boolean).join(' · ') || t('subif.noAddress')}</span>
        <button class="small" onclick={() => editor.removeSvi(device.id, s.vlan)} aria-label={t('svi.remove')}>✕</button>
        {#if s.ip}<span class="summary">{subnetSummary(s.ip, s.mask)}</span>{/if}
      </li>
    {/each}
  </ul>
{/if}
<form onsubmit={add} class:v6only={editor.ipMode === 'ipv6'}>
  <input bind:value={draft.vlan} inputmode="numeric" placeholder="VLAN" aria-label={t('subif.vlan')} />
  {#if editor.ipMode !== 'ipv6'}
    <input bind:value={draft.ip} placeholder="10.10.0.1" aria-label={t('config.ip')} autocomplete="off" spellcheck="false" />
    <input bind:value={draft.mask} placeholder="/24" aria-label={t('config.mask')} autocomplete="off" spellcheck="false" />
  {/if}
  <button type="submit" disabled={!draft.vlan.trim()} title={t('svi.add')} aria-label={t('svi.add')}>+</button>
</form>
{#if device.type === 'l3switch' && ui.has('net.loopback')}
  <LoopbackConfig {device} />
{/if}
{#if management}
  <label class="gw">
    <span>{t('config.gateway')}</span>
    <input value={gateway} placeholder="192.168.1.1" disabled={!editor.editable} onchange={(e) => setGateway(e.currentTarget.value)} autocomplete="off" spellcheck="false" />
  </label>
{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}

<style>
  .gw {
    display: grid;
    grid-template-columns: 7rem minmax(0, 1fr);
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    margin-top: 8px;
  }
  .gw input {
    font: inherit;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    padding: 2px 4px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  h3 {
    margin: 16px 0 6px;
    font-size: 0.85rem;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
  }
  .muted {
    color: var(--muted);
    font-size: 0.75rem;
    margin: 4px 0 6px;
  }
  ul {
    list-style: none;
    margin: 0 0 6px;
    padding: 0;
    font-size: 0.8rem;
  }
  li {
    display: grid;
    grid-template-columns: 4.5rem minmax(0, 1fr) auto;
    gap: 4px;
    align-items: center;
    padding: 3px 0;
    border-bottom: 1px solid var(--border);
  }
  .summary {
    grid-column: 1 / -1;
    color: var(--muted);
    font-size: 0.7rem;
  }
  .mono {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    overflow-wrap: anywhere;
  }
  form {
    display: grid;
    grid-template-columns: 3.5rem minmax(0, 1fr) 3rem auto;
    gap: 4px;
  }
  form.v6only {
    grid-template-columns: 3.5rem auto;
    justify-content: start;
  }
  input {
    font: inherit;
    font-size: 0.8rem;
    padding: 3px 5px;
    min-width: 0;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  button {
    padding: 3px 8px;
  }
  .small {
    padding: 1px 6px;
    font-size: 0.75rem;
  }
  .error {
    color: var(--danger);
    font-size: 0.75rem;
    margin: 4px 0 0;
  }
</style>
