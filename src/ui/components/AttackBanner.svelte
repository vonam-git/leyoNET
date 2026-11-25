<script lang="ts">
  import { t } from '../../i18n';
  import { session } from '../state/session.svelte';
  import { editor } from '../state/editor.svelte';
  import { examMode } from '../state/exam.svelte';

  /** Lernende: Die Lehrperson hat ein Sicherheits-Szenario gestartet. Welcher Angriff es ist, finden sie selbst heraus. */
  const shown = $derived(!!session.attack && !session.watching && !examMode.active);
  const effect = $derived(session.attackEffect);
</script>

{#if shown}
  <div class="attack" class:done={effect === 'blocked'} role="status">
    <strong>{t(effect === 'blocked' ? 'attack.banner.blocked' : effect === 'noTarget' ? 'attack.banner.noTarget' : 'attack.banner.running')}</strong>
    <span>{t(effect === 'blocked' ? 'attack.banner.blockedHint' : effect === 'noTarget' ? 'attack.banner.noTargetHint' : 'attack.banner.runningHint')}</span>
    {#if effect !== 'blocked' && editor.mode === 'design'}<button onclick={() => editor.setMode('simulation')}>{t('attack.banner.look')}</button>{/if}
  </div>
{/if}

<style>
  .attack {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
    padding: 6px 14px;
    font-size: 0.85rem;
    color: #fff;
    background: #8f1d24;
    border-bottom: 1px solid #6d141a;
  }
  .attack.done {
    background: #136a3c;
    border-color: #0e5430;
  }
  strong {
    font-family: 'Courier New', Courier, monospace;
  }
  button {
    margin-left: auto;
    min-height: 0;
    padding: 2px 10px;
  }
</style>
