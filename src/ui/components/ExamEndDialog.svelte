<script lang="ts">
  import { t } from '../../i18n';
  import { editor } from '../state/editor.svelte';
  import { examMode } from '../state/exam.svelte';
  import { session } from '../state/session.svelte';
  import Modal from './Modal.svelte';

  /**
   * Prüfungsmodus beenden: Nur mit dem Code der Lehrperson (steht im Prüfungsschlüssel).
   * Prüfung über den Server: Der Server prüft den Code, mit begrenzten Versuchen; danach ist
   * der Platz gesperrt (für einige Minuten oder bis die Lehrperson ihn freigibt).
   */
  let { onclose }: { onclose: () => void } = $props();
  let code = $state('');
  let problem = $state<'wrong' | 'locked' | 'error' | null>(null);
  let busy = $state(false);

  const lock = $derived(examMode.active?.server?.unlock ?? null);
  const lockedUntil = $derived(lock && lock.lockedUntil !== 0 && (lock.lockedUntil === -1 || lock.lockedUntil > examMode.now) ? lock.lockedUntil : 0);
  const lockText = $derived(
    lockedUntil === -1 ? t('exam.mode.lockedTeacher') : lockedUntil > 0 ? t('exam.mode.lockedFor', { minutes: Math.max(1, Math.ceil((lockedUntil - examMode.now) / 60_000)) }) : '',
  );

  async function end(event: SubmitEvent) {
    event.preventDefault();
    if (busy || lockedUntil || !code.trim()) return;
    busy = true;
    let result: typeof problem | 'ok' = null;
    const done = await examMode.end(code, async (c) => {
      result = await session.unlockExam(c);
      return result === 'ok';
    });
    busy = false;
    if (done) {
      editor.notify(t('exam.mode.ended'));
      onclose();
    } else problem = result === null ? 'wrong' : result === 'ok' ? null : result;
  }
</script>

<Modal title={t('exam.mode.end')} {onclose} width={420}>
  <form id="exam-end" onsubmit={end}>
    <p>{t('exam.mode.endHint')}</p>
    <label for="exam-code">{t('exam.mode.code')}</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input id="exam-code" bind:value={code} autocomplete="off" spellcheck="false" autofocus aria-invalid={problem === 'wrong'} disabled={!!lockedUntil} />
    {#if lockText}
      <p class="error" role="alert">{lockText}</p>
    {:else if problem === 'wrong'}
      <p class="error" role="alert">{t('exam.mode.wrongCode')}{#if lock}{' '}{t('exam.mode.attemptsLeft', { n: lock.left })}{/if}</p>
    {:else if problem === 'error'}
      <p class="error" role="alert">{t('exam.mode.unlockFailed')}</p>
    {:else if lock && examMode.active?.server}
      <p class="muted">{t('exam.mode.attemptsLeft', { n: lock.left })}</p>
    {/if}
  </form>
  {#snippet actions()}
    <button type="submit" form="exam-end" class="primary" disabled={busy || !!lockedUntil}>{t('exam.mode.end')}</button>
  {/snippet}
</Modal>

<style>
  form {
    display: grid;
    gap: 8px;
  }
  input {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }
  .error {
    color: var(--danger);
    margin: 0;
  }
  .muted {
    color: var(--muted);
    margin: 0;
    font-size: 0.85rem;
  }
  .primary {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
</style>
