<script lang="ts">
  import { t } from '../../i18n';
  import { dialogs } from '../state/dialogs.svelte';
  import { tour } from '../state/tour.svelte';
  import Avatar from './Avatar.svelte';

  /**
   * Geführte Demo: Der Avatar erklärt den Testfall in einer Sprechblase,
   * Schritt für Schritt mit «Zurück» und «Weiter».
   */
  const text = $derived(tour.demo ? t(`demo.${tour.demo.id}.tour.${tour.step}`) : '');
  const last = $derived(tour.step >= tour.steps.length - 1);

  // Kurz «sprechen», wenn ein neuer Schritt beginnt.
  let talking = $state(false);
  $effect(() => {
    void text;
    talking = true;
    const timer = setTimeout(() => (talking = false), Math.min(4000, 600 + text.length * 25));
    return () => clearTimeout(timer);
  });

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      tour.stop();
    }
  }
</script>

{#if tour.demo}
  <div class="tour" role="dialog" aria-labelledby="tour-title" aria-describedby="tour-text" tabindex="-1" {onkeydown}>
    <button class="avatar-btn" onclick={() => dialogs.show('avatar')} title={t('avatar.edit')} aria-label={t('avatar.edit')}>
      <Avatar config={tour.avatar} size={84} {talking} />
    </button>
    <div class="bubble">
      <div class="head">
        <strong id="tour-title">{t(`demo.${tour.demo.id}.title`)}</strong>
        <span class="muted">{t('tour.step', { n: tour.step + 1, total: tour.steps.length })}</span>
      </div>
      <p id="tour-text" aria-live="polite">{text}</p>
      <div class="buttons">
        <button onclick={() => tour.back()} disabled={tour.step === 0}>‹ {t('tour.back')}</button>
        <button class="primary" onclick={() => tour.next()}>{last ? t('tour.finish') : `${t('tour.next')} ›`}</button>
        <button class="ghost" onclick={() => tour.stop()} aria-label={t('tour.close')} title={t('tour.close')}>✕</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .tour {
    position: fixed;
    left: 14px;
    bottom: 14px;
    /* Über Geräte-Fenstern und Meldungen, damit «Weiter» immer erreichbar bleibt. */
    z-index: 60;
    display: flex;
    align-items: flex-end;
    gap: 8px;
    max-width: min(560px, calc(100vw - 28px));
  }
  .avatar-btn {
    padding: 0;
    border: none;
    background: none;
    border-radius: 50%;
    filter: drop-shadow(0 6px 14px rgba(15, 23, 42, 0.25));
  }
  .bubble {
    position: relative;
    padding: 10px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px 14px 14px 4px;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.22);
  }
  .head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 0.82rem;
  }
  p {
    margin: 6px 0 8px;
    font-size: 0.86rem;
    line-height: 1.45;
    white-space: pre-line;
  }
  .buttons {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }
  .buttons button {
    font-size: 0.8rem;
  }
  .primary {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
  .ghost {
    border-color: transparent;
    background: transparent;
    color: var(--muted);
  }
  .muted {
    color: var(--muted);
  }
</style>
