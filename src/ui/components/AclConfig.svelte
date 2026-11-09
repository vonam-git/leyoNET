<script lang="ts">
  import { ACL_NAME, formatAclRule, type Device, type FirewallProtocol, type FirewallRule } from '../../core';
  import { t } from '../../i18n';
  import { interfaceLabel } from '../labels';
  import { editor } from '../state/editor.svelte';
  import { simStore } from '../state/sim.svelte';

  /**
   * Zugriffslisten (ACL) eines Switches: benannte Regellisten, zustandslos, mit
   * implizitem «deny» am Ende. Wirksam erst, wenn eine Liste einem Port für
   * eingehende Pakete zugewiesen ist. Dasselbe geht auf der Befehlszeile
   * («ip access-list extended NAME», «ip access-group NAME in»).
   */
  let { device }: { device: Device } = $props();

  const acls = $derived(device.acls ?? []);
  const live = $derived((simStore.tick, editor.acting ? simStore.sim?.getDeviceState(device.id).acls : undefined));
  const PROTOCOLS: FirewallProtocol[] = ['any', 'tcp', 'udp', 'icmp'];
  const ports = $derived(device.interfaces.filter((i) => !i.sfpSlot || i.sfp));

  let newName = $state('');
  let drafts = $state<Record<string, { action: FirewallRule['action']; protocol: FirewallProtocol; src: string; dst: string; port: string }>>({});
  let error = $state<string | null>(null);

  const fresh = () => ({ action: 'allow' as const, protocol: 'tcp' as FirewallProtocol, src: 'any', dst: 'any', port: '80' });
  // Jede Liste hat ihre eigene Eingabezeile.
  $effect.pre(() => {
    for (const acl of acls) if (!drafts[acl.name]) drafts[acl.name] = fresh();
  });

  function report(failure: { code: string; params?: Record<string, string | number> } | null): boolean {
    error = failure ? t(`error.${failure.code}`, failure.params) : null;
    return !failure;
  }

  function create(event: SubmitEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (acls.some((a) => a.name === name)) return report({ code: 'aclExists', params: { name } });
    if (report(editor.setAccessList(device.id, name, []))) newName = '';
  }

  function addRule(event: SubmitEvent, name: string, rules: FirewallRule[]) {
    event.preventDefault();
    const d = drafts[name] ?? fresh();
    const withPort = d.protocol === 'tcp' || d.protocol === 'udp';
    const rule: FirewallRule = { action: d.action, protocol: d.protocol, src: d.src, dst: d.dst, ...(withPort && d.port.trim() ? { port: Number(d.port) } : {}) };
    if (report(editor.setAccessList(device.id, name, [...rules, rule]))) drafts[name] = { ...d, src: 'any', dst: 'any' };
  }

  function move(name: string, rules: FirewallRule[], index: number, delta: number) {
    const next = [...rules];
    const [rule] = next.splice(index, 1);
    next.splice(index + delta, 0, rule!);
    report(editor.setAccessList(device.id, name, next));
  }

  const removeRule = (name: string, rules: FirewallRule[], index: number) => report(editor.setAccessList(device.id, name, rules.filter((_, i) => i !== index)));
  const removeAcl = (name: string) => report(editor.setAccessList(device.id, name, null));
  const bind = (iface: number, value: string) => report(editor.setPortAccessList(device.id, iface, value || null));
  const what = (r: FirewallRule) => (r.protocol === 'any' ? t('firewall.anyProtocol') : r.protocol.toUpperCase()) + (r.port ? ` ${r.port}` : '');
  const bindSvi = (vlan: number, direction: 'in' | 'out', value: string) => report(editor.setSviAccessList(device.id, vlan, direction, value || null));
  const svis = $derived(device.type === 'l3switch' ? (device.svis ?? []) : []);
  const usedOn = (name: string) => [
    ...device.interfaces.filter((i) => i.aclIn === name).map((i) => interfaceLabel(device, i.index)),
    ...svis.flatMap((v) => [...(v.aclIn === name ? [`Vlan${v.vlan} in`] : []), ...(v.aclOut === name ? [`Vlan${v.vlan} out`] : [])]),
  ];
