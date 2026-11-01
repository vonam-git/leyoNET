<script lang="ts">
  import { ACCESS_PROFILES, CPE_LAN, CPE_WAN, parseMask, type Device } from '../../core';
  import { t } from '../../i18n';
  import { autosave } from '../autosave';
  import { dialogs } from '../state/dialogs.svelte';
  import { duplicates } from '../state/duplicates.svelte';
  import { editor } from '../state/editor.svelte';
  import { simStore } from '../state/sim.svelte';
  import { subnetSummary } from '../subnet';

  /**
   * Grundeinstellungen der Internet-Box (CPE): WAN-Adresse mit Gateway des
   * Providers und LAN-Adresse. Speichert beim Verlassen eines Feldes.
   * DHCP-Bereich, NAT, Routen und Zugangstechnik stehen unter «Erweitert …».
   */
  let { device }: { device: Device } = $props();

  const gatewayOf = (d: Device) => d.routes?.find((r) => parseMask(r.mask) === 0)?.gateway ?? '';
  let wan = $state({ ip: '', mask: '', gateway: '' });
  let lan = $state({ ip: '', mask: '' });
  let error = $state<{ part: 'wan' | 'lan'; field?: string; text: string } | null>(null);

  /** Masken kurz als Präfix zeigen (/30), gespeichert werden sie in Punktschreibweise. */
  const short = (mask?: string) => (mask && parseMask(mask) !== null ? `/${parseMask(mask)}` : (mask ?? ''));
  const sameMask = (a: string, b?: string) => (a.trim() ? parseMask(a) : null) === (b ? parseMask(b) : null);

  $effect(() => {
    wan = { ip: device.interfaces[CPE_WAN]?.ip ?? '', mask: short(device.interfaces[CPE_WAN]?.mask), gateway: gatewayOf(device) };
    lan = { ip: device.interfaces[CPE_LAN]?.ip ?? '', mask: short(device.interfaces[CPE_LAN]?.mask) };
    error = null;
  });

  const fail = (part: 'wan' | 'lan', quiet: boolean, failure: { code: string; field?: string; params?: Record<string, string | number> }) => {
    if (!quiet) error = { part, field: failure.field, text: t(`error.${failure.code}`, failure.params) };
    return false;
  };

  function saveWan(quiet: boolean): boolean {
    const saved = device.interfaces[CPE_WAN];
    if (wan.ip.trim() !== (saved?.ip ?? '') || !sameMask(wan.mask, saved?.mask)) {
      const failure = editor.setInterfaceAddress(device.id, CPE_WAN, wan.ip, wan.mask);
      if (failure) return fail('wan', quiet, failure);
    }
    if (wan.gateway.trim() !== gatewayOf(device)) {
      const failure = editor.setDefaultGateway(device.id, wan.gateway);
      if (failure) return fail('wan', quiet, { ...failure, field: 'gateway' });
    }
    if (error?.part === 'wan') error = null;
    return true;
  }

  function saveLan(quiet: boolean): boolean {
    const saved = device.interfaces[CPE_LAN];
    if (lan.ip.trim() === (saved?.ip ?? '') && sameMask(lan.mask, saved?.mask)) return true;
    const failure = editor.setInterfaceAddress(device.id, CPE_LAN, lan.ip, lan.mask);
    if (failure) return fail('lan', quiet, failure);
    if (error?.part === 'lan') error = null;
    return true;
  }

  const live = $derived((simStore.tick, editor.acting ? simStore.sim?.getDeviceState(device.id) : undefined));
  const kind = $derived(device.modem?.kind);
  const dhcp = $derived(device.dhcpServer);
  const invalid = (part: 'wan' | 'lan', field: string) => error?.part === part && error.field === field;
</script>

