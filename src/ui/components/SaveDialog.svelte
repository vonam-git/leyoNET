<script lang="ts">
  import { t } from '../../i18n';
  import { downloadProject } from '../actions';
  import { projectFilename } from '../persist/files';
  import { editor } from '../state/editor.svelte';
  import Modal from './Modal.svelte';

  /** Speichern: Projektname eingeben (vorausgefüllt), daraus entsteht der Dateiname. */
  let { onclose }: { onclose: () => void } = $props();
  let name = $state(editor.topology.title ?? '');
  const filename = $derived(projectFilename(new Date(), name));

  function save(event: SubmitEvent) {
    event.preventDefault();
    editor.setTitle(name);
    downloadProject();
    onclose();
  }
</script>

<Modal title={t('save.title')} {onclose} width={460}>
  <form id="save-form" onsubmit={save}>
    <label for="save-name">{t('save.name')}</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input id="save-name" bind:value={name} maxlength="80" placeholder={t('save.placeholder')} autofocus />
    <p class="muted">{t('save.file')} <code>{filename}</code></p>
  </form>
  {#snippet actions()}
    <button type="submit" form="save-form" class="primary">{t('save.download')}</button>
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
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
  }
  code {
    word-break: break-all;
  }
  .primary {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
</style>
