<script lang="ts">
  import { LB_METHODS, setLoadBalancer, type Device, type LbMethod, type LoadBalancerConfig } from '../../core';
  import { t } from '../../i18n';
  import { editor } from '../state/editor.svelte';
  import { simStore } from '../state/sim.svelte';

  /**
   * Load Balancer auf einem Server: Port, Verfahren, Server dahinter und Health Check.
   * In der Simulation zusätzlich, welche Server erreichbar sind und wie viele Verbindungen sie bekamen.
   */
  let { device }: { device: Device } = $props();

  const config = $derived(device.loadBalancer);
  const locked = $derived(editor.viewOnly);
  const live = $derived((simStore.tick, editor.acting && config ? simStore.sim?.getDeviceState(device.id).loadBalancer : undefined));
  let error = $state<string | null>(null);
  let draft = $state({ ip: '', port: '' });

  function apply(next: LoadBalancerConfig | null): boolean {
    const result = setLoadBalancer(editor.topology, device.id, next);
    if (!result.ok) {
      error = t(`error.${result.error.code}`, result.error.params);
      return false;
    }
    error = null;
    editor.applyConfig(result.value);
    return true;
  }

  function toggle(on: boolean) {
    apply(on ? { port: 80, method: 'roundRobin', backends: [] } : null);
  }

  function add(event: SubmitEvent) {
    event.preventDefault();
    if (!config) return;
    const port = draft.port.trim() ? Number(draft.port) : undefined;
    if (apply({ ...config, backends: [...config.backends, { ip: draft.ip, ...(port !== undefined ? { port } : {}) }] })) draft = { ip: '', port: '' };
  }
</script>

<label class="service">
  <input type="checkbox" checked={!!config} disabled={locked} onchange={(e) => toggle(e.currentTarget.checked)} />
  <span><b>{t('lb.enable')}</b><small>{t('lb.hint')}</small></span>
</label>

{#if config}
  <div class="row">
    <label>{t('lb.port')} <input class="num" type="number" min="1" max="65535" value={config.port} disabled={locked} onchange={(e) => apply({ ...config, port: Number(e.currentTarget.value) })} /></label>
    <label>
      {t('lb.method')}
      <select value={config.method} disabled={locked} onchange={(e) => apply({ ...config, method: e.currentTarget.value as LbMethod })}>
        {#each LB_METHODS as m (m)}<option value={m}>{t(`lb.method.${m}`)}</option>{/each}
      </select>
    </label>
    <label title={t('lb.healthHint')}>
      <input type="checkbox" checked={config.healthCheck !== false} disabled={locked} onchange={(e) => apply(e.currentTarget.checked ? (({ healthCheck: _h, ...rest }) => rest)(config) : { ...config, healthCheck: false })} />
      {t('lb.health')}
    </label>
  </div>
  <p class="muted">{t(`lb.method.${config.method}.hint`)}</p>

  <h4>{t('lb.backends')}</h4>
  {#if config.backends.length}
    <table>
      <thead>
        <tr>
          <th scope="col">{t('lb.server')}</th>
          <th scope="col">{t('lb.port')}</th>
          {#if live}<th scope="col">{t('lb.status')}</th><th scope="col">{t('lb.active')}</th><th scope="col">{t('lb.total')}</th>{/if}
          <th scope="col"><span class="visually-hidden">{t('lb.remove')}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each config.backends as b, i (`${b.ip}|${b.port ?? ''}`)}
          {@const s = live?.backends[i]}
          <tr>
            <td class="mono">{b.ip}</td>
            <td>{b.port ?? config.port}</td>
            {#if live}
              <td><span class="state" class:up={s?.up} class:down={s && !s.up}>{t(s?.up ? 'lb.up' : 'lb.down')}</span></td>
              <td>{s?.active ?? 0}</td>
              <td>{s?.total ?? 0}</td>
            {/if}
            <td><button class="small" disabled={locked} aria-label={t('lb.remove')} title={t('lb.remove')} onclick={() => apply({ ...config, backends: config.backends.filter((_, k) => k !== i) })}>✕</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <p class="muted">{t('lb.none')}</p>
  {/if}
  {#if !locked}
    <form class="row" onsubmit={add}>
      <input bind:value={draft.ip} placeholder="192.168.1.101" aria-label={t('lb.server')} spellcheck="false" autocomplete="off" />
      <input class="num" bind:value={draft.port} placeholder={String(config.port)} aria-label={t('lb.port')} inputmode="numeric" />
      <button type="submit" disabled={!draft.ip.trim()}>{t('lb.add')}</button>
    </form>
  {/if}
{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}

<style>
  .service {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  small {
    display: block;
    color: var(--muted);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-top: 8px;
  }
  .num {
    width: 5.5rem;
  }
  h4 {
    margin: 12px 0 4px;
    font-size: 0.85rem;
  }
  table {
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  th,
  td {
    padding: 3px 8px;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }
  .state {
    padding: 1px 6px;
    border-radius: 8px;
    border: 1px solid var(--border);
  }
  .state.up {
    background: color-mix(in srgb, #1f8a4c 22%, transparent);
    border-color: #1f8a4c;
  }
  .state.down {
    background: color-mix(in srgb, #8f1d24 20%, transparent);
    border-color: #8f1d24;
  }
  .error {
    color: var(--danger);
  }
</style>
