<script lang="ts">
  import { getDevice } from '../../core';
  import { t } from '../../i18n';
  import { closeDesktop, desktops, minimizeDesktop, type DesktopWindow } from '../state/desktop.svelte';
  import { editor } from '../state/editor.svelte';
  import AddressView from './AddressView.svelte';
  import Browser from './Browser.svelte';
  import { simStore } from '../state/sim.svelte';
  import DhcpServerView from './DhcpServerView.svelte';
  import MailApp from './MailApp.svelte';
  import ServiceLog from './ServiceLog.svelte';
  import Terminal from './Terminal.svelte';

  /** Simulierter Desktop eines Endgeräts mit seinen Anwendungen (ein Fenster). */
  let { win, index }: { win: DesktopWindow; index: number } = $props();
  const device = $derived(getDevice(editor.topology, win.deviceId));
  const active = $derived(desktops.active === win.deviceId);
  const apps = $derived([
    'terminal',
    'browser',
    'mail',
    'network',
    ...(device?.dhcpServer ? ['dhcpServer'] : []),
    ...(device?.dnsServer ? ['dnsServer'] : []),
    ...(device?.webServer ? ['webServer'] : []),
    ...(device?.mailServer ? ['mailServer'] : []),
  ]);
  const mailboxSummary = $derived(
    ((simStore.tick, simStore.sim?.getDeviceState(win.deviceId).mailboxes) || []).map((m) =>
      t('mailServer.boxSummary', { address: `${m.user}@${device?.mailServer?.domain ?? ''}`, count: m.count }),
    ),
  );
  const dnsSummary = $derived((device?.dnsServer?.records ?? []).map((r) => `${r.name}  ${r.type}  ${r.value}  (TTL ${r.ttl} s)`));

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      minimizeDesktop(win.deviceId);
    }
  }
</script>

{#if device}
  <div
    class="desktop"
    class:active
    hidden={win.minimized}
    style:--offset="{(index % 5) * 26}px"
    role="dialog"
    aria-labelledby="desktop-title-{win.deviceId}"
    tabindex="-1"
    {onkeydown}
    onpointerdown={() => (desktops.active = win.deviceId)}
    onfocusin={() => (desktops.active = win.deviceId)}
  >
    <header>
      <h2 id="desktop-title-{win.deviceId}">{t('desktop.title', { name: device.name })}</h2>
      <span class="buttons">
        <button class="win" onclick={() => minimizeDesktop(win.deviceId)} aria-label={t('desktop.minimize')} title={t('desktop.minimize')}>—</button>
        <button class="win" onclick={() => closeDesktop(win.deviceId)} aria-label={t('desktop.close')} title={t('desktop.close')}>✕</button>
      </span>
    </header>
    <div class="apps" role="tablist">
      {#each apps as app (app)}
        <button role="tab" aria-selected={win.app === app} onclick={() => (win.app = app)}>
          {t(`desktop.app.${app}`)}
        </button>
      {/each}
    </div>
    <div class="content" role="tabpanel">
      {#if win.app === 'network'}
        <div class="padded"><AddressView {device} /></div>
      {:else if win.app === 'browser'}
        <Browser {device} />
      {:else if win.app === 'dhcpServer'}
        <DhcpServerView {device} />
      {:else if win.app === 'dnsServer'}
        <ServiceLog {device} prefix="dnsServer." summary={dnsSummary.length ? dnsSummary : [t('dnsServer.noRecords')]} />
      {:else if win.app === 'mail'}
        <MailApp {device} />
      {:else if win.app === 'mailServer'}
        <ServiceLog {device} prefix={['smtp.', 'pop3.', 'imap.']} summary={mailboxSummary.length ? mailboxSummary : [t('mailServer.noMailboxes')]} />
      {:else if win.app === 'webServer'}
        <ServiceLog {device} prefix="http." summary={(device.webServer?.files ?? []).map((f) => f.path)} />
      {:else}
        <Terminal {device} />
      {/if}
    </div>
  </div>
{/if}

<style>
  .desktop {
    position: absolute;
    top: calc(52px + var(--offset));
    right: calc(16px + var(--offset));
    width: min(620px, calc(100% - 32px));
    height: min(420px, calc(100% - 72px));
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.25);
    overflow: hidden;
    z-index: 5;
  }
  .desktop[hidden] {
    display: none;
  }
  .desktop.active {
    z-index: 6;
    box-shadow: 0 14px 38px rgba(15, 23, 42, 0.35);
  }
  .desktop:not(.active) header {
    filter: saturate(0.4) brightness(1.05);
  }
  .buttons {
    display: flex;
    gap: 2px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px 6px 12px;
    background: var(--accent);
    color: var(--on-accent);
  }
  h2 {
    margin: 0;
    font-size: 0.9rem;
  }
  .win {
    padding: 2px 8px;
    color: inherit;
    background: transparent;
    border-color: transparent;
  }
  .win:hover {
    background: rgba(255, 255, 255, 0.15) !important;
  }
  .apps {
    display: flex;
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
  }
  .apps button {
    font-size: 0.8rem;
    padding: 3px 10px;
  }
  .apps button[aria-selected='true'] {
    background: var(--selected-soft);
    border-color: var(--accent);
  }
  .content {
    flex: 1;
    min-height: 0;
  }
  .padded {
    padding: 12px;
  }
</style>
