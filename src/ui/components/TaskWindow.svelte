<script lang="ts">
  import { t } from '../../i18n';
  import { editor } from '../state/editor.svelte';
  import { taskView } from '../state/taskView.svelte';
  import TaskBody from './TaskBody.svelte';

  /**
   * Die Aufgabe in einem grossen Fenster: gut lesbar bei langen Aufträgen.
   * Nicht modal, damit man daneben im Netz arbeiten kann. Am Kopf verschieben,
   * unten rechts in der Grösse ändern, Esc schliesst.
   */
  let box = $state<HTMLElement>();
  const tasks = $derived(editor.tasks);

  let drag: { dx: number; dy: number } | null = null;
  function down(event: PointerEvent) {
    if (event.button !== 0 || (event.target as Element).closest('button')) return;
    drag = { dx: event.clientX - taskView.x, dy: event.clientY - taskView.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function move(event: PointerEvent) {
    if (!drag) return;
    taskView.x = Math.min(window.innerWidth - 120, Math.max(-(box?.offsetWidth ?? 400) + 160, event.clientX - drag.dx));
    taskView.y = Math.min(window.innerHeight - 48, Math.max(0, event.clientY - drag.dy));
  }
  const up = () => (drag = null);

  // Beim Öffnen den Fokus ins Fenster setzen, damit Esc und Tab sofort wirken.
  $effect(() => {
    box?.focus({ preventScroll: true });
  });

  function onkeydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      taskView.close();
    }
  }
</script>

{#if tasks}
  <div bind:this={box} class="task-window" role="dialog" aria-labelledby="task-window-title" tabindex="-1" style:left="{taskView.x}px" style:top="{taskView.y}px" {onkeydown}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <header onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
      <span class="label" id="task-window-title">{t('tasks.window')}</span>
      <button class="close" onclick={() => taskView.close()} aria-label={t('about.close')} title="{t('about.close')} (Esc)">✕</button>
    </header>
    <div class="content">
      <TaskBody {tasks} large />
    </div>
  </div>
{/if}

<style>
  .task-window {
    position: fixed;
    z-index: 38;
    width: min(760px, calc(100vw - 32px));
    height: min(78vh, 900px);
    min-width: 320px;
    min-height: 220px;
    display: flex;
    flex-direction: column;
    resize: both;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 18px 48px color-mix(in srgb, #000 28%, transparent);
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px 8px 16px;
    border-bottom: 1px solid var(--border);
    cursor: move;
    user-select: none;
    background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  }
  .label {
    flex: 1;
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .close {
    padding: 2px 8px;
  }
  .content {
    flex: 1;
    overflow: auto;
    padding: 16px 20px 20px;
  }
</style>
