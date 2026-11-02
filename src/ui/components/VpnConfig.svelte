<script lang="ts">
  import type { Device } from '../../core';
  import { t } from '../../i18n';
  import { editor } from '../state/editor.svelte';
  import { simStore } from '../state/sim.svelte';

  /**
   * Site-to-Site-VPN (IPsec) eines Routers: Jeder Tunnel verbindet das eigene
   * Netz mit dem Netz am anderen Standort. Auf beiden Routern muss der Tunnel
   * gespiegelt eingetragen sein (eigenes ↔ entferntes Netz) mit demselben Schlüssel.
   */
  let { device }: { device: Device } = $props();

  const tunnels = $derived(device.vpn ?? []);
  const live = $derived((simStore.tick, editor.acting ? simStore.sim?.getDeviceState(device.id).vpn : undefined));

  let draft = $state({ name: '', peer: '', local: '', remote: '', key: '' });
  let error = $state<string | null>(null);

  function add(event: SubmitEvent) {
    event.preventDefault();
    const failure = editor.addVpnTunnel(device.id, { ...draft, name: draft.name.trim() || `VPN ${tunnels.length + 1}` });
    error = failure ? t(`error.${failure.code}`, failure.params) : null;
    if (!failure) draft = { name: '', peer: '', local: draft.local, remote: '', key: '' };
  }
</script>

<section class="vpn" data-help="vpn">
  <h3>{t('vpn.title')}</h3>
  <p class="muted">{t('vpn.intro')}</p>

  {#if tunnels.length === 0}<p class="muted">{t('vpn.none')}</p>{/if}
  {#each tunnels as tunnel, i (i)}
    {@const state = live?.[i]}
    <article class="tunnel {state?.status ?? ''}">
      <header>
        <strong>{tunnel.name}</strong>
        {#if state}<span class="status" role="status">{t(`vpn.status.${state.status}`)}{state.error ? ` – ${t(`vpn.error.${state.error}`)}` : ''}</span>{/if}
        <button class="remove" disabled={!editor.editable} onclick={() => editor.removeVpnTunnel(device.id, i)} aria-label={t('vpn.remove')} title={t('vpn.remove')}>✕</button>
      </header>
      <dl>
        <dt>{t('vpn.peer')}</dt><dd class="mono">{tunnel.peer}</dd>
        <dt>{t('vpn.local')}</dt><dd class="mono">{tunnel.local}</dd>
        <dt>{t('vpn.remote')}</dt><dd class="mono">{tunnel.remote}</dd>
        <dt>{t('vpn.key')}</dt><dd class="mono">{'•'.repeat(Math.min(tunnel.key.length, 12))}</dd>
        {#if state}
          <dt>{t('vpn.spi')}</dt><dd class="mono">0x{state.localSpi.toString(16)}{state.remoteSpi !== undefined ? ` / 0x${state.remoteSpi.toString(16)}` : ''}</dd>
          <dt>{t('vpn.counters')}</dt><dd>{t('vpn.countersValue', { sent: state.sent, received: state.received })}</dd>
        {/if}
      </dl>
    </article>
  {/each}

  {#if editor.editable}
    <form onsubmit={add}>
      <h4>{t('vpn.add')}</h4>
      <div class="grid">
        <label>{t('vpn.name')}<input bind:value={draft.name} placeholder="Zürich – Bern" maxlength="40" /></label>
        <label>{t('vpn.peer')}<input class="mono" bind:value={draft.peer} placeholder="203.0.113.2" spellcheck="false" /></label>
        <label>{t('vpn.local')}<input class="mono" bind:value={draft.local} placeholder="192.168.1.0/24" spellcheck="false" /></label>
        <label>{t('vpn.remote')}<input class="mono" bind:value={draft.remote} placeholder="192.168.2.0/24" spellcheck="false" /></label>
        <label>{t('vpn.key')}<input class="mono" bind:value={draft.key} type="text" autocomplete="off" spellcheck="false" /></label>
      </div>
      <button type="submit">{t('vpn.addButton')}</button>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </form>
  {/if}
  <p class="muted hint">{t('vpn.hint')}</p>
</section>

<style>
  h3 {
    margin: 10px 0 4px;
    font-size: 0.9rem;
  }
  h4 {
    margin: 12px 0 6px;
    font-size: 0.85rem;
  }
  .muted {
    color: var(--muted);
    font-size: 0.8rem;
    margin: 4px 0;
  }
  .tunnel {
    border: 1px solid var(--border);
    border-left: 4px solid var(--k, var(--border));
    border-radius: 6px;
    padding: 6px 10px;
    margin: 6px 0;
  }
  .tunnel.up {
    --k: #16a34a;
  }
  .tunnel.connecting {
    --k: #d97706;
  }
  .tunnel.failed {
    --k: #dc2626;
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .status {
    font-size: 0.8rem;
    color: var(--k);
    font-weight: 600;
  }
  .remove {
    margin-left: auto;
    padding: 0 6px;
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 2px 12px;
    margin: 6px 0 0;
    font-size: 0.8rem;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  .mono {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 6px 10px;
    margin-bottom: 8px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.78rem;
    color: var(--muted);
  }
  input {
    font-size: 0.8rem;
    padding: 3px 5px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .error {
    color: var(--danger);
    font-size: 0.8rem;
  }
  .hint {
    font-size: 0.75rem;
    margin-top: 10px;
  }
</style>
