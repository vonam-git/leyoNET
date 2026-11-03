<script lang="ts">
  import { t } from '../../i18n';
  import { dialogs } from '../state/dialogs.svelte';
  import { examMode } from '../state/exam.svelte';

  /** Leiste während einer Prüfung: Titel, Platz, Zeit und «Prüfung beenden» (Code der Lehrperson). */
  const exam = $derived(examMode.active);
  const clock = $derived(examMode.clock);
</script>

{#if exam}
  <div class="exam-banner" role="status">
    <strong>🔒 {t('exam.mode.title')}</strong>
    <span class="title">{exam.title}</span>
    {#if exam.variant}<span>{t('exam.mode.seat', { seat: exam.variant })}</span>{/if}
    <span class="clock" class:over={clock.over} title={t(exam.minutes ? 'exam.mode.left' : 'exam.mode.elapsed')}>⏱ {clock.text}</span>
    <span class="muted">{t('exam.mode.locked')}</span>
    <button onclick={() => dialogs.show('examEnd')}>{t('exam.mode.end')}</button>
  </div>
{/if}

<style>
  .exam-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    padding: 6px 12px;
    background: color-mix(in srgb, #7c3aed 12%, var(--surface));
    border-bottom: 1px solid color-mix(in srgb, #7c3aed 40%, var(--border));
    font-size: 0.85rem;
  }
  .title {
    font-weight: 600;
  }
  .clock {
    font-variant-numeric: tabular-nums;
  }
  .clock.over {
    color: var(--danger);
    font-weight: 600;
  }
  .muted {
    color: var(--muted);
    font-size: 0.78rem;
  }
  button {
    margin-left: auto;
  }
</style>
