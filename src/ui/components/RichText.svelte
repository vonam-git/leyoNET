<script lang="ts">
  import { parseInline, parseRich, type Inline } from '../richText';

  /** Aufgabentext mit einfacher Auszeichnung (Absätze, Listen, fett, Befehle, Adressen); immer als Text ausgegeben. */
  let { text, inline = false }: { text: string; inline?: boolean } = $props();
  const blocks = $derived(inline ? [] : parseRich(text));
  const parts = $derived(inline ? parseInline(text) : []);
</script>

{#snippet line(items: Inline[])}{#each items as part, i (i)}{#if part.kind === 'bold'}<strong>{part.text}</strong>{:else if part.kind === 'code'}<code>{part.text}</code>{:else if part.kind === 'addr'}<code class="addr">{part.text}</code>{:else}{part.text}{/if}{/each}{/snippet}

{#if inline}
  {@render line(parts)}
{:else}
  <div class="rich">
    {#each blocks as block, i (i)}
      {#if block.kind === 'p'}
        <p>{@render line(block.parts)}</p>
      {:else if block.kind === 'ul'}
        <ul>{#each block.items as item, j (j)}<li>{@render line(item)}</li>{/each}</ul>
      {:else}
        <ol>{#each block.items as item, j (j)}<li>{@render line(item)}</li>{/each}</ol>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .rich p {
    margin: 0 0 0.55em;
    line-height: 1.5;
  }
  .rich ul,
  .rich ol {
    margin: 0 0 0.6em;
    padding-left: 1.3em;
    line-height: 1.5;
  }
  code {
    font-family: var(--mono, ui-monospace, monospace);
    font-size: 0.92em;
    padding: 0 4px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--text) 8%, transparent);
    white-space: nowrap;
  }
  code.addr {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: color-mix(in srgb, var(--accent) 75%, var(--text));
  }
</style>
