<script lang="ts">
  import { buildRoutes, formatIp, logicalInterfaces, parseMask, VRF_NAME, vrfOfIface, type Device } from '../../core';
  import { t } from '../../i18n';
  import { interfaceLabel } from '../labels';
  import { editor } from '../state/editor.svelte';

  /**
   * VRFs: eigene Routingtabellen auf einem Router, einer Firewall oder einem
   * Layer-3-Switch. Anschlüsse werden einer VRF zugeordnet; jede VRF hat ihre
   * direkten Netze und eigene statische Routen. Dasselbe auf der Befehlszeile:
   * «vrf definition KUNDE-A», am Interface «vrf forwarding KUNDE-A».
   */
  let { device }: { device: Device } = $props();

  const vrfs = $derived(device.vrfs ?? []);
  const ifaces = $derived(logicalInterfaces(device));
  let newName = $state('');
  let drafts = $state<Record<string, { network: string; mask: string; gateway: string }>>({});
  let error = $state<string | null>(null);

  $effect.pre(() => {
    for (const v of vrfs) if (!drafts[v.name]) drafts[v.name] = { network: '', mask: '', gateway: '' };
  });

  function report(failure: { code: string; params?: Record<string, string | number> } | null): boolean {
    error = failure ? t(`error.${failure.code}`, failure.params) : null;
    return !failure;
  }

  function create(event: SubmitEvent) {
    event.preventDefault();
    if (report(editor.addVrf(device.id, newName.trim()))) newName = '';
  }

  function addRoute(event: SubmitEvent, name: string) {
    event.preventDefault();
    const d = drafts[name];
    if (!d) return;
    const [network = '', fromSlash] = d.network.split('/');
    const mask = d.mask.trim() || (fromSlash ? `/${fromSlash}` : '');
    if (report(editor.addVrfRoute(device.id, name, { network: network.trim(), mask, gateway: d.gateway.trim() || undefined }))) drafts[name] = { network: '', mask: '', gateway: '' };
  }

  const tableOf = (name: string) => buildRoutes(device, name).routes;
</script>

<section data-help="vrf">
  <h3>{t('vrf.title')}</h3>
  <p class="muted">{t('vrf.intro')}</p>

  {#if editor.editable}
    <form class="create" onsubmit={create}>
      <input bind:value={newName} placeholder="KUNDE-A" maxlength="32" pattern={VRF_NAME.source.slice(1, -1)} aria-label={t('vrf.newName')} spellcheck="false" />
      <button type="submit" disabled={!newName.trim()}>{t('vrf.create')}</button>
    </form>
  {/if}

  {#if vrfs.length}
    <h4>{t('vrf.assign')}</h4>
    <div class="assign">
      {#each ifaces as id (id)}
        <label>
          <span>{interfaceLabel(device, id)}</span>
          <select value={vrfOfIface(device, id) ?? ''} disabled={!editor.editable} onchange={(e) => report(editor.setInterfaceVrf(device.id, id, e.currentTarget.value || null))}>
            <option value="">{t('vrf.global')}</option>
            {#each vrfs as v (v.name)}<option value={v.name}>{v.name}</option>{/each}
          </select>
        </label>
      {/each}
    </div>

    {#each vrfs as v (v.name)}
      {@const draft = drafts[v.name]}
      <div class="vrf">
        <header>
          <strong class="mono">{v.name}</strong>
          <button type="button" class="small" disabled={!editor.editable} onclick={() => report(editor.removeVrf(device.id, v.name))} aria-label={t('vrf.delete', { name: v.name })} title={t('vrf.delete', { name: v.name })}>✕</button>
        </header>
        <table>
          <thead>
            <tr>
              <th scope="col">{t('vrf.col.kind')}</th>
              <th scope="col">{t('vrf.col.network')}</th>
              <th scope="col">{t('vrf.col.via')}</th>
              <th scope="col"><span class="visually-hidden">{t('routing.actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {#each tableOf(v.name) as r, i (i)}
              {@const index = r.kind === 'static' ? (v.routes ?? []).findIndex((s) => s.network === formatIp(r.network) && parseMask(s.mask) === r.prefix) : -1}
              <tr>
                <td>{r.kind === 'connected' ? 'C' : 'S'}</td>
                <td class="mono">{formatIp(r.network)}/{r.prefix}</td>
                <td class="mono">{r.via !== null ? formatIp(r.via) : interfaceLabel(device, r.iface)}</td>
                <td>
                  {#if index >= 0}<button type="button" class="small" disabled={!editor.editable} onclick={() => report(editor.removeVrfRoute(device.id, v.name, index))} aria-label={t('vrf.removeRoute')}>✕</button>{/if}
                </td>
              </tr>
            {:else}
              <tr><td colspan="4" class="muted">{t('vrf.empty')}</td></tr>
            {/each}
          </tbody>
        </table>
        {#if editor.editable && draft}
          <form class="route" onsubmit={(e) => addRoute(e, v.name)}>
            <input bind:value={draft.network} placeholder="172.16.0.0/16" aria-label={t('vrf.col.network')} spellcheck="false" />
            <input bind:value={draft.gateway} placeholder="10.9.0.2" aria-label={t('vrf.col.via')} spellcheck="false" />
            <button type="submit" disabled={!draft.network.trim()} aria-label={t('vrf.addRoute', { name: v.name })} title={t('vrf.addRoute', { name: v.name })}>+</button>
          </form>
        {/if}
      </div>
    {/each}
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <p class="muted hint">{t('vrf.hint')}</p>
</section>

<style>
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
  .hint {
    font-size: 0.75rem;
  }
  .mono,
  input {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  input,
  select {
    font-size: 0.8rem;
    padding: 2px 4px;
    min-width: 0;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .create,
  .route {
    display: flex;
    gap: 6px;
    margin: 6px 0;
  }
  .route input {
    flex: 1;
  }
  .assign {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 4px 10px;
  }
  .assign label {
    display: grid;
    grid-template-columns: 1fr 1.2fr;
    align-items: center;
    gap: 4px;
    font-size: 0.8rem;
  }
  .vrf {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 8px;
    margin: 8px 0;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
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
  }
  th {
    color: var(--muted);
    font-weight: normal;
  }
  .small {
    padding: 0 5px;
  }
  .error {
    color: var(--danger);
    font-size: 0.8rem;
  }
</style>
