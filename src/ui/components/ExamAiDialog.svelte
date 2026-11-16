<script lang="ts">
  import { fromAiExchange, toAiExchange } from '../../core';
  import { locale, t } from '../../i18n';
  import { pickFile } from '../actions';
  import { buildAiPrompt } from '../examAi';
  import { errorText } from '../labels';
  import { downloadText } from '../persist/files';
  import { editor } from '../state/editor.svelte';
  import Modal from './Modal.svelte';

  /**
   * Aufgaben mit einer KI: Anleitung mit Schema und Beispiel (der aktuellen Aufgabe) kopieren
   * oder speichern, in einer KI nach Wahl ausfüllen lassen und die Antwort wieder einfügen.
   * leyoNET stellt selbst keine Verbindung her; die Antwort wird streng geprüft und nur als
   * Text verwendet (siehe docs/sicherheit.md).
   */
  let { onclose }: { onclose: () => void } = $props();

  let wish = $state('');
  let answer = $state('');
  let error = $state<string | null>(null);
  let copied = $state(false);

  const prompt = () => buildAiPrompt(locale(), editor.tasks ? toAiExchange(editor.topology, editor.tasks) : null, wish);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt());
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      save();
    }
  }

  function save() {
    downloadText(t('examAi.fileName') + '.md', prompt(), 'text/markdown');
  }

  async function openFile() {
    const file = await pickFile('.json,.md,.txt,application/json,text/plain,text/markdown');
    if (file) answer = file.text;
  }

  function importAnswer() {
    error = null;
    const result = fromAiExchange(answer);
    if (!result.ok) {
      const detail = result.error ? '– ' + errorText(result.error) : '';
      error = t(`examAi.error.${['size', 'json', 'format', 'version'].includes(result.path) ? result.path : 'field'}`, { path: result.path, detail });
      return;
    }
    if (editor.acting) editor.setMode('design');
    editor.replace(result.topology, { undoable: true, tasks: result.tasks });
    editor.notify(t('examAi.imported', { title: result.tasks.title, goals: result.tasks.goals.length }));
    onclose();
  }
</script>

<Modal title={t('examAi.title')} {onclose} width={640}>
  <p class="muted">{t('examAi.intro')}</p>
  <fieldset>
    <legend>{t('examAi.step1')}</legend>
    <label>{t('examAi.wish')}<textarea bind:value={wish} rows="3" maxlength="2000" placeholder={t('examAi.wishPlaceholder')}></textarea></label>
    <p class="muted small">{t(editor.tasks?.goals.length ? 'examAi.exampleCurrent' : 'examAi.exampleBuiltin')}</p>
    <div class="buttons">
      <button class="primary" onclick={copy}>{copied ? t('examAi.copied') : t('examAi.copy')}</button>
      <button onclick={save}>{t('examAi.save')}</button>
    </div>
  </fieldset>
  <fieldset>
    <legend>{t('examAi.step2')}</legend>
    <label>{t('examAi.answer')}<textarea bind:value={answer} rows="6" spellcheck="false" class="mono" placeholder={'```json\n{ "format": "leyonet-ki-aufgabe", … }\n```'}></textarea></label>
    <div class="buttons">
      <button onclick={openFile}>{t('examAi.openFile')}</button>
      <button class="primary" onclick={importAnswer} disabled={!answer.trim()}>{t('examAi.import')}</button>
    </div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <p class="muted small">{t('examAi.next')}</p>
  </fieldset>
</Modal>

<style>
  label {
    display: grid;
    gap: 3px;
    font-size: 0.8rem;
    color: var(--muted);
  }
  textarea {
    width: 100%;
    resize: vertical;
    font: inherit;
    font-size: 0.85rem;
  }
  .mono {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 0.78rem;
  }
  fieldset {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px 10px;
    margin: 10px 0;
  }
  legend {
    font-weight: 600;
    font-size: 0.85rem;
    padding: 0 4px;
  }
  .buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 8px;
  }
  .small {
    font-size: 0.78rem;
    margin: 6px 0 0;
  }
  .error {
    color: var(--danger, #c0392b);
    font-size: 0.85rem;
  }
</style>