</script>

<section class="acl" data-help="acl">
  <h3>{t('acl.title')}</h3>
  <p class="muted">{t('acl.intro')}</p>

  {#each acls as acl (acl.name)}
    {@const hits = live?.find((a) => a.name === acl.name)}
    {@const draft = drafts[acl.name]}
    <div class="list">
      <header>
        <strong class="mono">{acl.name}</strong>
        <span class="muted">{usedOn(acl.name).length ? t('acl.usedOn', { ports: usedOn(acl.name).join(', ') }) : t('acl.unused')}</span>
        <button type="button" class="del" disabled={!editor.editable} onclick={() => removeAcl(acl.name)} aria-label={t('acl.delete', { name: acl.name })} title={t('acl.delete', { name: acl.name })}>✕</button>
      </header>
      <form onsubmit={(e) => addRule(e, acl.name, acl.rules)}>
        <table>
          <thead>
            <tr>
              <th scope="col">{t('acl.col.seq')}</th>
              <th scope="col">{t('firewall.col.action')}</th>
              <th scope="col">{t('firewall.col.what')}</th>
              <th scope="col">{t('firewall.col.src')}</th>
              <th scope="col">{t('firewall.col.dst')}</th>
              {#if hits}<th scope="col" title={t('firewall.hitsHint')}>{t('firewall.col.hits')}</th>{/if}
              <th scope="col"><span class="visually-hidden">{t('routing.actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {#each acl.rules as rule, i (i)}
              <tr class="rule {rule.action}" title={formatAclRule(rule)}>
                <td>{(i + 1) * 10}</td>
                <td><span class="badge">{t(`acl.action.${rule.action}`)}</span></td>
                <td>{what(rule)}</td>
                <td class="mono">{rule.src === 'any' ? t('firewall.any') : rule.src}</td>
                <td class="mono">{rule.dst === 'any' ? t('firewall.any') : rule.dst}</td>
                {#if hits}<td class="hits">{hits.hits[i] ?? 0}</td>{/if}
                <td class="act">
                  <button type="button" disabled={!editor.editable || i === 0} onclick={() => move(acl.name, acl.rules, i, -1)} aria-label={t('firewall.up')} title={t('firewall.up')}>↑</button>
                  <button type="button" disabled={!editor.editable || i === acl.rules.length - 1} onclick={() => move(acl.name, acl.rules, i, 1)} aria-label={t('firewall.down')} title={t('firewall.down')}>↓</button>
                  <button type="button" disabled={!editor.editable} onclick={() => removeRule(acl.name, acl.rules, i)} aria-label={t('firewall.remove')} title={t('firewall.remove')}>✕</button>
                </td>
              </tr>
            {/each}
            <tr class="rule deny implicit">
              <td></td>
              <td><span class="badge">{t('acl.action.deny')}</span></td>
              <td colspan="3" class="muted">{t('acl.implicit')}</td>
              {#if hits}<td class="hits">{hits.implicitDeny}</td>{/if}
              <td></td>
            </tr>
            {#if editor.editable && draft}
              <tr class="add">
                <td>+</td>
                <td>
                  <select bind:value={draft.action} aria-label={t('firewall.col.action')}>
                    <option value="allow">{t('acl.action.allow')}</option>
                    <option value="deny">{t('acl.action.deny')}</option>
                  </select>
                </td>
                <td class="what">
                  <select bind:value={draft.protocol} aria-label={t('firewall.col.protocol')}>
                    {#each PROTOCOLS as p (p)}<option value={p}>{p === 'any' ? t('firewall.anyProtocol') : p.toUpperCase()}</option>{/each}
                  </select>
                  {#if draft.protocol === 'tcp' || draft.protocol === 'udp'}<input class="port" bind:value={draft.port} placeholder={t('firewall.allPorts')} aria-label={t('firewall.col.port')} inputmode="numeric" />{/if}
                </td>
                <td><input bind:value={draft.src} placeholder="any" aria-label={t('firewall.col.src')} spellcheck="false" /></td>
                <td><input bind:value={draft.dst} placeholder="192.168.10.80" aria-label={t('firewall.col.dst')} spellcheck="false" /></td>
                {#if hits}<td></td>{/if}
                <td><button type="submit" aria-label={t('acl.addRule', { name: acl.name })} title={t('acl.addRule', { name: acl.name })}>+</button></td>
              </tr>
            {/if}
          </tbody>
        </table>
      </form>
    </div>
  {/each}

  {#if editor.editable}
    <form class="create" onsubmit={create}>
      <label>
        <span>{t('acl.newName')}</span>
        <input bind:value={newName} placeholder="GAESTE" maxlength="32" pattern={ACL_NAME.source.slice(1, -1)} spellcheck="false" />
      </label>
      <button type="submit" disabled={!newName.trim()}>{t('acl.create')}</button>
    </form>
  {/if}

  {#if acls.length || ports.some((p) => p.aclIn)}
    <h4>{t('acl.ports')}</h4>
    <div class="ports">
      {#each ports as port (port.index)}
        <label>
          <span>{interfaceLabel(device, port.index)}</span>
          <select value={port.aclIn ?? ''} disabled={!editor.editable} onchange={(e) => bind(port.index, e.currentTarget.value)}>
            <option value="">{t('acl.none')}</option>
            {#each acls as acl (acl.name)}<option value={acl.name}>{acl.name}</option>{/each}
            {#if port.aclIn && !acls.some((a) => a.name === port.aclIn)}<option value={port.aclIn}>{t('acl.missing', { name: port.aclIn })}</option>{/if}
          </select>
        </label>
      {/each}
    </div>
  {/if}
  {#if svis.length && (acls.length || svis.some((v) => v.aclIn || v.aclOut))}
    <h4>{t('acl.svis')}</h4>
    <p class="muted">{t('acl.svisHint')}</p>
    <div class="ports">
      {#each svis as v (v.vlan)}
        {#each ['in', 'out'] as const as dir (dir)}
          {@const current = dir === 'in' ? v.aclIn : v.aclOut}
          <label>
            <span>Vlan{v.vlan} {dir}</span>
            <select value={current ?? ''} disabled={!editor.editable} onchange={(e) => bindSvi(v.vlan, dir, e.currentTarget.value)}>
              <option value="">{t('acl.none')}</option>
              {#each acls as acl (acl.name)}<option value={acl.name}>{acl.name}</option>{/each}
              {#if current && !acls.some((a) => a.name === current)}<option value={current}>{t('acl.missing', { name: current })}</option>{/if}
            </select>
          </label>
        {/each}
      {/each}
    </div>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <p class="muted hint">{t('acl.hint')}</p>
</section>

<style>
  .acl {
    margin: 8px 0;
  }
  h3 {
    margin: 10px 0 4px;
    font-size: 0.9rem;
  }
  h4 {
    margin: 12px 0 4px;
    font-size: 0.82rem;
  }
  .muted {
    color: var(--muted);
    font-size: 0.8rem;
    margin: 4px 0;
  }
  .list {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 8px;
    margin: 8px 0;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  header .muted {
    flex: 1;
  }
  .del {
    padding: 0 6px;
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
  .implicit {
    opacity: 0.75;
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
  .create {
    display: flex;
    align-items: end;
    gap: 6px;
    margin: 8px 0;
  }
  .create label {
    display: grid;
    gap: 2px;
    font-size: 0.8rem;
  }
  .ports {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 4px 10px;
  }
  .ports label {
    display: grid;
    grid-template-columns: 1fr 1.3fr;
    align-items: center;
    gap: 4px;
    font-size: 0.8rem;
  }
  .error {
    color: var(--danger);
    font-size: 0.8rem;
  }
  .hint {
    font-size: 0.75rem;
  }
</style>
