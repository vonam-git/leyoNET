<script lang="ts">
  import { t } from '../../i18n';
  import { identify } from '../identify.svelte';

  /**
   * «Erkennen»: lässt den Bildschirm einer Klassen-Session rot blinken und zeigt auf dem Knopf,
   * ob der Auftrag noch unterwegs ist und wie lange es noch blinkt.
   */
  let { admin, code, disabled = false, onerror }: { admin: string; code: string; disabled?: boolean; onerror?: () => void } = $props();

  const run = $derived(identify.label(code));

  async function click() {
    try {
      await identify.start(admin, code);
    } catch {
      onerror?.();
    }
  }
</script>

<button
  class="identify"
  class:blinking={run?.phase === 'shown'}
  onclick={click}
  disabled={disabled || !!run}
  title={t('classLive.identify.hint2', { n: identify.seconds })}
  aria-live="polite"
>
  {#if run?.phase === 'pending'}
    ⏳ {t('classLive.identify.pending')}
  {:else if run?.phase === 'shown'}
    🔴 {t('classLive.identify.left', { n: run.left })}
  {:else if run?.phase === 'missed'}
    ⚠️ {t('classLive.identify.missed')}
  {:else}
    🔴 {t('classLive.identify.button')}
  {/if}
</button>

<style>
  .identify {
    font-variant-numeric: tabular-nums;
  }
  .identify.blinking:disabled {
    opacity: 1;
    color: #fff;
    background: #e11d48;
    border-color: #e11d48;
  }
</style>
