<script lang="ts">
  import { t } from '../../i18n';
  import { dialogs } from '../state/dialogs.svelte';
  import { examMode } from '../state/exam.svelte';
  import { session } from '../state/session.svelte';
  import { checkExamReopened, submitServerExam } from '../actions';
  import { locale } from '../../i18n';
  import { SEB_QUIT_PARAM, inSeb } from '../seb';

  /** Leiste während einer Prüfung: Titel, Platz, Zeit und «Prüfung beenden» (Code der Lehrperson). */
  const exam = $derived(examMode.active);
  const clock = $derived(examMode.clock);
  const server = $derived(exam?.server ?? null);
  const savedAgo = $derived(session.lastSaved ? Math.max(0, Math.round((examMode.now - session.lastSaved) / 1000)) : null);
  const submittedAt = $derived(server?.submitted ? new Date(server.submitted - (server.offset ?? 0)).toLocaleTimeString(locale() === 'en' ? 'en-GB' : 'de-CH', { hour: '2-digit', minute: '2-digit' }) : null);

  // Abgegeben oder Zeit um: alle 15 Sekunden nachfragen, ob die Lehrperson den Platz wieder geöffnet hat.
  $effect(() => {
    if (server?.state !== 'closed') return;
    const timer = setInterval(() => void checkExamReopened(), 15_000);
    return () => clearInterval(timer);
  });

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
      {#if server.sebQuit && inSeb()}
        <!-- Beenden-Link der SEB-Datei (quitURL): SEB fängt die Adresse ab und schliesst sich. -->
        <a class="seb-quit" href={`${location.pathname}?${SEB_QUIT_PARAM}=1`}>{t('exam.mode.sebQuit')}</a>
      {:else}
        <button onclick={() => (examMode.leaveClosed(), session.detach())}>{t('exam.mode.leave')}</button>
      {/if}
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
  .submit:hover:not(:disabled) {
    background: #166534;
  }
  .confirm {
    font-weight: 600;
  }
  .seb-quit {
    padding: 2px 10px;
    border-radius: 6px;
    background: var(--accent);
    color: var(--on-accent);
    text-decoration: none;
    font-weight: 600;
  }
</style>
