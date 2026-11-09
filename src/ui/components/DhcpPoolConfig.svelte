<script lang="ts">
  import { DHCP_POOL_NAME, logicalInterfaces, parseMask, relayOf, type Device, type DhcpPool } from '../../core';
  import { t } from '../../i18n';
  import { interfaceLabel } from '../labels';
  import { editor } from '../state/editor.svelte';
  import { ui } from '../state/ui.svelte';

  /**
   * DHCP auf Router, Firewall und Layer-3-Switch: Relay je Interface («ip helper-address»)
   * und eigene Pools («ip dhcp pool») mit ausgeschlossenen Adressen.
   */
  let { device }: { device: Device } = $props();

  const ifaces = $derived(logicalInterfaces(device).filter((id) => !(device.interfaces[id]?.sfpSlot && !device.interfaces[id]?.sfp)));
  const pools = $derived(device.dhcpPools ?? []);
  let error = $state<string | null>(null);

  function report(failure: { code: string; params?: Record<string, string | number> } | null): boolean {
    error = failure ? t(`error.${failure.code}`, failure.params) : null;
    return !failure;
  }

  // --- Pools ---------------------------------------------------------------------------

  type Draft = { name: string; network: string; gateway: string; dns: string };
  const empty = (): Draft => ({ name: '', network: '', gateway: '', dns: '' });
  let draft = $state<Draft>(empty());
  let excluded = $state({ start: '', end: '' });

  /** «192.168.10.0/24» oder «192.168.10.0 255.255.255.0» in Netz und Maske zerlegen. */
  function split(text: string): { network?: string; mask?: string } {
    const v = text.trim();
    if (!v) return {};
    const [network = '', mask = ''] = v.includes('/') ? v.split('/') : v.split(/\s+/);
    return { network, mask: v.includes('/') ? `/${mask}` : mask };
  }

  function addPool(event: SubmitEvent) {
    event.preventDefault();
    const pool: DhcpPool = { name: draft.name.trim(), ...split(draft.network), ...(draft.gateway.trim() ? { gateway: draft.gateway.trim() } : {}), ...(draft.dns.trim() ? { dns: draft.dns.trim() } : {}) };
    if (report(editor.setDhcpPool(device.id, pool.name, pool))) draft = empty();
  }

  function change(pool: DhcpPool, field: 'network' | 'gateway' | 'dns', value: string) {
    const next: DhcpPool = { ...pool };
    if (field === 'network') {
      delete next.network;
      delete next.mask;
      Object.assign(next, split(value));
    } else if (value.trim()) next[field] = value.trim();
    else delete next[field];
    report(editor.setDhcpPool(device.id, pool.name, next));
  }

  function addExcluded(event: SubmitEvent) {
    event.preventDefault();
    if (report(editor.setDhcpExcluded(device.id, excluded.start, excluded.end || undefined))) excluded = { start: '', end: '' };
  }

  const cidr = (p: DhcpPool) => (p.network && p.mask ? `${p.network}/${parseMask(p.mask)}` : '');
</script>

