<script lang="ts">
  import { CPE_LAN, formatIp6, linkLocal, networkOf6, parseCidr6, type Device } from '../../core';
  import { t } from '../../i18n';
  import { autosave } from '../autosave';
  import { interfaceLabel } from '../labels';
  import { editor } from '../state/editor.svelte';
  import { ui } from '../state/ui.svelte';

  /**
   * IPv6-Adressen der Anschlüsse von Router, Internet-Box und Provider. Ein
   * Router kündigt das Präfix jedes Anschlusses per Router Advertisement an
   * (SLAAC); mit «DHCPv6» vergibt er die Adressen stattdessen selbst. Dazu
   * DS-Lite: an der Internet-Box die Adresse des AFTR, beim Provider der
   * Schalter «als AFTR arbeiten».
   */
  let { device, compact = false }: { device: Device; compact?: boolean } = $props();

  /** Anschlüsse mit IPv6: CPE nur WAN und LAN (die LAN-Buchsen teilen sich ein Netz), sonst alle ausser seriellen. */
  const ports = $derived(device.type === 'cpe' ? device.interfaces.filter((i) => i.index === 0 || i.index === CPE_LAN) : device.interfaces.filter((i) => !i.serial));
  const announces = $derived(device.type !== 'internet');

  let drafts = $state<string[]>([]);
  let error = $state<{ index: number; text: string } | null>(null);
  let aftr = $state('');
  let aftrError = $state<string | null>(null);

  $effect(() => {
    drafts = device.interfaces.map((i) => i.ipv6 ?? '');
    aftr = device.dsLite?.aftr ?? '';
    error = null;
    aftrError = null;
  });

  function save(index: number, quiet: boolean): boolean {
    const draft = (drafts[index] ?? '').trim();
    if (draft === (device.interfaces[index]?.ipv6 ?? '')) return true;
    const failure = editor.setInterfaceIpv6(device.id, index, draft);
    if (failure) {
      if (!quiet) error = { index, text: t(`error.${failure.code}`, failure.params) };
      return false;
    }
    if (error?.index === index) error = null;
    return true;
  }

  function saveAftr(quiet: boolean): boolean {
    const value = aftr.trim();
    if (value === (device.dsLite?.aftr ?? '')) return true;
    const failure = editor.setDsLite(device.id, value || null);
    if (failure) {
      if (!quiet) aftrError = t(`error.${failure.code}`, failure.params);
      return false;
    }
    aftrError = null;
    return true;
  }

  const prefixOf = (text: string | undefined) => {
    const c = text ? parseCidr6(text) : null;
    return c ? `${formatIp6(networkOf6(c.address, c.prefix))}/${c.prefix}` : '';
  };
</script>

<section class="v6" data-help="ipv6">
  <h3>{t('ipv6.interfaces')}</h3>
  {#each ports as iface (iface.index)}
    <form class="iface" use:autosave={(quiet) => save(iface.index, quiet)} onsubmit={(e) => (e.preventDefault(), save(iface.index, false))}>
      <span class="label">{interfaceLabel(device, iface.index)}</span>
      <input bind:value={drafts[iface.index]} placeholder="2001:db8:1::1/64" disabled={!editor.editable} aria-label={t('ipv6.addressOf', { iface: interfaceLabel(device, iface.index) })} aria-invalid={error?.index === iface.index} spellcheck="false" autocomplete="off" />
    </form>
    {#if error?.index === iface.index}<p class="error" role="alert">{error.text}</p>{/if}
    {#if !compact && iface.ipv6}
      <p class="muted">
        {t('ipv6.linkLocal')}: <code>{formatIp6(linkLocal(iface.mac))}</code>
        {#if announces && !(device.type === 'cpe' && iface.index === 0)}· {t(iface.dhcp6 ? 'ipv6.announceDhcp' : 'ipv6.announceSlaac', { prefix: prefixOf(iface.ipv6) })}{/if}
      </p>
      {#if announces && !(device.type === 'cpe' && iface.index === 0)}
        <label class="check">
          <input type="checkbox" checked={!!iface.dhcp6} disabled={!editor.editable} onchange={(e) => editor.setInterfaceDhcp6(device.id, iface.index, e.currentTarget.checked)} />
          {t('ipv6.dhcp6')}
        </label>
      {/if}
    {/if}
  {/each}

  {#if device.type === 'cpe' && (ui.has('net.dsLite') || device.dsLite)}
    <h4 data-help="dsLite">DS-Lite</h4>
    <p class="muted">{t('dslite.cpeHint')}</p>
    <form class="iface" use:autosave={saveAftr} onsubmit={(e) => (e.preventDefault(), saveAftr(false))}>
      <span class="label">AFTR</span>
      <input bind:value={aftr} placeholder="2001:db8:ffff::1" disabled={!editor.editable} aria-label={t('dslite.aftr')} spellcheck="false" autocomplete="off" />
    </form>
    {#if aftrError}<p class="error" role="alert">{aftrError}</p>{/if}
  {/if}
  {#if device.type === 'internet' && (ui.has('net.dsLite') || device.aftr)}
    <h4 data-help="dsLite">DS-Lite</h4>
    <label class="check">
      <input type="checkbox" checked={!!device.aftr} disabled={!editor.editable} onchange={(e) => editor.setAftr(device.id, e.currentTarget.checked)} />
      {t('dslite.aftrRole')}
    </label>
    <p class="muted">{t('dslite.aftrHint', { address: device.cgnatAddress ?? '–' })}</p>
  {/if}
</section>

<style>
  .v6 {
    margin: 10px 0;
  }
  h3 {
    margin: 14px 0 6px;
    font-size: 0.85rem;
  }
  h4 {
    margin: 12px 0 4px;
    font-size: 0.8rem;
  }
  .iface {
    display: grid;
    grid-template-columns: 4.5em minmax(0, 1fr);
    gap: 6px;
    align-items: center;
    margin-bottom: 4px;
  }
  .label {
    font-size: 0.8rem;
    font-weight: 600;
  }
  input:not([type='checkbox']) {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 0.85rem;
    padding: 4px 6px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    min-width: 0;
  }
  input[aria-invalid='true'] {
    border-color: var(--danger);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    margin: 2px 0 6px;
  }
  .check input {
    width: auto;
  }
  .muted {
    margin: 0 0 4px;
    color: var(--muted);
    font-size: 0.75rem;
    word-break: break-all;
  }
  .error {
    margin: 0 0 6px;
    font-size: 0.8rem;
    color: var(--danger);
  }
</style>
