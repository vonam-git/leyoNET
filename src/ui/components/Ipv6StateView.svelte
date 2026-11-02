<script lang="ts">
  import type { Device, Ip6State } from '../../core';
  import { t } from '../../i18n';
  import { interfaceLabel } from '../labels';

  /** IPv6 in der Simulation: Adressen (mit Herkunft), Standardrouter, Nachbarn aus Neighbor Discovery. */
  let { device, state }: { device: Device; state: Ip6State | undefined } = $props();
</script>

{#if state}
  <section class="v6" data-help="ipv6">
    <h3>IPv6</h3>
    {#if state.config === 'waiting'}<p class="muted">{t('ipv6.waiting')}</p>{/if}
    <ul class="addresses">
      {#each state.addresses as a (a.iface + a.address)}
        <li>
          <code>{a.address}/{a.prefix}</code>
          <span class="origin origin-{a.origin}">{t(`ipv6.origin.${a.origin}`)}</span>
          {#if device.interfaces.length > 1}<span class="muted">{interfaceLabel(device, a.iface)}</span>{/if}
        </li>
      {/each}
    </ul>
    {#if state.gateway}<p class="small">{t('ipv6.gateway')}: <code>{state.gateway}</code></p>{/if}
    <h4>{t('ipv6.neighbors')}</h4>
    {#if state.neighbors.length === 0}
      <p class="muted small">{t('ipv6.noNeighbors')}</p>
    {:else}
      <table>
        <tbody>
          {#each state.neighbors as n (n.ip)}
            <tr><td><code>{n.ip}</code></td><td><code>{n.mac}</code></td><td class="muted">{n.router ? 'Router' : ''}</td></tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
{/if}

<style>
  .v6 {
    margin: 10px 0;
  }
  h3 {
    margin: 12px 0 6px;
    font-size: 0.85rem;
  }
  h4 {
    margin: 8px 0 4px;
    font-size: 0.8rem;
  }
  .addresses {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 3px;
    font-size: 0.8rem;
  }
  code {
    word-break: break-all;
    font-size: 0.78rem;
  }
  .origin {
    padding: 0 6px;
    margin-left: 4px;
    font-size: 0.7rem;
    border-radius: 8px;
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .origin-slaac,
  .origin-dhcpv6 {
    border-color: #16a085;
    color: #0f766e;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.78rem;
  }
  td {
    padding: 2px 4px;
    border-bottom: 1px solid var(--border);
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 0.78rem;
    margin: 4px 0;
  }
</style>
