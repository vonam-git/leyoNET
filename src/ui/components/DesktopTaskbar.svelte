<script lang="ts">
  import { getDevice } from '../../core';
  import { t } from '../../i18n';
  import { desktops, toggleDesktop } from '../state/desktop.svelte';
  import { editor } from '../state/editor.svelte';

  /** Taskleiste der offenen Desktops in der Simulationsleiste: Klick zeigt bzw. minimiert. */
  const name = (id: string) => getDevice(editor.topology, id)?.name ?? id;
</script>

{#if desktops.windows.length > 0}
  <div class="taskbar" role="group" aria-label={t('desktop.taskbar')}>
    <span class="label">{t('desktop.taskbar')}:</span>
    {#each desktops.windows as win (win.deviceId)}
      <button
        class:minimized={win.minimized}
        aria-pressed={!win.minimized && desktops.active === win.deviceId}
        onclick={() => toggleDesktop(win.deviceId)}
        title={win.minimized ? t('desktop.restore') : t('desktop.minimize')}
      >
        <span class="dot" aria-hidden="true"></span>{name(win.deviceId)}
      </button>
    {/each}
  </div>
{/if}

<style>
  .taskbar {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    overflow-x: auto;
  }
  .label {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .taskbar button {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    padding: 3px 10px;
    white-space: nowrap;
  }
  .taskbar button[aria-pressed='true'] {
    background: var(--selected-soft);
    border-color: var(--accent);
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
  }
  .minimized {
    opacity: 0.75;
  }
  .minimized .dot {
    background: var(--muted);
  }
</style>
