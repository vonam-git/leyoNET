<script lang="ts">
  import { t } from '../../i18n';
  import { editor } from '../state/editor.svelte';
  import { examMode } from '../state/exam.svelte';
  import Modal from './Modal.svelte';

  /** Prüfungsmodus beenden: Nur mit dem Code der Lehrperson (steht im Prüfungsschlüssel). */
  let { onclose }: { onclose: () => void } = $props();
  let code = $state('');
  let wrong = $state(false);

  async function end(event: SubmitEvent) {
    event.preventDefault();
    if (await examMode.end(code)) {
      editor.notify(t('exam.mode.ended'));
      onclose();
    } else wrong = true;
  }
</script>

<Modal title={t('exam.mode.end')} {onclose} width={420}>
  <form id="exam-end" onsubmit={end}>
    <p>{t('exam.mode.endHint')}</p>
    <label for="exam-code">{t('exam.mode.code')}</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input id="exam-code" bind:value={code} autocomplete="off" spellcheck="false" autofocus aria-invalid={wrong} />
    {#if wrong}<p class="error" role="alert">{t('exam.mode.wrongCode')}</p>{/if}
  </form>
  {#snippet actions()}
    <button type="submit" form="exam-end" class="primary">{t('exam.mode.end')}</button>
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
  .primary {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
</style>
