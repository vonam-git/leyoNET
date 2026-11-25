<script lang="ts">
  import { setProtection, type Device } from '../../core';
  import { t } from '../../i18n';
  import { editor } from '../state/editor.svelte';
  import { simStore } from '../state/sim.svelte';

  /** Desktop, «Sicherheit»: Wächter (auffällige Ereignisse) und Schutz dieses Geräts. */
  let { device }: { device: Device } = $props();
  const sim = $derived((simStore.tick, simStore.sim?.getDeviceState(device.id)));
  const alerts = $derived([...(sim?.alerts ?? [])].reverse());
  let error = $state<string | null>(null);

  function toggle(key: 'arpGuard' | 'synCookies', on: boolean) {
    const result = setProtection(editor.topology, device.id, key, on);
    error = result.ok ? null : t(`error.${result.error.code}`);
    if (result.ok) editor.applyConfig(result.value);
  }
</script>

<div class="security" data-help="attacks">
  <h3><span class="ly">leyo</span><b>NET</b> {t('security.title')}</h3>
  <div class="protect">
    {#each ['arpGuard', 'synCookies'] as const as key (key)}
      <label class:on={device[key]}>
        <input type="checkbox" checked={!!device[key]} disabled={editor.viewOnly} onchange={(e) => toggle(key, e.currentTarget.checked)} />
        <span><b>{t(`security.${key}`)}</b><small>{t(`security.${key}.hint`)}</small></span>
      </label>
    {/each}
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <h4>{t('security.watch')}</h4>
  <ul role="log" aria-label={t('security.watch')}>
    {#each alerts as a (a.time + a.kind + (a.params.ip ?? ''))}
      <li class={a.kind === 'arpBlocked' ? 'ok' : 'bad'}>
        <code>{(a.time / 1000).toFixed(1)} s</code>
        <span>{t(`security.alert.${a.kind}`, a.params)}</span>
        {#if a.count > 1}<em>× {a.count}</em>{/if}
      </li>
    {:else}
      <li class="none">{t('security.quiet')}</li>
    {/each}
  </ul>
</div>

<style>
  .security {
    height: 100%;
    overflow: auto;
    padding: 12px 14px;
    background-color: var(--surface);
    background-image: radial-gradient(var(--border) 1px, transparent 1.3px);
    background-size: 18px 18px;
    font-size: 0.84rem;
  }
  h3 {
    margin: 0 0 10px;
    font: 700 1.05rem 'Courier New', Courier, monospace;
  }
  h4 {
    margin: 14px 0 6px;
    font: 700 0.9rem 'Courier New', Courier, monospace;
  }
  .ly {
    color: #8a8f98;
    font-weight: 400;
  }
  .protect {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    gap: 8px;
  }
  label {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 8px 10px;
    border: 2px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }
  label.on {
    border-color: var(--distribution);
    background: var(--distribution-soft);
  }
  small {
    display: block;
    color: var(--muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    padding: 5px 10px;
    border-left: 4px solid #8f1d24;
    border-radius: 6px;
    background: var(--surface);
  }
  li.ok,
  li.none {
    border-left-color: var(--distribution);
  }
  em {
    color: var(--muted);
    font-style: normal;
  }
  .error {
    color: var(--danger);
  }
</style>
