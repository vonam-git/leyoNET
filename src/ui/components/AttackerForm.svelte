<script lang="ts">
  import { ATTACK_KINDS, setAttack, STRIDE, type AttackKind, type Device } from '../../core';
  import { t } from '../../i18n';
  import { editor } from '../state/editor.svelte';

  /** Entwurf: Angreifer einstellen (Angriff, Ziel, Beginn); Aussehen wie «Klassen-Verbund» und die IP-Konfiguration. */
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
  <h3>⚠ {t('attack.title')}</h3>
  <p class="muted">{t('attack.only')}</p>
  <label class="field">
    <span>{t('attack.kind')}</span>
    <select value={a?.kind ?? ''} disabled={!editor.editable} onchange={(e) => change({ kind: e.currentTarget.value as AttackKind | '' })}>
      <option value="">{t('attack.none')}</option>
      {#each ATTACK_KINDS as k (k)}<option value={k}>{t(`attack.kind.${k}`)}</option>{/each}
    </select>
  </label>
  {#if a}
    <p class="stride">{t(`attack.stride.${STRIDE[a.kind]}`)}</p>
    <p class="muted">{t(`attack.hint.${a.kind}`)}</p>
    <label class="field">
      <span>{t('attack.target')}</span>
      <input value={a.target ?? ''} maxlength="60" placeholder={t('attack.targetAuto')} spellcheck="false" autocomplete="off" disabled={!editor.editable} onchange={(e) => change({ target: e.currentTarget.value })} />
    </label>
    <label class="field">
      <span>{t('attack.delay')}</span>
      <input type="number" min="0" max="600" value={a.delay ?? 2} disabled={!editor.editable} onchange={(e) => change({ delay: Math.round(Number(e.currentTarget.value)) })} />
    </label>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>

<style>
  .attacker {
    margin: 8px 0;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-left: 3px solid #ef6c00;
    border-radius: 6px;
    font-size: 0.85rem;
    min-width: 0;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 0.9rem;
  }
  .field {
    display: grid;
    /* minmax(0, …): Ein langer Eintrag im Auswahlfeld darf die Leiste nie verbreitern. */
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
    margin-bottom: 8px;
    font-size: 0.8rem;
  }
  select,
  input {
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    padding: 5px 8px;
    font-size: 0.9rem;
    font-family: inherit;
    text-overflow: ellipsis;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .muted {
    margin: 4px 0;
    font-size: 0.78rem;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .stride {
    display: inline-block;
    max-width: 100%;
    box-sizing: border-box;
    margin: 0 0 4px;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 0.75rem;
    background: var(--routing-soft);
    color: var(--text);
    overflow-wrap: anywhere;
  }
  .error {
    margin: 4px 0 0;
    font-size: 0.8rem;
    color: var(--danger);
  }
</style>
