<script lang="ts">
  import { DEVICE_SPECS, isRouterType, isSwitchType } from '../../core';
  import { t } from '../../i18n';
  import { dialogs } from '../state/dialogs.svelte';
  import { editor } from '../state/editor.svelte';
  import AreaForm from './AreaForm.svelte';
  import CpeConfig from './CpeConfig.svelte';
  import CableInspector from './CableInspector.svelte';
  import DeviceBasics from './DeviceBasics.svelte';
  import GroupConfig from './GroupConfig.svelte';
  import HostConfigForm from './HostConfigForm.svelte';
  import HostPanel from './HostPanel.svelte';
  import Icon from './Icon.svelte';
  import ModemConfig from './ModemConfig.svelte';
  import NetDevicePanel from './NetDevicePanel.svelte';
  import PortPanel from './PortPanel.svelte';
  import RouterConfig from './RouterConfig.svelte';
  import SviConfig from './SviConfig.svelte';
  import WlanConfig from './WlanConfig.svelte';

  /**
   * Eigenschaften der Auswahl. Rechts stehen nur die Grundeinstellungen
   * (Name, Adressen, SSID …); alles Weitere öffnet «Erweitert …» in einem
   * eigenen Fenster mit Reitern (DeviceDialog). In der Simulation zeigt der
   * Inspektor den Live-Zustand des Geräts.
   */
  const device = $derived(editor.selectedDevice);
  const cable = $derived(editor.selectedCable);
  const area = $derived(editor.selectedArea);
  const spec = $derived(device ? DEVICE_SPECS[device.type] : undefined);
</script>

<aside class="inspector" aria-labelledby="inspector-title">
  <div class="head">
    <h2 id="inspector-title">{t('inspector.title')}</h2>
    <button class="help" onclick={() => dialogs.showHelp(device ? `device.${device.type}` : cable ? 'cables' : area ? 'areas' : editor.selection?.kind === 'group' ? 'selection' : 'overview')} title={t('help.contextHint')} aria-label={t('menu.help.help')}><Icon name="help" size={16} /></button>
  </div>

  {#if device && spec}
    <DeviceBasics {device} />

    {#if spec.role === 'endpoint'}
      {#if editor.acting}
        <HostPanel {device} />
      {:else if device.type === 'clientgroup'}
        <GroupConfig {device} />
      {:else}
        <HostConfigForm {device} />
      {/if}
    {:else if device.type === 'modem'}
      <ModemConfig {device} />
    {:else if device.type === 'cpe'}
      <CpeConfig {device} />
    {:else if editor.acting}
      <NetDevicePanel {device} />
    {:else if isRouterType(device.type)}
      <RouterConfig {device} part="interfaces" compact />
    {:else if device.type === 'l3switch'}
      <SviConfig {device} />
    {:else if device.type === 'accesspoint'}
      <WlanConfig {device} />
    {/if}

    {#if isSwitchType(device.type) || device.type === 'router'}
      <h3>{t('panel.title')}</h3>
      <PortPanel {device} />
    {/if}

    <button class="advanced" onclick={() => dialogs.showDevice(device.id)} title="{t('inspector.advancedHint')} (E)">
      <Icon name="gear" size={16} /> {t('inspector.advanced')}
    </button>

    {#if editor.editable}
      <div class="actions">
        <button onclick={() => editor.duplicateSelection()} title={t('menu.edit.duplicate')}><Icon name="copy" size={15} /> {t('menu.edit.duplicate')}</button>
        <button class="danger" onclick={() => editor.deleteSelection()}><Icon name="trash" size={15} /> {t('inspector.delete')}</button>
      </div>
    {/if}
  {:else if cable}
    <CableInspector {cable} />
  {:else if area}
    <AreaForm {area} />
  {:else if editor.selection?.kind === 'group'}
    {@const group = editor.selection}
    <div class="group">
      <p><strong>{t('selection.summary', { devices: group.devices.length, areas: group.areas.length })}</strong></p>
      <ul class="names">
        {#each editor.topology.devices.filter((d) => group.devices.includes(d.id)) as d (d.id)}<li>{d.name}</li>{/each}
        {#each (editor.topology.areas ?? []).filter((a) => group.areas.includes(a.id)) as a (a.id)}<li class="muted">▢ {a.title}</li>{/each}
      </ul>
      <p class="muted hint">{t('selection.hint')}</p>
      {#if editor.editable}
        <div class="actions">
          <button onclick={() => editor.copySelection()} title="{t('key.ctrl')}+C"><Icon name="copy" size={15} /> {t('menu.edit.copy')}</button>
          <button onclick={() => editor.duplicateSelection()} title="{t('key.ctrl')}+D">{t('menu.edit.duplicate')}</button>
          <button class="danger" onclick={() => editor.deleteSelection()}><Icon name="trash" size={15} /> {t('inspector.delete')}</button>
        </div>
      {/if}
    </div>
  {:else}
    <div class="empty">
      <p class="muted">{t('inspector.nothing')}</p>
      <ol class="steps">
        <li>{t('inspector.step1')}</li>
        <li>{t('inspector.step2')}</li>
        <li>{t('inspector.step3')}</li>
        <li>{t('inspector.step4')}</li>
      </ol>
      <button class="link" onclick={() => dialogs.show('shortcuts')}>{t('menu.help.shortcuts')}</button>
      <button class="link" onclick={() => dialogs.showHelp('overview')}>{t('menu.help.guide')}</button>
    </div>
  {/if}
</aside>

<style>
  .inspector {
    padding: 12px;
    overflow-y: auto;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .head .help {
    border: none;
    background: none;
    color: var(--muted);
    padding: 2px;
  }
  .advanced {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-top: 14px;
    padding: 8px;
    font-weight: 600;
    color: var(--accent);
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  }
  .advanced:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  }
  .group p {
    margin: 10px 0 6px;
  }
  .names {
    margin: 0;
    padding-left: 18px;
    max-height: 220px;
    overflow-y: auto;
    font-size: 0.85rem;
  }
  .hint {
    font-size: 0.8rem;
  }
  .actions {
    flex-wrap: wrap;
    display: flex;
    gap: 6px;
    margin-top: 12px;
  }
  .actions button {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .empty .steps {
    margin: 8px 0 12px;
    padding-left: 1.2em;
    font-size: 0.85rem;
    line-height: 1.6;
  }
  .link {
    display: block;
    border: none;
    background: none;
    padding: 2px 0;
    color: var(--accent);
    text-decoration: underline;
    font-size: 0.82rem;
  }
  h2 {
    margin: 0 0 12px;
    font-size: 0.95rem;
  }
  h3 {
    margin: 16px 0 6px;
    font-size: 0.85rem;
  }
  .muted {
    color: var(--muted);
  }
  .danger {
    color: var(--danger);
    border-color: var(--danger);
  }
</style>
