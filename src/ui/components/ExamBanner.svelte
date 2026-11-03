<script lang="ts">
  import { t } from '../../i18n';
  import { dialogs } from '../state/dialogs.svelte';
  import { examMode } from '../state/exam.svelte';
  import { session } from '../state/session.svelte';

  /** Leiste während einer Prüfung: Titel, Platz, Zeit und «Prüfung beenden» (Code der Lehrperson). */
  const exam = $derived(examMode.active);
  const clock = $derived(examMode.clock);
  const server = $derived(exam?.server ?? null);
  const savedAgo = $derived(session.lastSaved ? Math.max(0, Math.round((examMode.now - session.lastSaved) / 1000)) : null);
</script>

{#if exam}
  <div class="exam-banner" role="status">
    <strong>🔒 {t('exam.mode.title')}</strong>
    <span class="title">{exam.title}</span>
    {#if exam.variant}<span>{t('exam.mode.seat', { seat: exam.variant })}</span>{/if}
    {#if server?.state === 'closed'}
      <strong class="done">✓ {t('exam.mode.submitted')}</strong>
      <span class="muted">{t('exam.mode.submittedHint')}</span>
      <button onclick={() => (examMode.leaveClosed(), session.detach())}>{t('exam.mode.leave')}</button>
    {:else}
      <span class="clock" class:over={clock.over} title={t(exam.minutes || server?.until ? 'exam.mode.left' : 'exam.mode.elapsed')}>⏱ {clock.text}</span>
      {#if server}
        <span class="muted" class:error={session.status === 'error'}>{session.status === 'error' ? t('exam.mode.saveError') : savedAgo !== null ? t('exam.mode.savedAgo', { s: savedAgo }) : t('exam.mode.notSaved')}</span>
      {:else}
        <span class="muted">{t('exam.mode.locked')}</span>
      {/if}
      <button onclick={() => dialogs.show('examEnd')}>{t('exam.mode.end')}</button>
    {/if}
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
  .done {
    color: #15803d;
  }
  .error {
    color: var(--danger);
  }
  .muted {
    color: var(--muted);
    font-size: 0.78rem;
  }
  button {
    margin-left: auto;
  }
</style>