{#if ui.has('net.dhcpRelay')}
  <section data-help="dhcp">
    <h3>{t('router.relay')}</h3>
    <p class="muted">{t('router.relayHint')}</p>
    <div class="grid">
      {#each ifaces as id (id)}
        <label>
          <span>{interfaceLabel(device, id)}</span>
          <input
            value={relayOf(device, id) ?? ''}
            placeholder={t('router.relayPlaceholder')}
            aria-label={t('router.relayFor', { iface: interfaceLabel(device, id) })}
            disabled={!editor.editable}
            autocomplete="off"
            spellcheck="false"
            onchange={(e) => report(editor.setInterfaceRelay(device.id, id, e.currentTarget.value))}
          />
        </label>
      {/each}
    </div>
  </section>
{/if}

{#if ui.has('service.dhcp')}
  <section data-help="dhcp">
    <h3>{t('dhcpPool.title')}</h3>
    <p class="muted">{t('dhcpPool.intro')}</p>
    {#if pools.length}
      <table>
        <thead>
          <tr>
            <th scope="col">{t('dhcpPool.name')}</th>
            <th scope="col">{t('dhcpPool.network')}</th>
            <th scope="col">{t('dhcpPool.gateway')}</th>
            <th scope="col">DNS</th>
            <th scope="col"><span class="visually-hidden">{t('routing.actions')}</span></th>
          </tr>
        </thead>
        <tbody>
          {#each pools as p (p.name)}
            <tr>
              <td class="mono">{p.name}</td>
              <td><input value={cidr(p)} placeholder="192.168.10.0/24" disabled={!editor.editable} aria-label={t('dhcpPool.networkOf', { name: p.name })} onchange={(e) => change(p, 'network', e.currentTarget.value)} /></td>
              <td><input value={p.gateway ?? ''} placeholder="192.168.10.1" disabled={!editor.editable} aria-label={t('dhcpPool.gatewayOf', { name: p.name })} onchange={(e) => change(p, 'gateway', e.currentTarget.value)} /></td>
              <td><input value={p.dns ?? ''} placeholder="192.0.2.53" disabled={!editor.editable} aria-label={t('dhcpPool.dnsOf', { name: p.name })} onchange={(e) => change(p, 'dns', e.currentTarget.value)} /></td>
              <td><button type="button" class="small" disabled={!editor.editable} onclick={() => report(editor.setDhcpPool(device.id, p.name, null))} aria-label={t('dhcpPool.remove', { name: p.name })} title={t('dhcpPool.remove', { name: p.name })}>✕</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    {#if editor.editable}
      <form class="add" onsubmit={addPool}>
        <input bind:value={draft.name} placeholder="VLAN10" maxlength="32" pattern={DHCP_POOL_NAME.source.slice(1, -1)} aria-label={t('dhcpPool.name')} spellcheck="false" />
        <input bind:value={draft.network} placeholder="192.168.10.0/24" aria-label={t('dhcpPool.network')} spellcheck="false" />
        <input bind:value={draft.gateway} placeholder="192.168.10.1" aria-label={t('dhcpPool.gateway')} spellcheck="false" />
        <input bind:value={draft.dns} placeholder="DNS" aria-label="DNS" spellcheck="false" />
        <button type="submit" disabled={!draft.name.trim()}>{t('dhcpPool.add')}</button>
      </form>
    {/if}

    <h4>{t('dhcpPool.excluded')}</h4>
    {#each device.dhcpExcluded ?? [] as e (e.start + (e.end ?? ''))}
      <span class="chip mono">
        {e.start}{e.end ? ` – ${e.end}` : ''}
        <button type="button" class="x" disabled={!editor.editable} onclick={() => report(editor.setDhcpExcluded(device.id, e.start, e.end, true))} aria-label={t('dhcpPool.removeExcluded')}>✕</button>
      </span>
    {/each}
    {#if editor.editable}
      <form class="add" onsubmit={addExcluded}>
        <input bind:value={excluded.start} placeholder="192.168.10.1" aria-label={t('dhcpPool.excludedFrom')} spellcheck="false" />
        <input bind:value={excluded.end} placeholder="192.168.10.9" aria-label={t('dhcpPool.excludedTo')} spellcheck="false" />
        <button type="submit" disabled={!excluded.start.trim()}>{t('dhcpPool.addExcluded')}</button>
      </form>
    {/if}
    <p class="muted hint">{t('dhcpPool.hint')}</p>
  </section>
{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}

<style>
  h3 {
    margin: 10px 0 4px;
    font-size: 0.9rem;
  }
  h4 {
    margin: 12px 0 4px;
    font-size: 0.82rem;
  }
  .muted {
    color: var(--muted);
    font-size: 0.8rem;
    margin: 4px 0;
  }
  .hint {
    font-size: 0.75rem;
  }
  .mono,
  input {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  input {
    width: 100%;
    min-width: 0;
    font-size: 0.78rem;
    padding: 2px 4px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 4px 10px;
  }
  .grid label {
    display: grid;
    grid-template-columns: 7rem minmax(0, 1fr);
    align-items: center;
    gap: 4px;
    font-size: 0.8rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  th,
  td {
    text-align: left;
    padding: 3px 4px;
    border-bottom: 1px solid var(--border);
  }
  th {
    color: var(--muted);
    font-weight: normal;
  }
  .add {
    display: flex;
    gap: 4px;
    margin: 6px 0;
  }
  .small,
  .x {
    padding: 0 5px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 0 6px 4px 0;
    font-size: 0.8rem;
  }
  .error {
    color: var(--danger);
    font-size: 0.8rem;
  }
</style>
