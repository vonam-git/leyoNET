<script lang="ts">
  import { siteName } from '../../core';
  import { t } from '../../i18n';
  import { session } from '../state/session.svelte';

  /**
   * «Erkennen»: Die Lehrperson hat in der Admin-Konsole auf diese Session gezeigt. Der Bildschirm
   * blinkt einige Sekunden rot, damit sie im Schulzimmer sieht, wer an welcher Session arbeitet.
   */
  const SHOW_MS = 7000;
  let visible = $state(false);
  $effect(() => {
    const at = session.identify;
    if (!at) return;
    visible = true;
    const timer = setTimeout(() => (visible = false), Math.max(0, at + SHOW_MS - Date.now()));
    return () => clearTimeout(timer);
  });
  const site = $derived(session.site);
</script>

{#if visible}
  <button type="button" class="flash" onclick={() => (visible = false)} aria-live="assertive">
    <span class="card">
      <strong>{t('classLive.identify.title')}</strong>
      {#if site}<span class="seat">{siteName(site.seat, site.label)}</span>{/if}
      <span class="hint">{t('classLive.identify.hint')}</span>
    </span>
  </button>
{/if}

<style>
  .flash {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: grid;
    place-items: center;
    border: 14px solid #e11d48;
    background: color-mix(in srgb, #e11d48 18%, transparent);
    animation: blink 0.6s steps(2, jump-none) infinite;
    cursor: pointer;
    padding: 0;
    font: inherit;
  }
  .card {
    display: grid;
    gap: 8px;
    justify-items: center;
    padding: 28px 40px;
    border-radius: 16px;
    background: #e11d48;
    color: #fff;
    text-align: center;
    box-shadow: 0 10px 40px rgb(0 0 0 / 0.35);
  }
  strong {
    font-size: clamp(1.4rem, 3vw, 2.2rem);
  }
  .seat {
    font-size: clamp(2rem, 6vw, 4rem);
    font-weight: 800;
  }
  .hint {
    font-size: 0.9rem;
    opacity: 0.9;
  }
  @keyframes blink {
    0% {
      border-color: #e11d48;
      background: color-mix(in srgb, #e11d48 18%, transparent);
    }
    100% {
      border-color: transparent;
      background: transparent;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .flash {
      animation: none;
    }
  }
</style>
