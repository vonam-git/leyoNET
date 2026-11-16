<script lang="ts">
  import { setSipServer, setVoip, type Device } from '../../core';
  import { t } from '../../i18n';
  import { editor } from '../state/editor.svelte';
  import { simStore } from '../state/sim.svelte';

  /**
   * Telefonie (SIP, RFC 3261): beim IP-Telefon Rufnummer, Telefonanlage und Markierung, in der
   * Simulation Anmeldung, Anruf und Gesprächsqualität; beim Server die Telefonanlage.
   */
  let { device }: { device: Device } = $props();

  let number = $state('');
  let server = $state('');
  let error = $state<string | null>(null);
  let target = $state('');
  $effect(() => {
    number = device.voip?.number ?? '';
    server = device.voip?.server ?? '';
  });

  const live = $derived((simStore.tick, editor.acting ? simStore.sim?.getDeviceState(device.id) : undefined));

  function save() {
    error = null;
    if (!number.trim() && !server.trim()) return editor.apply(setVoip(editor.topology, device.id, null));
    const r = setVoip(editor.topology, device.id, { number, server, marking: device.voip?.marking !== false });
    if (!r.ok) return (error = t(`error.${r.error.code}`, r.error.params));
    editor.apply(r);
  }

  function setMarking(on: boolean) {
    if (!device.voip) return;
    editor.apply(setVoip(editor.topology, device.id, { ...device.voip, marking: on }));
  }

  function call(event: SubmitEvent) {
    event.preventDefault();
    if (target.trim()) simStore.sim?.call(device.id, target.trim());
  }
</script>

{#if device.type === 'ipphone'}
  <h3 data-help="voip">{t('voip.title')}</h3>
  <div class="row">
    <label>{t('voip.number')}<input bind:value={number} onchange={save} inputmode="numeric" maxlength="8" placeholder="201" disabled={!editor.editable} /></label>
    <label>{t('voip.server')}<input bind:value={server} onchange={save} placeholder="192.168.10.5" spellcheck="false" disabled={!editor.editable} /></label>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <label class="check"><input type="checkbox" checked={device.voip?.marking !== false} disabled={!editor.editable || !device.voip} onchange={(e) => setMarking(e.currentTarget.checked)} /> {t('voip.marking')}</label>
  <p class="muted small">{t('voip.hint')}</p>
  {#if editor.acting && live?.voip}
    {@const v = live.voip}
    <p class="status">{v.number ? t(v.registered ? 'voip.state.registered' : 'voip.state.unregistered', { number: v.number, server: v.server ?? '' }) : t('voip.state.direct')}</p>
    <form class="row" onsubmit={call}>
      <input bind:value={target} placeholder={t('voip.target')} aria-label={t('voip.target')} />
      <button class="primary" type="submit">{t('voip.call')}</button>
      <button type="button" onclick={() => simStore.sim?.hangup(device.id)}>{t('voip.hangup')}</button>
    </form>
    {#if v.call}
      {@const s = v.call.stats}
      <table>
        <tbody>
          <tr><th>{t('voip.peer')}</th><td>{v.call.peer} · {t(`voip.phase.${v.call.phase}`)}{v.call.reason ? ` (${v.call.reason})` : ''}</td></tr>
          <tr><th>{t('voip.packets')}</th><td>{t('voip.packetsValue', { sent: s.sent, received: s.received, lost: s.lost })}</td></tr>
          <tr><th>{t('voip.loss')}</th><td>{s.loss} %</td></tr>
          <tr><th>{t('voip.delay')}</th><td>{s.delay} ms</td></tr>
          <tr><th>{t('voip.jitter')}</th><td>{s.jitter} ms</td></tr>
          <tr><th>{t('voip.quality')}</th><td class="q-{s.quality}">{t(`voip.quality.${s.quality}`)}</td></tr>
        </tbody>
      </table>
    {/if}
  {/if}
{:else}
  <h3 data-help="voip">{t('voip.pbx')}</h3>
  <label class="check"><input type="checkbox" checked={!!device.sipServer} disabled={!editor.editable} onchange={(e) => editor.apply(setSipServer(editor.topology, device.id, e.currentTarget.checked))} /> {t('voip.pbxOn')}</label>
  <p class="muted small">{t('voip.pbxHint')}</p>
  {#if editor.acting && device.sipServer}
    {@const regs = live?.sipRegistrations ?? []}
    {#if regs.length}
      <table>
        <thead><tr><th>{t('voip.number')}</th><th>{t('voip.address')}</th></tr></thead>
        <tbody>
          {#each regs as r (r.number)}<tr><td>{r.number}</td><td>{r.address}</td></tr>{/each}
        </tbody>
      </table>
    {:else}
      <p class="muted small">{t('voip.noRegistrations')}</p>
    {/if}
  {/if}
{/if}

<style>
  .row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: end;
    margin: 6px 0;
  }
  label {
    display: grid;
    gap: 3px;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .check {
    display: flex;
    gap: 6px;
    align-items: center;
    color: var(--text);
  }
  .check input {
    width: auto;
  }
  .small {
    font-size: 0.78rem;
    margin: 4px 0;
  }
  .error {
    color: var(--danger, #c0392b);
    font-size: 0.85rem;
  }
  table {
    border-collapse: collapse;
    font-size: 0.82rem;
    margin-top: 6px;
  }
  th,
  td {
    text-align: left;
    padding: 2px 8px 2px 0;
  }
  th {
    color: var(--muted);
    font-weight: 500;
  }
  .q-good {
    color: var(--ok, #2e9e5b);
    font-weight: 600;
  }
  .q-fair {
    color: var(--warn, #d08a00);
    font-weight: 600;
  }
  .q-poor {
    color: var(--danger, #c0392b);
    font-weight: 600;
  }
</style>
