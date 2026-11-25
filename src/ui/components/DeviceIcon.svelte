<script lang="ts">
  import type { DeviceType } from '../../core';
  import { iconShapes } from '../deviceIcons';

  // Eigene, schlichte Symbole (keine Grafiken aus dem Vorbild, siehe Konzept 7.6). Die Formen
  // stehen in deviceIcons.ts, damit das Wiki dieselben Symbole zeigt.
  let { type, variant }: { type: DeviceType; variant?: string } = $props();
  const shapes = $derived(iconShapes(type, variant));
</script>

<g class="icon" aria-hidden="true">
  {#each shapes as shape, i (i)}
    <svelte:element this={shape.tag} xmlns="http://www.w3.org/2000/svg" class={shape.cls} {...shape.attrs} />
  {/each}
</g>

<style>
  .icon :global(rect),
  .icon :global(circle),
  .icon :global(path:not(.line, .warn, .mark)) {
    fill: var(--role-soft);
    stroke: var(--role);
    stroke-width: 2;
  }
  .icon :global(circle.fill) {
    fill: var(--role);
  }
  .icon :global(.warn) {
    fill: #ef6c00;
    stroke: #b4530a;
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .icon :global(.mark) {
    fill: none;
    stroke: #fff;
    stroke-width: 2.6;
    stroke-linecap: round;
  }
  .icon :global(.line) {
    fill: none;
    stroke: var(--role);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
