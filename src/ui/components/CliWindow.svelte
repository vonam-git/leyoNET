<script lang="ts">
  import { getDevice } from '../../core';
  import { t } from '../../i18n';
  import { cliWindow, closeCli } from '../state/cli.svelte';
  import { editor } from '../state/editor.svelte';
  import CliTerminal from './CliTerminal.svelte';

  /** Konsolenfenster eines Routers oder Switches (wie mit dem Konsolenkabel angeschlossen). */
  const device = $derived(cliWindow.deviceId ? getDevice(editor.topology, cliWindow.deviceId) : undefined);

  // Am Kopf verschieben; die Position bleibt für die Sitzung erhalten.
  let el = $state<HTMLElement>();
  let drag: { dx: number; dy: number } | null = null;
  function onHeadDown(event: PointerEvent) {
    if (!el || event.button !== 0 || (event.target as Element).closest('button')) return;
    const box = el.getBoundingClientRect();
    const parent = el.offsetParent!.getBoundingClientRect();
    drag = { dx: event.clientX - box.left + parent.left, dy: event.clientY - box.top + parent.top };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function onHeadMove(event: PointerEvent) {
    if (!drag || !el) return;
    const parent = el.offsetParent as HTMLElement;
    cliWindow.x = Math.min(parent.clientWidth - 120, Math.max(160 - el.offsetWidth, event.clientX - drag.dx));
    cliWindow.y = Math.min(parent.clientHeight - 40, Math.max(0, event.clientY - drag.dy));
  }
  function onHeadUp() {
    drag = null;
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeCli();
    }
  }
</script>

{#if device}
  <div class="window" bind:this={el} role="dialog" aria-labelledby="cli-title" tabindex="-1" {onkeydown} style:left={cliWindow.x !== undefined ? `${cliWindow.x}px` : undefined} style:top={cliWindow.y !== undefined ? `${cliWindow.y}px` : undefined}>
    <!-- svelte-ignore a11y_no_static_element_interactions (Ziehen mit der Maus; Tastatur: Fenster bleibt bedienbar) -->
    <header onpointerdown={onHeadDown} onpointermove={onHeadMove} onpointerup={onHeadUp} onpointercancel={onHeadUp} title={t('desktop.dragHint')}>
      <h2 id="cli-title">{t('cli.title', { name: device.name })}</h2>
      <span class="hint">{t('cli.hint')}</span>
      <button class="close" onclick={closeCli} aria-label={t('desktop.close')}>✕</button>
    </header>
    <div class="content">
      {#key cliWindow.generation}
        <CliTerminal deviceId={device.id} onclose={closeCli} />
      {/key}
    </div>
  </div>
{/if}

<style>
  .window {
    position: absolute;
    top: 52px;
    left: 16px;
    width: min(680px, calc(100% - 32px));
    height: min(440px, calc(100% - 72px));
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.25);
    overflow: hidden;
    resize: both;
    min-width: 320px;
    min-height: 200px;
    z-index: 6;
  }
  header {
    cursor: move;
    touch-action: none;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px 6px 12px;
    background: #2b3440;
    color: #e6ebf1;
  }
  h2 {
    margin: 0;
    font-size: 0.9rem;
    white-space: nowrap;
  }
  .hint {
    flex: 1;
    font-size: 0.75rem;
    opacity: 0.75;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .close {
    padding: 2px 8px;
    color: inherit;
    background: transparent;
    border-color: transparent;
  }
  .content {
    flex: 1;
    min-height: 0;
  }
</style>
