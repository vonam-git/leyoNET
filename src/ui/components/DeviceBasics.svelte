<script lang="ts">
  import { DEVICE_SPECS, MAX_NAME_LENGTH, convert, copperPorts, devicePrice, floorsOf, hasCli, isRackable, type Device } from '../../core';
  import { t } from '../../i18n';
  import { roleLabel, typeLabel } from '../labels';
  import { openCli } from '../state/cli.svelte';
  import { editor } from '../state/editor.svelte';
  import { ui } from '../state/ui.svelte';

  /**
   * Grunddaten eines Geräts: Name, Typ, Preis, Stockwerk, Rack, Anzahl
   * Anschlüsse und Befehlszeile. Rechts im Inspektor und im Reiter «Allgemein».
   * `full`: auch Anzahl Anschlüsse (sonst nur im erweiterten Dialog).
   */
  let { device, full = false }: { device: Device; full?: boolean } = $props();

  const spec = $derived(DEVICE_SPECS[device.type]);
  const floors = $derived(floorsOf(editor.topology));
  const copper = $derived(copperPorts(device).length);
  const racks = $derived((editor.topology.areas ?? []).filter((a) => a.kind === 'rack'));
  const money = (chf: number) => `${ui.currency} ${new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 }).format(convert(chf, ui.currency))}`;
  const id = `name-${Math.random().toString(36).slice(2, 7)}`;

  let nameDraft = $state('');
  $effect(() => {
    nameDraft = device.name;
  });

  function commitName() {
    if (!editor.rename(device.id, nameDraft)) nameDraft = device.name;
  }

  function onNameKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') {
      event.stopPropagation();
      nameDraft = device.name;
      event.currentTarget.blur();
    }
  }
</script>

<label class="field">
  <span>{t('inspector.name')}</span>
  <input id={full ? id : 'inspector-name'} type="text" maxlength={MAX_NAME_LENGTH} bind:value={nameDraft} disabled={!editor.editable} onchange={commitName} onkeydown={onNameKeydown} />
</label>
<dl class="facts">
  <dt>{t('inspector.type')}</dt>
  <dd>{typeLabel(device.type)}{device.variant === 'rack' ? ` (${t('shop.serverRack')})` : ''}</dd>
  <dt>{t('inspector.role')}</dt>
  <dd>{roleLabel(device.type)}</dd>
  {#if ui.showPrices && devicePrice(device) > 0}
    <dt>{t('costs.price')}</dt>
    <dd>{money(devicePrice(device))}</dd>
  {/if}
</dl>

{#if floors.length > 1 && ui.has('tool.floors')}
  <label class="field">
    <span>{t('floor.label')}</span>
    <select value={device.floor ?? 0} disabled={!editor.editable} onchange={(e) => editor.setDeviceFloor(device.id, Number(e.currentTarget.value))}>
      {#each floors as f, i (i)}<option value={i}>{f.name}</option>{/each}
    </select>
  </label>
{/if}

{#if isRackable(device.type) && racks.length > 0 && ui.has('tool.racks')}
  <label class="field">
    <span>{t('rack.mount')}</span>
    <select value={device.rack ?? ''} disabled={!editor.editable} onchange={(e) => editor.setDeviceRack(device.id, e.currentTarget.value || null)}>
      <option value="">{t('rack.notMounted')}</option>
      {#each racks as r (r.id)}<option value={r.id}>{r.title}</option>{/each}
    </select>
  </label>
{/if}

{#if full && spec.minInterfaces !== spec.maxInterfaces && editor.editable}
  <div class="field">
    <span id="{id}-ports">{t('inspector.portCount')}</span>
    <div class="stepper" role="group" aria-labelledby="{id}-ports">
      <button aria-label={t('inspector.portLess')} disabled={copper <= spec.minInterfaces} onclick={() => editor.setInterfaceCount(device.id, copper - 1)}>−</button>
      <output aria-live="polite">{copper}</output>
      <button aria-label={t('inspector.portMore')} disabled={copper >= spec.maxInterfaces} onclick={() => editor.setInterfaceCount(device.id, copper + 1)}>+</button>
    </div>
  </div>
{/if}

{#if hasCli(device.type) && ui.has('net.cli')}
  <button class="cli" onclick={() => openCli(device.id)} title={t('cli.openHint')}>›_ {t('cli.open')}</button>
{/if}

<style>
  .field {
    display: grid;
    gap: 4px;
    margin-bottom: 12px;
    font-size: 0.85rem;
  }
  input,
  select {
    font: inherit;
    font-size: 0.95rem;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
  }
  select {
    font-size: 0.85rem;
    padding: 4px 6px;
  }
  .facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    margin: 0 0 12px;
    font-size: 0.85rem;
  }
  .facts dt {
    color: var(--muted);
  }
  .facts dd {
    margin: 0;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .stepper button {
    width: 32px;
  }
  .stepper output {
    min-width: 2ch;
    text-align: center;
    font-weight: 600;
  }
  .cli {
    width: 100%;
    margin-bottom: 8px;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    background: var(--console-bg);
    color: var(--console-text);
    border-color: var(--console-bg);
  }
  .cli:hover:not(:disabled) {
    background: #2b3440;
  }
</style>
