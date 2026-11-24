<script lang="ts">
  import { t } from '../../i18n';
  import { IDENTIFY_CHOICES, identify } from '../identify.svelte';

  /** Blinkdauer für «Erkennen» wählen (gilt für alle Knöpfe, im Browser gemerkt). */
</script>

<label class="identify-seconds" title={t('classLive.identify.durationHint')}>
  🔴 {t('classLive.identify.duration')}
  <select value={identify.seconds} onchange={(e) => identify.setSeconds(Number(e.currentTarget.value))}>
    {#each IDENTIFY_CHOICES as n (n)}
      <option value={n}>{t('classLive.identify.seconds', { n })}</option>
    {/each}
  </select>
</label>

<style>
  .identify-seconds {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
</style>
