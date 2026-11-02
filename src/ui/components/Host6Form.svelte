<script lang="ts">
  import { formatIp6, isDocumentation6, isUniqueLocal6, linkLocal, networkOf6, parseCidr6, type Device } from '../../core';
  import { t } from '../../i18n';
  import { autosave } from '../autosave';
  import { editor } from '../state/editor.svelte';

  /**
   * IPv6 eines Endgeräts: automatisch (SLAAC oder DHCPv6, je nachdem, was der
   * Router im Router Advertisement ankündigt) oder feste Adresse mit Präfix und
   * Standardgateway. Die Link-Local-Adresse entsteht immer aus der MAC.
   */
  let { device }: { device: Device } = $props();

  const saved = $derived({ address: device.interfaces[0]?.ipv6 ?? '', gateway: device.gateway6 ?? '' });
  let draft = $state({ address: '', gateway: '' });
  let auto = $state(false);
  let error = $state<{ field?: string; text: string } | null>(null);

  $effect(() => {
    draft = { ...saved };
    auto = !!device.ipv6Auto;
    error = null;
  });

  const mac = $derived(device.interfaces[0]?.mac ?? '');
  const lla = $derived(mac ? formatIp6(linkLocal(mac)) : '');
  const dirty = $derived(auto !== !!device.ipv6Auto || (!auto && (draft.address.trim() !== saved.address || draft.gateway.trim() !== saved.gateway)));

  /** Kurze Einordnung der Adresse: Netz, Dokumentationsbereich oder ULA. */
  const info = $derived.by(() => {
    const c = saved.address ? parseCidr6(saved.address) : null;
    if (!c) return '';
    const kind = isDocumentation6(c.address) ? t('ipv6.kind.documentation') : isUniqueLocal6(c.address) ? t('ipv6.kind.ula') : t('ipv6.kind.global');
    return t('ipv6.network', { network: `${formatIp6(networkOf6(c.address, c.prefix))}/${c.prefix}`, kind });
  });

  function save(quiet: boolean): boolean {
    if (!dirty) return true;
    const failure = editor.configureHost6(device.id, { auto, address: draft.address, gateway: draft.gateway });
    if (failure) {
      if (!quiet) error = { field: failure.field, text: t(`error.${failure.code}`, failure.params) };
      return false;
    }
    error = null;
    return true;
  }
</script>

<form class="config" use:autosave={save} onsubmit={(e) => (e.preventDefault(), save(false))}>
  <h3>IPv6</h3>
  <fieldset class="mode">
    <legend class="visually-hidden">{t('ipv6.mode')}</legend>
    <label><input type="radio" bind:group={auto} value={false} /> {t('ipv6.mode.manual')}</label>
    <label><input type="radio" bind:group={auto} value={true} /> {t('ipv6.mode.auto')}</label>
  </fieldset>
  {#if auto}
    <p class="muted">{t('ipv6.autoExplain')}</p>
  {:else}
    <label class="field">
      <span>{t('ipv6.address')}</span>
      <input id="config6-address" type="text" autocomplete="off" spellcheck="false" placeholder="2001:db8:1::10/64" bind:value={draft.address} aria-invalid={error?.field === 'ipv6'} />
    </label>
    {#if error?.field === 'ipv6'}<p class="error" role="alert">{error.text}</p>{/if}
    <label class="field">
      <span>{t('ipv6.gateway')}</span>
      <input id="config6-gateway" type="text" autocomplete="off" spellcheck="false" placeholder="2001:db8:1::1" bind:value={draft.gateway} aria-invalid={error?.field === 'gateway6'} />
    </label>
    {#if error?.field === 'gateway6'}<p class="error" role="alert">{error.text}</p>{/if}
    {#if info}<p class="muted">{info}</p>{/if}
  {/if}
  {#if error && !error.field}<p class="error" role="alert">{error.text}</p>{/if}
  {#if lla}<p class="muted lla">{t('ipv6.linkLocal')}: <code>{lla}</code></p>{/if}
</form>

<style>
  .config {
    margin: 8px 0 12px;
  }
  h3 {
    margin: 16px 0 8px;
    font-size: 0.85rem;
  }
  .mode {
    display: flex;
    gap: 14px;
    margin: 0 0 8px;
    padding: 0;
    border: none;
    font-size: 0.85rem;
  }
  .mode label {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .field {
    display: grid;
    gap: 2px;
    margin-bottom: 8px;
    font-size: 0.8rem;
  }
  input[type='text'] {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 0.9rem;
    padding: 5px 8px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  input[aria-invalid='true'] {
    border-color: var(--danger);
  }
  .muted {
    margin: 0 0 6px;
    color: var(--muted);
    font-size: 0.8rem;
  }
  .lla code {
    word-break: break-all;
  }
  .error {
    margin: -4px 0 8px;
    font-size: 0.8rem;
    color: var(--danger);
  }
</style>
