<script lang="ts">
  import { DEVICE_SPECS, canHostServices, canUseWifi, getDevice, hasRoutingTable, isRouterType, isSwitchType } from '../../core';
  import { t } from '../../i18n';
  import { typeLabel } from '../labels';
  import { dialogs } from '../state/dialogs.svelte';
  import { editor } from '../state/editor.svelte';
  import { ui } from '../state/ui.svelte';
  import CpeConfig from './CpeConfig.svelte';
  import DeviceBasics from './DeviceBasics.svelte';
  import DhcpServerForm from './DhcpServerForm.svelte';
  import DeviceIcon from './DeviceIcon.svelte';
  import GroupConfig from './GroupConfig.svelte';
  import HostConfigForm from './HostConfigForm.svelte';
  import HostPanel from './HostPanel.svelte';
  import Icon from './Icon.svelte';
  import MailAccountForm from './MailAccountForm.svelte';
  import ModemConfig from './ModemConfig.svelte';
  import NetDevicePanel from './NetDevicePanel.svelte';
  import PortPanel from './PortPanel.svelte';
  import PortTable from './PortTable.svelte';
  import RouterConfig from './RouterConfig.svelte';
  import RoutingEditor from './RoutingEditor.svelte';
  import RoutingProtocols from './RoutingProtocols.svelte';
  import Services from './Services.svelte';
  import SviConfig from './SviConfig.svelte';
  import SwitchConfig from './SwitchConfig.svelte';
  import WifiClientForm from './WifiClientForm.svelte';
  import WlanConfig from './WlanConfig.svelte';

  /**
   * Erweiterte Einstellungen eines Geräts: alle Parameter sauber nach Reitern
   * geordnet. Mit ◀ ▶ (oder Bild↑/Bild↓, Alt+←/→) direkt zum vorherigen bzw.
   * nächsten Gerät wechseln; der gewählte Reiter bleibt, wenn es ihn dort gibt.
   */
  let dialog: HTMLDialogElement;

  const device = $derived(dialogs.device ? getDevice(editor.topology, dialogs.device.id) : undefined);

  /** Geräte in der Reihenfolge für ◀ ▶: auf dem angezeigten Stockwerk, nach Namen sortiert. */
  const order = $derived(
    editor.topology.devices
      .filter((d) => ui.floor === 'all' || (d.floor ?? 0) === ui.floor || d.id === device?.id)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
  );
  const position = $derived(device ? order.findIndex((d) => d.id === device.id) : -1);

  type TabId = 'general' | 'addresses' | 'ports' | 'routing' | 'nat' | 'relay' | 'dhcp' | 'switching' | 'wlan' | 'mail' | 'services' | 'modem' | 'group' | 'state';

  const tabs = $derived.by((): TabId[] => {
    if (!device) return [];
    const d = device;
    const role = DEVICE_SPECS[d.type].role;
    const list: TabId[] = ['general'];
    if (editor.acting) list.push('state');
    if (role === 'endpoint' && d.type !== 'clientgroup') list.push('addresses');
    if (d.type === 'clientgroup') list.push('group');
    if (isRouterType(d.type) || d.type === 'l3switch' || d.type === 'cpe') list.push('addresses');
    list.push('ports');
    if (hasRoutingTable(d.type) && role !== 'endpoint') list.push('routing');
    if (d.type === 'cpe') list.push('dhcp');
    if (((d.type === 'router' || d.type === 'cpe') && ui.has('net.nat')) || (d.type === 'internet' && ui.has('net.cgnat'))) list.push('nat');
    if (d.type === 'router' && ui.has('net.dhcpRelay')) list.push('relay');
    if (isSwitchType(d.type)) list.push('switching');
    if (d.type === 'accesspoint' || (role === 'endpoint' && canUseWifi(d) && ui.has('medium.wireless'))) list.push('wlan');
    if (role === 'endpoint' && ui.has('service.mail') && d.type !== 'clientgroup') list.push('mail');
    if (canHostServices(d.type)) list.push('services');
    if (d.type === 'modem' || d.type === 'cpe') list.push('modem');
    return list;
  });

  const tab = $derived.by((): TabId => {
    const wanted = dialogs.device?.tab as TabId | undefined;
    return wanted && tabs.includes(wanted) ? wanted : (tabs[0] ?? 'general');
  });

  const HELP: Partial<Record<TabId, string>> = { routing: 'routing', nat: 'nat', relay: 'dhcp', dhcp: 'dhcp', wlan: 'wlan', mail: 'mail', switching: 'vlan', services: 'dhcp' };

  $effect(() => {
    if (dialogs.device && !dialog.open) dialog.showModal();
  });

  // Gerät gelöscht oder Projekt gewechselt: schliessen.
  $effect(() => {
    if (dialogs.device && !device) dialogs.closeDevice();
  });

  /** Offene Eingabe zuerst speichern (Formulare speichern beim Verlassen des Feldes). */
  function commitInput() {
    const active = document.activeElement;
    if (active instanceof HTMLElement && dialog.contains(active) && active.matches('input, textarea, select')) active.blur();
  }

  function select(id: TabId) {
    commitInput();
    if (dialogs.device) dialogs.device = { ...dialogs.device, tab: id };
  }

  /** Zum vorherigen (-1) oder nächsten (+1) Gerät. */
  function step(delta: number) {
    if (order.length < 2 || position < 0) return;
    const next = order[(position + delta + order.length) % order.length]!;
    commitInput();
    dialogs.showDevice(next.id, tab);
    editor.select({ kind: 'device', id: next.id });
  }

  function onkeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    const typing = !!target.closest('input, textarea, select, [contenteditable]');
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      step(event.key === 'PageUp' ? -1 : 1);
    } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && (event.altKey || (!typing && !target.closest('[role="tablist"]')))) {
      event.preventDefault();
      step(event.key === 'ArrowLeft' ? -1 : 1);
    }
  }

  /** Reiterleiste: Pfeiltasten wechseln den Reiter (WAI-ARIA Tabs). */
  function onTabKey(event: KeyboardEvent) {
    if (event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    event.stopPropagation();
    const i = tabs.indexOf(tab);
    const next = tabs[(i + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + tabs.length) % tabs.length]!;
    select(next);
    queueMicrotask(() => (document.getElementById(`devtab-${next}`) as HTMLElement | null)?.focus());
  }
</script>

<dialog bind:this={dialog} class="device-dialog" aria-labelledby="device-dialog-title" onclose={() => dialogs.closeDevice()} oncancel={commitInput} {onkeydown}>
  {#if device}
    <header>
      <button class="nav" onclick={() => step(-1)} disabled={order.length < 2} aria-label={t('deviceDialog.prev')} title="{t('deviceDialog.prev')} (Bild↑)">◀</button>
      <svg class="icon role-{DEVICE_SPECS[device.type].role}" viewBox="-30 -25 60 50" aria-hidden="true"><DeviceIcon type={device.type} variant={device.variant} /></svg>
      <div class="title">
        <h2 id="device-dialog-title">{device.name}</h2>
        <span class="muted">{typeLabel(device.type)} · {t('deviceDialog.position', { n: position + 1, total: order.length })}</span>
      </div>
      <button class="nav" onclick={() => step(1)} disabled={order.length < 2} aria-label={t('deviceDialog.next')} title="{t('deviceDialog.next')} (Bild↓)">▶</button>
      <span class="spacer"></span>
      {#if HELP[tab]}
        <button class="ghost" onclick={() => (dialog.close(), dialogs.showHelp(HELP[tab]))} title={t('help.contextHint')} aria-label={t('menu.help.help')}><Icon name="help" size={16} /></button>
      {/if}
      <button class="ghost close" onclick={() => dialog.close()} aria-label={t('about.close')}>✕</button>
    </header>

    <div class="tabs" role="tablist" aria-label={t('deviceDialog.tabs')} tabindex="-1" onkeydown={onTabKey}>
      {#each tabs as id (id)}
        <button id="devtab-{id}" role="tab" aria-selected={tab === id} aria-controls="devpanel" tabindex={tab === id ? 0 : -1} onclick={() => select(id)}>
          {t(`deviceDialog.tab.${id}`)}
        </button>
      {/each}
    </div>

    <div id="devpanel" class="panel" role="tabpanel" aria-labelledby="devtab-{tab}">
      {#key device.id + tab}
        {#if tab === 'general'}
          <div class="cols">
            <div><DeviceBasics {device} full /></div>
            {#if editor.editable}
              <div class="actions">
                <button onclick={() => editor.duplicateSelection()} disabled={editor.selection?.kind !== 'device' || editor.selection.id !== device.id}><Icon name="copy" size={15} /> {t('menu.edit.duplicate')}</button>
                <button class="danger" onclick={() => (editor.select({ kind: 'device', id: device.id }), editor.deleteSelection())}><Icon name="trash" size={15} /> {t('inspector.delete')}</button>
              </div>
            {/if}
          </div>
        {:else if tab === 'state'}
          {#if DEVICE_SPECS[device.type].role === 'endpoint'}<HostPanel {device} />{:else}<NetDevicePanel {device} />{/if}
        {:else if tab === 'addresses'}
          {#if DEVICE_SPECS[device.type].role === 'endpoint'}
            <HostConfigForm {device} />
          {:else if device.type === 'l3switch'}
            <SviConfig {device} />
          {:else if device.type === 'cpe'}
            <CpeConfig {device} />
          {:else}
            <RouterConfig {device} part="interfaces" />
          {/if}
        {:else if tab === 'group'}
          <GroupConfig {device} />
        {:else if tab === 'ports'}
          {#if isSwitchType(device.type) || device.type === 'router'}
            <h3>{t('panel.title')}</h3>
            <PortPanel {device} />
          {/if}
          <h3>{t('inspector.interfaces')}</h3>
          <PortTable {device} />
        {:else if tab === 'routing'}
          <h3 data-help="routing">{editor.acting ? t('routing.title') : t('deviceDialog.routingTitle')}</h3>
          <RoutingEditor {device} />
          <RoutingProtocols {device} />
        {:else if tab === 'nat'}
          <RouterConfig {device} part="nat" />
        {:else if tab === 'dhcp'}
          <h3>{t('services.dhcp')}</h3>
          <DhcpServerForm {device} />
        {:else if tab === 'relay'}
          <RouterConfig {device} part="relay" />
        {:else if tab === 'switching'}
          <SwitchConfig {device} />
        {:else if tab === 'wlan'}
          {#if device.type === 'accesspoint'}<WlanConfig {device} />{:else}<h3>{t('wifi.title')}</h3><WifiClientForm {device} />{/if}
        {:else if tab === 'mail'}
          <h3>{t('mailAccount.title')}</h3>
          <MailAccountForm {device} />
        {:else if tab === 'services'}
          <Services {device} />
        {:else if tab === 'modem'}
          <ModemConfig {device} />
        {/if}
      {/key}
    </div>
    <footer class="muted">{t('deviceDialog.footer')}</footer>
  {/if}
</dialog>

<style>
  dialog {
    width: min(900px, calc(100vw - 32px));
    height: min(680px, calc(100vh - 48px));
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
    flex-direction: column;
    overflow: hidden;
  }
  dialog[open] {
    display: flex;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.35);
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
  }
  .icon {
    width: 40px;
    height: 34px;
    flex: none;
  }
  .title h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .title .muted {
    font-size: 0.78rem;
  }
  .nav {
    width: 34px;
    height: 34px;
    padding: 0;
    font-size: 0.9rem;
    border-radius: 50%;
  }
  .spacer {
    flex: 1;
  }
  .ghost {
    border-color: transparent;
    background: transparent;
    color: var(--muted);
  }
  .close {
    font-size: 1rem;
  }
  .tabs {
    display: flex;
    gap: 2px;
    padding: 0 10px;
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    flex: none;
  }
  .tabs button {
    border: none;
    border-bottom: 3px solid transparent;
    border-radius: 0;
    background: none;
    padding: 9px 12px 7px;
    font-size: 0.85rem;
    white-space: nowrap;
    color: var(--muted);
  }
  .tabs button[aria-selected='true'] {
    color: var(--text);
    font-weight: 600;
    border-bottom-color: var(--accent);
  }
  .tabs button:hover {
    color: var(--text);
    background: var(--hover);
  }
  .panel {
    flex: 1;
    overflow-y: auto;
    padding: 6px 20px 16px;
  }
  .panel :global(h3) {
    margin: 14px 0 8px;
    font-size: 0.92rem;
  }
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 24px;
    align-items: start;
    padding-top: 12px;
    max-width: 640px;
  }
  .actions {
    display: grid;
    gap: 6px;
  }
  .actions button {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .danger {
    color: var(--danger);
    border-color: var(--danger);
  }
  footer {
    padding: 6px 14px;
    border-top: 1px solid var(--border);
    font-size: 0.75rem;
    flex: none;
  }
  .muted {
    color: var(--muted);
  }
  @media (max-width: 640px) {
    .cols {
      grid-template-columns: 1fr;
    }
  }
</style>
