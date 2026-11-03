<script lang="ts">
  import { t } from '../../i18n';
  import { SIZE_LIMITS, ui, type SizeName } from '../state/ui.svelte';

  /**
   * Griff zum Ziehen der Grösse eines Bereichs (Maus, Touch oder Pfeiltasten).
   * `edge`: auf welcher Seite des Bereichs der Griff sitzt; daraus folgt, in welche
   * Richtung Ziehen den Bereich grösser macht. Doppelklick = Standardgrösse.
   */
  let {
    name,
    edge,
    current,
    label,
  }: { name: SizeName; edge: 'left' | 'right' | 'top'; current: () => number; label: string } = $props();

  const vertical = $derived(edge !== 'top');
  let start: { pos: number; size: number } | null = null;

  function sign() {
    // Griff rechts am Bereich: nach rechts ziehen vergrössert; links bzw. oben: umgekehrt.
    return edge === 'right' ? 1 : -1;
  }

  function onpointerdown(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    start = { pos: vertical ? event.clientX : event.clientY, size: current() };
  }
  function onpointermove(event: PointerEvent) {
    if (!start) return;
    const delta = (vertical ? event.clientX : event.clientY) - start.pos;
    ui.setSize(name, start.size + sign() * delta);
  }
  function onpointerup() {
    start = null;
  }
  function onkeydown(event: KeyboardEvent) {
    const grow = vertical ? (edge === 'right' ? 'ArrowRight' : 'ArrowLeft') : 'ArrowUp';
    const shrink = vertical ? (edge === 'right' ? 'ArrowLeft' : 'ArrowRight') : 'ArrowDown';
    const step = event.shiftKey ? 50 : 10;
    if (event.key === grow) ui.setSize(name, current() + step);
    else if (event.key === shrink) ui.setSize(name, current() - step);
    else if (event.key === 'Home' || event.key === 'Enter') ui.setSize(name, null);
    else return;
    event.preventDefault();
  }
</script>

<!-- Fokussierbarer Trenner (ARIA «separator» mit Wert) ist bedienbar. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="splitter {edge}"
  role="separator"
  tabindex="0"
  aria-orientation={vertical ? 'vertical' : 'horizontal'}
  aria-label={label}
  aria-valuenow={Math.round(current())}
  aria-valuemin={SIZE_LIMITS[name][0]}
  aria-valuemax={SIZE_LIMITS[name][1]}
  title={t('splitter.hint')}
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={onpointerup}
  ondblclick={() => ui.setSize(name, null)}
  {onkeydown}
></div>

<style>
  .splitter {
    position: absolute;
    z-index: 6;
    touch-action: none;
  }
  .splitter::after {
    content: '';
    position: absolute;
    background: transparent;
    transition: background-color 0.12s;
  }
  .splitter:hover::after,
  .splitter:focus-visible::after,
  .splitter:active::after {
    background: var(--accent);
  }
  .left,
  .right {
    top: 0;
    bottom: 0;
    width: 9px;
    cursor: col-resize;
  }
  .right {
    right: -5px;
  }
  .left {
    left: -5px;
  }
  .left::after,
  .right::after {
    top: 0;
    bottom: 0;
    left: 3px;
    width: 3px;
  }
  .top {
    left: 0;
    right: 0;
    top: -5px;
    height: 9px;
    cursor: row-resize;
  }
  .top::after {
    left: 0;
    right: 0;
    top: 3px;
    height: 3px;
  }
  .splitter:focus-visible {
    outline: none;
  }
</style>
