<script lang="ts">
  import { CPE_WAN, MODEM_WAN, siteName, verbundAddresses, type Device } from '../../core';
  import { t } from '../../i18n';
  import { interfaceLabel } from '../labels';
  import { editor } from '../state/editor.svelte';
  import { session } from '../state/session.svelte';
  import { verbund } from '../state/verbund.svelte';
  import { dialogs } from '../state/dialogs.svelte';

  /**
   * Klassen-Verbund am Gerät: Lernende machen Modem, Internet-Box oder Router zum Anschluss
   * ihres Standorts; die Lehrperson markiert in der Infrastruktur das Internet-Gerät als Provider.
   */
  let { device }: { device: Device } = $props();

  const uplinkType = $derived(['modem', 'cpe', 'router', 'firewall'].includes(device.type));
  const inClass = $derived(!!session.classCode && !!session.classSettings?.verbund.enabled);
  const fixedWan = $derived(device.type === 'modem' ? MODEM_WAN : device.type === 'cpe' ? CPE_WAN : null);
  const seat = $derived(session.site?.seat ?? null);
  const addr = $derived(seat ? verbundAddresses(seat) : null);
  const status = $derived(seat ? verbund.status[String(seat)] : undefined);
  let error = $state<string | null>(null);
  let editing = $state(false);
  let seatInput = $state('');
  let labelInput = $state('');

  function report(e: { code: string } | null) {
    error = e ? t(`error.${e.code}`) : null;
  }

  function toggle(on: boolean) {
    report(editor.setVerbund(device.id, on ? (fixedWan ?? device.verbund?.iface ?? device.interfaces.length - 1) : null));
  }

  function startEdit() {
    seatInput = String(seat ?? '');
    labelInput = session.site?.label ?? '';
    editing = true;
  }

  async function saveSite(event: SubmitEvent) {
    event.preventDefault();
    try {
      const n = Number(seatInput);
      await session.setSite({ ...(Number.isInteger(n) && n > 0 ? { seat: n } : {}), label: labelInput });
      editing = false;
      error = null;
    } catch (e) {
      error = t(`verbund.error.${(e as { code?: string }).code ?? 'unknown'}`);
    }
  }
</script>

{#if device.type === 'internet' && !inClass}
  <section class="verbund" data-help="verbund">
    <label class="check">
      <input type="checkbox" checked={!!device.verbundProvider} disabled={!editor.editable} onchange={(e) => report(editor.setVerbundProvider(device.id, e.currentTarget.checked))} />
      🌐 {t('verbund.provider')}
    </label>
    <p class="muted">{t('verbund.providerHint')}</p>
  </section>
{:else if uplinkType && inClass}
  <section class="verbund" data-help="verbund">
    <h3>🌐 {t('verbund.title')}</h3>
    <p class="site">
      {#if seat}<strong>{siteName(seat, session.site?.label)}</strong> · {t('verbund.seatN', { seat })}{/if}
      <button type="button" class="link" onclick={startEdit}>{t('verbund.changeSite')}</button>
    </p>
    {#if editing}
      <form class="row" onsubmit={saveSite}>
        <input bind:value={seatInput} inputmode="numeric" class="seat" aria-label={t('verbund.seat')} placeholder={t('verbund.seat')} />
        <input bind:value={labelInput} maxlength="30" aria-label={t('verbund.group')} placeholder={t('verbund.group')} />
        <button type="submit">{t('verbund.save')}</button>
      </form>
    {/if}
    <label class="check">
      <input type="checkbox" checked={!!device.verbund} disabled={!editor.editable} onchange={(e) => toggle(e.currentTarget.checked)} />
      {t('verbund.uplink')}
    </label>
    {#if device.verbund}
      {#if fixedWan === null}
        <label class="row">
          {t('verbund.wanPort')}
          <select value={device.verbund.iface} disabled={!editor.editable} onchange={(e) => report(editor.setVerbund(device.id, Number(e.currentTarget.value)))}>
            {#each device.interfaces as i (i.index)}<option value={i.index}>{interfaceLabel(device, i.index)}</option>{/each}
          </select>
        </label>
      {/if}
      {#if addr}
        <dl>
          <dt>{t('verbund.wanAddress')}</dt><dd class="mono">{addr.site}/30</dd>
          <dt>{t('verbund.gateway')}</dt><dd class="mono">{addr.provider}</dd>
        </dl>
        <button type="button" disabled={!editor.editable} onclick={() => seat && report(editor.applyVerbundAddresses(device.id, seat))}>{t('verbund.applyAddresses')}</button>
      {/if}
      {#if status}
        <p class="status {status.level}">● {t(`verbund.level.${status.level}`)}{#if status.total} · {t('verbund.goals', { n: status.goals, total: status.total })}{/if}</p>
      {/if}
      {#if !verbund.infra}<p class="muted">{t('verbund.noInfra')}</p>{/if}
    {/if}
    {#if verbund.showMap}<button type="button" class="link" onclick={() => dialogs.show('verbundMap')}>🗺 {t('verbund.openMap')}</button>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </section>
{/if}

<style>
  .verbund {
    margin: 8px 0;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 6px;
    font-size: 0.85rem;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 0.9rem;
  }
  .check,
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 4px 0;
  }
  .seat {
    width: 4rem;
  }
  .site {
    margin: 2px 0 6px;
  }
  .muted {
    color: var(--muted);
    font-size: 0.78rem;
    margin: 4px 0;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    margin: 6px 0;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  .mono {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  .link {
    background: none;
    border: none;
    padding: 0;
    color: var(--accent);
    cursor: pointer;
    text-decoration: underline;
  }
  .status {
    margin: 6px 0 0;
    font-weight: 600;
  }
  .status.offline {
    color: var(--danger);
  }
  .status.connected {
    color: #d97706;
  }
  .status.online,
  .status.services,
  .status.done {
    color: #16a34a;
  }
  .error {
    color: var(--danger);
  }
</style>
