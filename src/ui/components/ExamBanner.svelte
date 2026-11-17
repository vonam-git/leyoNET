<script lang="ts">
  import { t } from '../../i18n';
  import { dialogs } from '../state/dialogs.svelte';
  import { examMode } from '../state/exam.svelte';
  import { session } from '../state/session.svelte';
  import { submitServerExam } from '../actions';
  import { locale } from '../../i18n';

  /** Leiste während einer Prüfung: Titel, Platz, Zeit und «Prüfung beenden» (Code der Lehrperson). */
  const exam = $derived(examMode.active);
  const clock = $derived(examMode.clock);
  const server = $derived(exam?.server ?? null);
  const savedAgo = $derived(session.lastSaved ? Math.max(0, Math.round((examMode.now - session.lastSaved) / 1000)) : null);
  const submittedAt = $derived(server?.submitted ? new Date(server.submitted - (server.offset ?? 0)).toLocaleTimeString(locale() === 'en' ? 'en-GB' : 'de-CH', { hour: '2-digit', minute: '2-digit' }) : null);

  /** Abgeben: Nachfrage, dann schliesst der Server den Platz; hier beginnt eine leere Fläche. */
  let confirming = $state(false);
  let busy = $state(false);
  let failed = $state(false);
  async function submit() {
    busy = true;
    failed = false;
    const ok = await submitServerExam();
    busy = false;
    confirming = !ok;
    failed = !ok;
  }
</script>

{#if exam}
  <div class="exam-banner" role="status">
    <strong>🔒 {t('exam.mode.title')}</strong>
    <span class="title">{exam.title}</span>
    {#if exam.variant}<span>{t('exam.mode.seat', { seat: exam.variant })}</span>{/if}
    {#if server?.state === 'closed'}
      <strong class="done">✓ {submittedAt ? t('exam.mode.submittedAt', { time: submittedAt }) : t('exam.mode.submitted')}</strong>
      <span class="muted">{t(submittedAt ? 'exam.mode.submittedOwnHint' : 'exam.mode.submittedHint')}</span>
      <button onclick={() => (examMode.leaveClosed(), session.detach())}>{t('exam.mode.leave')}</button>
    {:else}
      <span class="clock" class:over={clock.over} title={t(exam.minutes || server?.until ? 'exam.mode.left' : 'exam.mode.elapsed')}>⏱ {clock.text}</span>
      {#if server}
        <span class="muted" class:error={session.status === 'error'}>{session.status === 'error' ? t('exam.mode.saveError') : savedAgo !== null ? t('exam.mode.savedAgo', { s: savedAgo }) : t('exam.mode.notSaved')}</span>
      {:else}
        <span class="muted">{t('exam.mode.locked')}</span>
      {/if}
      {#if server && server.state === 'open'}
        {#if confirming}
          <span class="confirm" role="alert">{t('exam.mode.submitConfirm')}</span>
          <button class="submit" onclick={submit} disabled={busy}>{t('exam.mode.submitYes')}</button>
          <button class="plain" onclick={() => (confirming = false)} disabled={busy}>{t('exam.mode.submitNo')}</button>
        {:else}
          <button class="submit" onclick={() => (confirming = true)}>📤 {t('exam.mode.submit')}</button>
        {/if}
        {#if failed}<span class="error" role="alert">{t('exam.mode.submitFailed')}</span>{/if}
      {/if}
      <button class="end" onclick={() => dialogs.show('examEnd')}>{t('exam.mode.end')}</button>
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
  button:first-of-type {
    margin-left: auto;
  }
  .submit {
    background: #15803d;
    border-color: #15803d;
    color: #fff;
    font-weight: 600;
  }
  .confirm {
    font-weight: 600;
  }
</style>
