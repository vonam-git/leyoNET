<script lang="ts">
  import { desktops } from '../state/desktop.svelte';
  import DesktopTaskbar from './DesktopTaskbar.svelte';
  import { t } from '../../i18n';
  import { simStore, type Speed } from '../state/sim.svelte';
  import { editor } from '../state/editor.svelte';

  /** Zeitlauf-Regler: Anhalten, Einzelschritt und Zeitlupe für die Demonstration am Beamer. */
  const speeds: Speed[] = ['realtime', 'slow', 'slower'];
  const clock = $derived((simStore.tick, ((simStore.sim?.now ?? 0) / 1000).toFixed(3)));
</script>

<div class="controls" class:stepping={simStore.paused} role="toolbar" aria-label={t('sim.controls')}>
  <button onclick={() => simStore.togglePause()} aria-pressed={simStore.paused}>
    {simStore.paused ? `▶ ${t('sim.resume')}` : `⏸ ${t('sim.pause')}`}
  </button>
  <button onclick={() => simStore.stepBack()} disabled={!simStore.canStepBack} title={t('sim.stepBackHint')}>⏮ {t('sim.stepBack')}</button>
  <button class="step" onclick={() => simStore.step()} title={t('sim.stepHint')}>⏭ {t('sim.step')}</button>
  <button onclick={() => simStore.reset(editor.topology)} title={t('sim.resetHint')}>↺ {t('sim.reset')}</button>
  {#if simStore.paused}<span class="badge">{t('canvas.stepMode')}</span>{/if}
  <label>
    {t('sim.speed')}
    <select bind:value={simStore.speed}>
      {#each speeds as speed (speed)}
        <option value={speed}>{t(`sim.speed.${speed}`)}</option>
      {/each}
    </select>
  </label>
  <span class="clock">{t('sim.clock', { time: clock })}</span>
  {#if desktops.windows.length > 0}
    <DesktopTaskbar />
  {:else}
    <span class="hint">{t('mode.actionHint')}</span>
  {/if}
</div>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    padding: 6px 12px;
    background: var(--selected-soft);
    border-bottom: 1px solid var(--border);
    font-size: 0.85rem;
  }
  .controls.stepping {
    color: #78350f;
    background: #fef3c7;
    border-bottom-color: #f59e0b;
  }
  .stepping .step {
    font-weight: 700;
    color: #78350f;
    border-color: #f59e0b;
    background: #fff;
  }
  .badge {
    padding: 1px 8px;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    color: #fff;
    background: #d97706;
    border-radius: 10px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  select {
    font: inherit;
    padding: 2px 4px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .clock {
    font-variant-numeric: tabular-nums;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  .hint {
    color: var(--muted);
    font-size: 0.8rem;
  }
</style>
