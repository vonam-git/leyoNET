<script lang="ts">
  import { logicalInterfaces, type Device } from '../../core';
  import { t } from '../../i18n';
  import { interfaceLabel } from '../labels';
  import { editor } from '../state/editor.svelte';

  /**
   * VXLAN (Layer-3-Switch als VTEP): ein VLAN über das geroutete Netz zu anderen
   * Switches verlängern. Je VNI ein VLAN und die Adressen der anderen VTEPs.
   * Befehlszeile: «vlan 10» / «vn-segment 10010», «interface nve1».
   */
  let { device }: { device: Device } = $props();

  const vnis = $derived(device.vxlan?.vnis ?? []);
  const sources = $derived(logicalInterfaces(device));
  let draft = $state({ vni: '', vlan: '', peer: '' });
  let peerDrafts = $state<Record<number, string>>({});
  let error = $state<string | null>(null);

  function report(failure: { code: string; params?: Record<string, string | number> } | null): boolean {
    error = failure ? t(`error.${failure.code}`, failure.params) : null;
    return !failure;
  }

  function add(event: SubmitEvent) {
    event.preventDefault();
    const vni = Number(draft.vni);
    if (draft.vlan.trim() && !report(editor.setVniVlan(device.id, vni, Number(draft.vlan)))) return;
    for (const peer of draft.peer.split(/[\s,;]+/).filter(Boolean)) if (!report(editor.addVniPeer(device.id, vni, peer))) return;
    draft = { vni: '', vlan: '', peer: '' };
  }

  function addPeer(event: SubmitEvent, vni: number) {
    event.preventDefault();
    if (report(editor.addVniPeer(device.id, vni, peerDrafts[vni] ?? ''))) peerDrafts[vni] = '';
  }
</script>

<h3 data-help="vxlan">{t('vxlan.title')}</h3>
<p class="muted">{t('vxlan.intro')}</p>
<label class="row">
  <span>{t('vxlan.source')}</span>
  <select value={device.vxlan?.source === undefined ? '' : String(device.vxlan.source)} disabled={!editor.editable} onchange={(e) => report(editor.setVxlanSource(device.id, e.currentTarget.value === '' ? null : Number(e.currentTarget.value)))}>
    <option value="">{t('vxlan.noSource')}</option>
    {#each sources as id (id)}<option value={String(id)}>{interfaceLabel(device, id)}</option>{/each}
  </select>
</label>
{#if vnis.length}
  <table>
    <thead>
      <tr>
        <th scope="col">VNI</th>
        <th scope="col">VLAN</th>
        <th scope="col">{t('vxlan.peers')}</th>
      </tr>
    </thead>
    <tbody>
      {#each vnis as v (v.vni)}
        <tr>
          <td class="mono">{v.vni}</td>
          <td>
            <input class="vlan" inputmode="numeric" value={v.vlan ?? ''} placeholder="–" disabled={!editor.editable} aria-label={t('vxlan.vlanOf', { vni: v.vni })} onchange={(e) => report(editor.setVniVlan(device.id, v.vni, e.currentTarget.value.trim() ? Number(e.currentTarget.value) : null))} />
          </td>
          <td>
            {#each v.peers as peer (peer)}
              <span class="peer mono">{peer}<button type="button" class="x" disabled={!editor.editable} onclick={() => report(editor.removeVniPeer(device.id, v.vni, peer))} aria-label={t('vxlan.removePeer', { peer })}>✕</button></span>
            {/each}
            {#if editor.editable}
              <form class="inline" onsubmit={(e) => addPeer(e, v.vni)}>
                <input bind:value={peerDrafts[v.vni]} placeholder="10.255.0.2" aria-label={t('vxlan.addPeer', { vni: v.vni })} spellcheck="false" />
              </form>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
{#if editor.editable}
  <form class="add" onsubmit={add}>
    <input bind:value={draft.vni} inputmode="numeric" placeholder="VNI 10010" aria-label="VNI" />
    <input bind:value={draft.vlan} inputmode="numeric" placeholder="VLAN 10" aria-label="VLAN" />
    <input bind:value={draft.peer} placeholder="10.255.0.2" aria-label={t('vxlan.peers')} spellcheck="false" />
    <button type="submit" disabled={!draft.vni.trim()}>{t('vxlan.add')}</button>
  </form>
{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}
<p class="muted hint">{t('vxlan.hint')}</p>

<style>
  h3 {
    margin: 16px 0 6px;
    font-size: 0.85rem;
  }
  .muted {
    color: var(--muted);
    font-size: 0.75rem;
    margin: 4px 0;
  }
  .row {
    display: grid;
    grid-template-columns: 8rem minmax(0, 1fr);
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    margin: 6px 0;
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
    vertical-align: top;
  }
  th {
    color: var(--muted);
    font-weight: normal;
  }
  .vlan {
    width: 4.5em;
  }
  .peer {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin: 0 6px 3px 0;
  }
  .x {
    padding: 0 4px;
    font-size: 0.7rem;
  }
  .inline input {
    width: 9em;
  }
  .add {
    display: flex;
    gap: 4px;
    margin: 6px 0;
  }
  .add input {
    flex: 1;
  }
  .error {
    color: var(--danger);
    font-size: 0.8rem;
  }
  .hint {
    font-size: 0.72rem;
  }
</style>
