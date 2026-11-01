<script lang="ts">
  import { t } from '../../i18n';
  import { openDemo } from '../demoRunner';
  import { tour } from '../state/tour.svelte';
  import { dialogs } from '../state/dialogs.svelte';
  import Avatar from './Avatar.svelte';
  import { DEMOS, DEMO_TOPICS, type Demo } from '../demos';
  import Modal from './Modal.svelte';

  /**
   * Demo-Netze: zu jedem Protokoll ein fertig konfigurierter Aufbau.
   * «Öffnen» lädt ihn in den Entwurf, «Vorführen» startet zusätzlich die
   * Simulation und löst die passende Aktion aus.
   */
  let { onclose }: { onclose: () => void } = $props();

  function choose(demo: Demo, present: boolean) {
    onclose();
    tour.stop();
    openDemo(demo, present);
  }

  function guide(demo: Demo) {
    onclose();
    tour.start(demo);
  }
</script>

<Modal title={t('demo.title')} {onclose} width={880}>
  <div class="intro">
    <button class="avatar-btn" onclick={() => dialogs.show('avatar')} title={t('avatar.edit')} aria-label={t('avatar.edit')}><Avatar config={tour.avatar} size={64} /></button>
    <p class="muted">{t('demo.intro')} {t('demo.introTour')}</p>
  </div>
  {#each DEMO_TOPICS as topic (topic)}
    <h3>{t(`demo.topic.${topic}`)}</h3>
    <ul>
      {#each DEMOS.filter((d) => d.topic === topic) as demo (demo.id)}
        <li>
          <div class="text">
            <strong>{t(`demo.${demo.id}.title`)}</strong>
            <span class="layers" aria-label={t('demo.layers')}>
              {#each demo.layers as n (n)}<span class="layer" style:background="var(--osi-{n})" title={t(`osi.${n}.name`)}>{n}</span>{/each}
            </span>
            <p class="muted">{t(`demo.${demo.id}.text`)}</p>
            <p class="show">▶ {t(`demo.${demo.id}.show`)}</p>
          </div>
          <div class="buttons">
            {#if demo.tour}<button class="guide" onclick={() => guide(demo)}>🧑‍🏫 {t('demo.guide')}</button>{/if}
            <button class="primary" onclick={() => choose(demo, true)}>▶ {t('demo.present')}</button>
            <button onclick={() => choose(demo, false)}>{t('demo.open')}</button>
          </div>
        </li>
      {/each}
    </ul>
  {/each}
</Modal>

<style>
  .intro {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .avatar-btn {
    padding: 0;
    border: none;
    background: none;
    border-radius: 50%;
  }
  .guide {
    background: color-mix(in srgb, #f59e0b 16%, var(--surface));
    border-color: #f59e0b;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
    gap: 8px;
  }
  li {
    display: flex;
    gap: 10px;
    justify-content: space-between;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }
  .text {
    min-width: 0;
  }
  .text p {
    margin: 4px 0 0;
    font-size: 0.8rem;
  }
  .show {
    color: var(--text);
    font-size: 0.78rem !important;
  }
  .layers {
    display: inline-flex;
    gap: 2px;
    margin-left: 6px;
    vertical-align: middle;
  }
  .layer {
    min-width: 15px;
    text-align: center;
    border-radius: 3px;
    color: #fff;
    font-size: 0.65rem;
    font-weight: 700;
  }
  .buttons {
    display: grid;
    gap: 4px;
    align-content: start;
    flex: none;
  }
  .buttons button {
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .primary {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
</style>
