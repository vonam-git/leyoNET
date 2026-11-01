<script lang="ts">
  import { cableAt, getDevice, otherEnd, portAccepts } from '../../core';
  import { t } from '../../i18n';
  import { interfaceLabel } from '../labels';
  import { editor } from '../state/editor.svelte';

  /**
   * Anschlussauswahl beim Verbinden («Anschluss wählen»): Liste aller
   * Anschlüsse des Geräts neben dem Gerät. Belegte und unpassende sind
   * ausgegraut und zeigen, womit sie verbunden sind.
   */
  const prompt = $derived(editor.portPrompt);
  const device = $derived(prompt ? getDevice(editor.topology, prompt.deviceId) : undefined);

  const options = $derived.by(() => {
    if (!device) return [];
    return device.interfaces.map((iface) => {
      const cable = cableAt(editor.topology, { device: device.id, iface: iface.index });
      const peer = cable ? getDevice(editor.topology, otherEnd(cable, device.id).device) : undefined;
      const fits = portAccepts(device, iface.index, editor.medium);
      return { index: iface.index, label: interfaceLabel(device, iface.index), peer: peer?.name, fits, free: !cable && fits };
    });
  });

  /** Bildschirmposition rechts neben dem Gerät. */
  const position = $derived.by(() => {
    if (!device) return { x: 0, y: 0 };
    const v = editor.view;
    return { x: device.position.x * v.scale + v.x + 44 * v.scale, y: device.position.y * v.scale + v.y - 30 * v.scale };
  });

  let list = $state<HTMLElement>();
  $effect(() => {
    if (prompt) queueMicrotask(() => list?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus());
  });

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      editor.cancel();
    }
  }
</script>

{#if prompt && device}
  <div class="picker" style:left="{position.x}px" style:top="{position.y}px" role="dialog" aria-label={t('portPicker.title', { name: device.name })} tabindex="-1" {onkeydown} onpointerdown={(e) => e.stopPropagation()}>
    <p class="title">{t(prompt.step === 'source' ? 'portPicker.source' : 'portPicker.target', { name: device.name })}</p>
    <ul bind:this={list}>
      {#each options as o (o.index)}
        <li>
          <button disabled={!o.free} onclick={() => editor.choosePort(o.index)} title={o.peer ? t('portPicker.busy', { peer: o.peer }) : !o.fits ? t('portPicker.unfit') : ''}>
            <span class="led" class:on={!!o.peer}></span>
            <span class="name">{o.label}</span>
            <span class="state">{o.peer ? `→ ${o.peer}` : !o.fits ? t('portPicker.unfitShort') : t('portPicker.free')}</span>
          </button>
        </li>
      {/each}
    </ul>
    <button class="cancel" onclick={() => editor.cancel()}>{t('portPicker.cancel')}</button>
  </div>
{/if}

<style>
  .picker {
    position: absolute;
    z-index: 8;
    min-width: 190px;
    max-height: 320px;
    display: flex;
    flex-direction: column;
    padding: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.25);
  }
  .title {
    margin: 2px 4px 6px;
    font-size: 0.8rem;
    font-weight: 600;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
  }
  li button {
    width: 100%;
    display: grid;
    grid-template-columns: 10px auto 1fr;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border: none;
    border-radius: 6px;
    background: none;
    text-align: left;
    font-size: 0.8rem;
  }
  li button:hover:not(:disabled),
  li button:focus-visible {
    background: var(--selected-soft);
  }
  li button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .led {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid var(--muted);
  }
  .led.on {
    background: #16a34a;
    border-color: #16a34a;
  }
  .name {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-weight: 600;
  }
  .state {
    color: var(--muted);
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cancel {
    margin-top: 6px;
    font-size: 0.78rem;
  }
</style>
