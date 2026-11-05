<script lang="ts">
  import { routingModeOf, type Device, type RoutingMode } from '../../core';
  import { t } from '../../i18n';
  import { dialogs } from '../state/dialogs.svelte';
  import { editor } from '../state/editor.svelte';
  import { ui } from '../state/ui.svelte';

  /**
   * Routing-Art eines Routers oder Layer-3-Switches. Für Einsteiger ein
   * Häkchen «Automatisches Routing»: Der Router kennt dann alle Netze im Plan
   * selbst. Ohne Häkchen wählt man zwischen statischen Routen (von Hand) und
   * dynamischem Routing (OSPF, RIP, BGP).
   */
  let { device, compact = false }: { device: Device; compact?: boolean } = $props();

  const mode = $derived(routingModeOf(device));
  const canAuto = $derived(ui.has('routing.auto') || mode === 'auto');
  const canDynamic = $derived(ui.has('routing.ospf') || ui.has('routing.rip') || ui.has('routing.bgp') || mode === 'dynamic');
  /** Zuletzt gewählte manuelle Art, damit das Abwählen von «auto» dorthin zurückkehrt. */
  const manual = $derived<RoutingMode>(device.ospf || device.rip || device.bgp ? 'dynamic' : 'static');
  const resting = $derived(mode === 'auto' && ((device.routes?.length ?? 0) > 0 || !!device.ospf || !!device.rip || !!device.bgp));

  const set = (next: RoutingMode) => editor.setRoutingMode(device.id, next);
</script>

<fieldset class="routing-mode" class:compact disabled={!editor.editable}>
  <legend>{t('routingMode.title')}</legend>
  {#if canAuto}
    <label class="auto">
      <input type="checkbox" checked={mode === 'auto'} onchange={(e) => set(e.currentTarget.checked ? 'auto' : manual)} />
      <span><strong>{t('routingMode.auto')}</strong> <span class="badge">{t('routingMode.beginner')}</span></span>
    </label>
  {/if}
  {#if mode === 'auto'}
    <p class="muted">{t('routingMode.autoHint')}</p>
    {#if resting}<p class="note">{t('routingMode.resting')}</p>{/if}
  {:else}
    <div class="choice" role="radiogroup" aria-label={t('routingMode.manual')}>
      <label><input type="radio" name="routing-mode-{device.id}" checked={mode === 'static'} onchange={() => set('static')} /> {t('routingMode.static')}</label>
      <label class:locked={!canDynamic} title={canDynamic ? undefined : t('routingMode.dynamicLocked')}>
        <input type="radio" name="routing-mode-{device.id}" checked={mode === 'dynamic'} disabled={!canDynamic} onchange={() => set('dynamic')} /> {t(editor.ipMode === 'ipv6' ? 'routingMode.dynamic6' : editor.ipMode === 'dual' ? 'routingMode.dynamicDual' : 'routingMode.dynamic')}
      </label>
    </div>
    {#if !compact}<p class="muted">{t(mode === 'dynamic' ? 'routingMode.dynamicHint' : 'routingMode.staticHint')}</p>{/if}
  {/if}
  {#if compact && mode !== 'auto'}
    <button type="button" class="link" onclick={() => dialogs.showDevice(device.id, 'routing')}>{t('routingMode.open')}</button>
  {/if}
</fieldset>

<style>
  .routing-mode {
    margin: 10px 0;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 0.85rem;
  }
  legend {
    padding: 0 4px;
    color: var(--muted);
    font-size: 0.78rem;
  }
  label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  input {
    width: auto;
  }
  .locked {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .auto {
    align-items: flex-start;
  }
  .auto input {
    margin-top: 3px;
  }
  .badge {
    display: inline-block;
    padding: 0 6px;
    font-size: 0.7rem;
    color: #92400e;
    background: #fef3c7;
    border-radius: 8px;
  }
  .choice {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin-top: 6px;
  }
  p {
    margin: 6px 0 0;
    font-size: 0.8rem;
    line-height: 1.4;
  }
  .muted {
    color: var(--muted);
  }
  .note {
    color: #b45309;
  }
  .link {
    margin-top: 6px;
    padding: 0;
    border: none;
    background: none;
    color: var(--accent);
    text-decoration: underline;
    font-size: 0.8rem;
  }
</style>
