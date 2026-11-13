<script lang="ts">
  import type { VNode } from '../aufbau';
  import Tree from './Tree.svelte';

  /** Zeichnet einen Baum aus aufbau.ts. Texte bleiben Text (kein HTML). */
  let { node }: { node: VNode } = $props();
</script>

{#if node.tag === '#text'}{node.text}{:else}<svelte:element this={node.tag} class={node.cls} title={node.title} {...node.attrs}
    >{#each node.children ?? [] as child, i (i)}<Tree node={child} />{/each}</svelte:element
  >{/if}
