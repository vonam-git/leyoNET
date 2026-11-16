<script lang="ts">
  import type { Device } from '../../core';
  import { t } from '../../i18n';
  import { simStore } from '../state/sim.svelte';

  /**
   * Das IP-Telefon in der Simulation: Anzeige, Wähltastatur, Anrufen und Auflegen.
   * Gewählt wird eine Rufnummer (über die Telefonanlage bzw. den SIP-Provider) oder eine
   * IP-Adresse (direkt). Nach dem Gespräch: Verlust, Laufzeit, Jitter und Qualität.
   */
  let { device }: { device: Device } = $props();

  let dial = $state('');
  const voip = $derived((simStore.tick, simStore.sim?.getDeviceState(device.id).voip));
  const call = $derived(voip?.call);
  const busy = $derived(!!call && (call.phase === 'calling' || call.phase === 'ringing' || call.phase === 'active'));
  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'] as const;

  function press(key: string) {
    if (dial.length < 24) dial += key;
  }

  function start(event?: SubmitEvent) {
    event?.preventDefault();
    const target = dial.trim();
    if (!target || busy) return;
    simStore.sim?.call(device.id, target, 60);
  }

  function hangup() {
    simStore.sim?.hangup(device.id);
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && busy) {
      event.stopPropagation();
      hangup();
    }
  }
</script>

<div class="phone">
  <div class="screen" role="status" aria-live="polite">
    <div class="line top">
      <span>{voip?.number ? t('phone.number', { number: voip.number }) : t('phone.noNumber')}</span>
      <span class="reg" class:on={voip?.registered}>{voip?.server ? t(voip.registered ? 'phone.registered' : 'phone.unregistered') : t('phone.direct')}</span>
    </div>
    <div class="big">
      {#if call && busy}
        {t(`phone.phase.${call.phase}`, { peer: call.peer })}
      {:else if call?.phase === 'failed'}
        {t('phone.failed', { peer: call.peer, reason: call.reason ?? '' })}
      {:else}
        {dial || t('phone.ready')}
      {/if}
    </div>
    {#if call && (call.phase === 'active' || call.phase === 'ended')}
      {@const s = call.stats}
      <div class="line stats">
        <span>{t('phone.loss', { loss: s.loss })}</span>
        <span>{t('phone.delay', { delay: s.delay })}</span>
        <span>{t('phone.jitter', { jitter: s.jitter })}</span>
        <span class="q-{s.quality}">{t(`voip.quality.${s.quality}`)}</span>
      </div>
    {/if}
  </div>

  <form class="dial" onsubmit={start}>
    <input bind:value={dial} {onkeydown} inputmode="tel" spellcheck="false" autocomplete="off" maxlength="24" placeholder={t('phone.placeholder')} aria-label={t('phone.placeholder')} />
    <button type="button" class="ghost" onclick={() => (dial = dial.slice(0, -1))} aria-label={t('phone.delete')} title={t('phone.delete')}>⌫</button>
  </form>

  <div class="keypad">
    {#each KEYS as key (key)}
      <button type="button" onclick={() => press(key)}>{key}</button>
    {/each}
  </div>

  <div class="actions">
    <button type="button" class="call" onclick={() => start()} disabled={busy || !dial.trim()}>📞 {t('voip.call')}</button>
    <button type="button" class="end" onclick={hangup} disabled={!busy}>{t('voip.hangup')}</button>
  </div>
  <p class="muted hint">{t('phone.hint')}</p>
</div>

<style>
  .phone {
    padding: 10px 12px;
    display: grid;
    gap: 7px;
    max-width: 340px;
    margin: 0 auto;
  }
  .screen {
    background: #1d2a22;
    color: #c8f0d4;
    border-radius: 8px;
    padding: 8px 10px;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    min-height: 72px;
    display: grid;
    gap: 4px;
  }
  .line {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.75rem;
    flex-wrap: wrap;
  }
  .reg {
    opacity: 0.7;
  }
  .reg.on {
    opacity: 1;
  }
  .big {
    font-size: 1.15rem;
    min-height: 1.6em;
    word-break: break-all;
  }
  .q-good {
    color: #7ee29c;
  }
  .q-fair {
    color: #f3c969;
  }
  .q-poor {
    color: #ff8f8f;
  }
  .dial {
    display: flex;
    gap: 6px;
  }
  .dial input {
    flex: 1;
    font-size: 1rem;
    letter-spacing: 0.05em;
  }
  .keypad {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }
  .keypad button {
    font-size: 1rem;
    padding: 3px 0;
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .call:not(:disabled) {
    background: var(--ok, #2e9e5b);
    color: #fff;
    border-color: transparent;
  }
  .end:not(:disabled) {
    background: var(--danger, #c0392b);
    color: #fff;
    border-color: transparent;
  }
  .hint {
    font-size: 0.75rem;
    margin: 0;
  }
</style>
