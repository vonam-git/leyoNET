<script lang="ts">
  import { dissect, mediumOf, type PacketLogEntry } from '../../core';
  import { t } from '../../i18n';
  import { encapsulationView, hexView, markBytes, osiLayersView } from '../aufbau';
  import { editor } from '../state/editor.svelte';
  import { ui } from '../state/ui.svelte';
  import Tree from './Tree.svelte';

  let { entry, onclose, onfollow }: { entry: PacketLogEntry; onclose: () => void; onfollow?: () => void } = $props();

  /**
   * Der Rahmen wird mit echten Bytes kodiert (wie auf der Leitung) und nach dem
   * OSI-Modell gezeigt: oben die Anwendung, unten die Bitübertragung. Ein Klick
   * auf ein Feld markiert seine Bytes in der Hex-Ansicht. Darstellung gemeinsam
   * mit dem Wiki (aufbau.ts, aufbau.css).
   */
  const medium = $derived.by(() => {
    const cable = editor.topology.cables.find((c) => c.id === entry.cable);
    return cable ? mediumOf(cable) : 'tp';
  });
  const wire = $derived(dissect(entry.frame, medium));
  const osi = $derived(osiLayersView(wire, t, { showEmpty: ui.has('tool.osi'), formats: ui.has('tool.frame') }));
  const encap = $derived(ui.has('tool.frame') ? encapsulationView(wire, t) : null);
  const hex = $derived(ui.has('tool.hex') && wire.bytes.length > 0 ? hexView(wire.bytes, t('wire.hex')) : null);

  let root: HTMLElement;
  let active: HTMLElement | null = null;

  /** Feld unter dem Zeiger oder mit Fokus: Bytes markieren (Ereignisse an der Wurzel gesammelt). */
  function mark(e: Event) {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-start]');
    if (!target || !root.contains(target)) return;
    active?.classList.remove('on');
    active = target;
    target.classList.add('on');
    markBytes(root, Number(target.dataset.start), Number(target.dataset.len));
  }
  $effect(() => {
    void entry.id;
    active = null;
    if (root) markBytes(root, 0, 0);
  });
</script>

<section class="details" aria-labelledby="details-title" bind:this={root} onmouseover={mark} onfocusin={mark} onclick={mark} role="presentation">
  <header>
    <h3 id="details-title">{t('layer.title', { id: entry.id })}</h3>
    <span class="muted">{t('wire.size', { n: wire.bytes.length })}</span>
    {#if onfollow}<button class="small" onclick={onfollow} title={t('packets.stream.followHint')}>{t('packets.stream.follow')}</button>{/if}
    <button class="small" onclick={onclose} aria-label={t('layer.close')}>✕</button>
  </header>

  {#if ui.has('tool.osi')}
    <p class="hint">{t('wire.osiHint')}</p>
  {/if}

  <Tree node={osi} />

  {#if encap}
    <details class="encap" open>
      <summary>{t('fmt.encap.title')}</summary>
      <Tree node={encap} />
    </details>
  {/if}

  {#if hex}
    <h4>{t('wire.hex')}</h4>
    <Tree node={hex} />
  {/if}
</section>

<style>
  .details {
    height: 100%;
    overflow-y: auto;
    padding: 8px 10px;
    border-left: 1px solid var(--border);
    background: var(--surface);
    font-size: 0.8rem;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  header .muted {
    flex: 1;
  }
  h3 {
    margin: 0;
    font-size: 0.85rem;
  }
  h4 {
    margin: 10px 0 4px;
    font-size: 0.8rem;
  }
  .hint {
    margin: 0 0 6px;
    color: var(--muted);
    font-size: 0.72rem;
  }
  .small {
    font-size: 0.75rem;
    padding: 2px 8px;
  }
  .muted {
    color: var(--muted);
  }
  .encap {
    margin: 8px 0 4px;
  }
  .encap > summary {
    cursor: pointer;
    font-weight: 600;
    margin-bottom: 4px;
  }
</style>
