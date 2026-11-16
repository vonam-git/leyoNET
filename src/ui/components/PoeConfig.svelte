<script lang="ts">
  import {
    MAX_POE_BUDGET,
    POE_CLASS_PD_WATTS,
    POE_CLASS_PSE_WATTS,
    POE_STANDARDS,
    POE_STANDARD_IDS,
    canBePowered,
    canSupplyPoe,
    defaultPoeClass,
    getDevice,
    needsPoe,
    poeReport,
    setPoe,
    setPoeClass,
    setPortPoe,
    setPowerSource,
    type Device,
    type PoeStandard,
  } from '../../core';
  import { t } from '../../i18n';
  import { interfaceLabel } from '../labels';
  import { editor } from '../state/editor.svelte';

  /**
   * Power over Ethernet (IEEE 802.3, Klausel 33 und 145): beim Switch Typ, Budget und Ports,
   * beim gespeisten Gerät Stromversorgung und Klasse. Werte gelten sofort (wie autosave).
   */
  let { device }: { device: Device } = $props();

  const report = $derived(poeReport(editor.topology));
  const supply = $derived(report.supplies.get(device.id));
  const own = $derived(report.devices.get(device.id));
  const nameOf = (id: string) => getDevice(editor.topology, id)?.name ?? id;
  const pct = $derived(supply ? Math.min(100, Math.round((supply.used / supply.budget) * 100)) : 0);

  let budget = $state('');
  $effect(() => {
    budget = device.poe ? String(device.poe.budget) : '';
  });

  function setStandard(value: string) {
    if (value === '') return editor.apply(setPoe(editor.topology, device.id, null));
    const standard = value as PoeStandard;
    // Vorschlag: so viel Budget, dass jeder Port seine höchste Klasse bekäme, gedeckelt wie bei üblichen Geräten.
    const ports = device.interfaces.filter((i) => !i.serial && !i.sfpSlot).length;
    const proposed = device.poe?.budget ?? Math.min(ports * POE_CLASS_PSE_WATTS[POE_STANDARDS[standard].maxClass], standard === 'af' || standard === 'at' ? 370 : 1440);
    editor.apply(setPoe(editor.topology, device.id, { standard, budget: proposed }));
  }

  function saveBudget() {
    if (!device.poe) return;
    const value = Number(budget.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0 || value > MAX_POE_BUDGET) {
      budget = String(device.poe.budget);
      return editor.notify(t('error.invalidPoeBudget', { value: budget }), 'error');
    }
    editor.apply(setPoe(editor.topology, device.id, { standard: device.poe.standard, budget: value }));
  }

  const classOf = $derived(device.poeClass ?? defaultPoeClass(device));
</script>

{#if canSupplyPoe(device.type)}
  <h3 data-help="poe">{t('poe.title')}</h3>
  <div class="row">
    <label
      >{t('poe.standard')}
      <select value={device.poe?.standard ?? ''} onchange={(e) => setStandard(e.currentTarget.value)} disabled={!editor.editable}>
        <option value="">{t('poe.none')}</option>
        {#each POE_STANDARD_IDS as id (id)}
          <option value={id}>{t(`poe.standard.${id}`)}</option>
        {/each}
      </select>
    </label>
    {#if device.poe}
      <label
        >{t('poe.budget')}
        <span class="unit"><input bind:value={budget} onchange={saveBudget} inputmode="decimal" disabled={!editor.editable} /> W</span>
      </label>
    {/if}
  </div>
  {#if supply}
    <div class="meter" role="meter" aria-valuemin="0" aria-valuemax={supply.budget} aria-valuenow={supply.used} aria-label={t('poe.used')}>
      <div class="fill" class:full={pct >= 90} style:width="{pct}%"></div>
    </div>
    <p class="muted small">{t('poe.usedOf', { used: supply.used, budget: supply.budget, free: Math.round((supply.budget - supply.used) * 10) / 10 })}</p>
    {#if supply.ports.length}
      <table>
        <thead><tr><th>{t('poe.port')}</th><th>{t('poe.device')}</th><th>{t('poe.class')}</th><th>{t('poe.watts')}</th><th>{t('poe.status')}</th><th></th></tr></thead>
        <tbody>
          {#each supply.ports as p (p.iface)}
            <tr>
              <td>{interfaceLabel(device, p.iface)}</td>
              <td>{nameOf(p.device)}</td>
              <td>{p.poeClass}</td>
              <td>{p.watts ? `${p.watts} W` : '–'}</td>
              <td class:bad={!!p.reason}>{p.reason ? t(`poe.reason.${p.reason}`) : t('poe.powered')}</td>
              <td>
                <label class="check"
                  ><input type="checkbox" checked={!device.interfaces[p.iface]?.poeOff} disabled={!editor.editable} onchange={(e) => editor.apply(setPortPoe(editor.topology, device.id, p.iface, e.currentTarget.checked))} />
                  {t('poe.on')}</label
                >
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="muted small">{t('poe.noDevices')}</p>
    {/if}
  {/if}
{/if}

{#if canBePowered(device.type)}
  <h3 data-help="poe">{t('poe.powerTitle')}</h3>
  <div class="row">
    <label
      >{t('poe.source')}
      <select value={needsPoe(device) ? 'poe' : 'local'} onchange={(e) => editor.apply(setPowerSource(editor.topology, device.id, e.currentTarget.value as 'poe' | 'local'))} disabled={!editor.editable}>
        <option value="poe">{t('poe.source.poe')}</option>
        <option value="local">{t('poe.source.local')}</option>
      </select>
    </label>
    <label
      >{t('poe.class')}
      <select value={String(classOf)} onchange={(e) => editor.apply(setPoeClass(editor.topology, device.id, Number(e.currentTarget.value) === defaultPoeClass(device) ? null : Number(e.currentTarget.value)))} disabled={!editor.editable}>
        {#each POE_CLASS_PSE_WATTS as watts, c (c)}
          <option value={String(c)}>{t('poe.classOption', { c, pse: watts, pd: POE_CLASS_PD_WATTS[c] })}</option>
        {/each}
      </select>
    </label>
  </div>
  {#if needsPoe(device)}
    <p class="status" class:bad={!own?.powered}>
      {#if own?.powered && own.source}
        {t('poe.fedBy', { device: nameOf(own.source.device), port: interfaceLabel(getDevice(editor.topology, own.source.device)!, own.source.iface), watts: own.watts ?? 0 })}
      {:else}
        {t(`poe.reason.${own?.reason ?? 'noCable'}`)}
      {/if}
    </p>
  {/if}
{/if}

<style>
  .row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin: 6px 0;
  }
  label {
    display: grid;
    gap: 3px;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .unit {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--text);
  }
  .unit input {
    width: 7em;
  }
  .meter {
    height: 8px;
    border-radius: 4px;
    background: var(--border);
    overflow: hidden;
    margin-top: 8px;
  }
  .fill {
    height: 100%;
    background: var(--ok, #2e9e5b);
  }
  .fill.full {
    background: var(--warn, #d08a00);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
    margin-top: 6px;
  }
  th,
  td {
    text-align: left;
    padding: 3px 6px;
    border-bottom: 1px solid var(--border);
  }
  th {
    color: var(--muted);
    font-weight: 500;
  }
  .bad {
    color: var(--danger, #c0392b);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--text);
  }
  .small {
    font-size: 0.78rem;
    margin: 4px 0;
  }
  .status {
    font-size: 0.85rem;
  }
</style>
