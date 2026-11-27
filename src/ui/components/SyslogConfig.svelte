<script lang="ts">
  import { setSyslog, setSyslogServer, canInstall, type Device } from '../../core';
  import { t } from '../../i18n';
  import { autosave } from '../autosave';
  import { editor } from '../state/editor.svelte';
  import { simStore } from '../state/sim.svelte';

  /**
   * Syslog (RFC 5424 über UDP 514, RFC 5426): Ereignisse dieses Geräts an einen Syslog-Server
   * schicken; auf Rechnern zusätzlich den Dienst «Syslog-Server» mit den empfangenen Meldungen.
   */
  let { device, server = false }: { device: Device; server?: boolean } = $props();
  let target = $state('');
  // Gespeicherten Wert übernehmen (auch nach Rückgängig oder Änderung auf der Befehlszeile).
  $effect(() => {
    target = device.syslog ?? '';
  });
  let error = $state<string | null>(null);
  const received = $derived((simStore.tick, server && device.syslogServer ? (simStore.sim?.getDeviceState(device.id) as { syslog?: { from: string; host: string; msgid: string; severity: number; text: string; received: number }[] } | undefined)?.syslog : undefined));
  const SEVERITY = ['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug'];

  function save(quiet = false): boolean {
    if ((device.syslog ?? '') === target.trim()) return true;
    const result = setSyslog(editor.topology, device.id, target);
    if (!result.ok) {
      if (!quiet) error = t(`error.${result.error.code}`, result.error.params);
      return false;
    }
    error = null;
    editor.applyConfig(result.value);
    return true;
  }
  function toggle(on: boolean) {
    const result = setSyslogServer(editor.topology, device.id, on);
    error = result.ok ? null : t(`error.${result.error.code}`);
    if (result.ok) editor.applyConfig(result.value);
  }
</script>

<h3 data-help="syslog">{t('syslog.title')}</h3>
<form use:autosave={save} onsubmit={(e) => (e.preventDefault(), save(false))}>
  <label>{t('syslog.target')} <input bind:value={target} placeholder="192.168.1.10" spellcheck="false" autocomplete="off" disabled={editor.viewOnly} /></label>
  <small class="muted">{t('syslog.targetHint')}</small>
</form>
{#if server && canInstall(device.type)}
  <label class="service">
    <input type="checkbox" checked={!!device.syslogServer} disabled={editor.viewOnly} onchange={(e) => toggle(e.currentTarget.checked)} />
    <span><b>{t('syslog.server')}</b><small>{t('syslog.serverHint')}</small></span>
  </label>
{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if received}
  <ul class="log" role="log" aria-label={t('syslog.received')}>
    {#each [...received].reverse() as m (m.received + m.from + m.msgid)}
      <li class="sev{m.severity}">
        <code>{(m.received / 1000).toFixed(1)} s</code>
        <b>{m.host}</b> <span class="muted">({m.from})</span>
        <code>{SEVERITY[m.severity]}</code> <code>{m.msgid}</code>
        <span>{m.text}</span>
      </li>
    {:else}
      <li class="muted">{t('syslog.none')}</li>
    {/each}
  </ul>
{/if}

<style>
  label {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .service {
    align-items: flex-start;
    margin-top: 10px;
  }
  small {
    display: block;
    color: var(--muted);
  }
  .log {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: grid;
    gap: 3px;
    max-height: 18rem;
    overflow: auto;
  }
  .log li {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    padding: 3px 8px;
    border-left: 4px solid var(--border);
    overflow-wrap: anywhere;
  }
  .log li.sev4,
  .log li.sev3,
  .log li.sev2 {
    border-left-color: #8f1d24;
  }
  .error {
    color: var(--danger);
  }
</style>
