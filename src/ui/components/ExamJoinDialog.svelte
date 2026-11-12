<script lang="ts">
  import { codeInput } from '../codeInput';
  import { chooseVariant, parseProject } from '../../core';
  import { t } from '../../i18n';
  import { ensureProjectFeatures } from '../actions';
  import { editor } from '../state/editor.svelte';
  import { examMode } from '../state/exam.svelte';
  import { ApiError, session } from '../state/session.svelte';
  import Modal from './Modal.svelte';

  /**
   * Webversion: Prüfung mit dem Platz-Code beitreten, den die Lehrperson verteilt.
   * Vor dem Start wartet der Dialog; danach öffnet sich die Aufgabe des Platzes
   * (oder der zuletzt gespeicherte Stand), und der Prüfungsmodus beginnt.
   */
  let { onclose }: { onclose: () => void } = $props();
  let code = $state('');
  let busy = $state(false);
  let waiting = $state<string | null>(null);
  let message = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => () => clearTimeout(timer));

  async function join(event?: SubmitEvent) {
    event?.preventDefault();
    clearTimeout(timer);
    busy = true;
    message = null;
    try {
      const data = await session.joinExam(code);
      if (data.exam.state === 'waiting') {
        waiting = data.exam.title;
        // Alle 5 Sekunden nachfragen, bis die Lehrperson startet.
        timer = setTimeout(() => void join(), 5000);
        return;
      }
      waiting = null;
      if (!data.session || !data.project) {
        message = t('exam.join.closed');
        return;
      }
      const parsed = parseProject(JSON.stringify(data.project));
      if (!parsed.ok || !parsed.tasks?.exam) {
        message = t('exam.join.invalid');
        return;
      }
      let topology = parsed.topology;
      let tasks = parsed.tasks;
      if (tasks.exam?.variants && data.variant) {
        const chosen = chooseVariant(tasks, data.variant);
        if (chosen) {
          tasks = chosen.tasks;
          topology = chosen.topology ?? topology;
        }
      }
      if (editor.acting) editor.setMode('design');
      editor.replace(topology, { undoable: false, tasks, snapshots: parsed.snapshots ?? [] });
      examMode.enterServer(tasks, code.trim().toUpperCase(), data.exam);
      ensureProjectFeatures(t(data.fresh ? 'exam.join.started' : 'exam.join.resumed', { title: tasks.title, seat: data.exam.seat }));
      onclose();
    } catch (error) {
      const c = error instanceof ApiError ? error.code : 'other';
      message = t(`exam.join.error.${['unknownSeat', 'rateLimited', 'offline', 'seatInUse', 'sebRequired'].includes(c) ? c : 'other'}`);
      waiting = null;
    } finally {
      busy = false;
    }
  }
</script>

<Modal title={t('exam.join.title')} {onclose} width={460}>
  <form id="exam-join" onsubmit={join}>
    <p class="muted">{t('exam.join.hint')}</p>
    <label for="seat-code">{t('exam.join.code')}</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input id="seat-code" bind:value={code} placeholder="ABCD-2345" maxlength="14" use:codeInput autocomplete="off" spellcheck="false" autofocus />
    {#if waiting}<p class="wait" role="status">⏳ {t('exam.join.waiting', { title: waiting })}</p>{/if}
    {#if message}<p class="error" role="alert">{message}</p>{/if}
  </form>
  {#snippet actions()}
    <button type="submit" form="exam-join" class="primary" disabled={busy || code.trim().length < 8}>{t('exam.join.join')}</button>
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
  input {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 1.2rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
    margin: 0;
  }
  .wait {
    margin: 0;
  }
  .error {
    color: var(--danger);
    margin: 0;
  }
  .primary {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
</style>
