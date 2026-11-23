<script lang="ts">
  import { t } from '../../i18n';

  /**
   * Klassencode gross für den Beamer: nur der Klassencode und die Schritte zum Beitreten, damit
   * niemand aus Versehen einen Session-Code abschreibt.
   */
  let { code, label, onclose }: { code: string; label: string; onclose: () => void } = $props();
  let root: HTMLDivElement | undefined = $state();
  const address = typeof location !== 'undefined' ? `${location.host}` : '';
  const pretty = $derived(code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

  $effect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !document.fullscreenElement && onclose();
    window.addEventListener('keydown', key);
    root?.focus();
    return () => window.removeEventListener('keydown', key);
  });
  function fullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root?.requestFullscreen?.();
  }
</script>

<div class="big" bind:this={root} role="dialog" aria-modal="true" aria-label={t('classLive.big.title', { label })} tabindex="-1">
  <div class="tools">
    <button onclick={fullscreen} title={t('verbund.dash.fullscreen')}>⛶</button>
    <button onclick={onclose} aria-label={t('about.close')}>✕</button>
  </div>
  <p class="label">{t('classLive.big.title', { label })}</p>
  <p class="what">{t('classLive.big.what')}</p>
  <p class="code" aria-label={code.split('').join(' ')}>{pretty}</p>
  <ol class="steps">
    <li>{t('classLive.big.step1', { address })}</li>
    <li>{t('classLive.big.step2')}</li>
    <li>{t('classLive.big.step3')}</li>
  </ol>
  <p class="warn">{t('classLive.big.warn')}</p>
</div>

<style>
  .big {
    position: fixed;
    inset: 0;
    z-index: 2100;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.2vh;
    padding: 4vh 4vw;
    background: #0f172a;
    color: #e2e8f0;
    text-align: center;
    outline: none;
  }
  .tools {
    position: absolute;
    top: 16px;
    right: 16px;
    display: flex;
    gap: 8px;
  }
  .tools button {
    background: transparent;
    color: #e2e8f0;
    border: 1px solid #475569;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 1.1rem;
  }
  .label {
    margin: 0;
    font-size: clamp(1.2rem, 3vw, 2.4rem);
    font-weight: 600;
  }
  .what {
    margin: 0;
    font-size: clamp(1rem, 2.2vw, 1.8rem);
    color: #94a3b8;
  }
  .code {
    margin: 1vh 0;
    font: 800 clamp(3.5rem, 14vw, 13rem) / 1 ui-monospace, 'Cascadia Mono', Menlo, Consolas, monospace;
    letter-spacing: 0.06em;
    color: #fff;
  }
  .steps {
    margin: 0;
    padding-left: 1.4em;
    text-align: left;
    font-size: clamp(1rem, 2.2vw, 1.9rem);
    line-height: 1.5;
  }
  .warn {
    margin: 1vh 0 0;
    font-size: clamp(0.9rem, 1.6vw, 1.3rem);
    color: #fbbf24;
  }
</style>
