<script lang="ts">
  import { ATTACK_KINDS, setAttack, STRIDE, type AttackKind, type Device } from '../../core';
  import { t } from '../../i18n';
  import { editor } from '../state/editor.svelte';

  /** Entwurf: Angreifer einstellen (Angriff, Ziel, Beginn). */
  let { device }: { device: Device } = $props();
  let error = $state<string | null>(null);
  const a = $derived(device.attack);

  function change(next: { kind?: AttackKind | ''; target?: string; delay?: number }) {
    const kind = next.kind ?? a?.kind ?? '';
    const result = setAttack(editor.topology, device.id, kind ? { kind, target: next.target ?? a?.target ?? '', delay: next.delay ?? a?.delay ?? 2 } : null);
    error = result.ok ? null : t(`error.${result.error.code}`);
    if (result.ok) editor.applyConfig(result.value);
  }
</script>

<section class="attacker" data-help="attacks">
  <h3>{t('attack.title')}</h3>
  <p class="muted">{t('attack.only')}</p>
  <label
    >{t('attack.kind')}
    <select value={a?.kind ?? ''} disabled={!editor.editable} onchange={(e) => change({ kind: e.currentTarget.value as AttackKind | '' })}>
      <option value="">{t('attack.none')}</option>
      {#each ATTACK_KINDS as k (k)}<option value={k}>{t(`attack.kind.${k}`)} ({t(`attack.stride.${STRIDE[k]}`)})</option>{/each}
    </select></label
  >
  {#if a}
    <p class="muted">{t(`attack.hint.${a.kind}`)}</p>
    <label>{t('attack.target')}<input value={a.target ?? ''} maxlength="60" placeholder={t('attack.targetAuto')} disabled={!editor.editable} onchange={(e) => change({ target: e.currentTarget.value })} /></label>
    <label>{t('attack.delay')}<input type="number" min="0" max="600" value={a.delay ?? 2} disabled={!editor.editable} onchange={(e) => change({ delay: Math.round(Number(e.currentTarget.value)) })} /></label>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>

<style>
  .attacker {
    padding: 8px 10px;
    margin-bottom: 10px;
    border: 1px solid var(--border);
    border-left: 4px solid #8f1d24;
    border-radius: 8px;
  }
  h3 {
    margin: 0 0 4px;
    font: 700 0.95rem 'Courier New', Courier, monospace;
  }
  label {
    display: grid;
    gap: 2px;
    margin: 6px 0;
    font-size: 0.8rem;
  }
  .muted {
    margin: 2px 0;
    font-size: 0.76rem;
    color: var(--muted);
  }
  .error {
    color: var(--danger);
  }
</style>
