<script lang="ts">
  import { DEFAULT_DNS_TTL, DEFAULT_MX_PRIORITY, DNS_TYPES, reverseName, type Device, type DnsType } from '../../core';
  import { t } from '../../i18n';
  import { autosave } from '../autosave';
  import { editor } from '../state/editor.svelte';

  /** Entwurfsmodus, Rechner: DNS-Server mit seiner Zone und allenfalls einer Weiterleitung. */
  let { device }: { device: Device } = $props();

  let record = $state({ name: '', type: 'A' as DnsType, value: '', ttl: String(DEFAULT_DNS_TTL), priority: String(DEFAULT_MX_PRIORITY) });
  let error = $state<{ field?: string; text: string } | null>(null);
  const records = $derived(device.dnsServer?.records ?? []);

  /** Beispiele je Typ für Name und Wert. */
  const PLACEHOLDER: Record<DnsType, [string, string]> = {
    A: ['web.schule.example', '192.168.0.3'],
    AAAA: ['web.schule.example', '2001:db8:1::3'],
    CNAME: ['www.schule.example', 'web.schule.example'],
    MX: ['schule.example', 'mail.schule.example'],
    TXT: ['schule.example', 'v=spf1 mx -all'],
    NS: ['schule.example', 'dns.schule.example'],
    PTR: ['192.168.0.3', 'web.schule.example'],
  };

  function add(event: SubmitEvent) {
    event.preventDefault();
    // PTR: Eine Adresse als Name wird automatisch zum Namen unter in-addr.arpa bzw. ip6.arpa.
    const name = record.type === 'PTR' ? (reverseName(record.name) ?? record.name) : record.name;
    const failure = editor.addDnsRecord(device.id, {
      name,
      type: record.type,
      value: record.value,
      ttl: Number(record.ttl),
      ...(record.type === 'MX' ? { priority: Number(record.priority) } : {}),
    });
    error = failure ? { field: failure.field, text: t(`error.${failure.code}`, failure.params) } : null;
    if (!failure) record = { ...record, name: '', value: '' };
  }

  let forwarder = $state('');
  let forwarderError = $state<string | null>(null);
  $effect(() => {
    forwarder = device.dnsServer?.forwarder ?? '';
    forwarderError = null;
  });
  function saveForwarder(quiet: boolean): boolean {
    if (forwarder.trim() === (device.dnsServer?.forwarder ?? '')) return true;
    const failure = editor.setDnsForwarder(device.id, forwarder);
    if (failure) {
      if (!quiet) forwarderError = t(`error.${failure.code}`, failure.params);
      return false;
    }
    forwarderError = null;
    return true;
  }
  const shown = (r: { type: DnsType; value: string; priority?: number }) => (r.type === 'MX' ? `${r.priority ?? DEFAULT_MX_PRIORITY} ${r.value}` : r.type === 'TXT' ? `"${r.value}"` : r.value);
</script>

<label class="toggle">
  <input type="checkbox" checked={!!device.dnsServer} onchange={(e) => editor.setDnsServerEnabled(device.id, e.currentTarget.checked)} />
  {t('dnsServer.enable')}
</label>

{#if device.dnsServer}
  {#if records.length === 0}
    <p class="muted">{t('dnsServer.noRecords')}</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th scope="col">{t('dnsServer.name')}</th>
          <th scope="col">{t('dnsServer.type')}</th>
          <th scope="col">{t('dnsServer.value')}</th>
          <th scope="col">TTL</th>
          <th scope="col"><span class="visually-hidden">{t('dnsServer.remove')}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each records as r, i (i)}
          <tr>
            <td class="mono">{r.name}</td>
            <td>{r.type}</td>
            <td class="mono value">{shown(r)}</td>
            <td>{r.ttl}</td>
            <td>
              <button class="small" aria-label={t('dnsServer.removeRecord', { name: r.name })} onclick={() => editor.removeDnsRecord(device.id, i)}>
                ✕
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <form class="add" onsubmit={add}>
    <div class="grid">
      <label>
        <span>{t('dnsServer.name')}</span>
        <input bind:value={record.name} placeholder={PLACEHOLDER[record.type][0]} autocomplete="off" spellcheck="false" aria-invalid={error?.field === 'name'} />
      </label>
      <label>
        <span>{t('dnsServer.type')}</span>
        <select bind:value={record.type}>
          {#each DNS_TYPES as type (type)}<option value={type}>{t(`dnsServer.type${type}`)}</option>{/each}
        </select>
      </label>
      <label>
        <span>{t(`dnsServer.valueLabel.${record.type}`)}</span>
        <input bind:value={record.value} placeholder={PLACEHOLDER[record.type][1]} autocomplete="off" spellcheck="false" aria-invalid={error?.field === 'value'} />
      </label>
      {#if record.type === 'MX'}
        <label>
          <span>{t('dnsServer.priority')}</span>
          <input bind:value={record.priority} inputmode="numeric" aria-invalid={error?.field === 'priority'} />
        </label>
      {/if}
      <label>
        <span>{t('dnsServer.ttl')}</span>
        <input bind:value={record.ttl} inputmode="numeric" aria-invalid={error?.field === 'ttl'} />
      </label>
    </div>
    {#if error}
      <p class="error" role="alert">{error.text}</p>
    {/if}
    {#if record.type === 'PTR'}<p class="muted">{t('dnsServer.ptrHint')}</p>{/if}
    <button type="submit" disabled={!record.name.trim() || !record.value.trim()}>{t('dnsServer.add')}</button>
  </form>

  <form class="forwarder" use:autosave={saveForwarder} onsubmit={(e) => (e.preventDefault(), saveForwarder(false))}>
    <label>
      <span>{t('dnsServer.forwarder')}</span>
      <input bind:value={forwarder} placeholder="198.51.100.53" autocomplete="off" spellcheck="false" aria-invalid={!!forwarderError} />
    </label>
    {#if forwarderError}<p class="error" role="alert">{forwarderError}</p>{/if}
  </form>
  <p class="muted">{t(device.dnsServer.forwarder ? 'dnsServer.explainForward' : 'dnsServer.explain')}</p>
{/if}

<style>
  .toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    margin-bottom: 8px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
    margin-bottom: 8px;
  }
  th,
  td {
    text-align: left;
    padding: 3px 4px;
    border-bottom: 1px solid var(--border);
  }
  th {
    color: var(--muted);
    font-weight: normal;
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 6px;
    margin-bottom: 6px;
  }
  .grid label {
    display: grid;
    gap: 2px;
    font-size: 0.75rem;
  }
  input,
  select {
    width: 100%;
    min-width: 0;
    font-size: 0.8rem;
    padding: 4px 6px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  input {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  input[aria-invalid='true'] {
    border-color: var(--danger);
  }
  .value {
    word-break: break-all;
  }
  .forwarder label {
    display: grid;
    gap: 2px;
    font-size: 0.75rem;
    margin-top: 10px;
  }
  .small {
    font-size: 0.7rem;
    padding: 1px 6px;
  }
  .mono {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  .error {
    margin: 4px 0;
    font-size: 0.8rem;
    color: var(--danger);
  }
  .muted {
    margin: 6px 0 0;
    font-size: 0.75rem;
    color: var(--muted);
  }
</style>
