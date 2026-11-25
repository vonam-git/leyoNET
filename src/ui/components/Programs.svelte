<script lang="ts">
  import { setScanner, type Device } from '../../core';
  import { t } from '../../i18n';
  import { editor } from '../state/editor.svelte';

  /** Simulation, Desktop: Programme installieren und entfernen (ändert die Konfiguration des Geräts). */
  let { device, onopen }: { device: Device; onopen: (app: string) => void } = $props();

  let error = $state<string | null>(null);
  function install(on: boolean) {
    const result = setScanner(editor.topology, device.id, on);
    error = result.ok ? null : t(`error.${result.error.code}`);
    if (result.ok) editor.applyConfig(result.value);
  }
</script>

<div class="programs">
  <p class="muted">{t('programs.hint')}</p>
  <article>
    <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
      <circle cx="24" cy="24" r="17" class="ring" /><circle cx="24" cy="24" r="9" class="ring" />
      <path d="M24 24 L36 12" class="beam" /><circle cx="24" cy="24" r="3" class="dot" /><circle cx="33" cy="30" r="2.6" class="hit" /><circle cx="15" cy="19" r="2.6" class="hit" />
    </svg>
    <div>
      <h3>{t('scanner.title')}</h3>
      <p>{t('programs.scanner')}</p>
    </div>
    {#if device.scanner}
      <span class="row">
        <button class="primary" onclick={() => onopen('scanner')}>{t('programs.open')}</button>
        <button onclick={() => install(false)} disabled={editor.viewOnly}>{t('programs.remove')}</button>
      </span>
    {:else}
      <button class="primary" onclick={() => install(true)} disabled={editor.viewOnly}>{t('programs.install')}</button>
    {/if}
  </article>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
  .programs {
    padding: 14px;
    overflow: auto;
    height: 100%;
  }
  .muted {
    color: var(--muted);
    margin: 0 0 12px;
    font-size: 0.85rem;
  }
  article {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 14px;
    align-items: center;
    padding: 12px 14px;
    border: 2px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
  }
  h3 {
    margin: 0;
    font: 700 1rem 'Courier New', Courier, monospace;
  }
  article p {
    margin: 2px 0 0;
    font-size: 0.82rem;
    color: var(--muted);
  }
  .row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .primary {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
  .ring {
    fill: none;
    stroke: var(--muted);
    stroke-width: 1.5;
    stroke-dasharray: 3 3;
  }
  .beam {
    stroke: var(--accent);
    stroke-width: 2.5;
    stroke-linecap: round;
  }
  .dot {
    fill: var(--accent);
  }
  .hit {
    fill: var(--distribution);
  }
  .error {
    color: var(--danger);
  }
</style>