<h3>{t('cpe.title')}</h3>
<p class="access">
  <span class="muted">{t('cpe.access')}:</span>
  {kind ? `${t(`modem.kind.${kind}`)} · ${ACCESS_PROFILES[kind].downstream}/${ACCESS_PROFILES[kind].upstream} Mbit/s` : t('cpe.ethernet')}
  {#if live?.modem}<span class="phase phase-{live.modem.phase}">{t(`modem.phase.${live.modem.phase}`)}</span>{/if}
</p>

<form class="block" use:autosave={saveWan} onsubmit={(e) => (e.preventDefault(), saveWan(false))}>
  <span class="label">WAN</span>
  <div class="pair">
    <input bind:value={wan.ip} placeholder="203.0.113.2" disabled={!editor.editable} aria-label={t('cpe.wanIp')} aria-invalid={invalid('wan', 'ip')} autocomplete="off" spellcheck="false" />
    <input class="mask" bind:value={wan.mask} placeholder="/30" disabled={!editor.editable} aria-label={t('config.mask')} aria-invalid={invalid('wan', 'mask')} autocomplete="off" spellcheck="false" />
  </div>
  <label class="gw">
    <span class="muted">{t('cpe.gateway')}</span>
    <input bind:value={wan.gateway} placeholder="203.0.113.1" disabled={!editor.editable} aria-invalid={invalid('wan', 'gateway')} autocomplete="off" spellcheck="false" />
  </label>
</form>
{#if error?.part === 'wan'}<p class="error" role="alert">{error.text}</p>{/if}

<form class="block" use:autosave={saveLan} onsubmit={(e) => (e.preventDefault(), saveLan(false))}>
  <span class="label">LAN</span>
  <div class="pair">
    <input bind:value={lan.ip} placeholder="192.168.1.1" disabled={!editor.editable} aria-label={t('cpe.lanIp')} aria-invalid={invalid('lan', 'ip')} autocomplete="off" spellcheck="false" />
    <input class="mask" bind:value={lan.mask} placeholder="/24" disabled={!editor.editable} aria-label={t('config.mask')} aria-invalid={invalid('lan', 'mask')} autocomplete="off" spellcheck="false" />
  </div>
</form>
{#if error?.part === 'lan'}<p class="error" role="alert">{error.text}</p>{/if}
{#if device.interfaces[CPE_LAN]?.ip}
  <p class="muted small">{subnetSummary(device.interfaces[CPE_LAN].ip, device.interfaces[CPE_LAN].mask)}</p>
  {#if duplicates.has(device.id, device.interfaces[CPE_LAN].ip)}<p class="error small">❗ {t('canvas.duplicateIp', { ip: device.interfaces[CPE_LAN].ip })}</p>{/if}
{/if}

<p class="dhcp">
  <span class="muted">DHCP:</span>
  {dhcp ? t('cpe.dhcpRange', { start: dhcp.start, end: dhcp.end }) : t('cpe.dhcpOff')}
  {#if live?.dhcpLeases}<span class="muted"> · {t('cpe.leases', { n: live.dhcpLeases.length })}</span>{/if}
  <button type="button" class="link" onclick={() => dialogs.showDevice(device.id, 'dhcp')}>{t('cpe.edit')}</button>
</p>

<style>
  h3 {
    margin: 12px 0 6px;
    font-size: 0.85rem;
  }
  .access,
  .dhcp {
    margin: 4px 0 8px;
    font-size: 0.8rem;
  }
  .phase {
    margin-left: 6px;
    padding: 0 6px;
    border-radius: 999px;
    font-size: 0.72rem;
    background: var(--surface-2);
  }
  .phase-online {
    background: color-mix(in srgb, #16a34a 18%, transparent);
    color: #15803d;
  }
  .phase-connecting {
    background: color-mix(in srgb, #f97316 18%, transparent);
  }
  .block {
    display: grid;
    grid-template-columns: 2.6rem minmax(0, 1fr);
    gap: 4px 6px;
    align-items: center;
    margin-top: 6px;
  }
  .label {
    font-size: 0.8rem;
    font-weight: 600;
  }
  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 4.2rem;
    gap: 4px;
  }
  .gw {
    grid-column: 2;
    display: grid;
    gap: 2px;
    font-size: 0.75rem;
  }
  input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 0.8rem;
    padding: 4px 6px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  input[aria-invalid='true'] {
    border-color: var(--danger);
  }
  .muted {
    color: var(--muted);
  }
  .small {
    margin: 4px 0 0 2.9rem;
    font-size: 0.75rem;
  }
  .error {
    margin: 4px 0;
    font-size: 0.8rem;
    color: var(--danger);
  }
  .link {
    border: none;
    background: none;
    padding: 0 0 0 6px;
    color: var(--accent);
    text-decoration: underline;
    font-size: inherit;
  }
</style>
