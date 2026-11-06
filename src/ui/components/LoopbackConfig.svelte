<script lang="ts">
  import { loopbackId, type Device } from '../../core';
  import { t } from '../../i18n';
  import { interfaceLabel } from '../labels';
  import { editor } from '../state/editor.svelte';
  import { subnetSummary } from '../subnet';

  /**
   * Loopback-Interfaces eines Routers oder Layer-3-Switches: immer aktiv, nicht
   * an ein Kabel gebunden. Üblich für die Router-ID, als feste Verwaltungsadresse
   * und als Quelle von Tunneln (VXLAN).
   */
  let { device }: { device: Device } = $props();

  let draft = $state({ id: '0', ip: '', mask: '/32' });
  let error = $state<string | null>(null);

  function add(event: SubmitEvent) {
    event.preventDefault();
    const failure = editor.setLoopback(device.id, Number(draft.id), draft.ip, draft.mask);
    error = failure ? t(`error.${failure.code}`, failure.params) : null;
    if (!failure) draft = { id: String(Math.max(0, ...(device.loopbacks ?? []).map((l) => l.id + 1), Number(draft.id) + 1)), ip: '', mask: '/32' };
  }
</script>

<h3>{t('loopback.title')}</h3>
<p class="muted">{t('loopback.hint')}</p>
{#if (device.loopbacks ?? []).length > 0}
  <ul>
    {#each device.loopbacks ?? [] as l (l.id)}
      <li>
        <span class="name">{interfaceLabel(device, loopbackId(l.id))}</span>
        <span class="mono">{l.ip ? `${l.ip} ${l.mask ?? ''}` : t('subif.noAddress')}</span>
        <button class="small" disabled={!editor.editable} onclick={() => editor.removeLoopback(device.id, l.id)} aria-label={t('loopback.remove', { n: l.id })}>✕</button>
        {#if l.ip}<span class="summary">{subnetSummary(l.ip, l.mask)}</span>{/if}
      </li>
    {/each}
  </ul>
{/if}
{#if editor.editable}
  <form onsubmit={add}>
    <input bind:value={draft.id} inputmode="numeric" placeholder="0" aria-label={t('loopback.number')} />
    <input bind:value={draft.ip} placeholder="10.255.0.1" aria-label={t('config.ip')} autocomplete="off" spellcheck="false" />
    <input bind:value={draft.mask} placeholder="/32" aria-label={t('config.mask')} autocomplete="off" spellcheck="false" />
    <button type="submit" disabled={!draft.ip.trim()} title={t('loopback.add')} aria-label={t('loopback.add')}>+</button>
  </form>
{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}

<style>
  h3 {
    margin: 16px 0 6px;
    font-size: 0.85rem;
  }
  .muted {
    color: var(--muted);
    font-size: 0.75rem;
    margin: 0 0 6px;
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
    grid-template-columns: 3rem minmax(0, 1fr) 3.5rem auto;
    gap: 4px;
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
