<script lang="ts">
  import { cableAt, getDevice, otherEnd, type Device } from '../../core';
  import { t } from '../../i18n';
  import { duplicates } from '../state/duplicates.svelte';
  import { editor } from '../state/editor.svelte';
  import { ui } from '../state/ui.svelte';
  import { interfaceLabel } from '../labels';

  /**
   * Schnellansicht: welcher Adapter konfiguriert wird (Name, Verbindung) und
   * seine MAC-Adresse. Die MAC lässt sich im Entwurf ändern (ab Profil 3), z.B.
   * um eine doppelte MAC vorzuführen.
   */
  let { device, index = 0 }: { device: Device; index?: number } = $props();

  const iface = $derived(device.interfaces[index]);
  const cable = $derived(cableAt(editor.topology, { device: device.id, iface: index }));
  const peer = $derived.by(() => {
    if (!cable) return null;
    const end = otherEnd(cable, device.id);
    const other = getDevice(editor.topology, end.device);
    return other ? { name: other.name, port: interfaceLabel(other, end.iface) } : null;
  });
  const duplicate = $derived(duplicates.hasMac(device.id, index));
  const canEdit = $derived(editor.editable && ui.has('net.macEdit'));

  let editing = $state(false);
  let draft = $state('');
  let error = $state<string | null>(null);

  function start() {
    draft = iface?.mac ?? '';
    error = null;
    editing = true;
  }

  function save() {
    const failure = editor.setInterfaceMac(device.id, index, draft);
    if (failure) {
      error = t(`error.${failure.code}`, failure.params);
      return;
    }
    editing = false;
    error = null;
  }

  function reset() {
    editor.setInterfaceMac(device.id, index, '');
    editing = false;
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      save();
    } else if (event.key === 'Escape') {
      editing = false;
    }
  }
</script>

{#if iface}
  <div class="adapter">
    <div class="row">
      <span class="label">{t('adapter.title')}</span>
      <span>
        <strong>{interfaceLabel(device, index)}</strong>
        {#if cable && peer}
          <span class="muted">{t(`adapter.medium.${cable.medium === 'wireless' ? 'wlan' : 'cable'}`)} {t('inspector.connectedTo', { device: peer.name, iface: peer.port })}</span>
        {:else}
          <span class="muted">{t('adapter.notConnected')}</span>
        {/if}
      </span>
    </div>
    <div class="row">
      <span class="label">{t('adapter.mac')}</span>
      {#if editing}
        <span class="edit">
          <!-- svelte-ignore a11y_autofocus -->
          <input bind:value={draft} {onkeydown} onblur={save} aria-label={t('adapter.mac')} aria-invalid={!!error} spellcheck="false" autocomplete="off" autofocus />
        </span>
      {:else}
        <span class="mac">
          <code class:dup={duplicate}>{iface.mac}</code>
          {#if canEdit}<button type="button" class="link" onclick={start}>{t('adapter.change')}</button>{/if}
        </span>
      {/if}
    </div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if editing}<p class="muted small">{t('adapter.macHint')} <button type="button" class="link" onmousedown={(e) => e.preventDefault()} onclick={reset}>{t('adapter.reset')}</button></p>{/if}
    {#if duplicate}<p class="warning" role="alert">❗ {t('adapter.duplicateMac', { mac: iface.mac })}</p>{/if}
  </div>
{/if}

<style>
  .adapter {
    margin: 6px 0 10px;
    font-size: 0.85rem;
    display: grid;
    gap: 3px;
  }
  .row {
    display: grid;
    grid-template-columns: 5.4em minmax(0, 1fr);
    gap: 8px;
    align-items: baseline;
  }
  .label {
    color: var(--muted);
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 0.78rem;
    margin: 2px 0 0;
  }
  .mac {
    display: flex;
    gap: 8px;
    align-items: baseline;
  }
  code {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  code.dup {
    color: var(--danger);
    font-weight: 700;
  }
  .edit input {
    width: 100%;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    color: var(--accent);
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
    font-size: 0.8rem;
  }
  .error {
    color: var(--danger);
    margin: 2px 0 0;
  }
  .warning {
    margin: 4px 0 0;
    padding: 4px 8px;
    border-radius: 6px;
    background: var(--warning-soft);
  }
</style>
