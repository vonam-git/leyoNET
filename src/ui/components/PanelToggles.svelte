<script lang="ts">
  import { t } from '../../i18n';
  import { editor } from '../state/editor.svelte';
  import { ui } from '../state/ui.svelte';

  /**
   * Griffe am Rand der Zeichenfläche: Shop (links), Eigenschaften (rechts) und
   * Paketliste (unten, in der Simulation) ein- und ausfahren. So bleibt mehr
   * Platz, z.B. beim Vorführen am Beamer. Die Wahl bleibt im Browser gespeichert.
   */
  const bottom = $derived(editor.acting && ui.has('tool.sniffer'));
  /** Mit `inside` der Griff oben an der offenen Paketliste (zum Einfahren). */
  let { inside = false }: { inside?: boolean } = $props();
</script>

{#if inside}
  <button class="grip bottom open" onclick={() => ui.togglePanel('bottom')} aria-expanded="true" title={t('panel.hideBottom')} aria-label={t('panel.hideBottom')}>⌄ {t('packets.title')}</button>
{:else}
<button class="grip left" onclick={() => ui.togglePanel('left')} aria-expanded={ui.panels.left} title={t(ui.panels.left ? 'panel.hideLeft' : 'panel.showLeft')} aria-label={t(ui.panels.left ? 'panel.hideLeft' : 'panel.showLeft')}>
  {ui.panels.left ? '‹' : '›'}
</button>
<button class="grip right" onclick={() => ui.togglePanel('right')} aria-expanded={ui.panels.right} title={t(ui.panels.right ? 'panel.hideRight' : 'panel.showRight')} aria-label={t(ui.panels.right ? 'panel.hideRight' : 'panel.showRight')}>
  {ui.panels.right ? '›' : '‹'}
</button>
{#if bottom && !ui.panels.bottom}
  <button class="grip bottom" onclick={() => ui.togglePanel('bottom')} aria-expanded="false" title={t('panel.showBottom')} aria-label={t('panel.showBottom')}>⌃ {t('packets.title')}</button>
{/if}
{/if}

<style>
  .grip {
    position: absolute;
    z-index: 4;
    padding: 0;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--muted);
    font-size: 0.95rem;
    line-height: 1;
    box-shadow: var(--shadow);
    opacity: 0.85;
  }
  .grip:hover {
    opacity: 1;
    color: var(--text);
  }
  .left,
  .right {
    top: 50%;
    width: 16px;
    height: 48px;
    transform: translateY(-50%);
  }
  .left {
    left: 0;
    border-left: none;
    border-radius: 0 8px 8px 0;
  }
  .right {
    right: 0;
    border-right: none;
    border-radius: 8px 0 0 8px;
  }
  .bottom {
    left: 50%;
    bottom: 6px;
    transform: translateX(-50%);
    padding: 1px 12px;
    border-radius: 8px;
    font-size: 0.75rem;
  }
  .bottom.open {
    top: -11px;
    bottom: auto;
  }
</style>
