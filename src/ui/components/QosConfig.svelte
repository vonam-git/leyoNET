<script lang="ts">
  import { MAX_RATE, MIN_RATE, setPortRate, setQos, type Device } from '../../core';
  import { t } from '../../i18n';
  import { interfaceLabel } from '../labels';
  import { editor } from '../state/editor.svelte';

  /**
   * QoS (DiffServ, RFC 2474; 802.1p im 802.1Q-Tag): Prioritäts-Warteschlangen ein, DSCP
   * vertrauen oder zurücksetzen, Bandbreite je Port (Engpass) in kbit/s.
   */
  let { device }: { device: Device } = $props();

  const ports = $derived(device.interfaces.filter((i) => !i.sfpSlot || i.sfp));
  let error = $state<string | null>(null);

  function setRate(index: number, value: string) {
    error = null;
    const text = value.trim().replace(/\s/g, '');
    if (!text) return editor.apply(setPortRate(editor.topology, device.id, index, null));
    const m = /^(\d+(?:[.,]\d+)?)([kKmM]?)$/.exec(text);
    const rate = m ? Math.round(Number(m[1]!.replace(',', '.')) * (m[2]!.toLowerCase() === 'm' ? 1000 : 1)) : NaN;
    const r = setPortRate(editor.topology, device.id, index, rate);
    if (!r.ok) return (error = t('error.invalidRate', { value: text, min: MIN_RATE, max: MAX_RATE }));
    editor.apply(r);
  }

  const QUEUES = [0, 1, 2, 3] as const;
</script>

<h3 data-help="qos">{t('qos.title')}</h3>
<label class="check"><input type="checkbox" checked={!!device.qos} disabled={!editor.editable} onchange={(e) => editor.apply(setQos(editor.topology, device.id, e.currentTarget.checked ? {} : null))} /> {t('qos.enable')}</label>
{#if device.qos}
  <label class="check"><input type="checkbox" checked={device.qos.trust !== false} disabled={!editor.editable} onchange={(e) => editor.apply(setQos(editor.topology, device.id, { trust: e.currentTarget.checked }))} /> {t('qos.trust')}</label>
{/if}
<p class="muted small">{t(device.qos ? 'qos.hintOn' : 'qos.hintOff')}</p>
<table class="queues">
  <thead><tr><th>{t('qos.queue')}</th><th>{t('qos.traffic')}</th><th>DSCP</th><th>PCP</th></tr></thead>
  <tbody>
    {#each QUEUES as q (q)}
      <tr><td>{q + 1}</td><td>{t(`qos.queue.${q}`)}</td><td>{t(`qos.queue.${q}.dscp`)}</td><td>{['5', '6, 7', '1–4', '0'][q]}</td></tr>
    {/each}
  </tbody>
</table>

<h3>{t('qos.rates')}</h3>
<p class="muted small">{t('qos.ratesHint')}</p>
{#if error}<p class="error" role="alert">{error}</p>{/if}
<table>
  <thead><tr><th>{t('poe.port')}</th><th>{t('qos.rate')}</th></tr></thead>
  <tbody>
    {#each ports as p (p.index)}
      <tr>
        <td>{interfaceLabel(device, p.index)}</td>
        <td><input value={p.rate ? String(p.rate) : ''} placeholder={t('qos.unlimited')} onchange={(e) => setRate(p.index, e.currentTarget.value)} disabled={!editor.editable} aria-label={`${interfaceLabel(device, p.index)} ${t('qos.rate')}`} /></td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  .check {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 0.85rem;
    margin: 4px 0;
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
    width: 100%;
  }
  th,
  td {
    text-align: left;
    padding: 3px 6px;
    border-bottom: 1px solid var(--border);
  }
  th {
    color: var(--muted);
    font-weight: 500;
  }
  td input {
    width: 9em;
  }
</style>
