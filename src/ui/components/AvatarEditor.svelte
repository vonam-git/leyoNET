<script lang="ts">
  import { t } from '../../i18n';
  import { BEARDS, DEFAULT_AVATAR, EXTRAS, GLASSES, HAIR_COLORS, HAIR_STYLES, SHIRTS, SKINS, randomAvatar } from '../avatar';
  import { tour } from '../state/tour.svelte';
  import Avatar from './Avatar.svelte';
  import Modal from './Modal.svelte';

  /** Avatar der Lehrperson einstellen; gilt nur in diesem Browser. */
  let { onclose }: { onclose: () => void } = $props();
  const a = $derived(tour.avatar);
</script>

<Modal title={t('avatar.title')} {onclose} width={560}>
  <div class="layout">
    <div class="preview"><Avatar config={a} size={150} talking /></div>
    <div class="options">
      <fieldset>
        <legend>{t('avatar.skin')}</legend>
        {#each SKINS as color, i (color)}
          <button class="swatch" style:background={color} aria-pressed={a.skin === i} aria-label={t('avatar.skinN', { n: i + 1 })} onclick={() => tour.setAvatar({ skin: i })}></button>
        {/each}
      </fieldset>
      <fieldset>
        <legend>{t('avatar.hair')}</legend>
        {#each HAIR_STYLES as style (style)}
          <button class="chip" aria-pressed={a.hair === style} onclick={() => tour.setAvatar({ hair: style })}>{t(`avatar.hair.${style}`)}</button>
        {/each}
      </fieldset>
      <fieldset>
        <legend>{t('avatar.hairColor')}</legend>
        {#each HAIR_COLORS as color, i (color)}
          <button class="swatch" style:background={color} aria-pressed={a.hairColor === i} aria-label={t('avatar.colorN', { n: i + 1 })} onclick={() => tour.setAvatar({ hairColor: i })}></button>
        {/each}
      </fieldset>
      <fieldset>
        <legend>{t('avatar.beard')}</legend>
        {#each BEARDS as beard (beard)}
          <button class="chip" aria-pressed={a.beard === beard} onclick={() => tour.setAvatar({ beard })}>{t(`avatar.beard.${beard}`)}</button>
        {/each}
      </fieldset>
      <fieldset>
        <legend>{t('avatar.glasses')}</legend>
        {#each GLASSES as glasses (glasses)}
          <button class="chip" aria-pressed={a.glasses === glasses} onclick={() => tour.setAvatar({ glasses })}>{t(`avatar.glasses.${glasses}`)}</button>
        {/each}
      </fieldset>
      <fieldset>
        <legend>{t('avatar.shirt')}</legend>
        {#each SHIRTS as color, i (color)}
          <button class="swatch" style:background={color} aria-pressed={a.shirt === i} aria-label={t('avatar.colorN', { n: i + 1 })} onclick={() => tour.setAvatar({ shirt: i })}></button>
        {/each}
      </fieldset>
      <fieldset>
        <legend>{t('avatar.extra')}</legend>
        {#each EXTRAS as extra (extra)}
          <button class="chip" aria-pressed={a.extra === extra} onclick={() => tour.setAvatar({ extra })}>{t(`avatar.extra.${extra}`)}</button>
        {/each}
      </fieldset>
    </div>
  </div>
  <p class="muted">{t('avatar.privacy')}</p>
  {#snippet actions()}
    <button onclick={() => tour.setAvatar(randomAvatar())}>🎲 {t('avatar.random')}</button>
    <button onclick={() => tour.setAvatar(DEFAULT_AVATAR)}>{t('avatar.reset')}</button>
  {/snippet}
</Modal>

<style>
  .layout {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 18px;
    align-items: start;
  }
  .options {
    display: grid;
    gap: 6px;
  }
  fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 0;
    padding: 0;
    border: none;
  }
  legend {
    width: 100%;
    margin-bottom: 2px;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .swatch {
    width: 24px;
    height: 24px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid var(--border);
  }
  .swatch[aria-pressed='true'] {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--selected-soft);
  }
  .chip {
    font-size: 0.76rem;
    padding: 2px 8px;
    border-radius: 999px;
  }
  .chip[aria-pressed='true'] {
    background: var(--selected-soft);
    border-color: var(--accent);
  }
  @media (max-width: 560px) {
    .layout {
      grid-template-columns: 1fr;
      justify-items: center;
    }
  }
</style>
