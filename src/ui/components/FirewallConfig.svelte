<script lang="ts">
  import { DEVICE_SPECS, type Device, type FirewallConfig, type FirewallProtocol, type FirewallRule } from '../../core';
  import { t } from '../../i18n';
  import { interfaceLabel } from '../labels';
  import { editor } from '../state/editor.svelte';
  import { simStore } from '../state/sim.svelte';

  /**
   * Firewall eines Routers (weitergeleitete Pakete) oder Endgeräts (eingehende
   * Pakete): Regeln von oben nach unten, die erste passende gilt; sonst die
   * Standardregel. In der Simulation zeigen Zähler, welche Regel wie oft gegriffen hat.
   */
  let { device }: { device: Device } = $props();

  const isEndpoint = $derived(DEVICE_SPECS[device.type].role === 'endpoint');
  const config = $derived(device.firewall);
  const live = $derived((simStore.tick, editor.acting ? simStore.sim?.getDeviceState(device.id).firewall : undefined));
  const PROTOCOLS: FirewallProtocol[] = ['any', 'tcp', 'udp', 'icmp'];

  let draft = $state({ action: 'allow' as FirewallRule['action'], protocol: 'tcp' as FirewallProtocol, src: 'any', dst: 'any', port: '80', iface: '' });
  let error = $state<string | null>(null);

  function apply(next: FirewallConfig | null): boolean {
    const failure = editor.setFirewall(device.id, next);
    error = failure ? t(`error.${failure.code}`, failure.params) : null;
    return !failure;
  }

  function add(event: SubmitEvent) {
    event.preventDefault();
    if (!config) return;
    const withPort = draft.protocol === 'tcp' || draft.protocol === 'udp';
    const rule: FirewallRule = {
      action: draft.action,
      protocol: draft.protocol,
      src: draft.src,
      dst: draft.dst,
      ...(withPort && draft.port.trim() ? { port: Number(draft.port) } : {}),
      ...(draft.iface !== '' ? { iface: Number(draft.iface) } : {}),
    };
    if (apply({ ...config, rules: [...config.rules, rule] })) draft = { ...draft, src: 'any', dst: 'any' };
  }

  function move(index: number, delta: number) {
    if (!config) return;
    const rules = [...config.rules];
    const [rule] = rules.splice(index, 1);
    rules.splice(index + delta, 0, rule!);
    apply({ ...config, rules });
  }

  const remove = (index: number) => config && apply({ ...config, rules: config.rules.filter((_, i) => i !== index) });
  const what = (r: FirewallRule) => (r.protocol === 'any' ? t('firewall.anyProtocol') : r.protocol.toUpperCase()) + (r.port ? ` ${r.port}` : '');
</script>

