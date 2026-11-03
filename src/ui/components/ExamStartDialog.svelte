<script lang="ts">
  import { chooseVariant } from '../../core';
  import { t } from '../../i18n';
  import { ensureProjectFeatures } from '../actions';
  import { dialogs } from '../state/dialogs.svelte';
  import { editor } from '../state/editor.svelte';
  import { examMode } from '../state/exam.svelte';
  import Modal from './Modal.svelte';

  /** Prüfungsdatei mit mehreren Varianten: Die Lernenden wählen ihren Platz, dann beginnt die Prüfung. */
  let { onclose }: { onclose: () => void } = $props();
  const pending = dialogs.examStart;
  const variants = pending?.tasks.exam?.variants ?? [];
  let seat = $state(variants[0]?.id ?? '');

  function start(event: SubmitEvent) {
    event.preventDefault();
    if (!pending) return;
    const chosen = chooseVariant(pending.tasks, seat);
    if (!chosen) return;
    editor.replace(chosen.topology ?? pending.topology, { undoable: true, tasks: chosen.tasks, snapshots: pending.snapshots });
    examMode.enter(chosen.tasks);
    dialogs.examStart = null;
    ensureProjectFeatures(t('exam.mode.started', { title: chosen.tasks.title, seat }));
    onclose();
  }
</script>

<Modal title={pending?.tasks.title ?? t('exam.mode.title')} {onclose} width={480}>
  <form id="exam-start" onsubmit={start}>
    {#if pending?.tasks.description}<p>{pending.tasks.description}</p>{/if}
    <label for="exam-seat">{t('exam.mode.chooseSeat')}</label>
    <select id="exam-seat" bind:value={seat}>
      {#each variants as v (v.id)}<option value={v.id}>{t('exam.mode.seat', { seat: v.id })}</option>{/each}
    </select>
    <p class="muted">{t('exam.mode.startHint')}</p>
  </form>
  {#snippet actions()}
    <button type="submit" form="exam-start" class="primary">{t('exam.mode.start')}</button>
  {/snippet}
</Modal>

<style>
  form {
    display: grid;
    gap: 8px;
  }
  label {
    font-weight: 600;
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
    margin: 0;
  }
  .primary {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
</style>
