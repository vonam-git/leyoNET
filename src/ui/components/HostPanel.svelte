<script lang="ts">
  import type { Device } from '../../core';
  import { t } from '../../i18n';
  import { openDesktop } from '../state/desktop.svelte';
  import { simStore } from '../state/sim.svelte';
  import { editor } from '../state/editor.svelte';
  import AddressView from './AddressView.svelte';
  import StateTables from './StateTables.svelte';

  /** Simulation, Endgerät: wirksame Adresse, Desktop öffnen, ARP-Tabelle. */
  let { device }: { device: Device } = $props();

  const arp = $derived((simStore.tick, simStore.sim?.getDeviceState(device.id).arp ?? []));
  const now = $derived((simStore.tick, simStore.sim?.now ?? 0));
</script>

<AddressView {device} />

<button class="open" onclick={() => openDesktop(device.id)}>{t('desktop.open')}</button>
<p class="hint">{t('desktop.openHint')}</p>

{#if editor.ipMode !== 'ipv6'}<StateTables {device} {arp} {now} />{/if}

<style>
  .open {
    width: 100%;
    margin-top: 10px;
    font-weight: 600;
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
  .open:hover {
    filter: brightness(1.08);
    background: var(--accent) !important;
  }
  .hint {
    margin: 4px 0 0;
    font-size: 0.75rem;
    color: var(--muted);
  }
</style>