<section class="firewall" data-help="firewall">
  <h3>{t('firewall.title')}</h3>
  <p class="muted">{t(isEndpoint ? 'firewall.scopeHost' : device.type === 'firewall' ? 'firewall.scopeDevice' : 'firewall.scopeRouter')}</p>

  {#if !config}
    <p class="muted">{t('firewall.off')}</p>
    <div class="buttons">
      <button disabled={!editor.editable} onclick={() => apply({ defaultAction: 'deny', rules: [] })}>🛡 {t('firewall.startDeny')}</button>
      <button disabled={!editor.editable} onclick={() => apply({ defaultAction: 'allow', rules: [] })}>{t('firewall.startAllow')}</button>
    </div>
  {:else}
    <fieldset class="default" disabled={!editor.editable}>
      <legend>{t('firewall.default')}</legend>
      <label><input type="radio" checked={config.defaultAction === 'allow'} onchange={() => apply({ ...config, defaultAction: 'allow' })} /> {t('firewall.action.allow')}</label>
      <label><input type="radio" checked={config.defaultAction === 'deny'} onchange={() => apply({ ...config, defaultAction: 'deny' })} /> {t('firewall.action.deny')}</label>
      {#if live}<span class="hits" title={t('firewall.hitsHint')}>{live.defaultHits}×</span>{/if}
    </fieldset>
    <label class="check">
      <input type="checkbox" checked={config.stateful !== false} disabled={!editor.editable} onchange={(e) => apply({ ...config, stateful: e.currentTarget.checked })} />
      {t('firewall.stateful')}
    </label>

    <form onsubmit={add}>
      <table>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">{t('firewall.col.action')}</th>
            <th scope="col">{t('firewall.col.what')}</th>
            <th scope="col">{t('firewall.col.src')}</th>
            <th scope="col">{t('firewall.col.dst')}</th>
            {#if !isEndpoint}<th scope="col">{t('firewall.col.iface')}</th>{/if}
            {#if live}<th scope="col" title={t('firewall.hitsHint')}>{t('firewall.col.hits')}</th>{/if}
            <th scope="col"><span class="visually-hidden">{t('routing.actions')}</span></th>
          </tr>
        </thead>
        <tbody>
          {#if config.rules.length === 0}<tr><td colspan="8" class="muted">{t('firewall.noRules')}</td></tr>{/if}
          {#each config.rules as rule, i (i)}
            <tr class="rule {rule.action}">
              <td>{i + 1}</td>
              <td><span class="badge">{t(`firewall.action.${rule.action}`)}</span></td>
              <td>{what(rule)}</td>
              <td class="mono">{rule.src === 'any' ? t('firewall.any') : rule.src}</td>
              <td class="mono">{rule.dst === 'any' ? t('firewall.any') : rule.dst}</td>
              {#if !isEndpoint}<td>{rule.iface !== undefined ? interfaceLabel(device, rule.iface) : t('firewall.any')}</td>{/if}
              {#if live}<td class="hits">{live.hits[i] ?? 0}</td>{/if}
              <td class="act">
                <button type="button" disabled={!editor.editable || i === 0} onclick={() => move(i, -1)} aria-label={t('firewall.up')} title={t('firewall.up')}>↑</button>
                <button type="button" disabled={!editor.editable || i === config.rules.length - 1} onclick={() => move(i, 1)} aria-label={t('firewall.down')} title={t('firewall.down')}>↓</button>
                <button type="button" disabled={!editor.editable} onclick={() => remove(i)} aria-label={t('firewall.remove')} title={t('firewall.remove')}>✕</button>
              </td>
            </tr>
          {/each}
          {#if editor.editable}
            <tr class="add">
              <td>+</td>
              <td>
                <select bind:value={draft.action} aria-label={t('firewall.col.action')}>
                  <option value="allow">{t('firewall.action.allow')}</option>
                  <option value="deny">{t('firewall.action.deny')}</option>
                </select>
              </td>
              <td class="what">
                <select bind:value={draft.protocol} aria-label={t('firewall.col.protocol')}>
                  {#each PROTOCOLS as p (p)}<option value={p}>{p === 'any' ? t('firewall.anyProtocol') : p.toUpperCase()}</option>{/each}
                </select>
                {#if draft.protocol === 'tcp' || draft.protocol === 'udp'}<input class="port" bind:value={draft.port} placeholder={t('firewall.allPorts')} aria-label={t('firewall.col.port')} inputmode="numeric" />{/if}
              </td>
              <td><input bind:value={draft.src} placeholder="any" aria-label={t('firewall.col.src')} spellcheck="false" /></td>
              <td><input bind:value={draft.dst} placeholder="192.168.2.80" aria-label={t('firewall.col.dst')} spellcheck="false" /></td>
              {#if !isEndpoint}
                <td>
                  <select bind:value={draft.iface} aria-label={t('firewall.col.iface')}>
                    <option value="">{t('firewall.any')}</option>
                    {#each device.interfaces as iface (iface.index)}<option value={String(iface.index)}>{interfaceLabel(device, iface.index)}</option>{/each}
                  </select>
                </td>
              {/if}
              <td><button type="submit" aria-label={t('firewall.add')} title={t('firewall.add')}>+</button></td>
            </tr>
          {/if}
        </tbody>
      </table>
    </form>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if live}<p class="muted">{t('firewall.blocked', { n: live.blocked, connections: live.connections })}</p>{/if}
    <p class="muted hint">{t('firewall.hint')}</p>
    <button class="off" disabled={!editor.editable} onclick={() => apply(null)}>{t('firewall.disable')}</button>
  {/if}
</section>

<style>
  .firewall {
    margin: 8px 0;
  }
  h3 {
    margin: 10px 0 4px;
    font-size: 0.9rem;
  }
  .muted {
    color: var(--muted);
    font-size: 0.8rem;
    margin: 4px 0;
  }
  .buttons {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .default {
    display: flex;
    gap: 14px;
    align-items: center;
    margin: 6px 0;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 0.85rem;
  }
  .default legend {
    font-size: 0.75rem;
    color: var(--muted);
  }
  .default label,
  .check {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .check {
    font-size: 0.8rem;
    margin: 4px 0 8px;
  }
  input[type='radio'],
  input[type='checkbox'] {
    width: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  th,
  td {
    text-align: left;
    padding: 3px 5px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  th {
    color: var(--muted);
    font-weight: normal;
  }
  .mono,
  input {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  input,
  select {
    width: 100%;
    min-width: 0;
    font-size: 0.78rem;
    padding: 2px 4px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .what {
    display: flex;
    gap: 3px;
  }
  .port {
    width: 5em;
  }
  .rule {
    box-shadow: inset 3px 0 0 var(--k);
  }
  .rule.allow {
    --k: #16a34a;
  }
  .rule.deny {
    --k: #dc2626;
  }
  .badge {
    font-weight: 600;
    color: var(--k);
  }
  .hits {
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  .act {
    white-space: nowrap;
  }
  .act button {
    padding: 0 5px;
  }
  .error {
    color: var(--danger);
    font-size: 0.8rem;
  }
  .hint {
    font-size: 0.75rem;
  }
  .off {
    margin-top: 6px;
  }
</style>
