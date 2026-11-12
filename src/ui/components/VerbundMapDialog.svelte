<script lang="ts">
  import { Simulation, probeSites, siteName } from '../../core';
  import { locale, t } from '../../i18n';
  import { editor } from '../state/editor.svelte';
  import { session } from '../state/session.svelte';
  import { verbund } from '../state/verbund.svelte';
  import Modal from './Modal.svelte';
  import VerbundMap, { type Flight, type MapSite } from './VerbundMap.svelte';

  /**
   * Karte und Nachrichten für die Lernenden. Eine Nachricht geht nur weg, wenn der eigene Standort
   * in der Simulation die Zentrale erreicht (wie echte Post braucht sie eine Verbindung).
   */
  let { onclose }: { onclose: () => void } = $props();
  verbund.unread = 0;

  const own = $derived(session.site?.seat ?? 0);
  const sites = $derived<MapSite[]>(
    verbund.sites
      .map((s) => {
        const st = verbund.status[String(s.seat)];
        return { seat: s.seat, name: siteName(s.seat, s.label), level: st?.level ?? 'offline', goals: st?.goals ?? 0, total: st?.total ?? 0, own: s.seat === own };
      })
      .sort((a, b) => a.seat - b.seat),
  );
  const flights = $derived<Flight[]>(verbund.messages.slice(-10).map((m) => ({ id: m.id, from: m.from, to: m.to })));
  const inbox = $derived(verbund.messages.filter((m) => m.to === own || m.from === own || m.to === -1).slice(-30).reverse());

  let to = $state(0);
  let subject = $state('');
  let text = $state('');
  let error = $state<string | null>(null);
  let sending = $state(false);
  let sent = $state(false);

  const time = (ms: number) => new Date(ms).toLocaleTimeString(locale() === 'en' ? 'en-GB' : 'de-CH', { hour: '2-digit', minute: '2-digit' });
  const nameOf = (seat: number, label?: string) => (seat === 0 ? t('verbund.hub') : seat === -1 ? t('verbund.all') : siteName(seat, label ?? verbund.sites.find((s) => s.seat === seat)?.label));

  /** Erreicht der eigene Standort die Zentrale? Geprüft im zusammengesetzten Netz. */
  function reachable(): boolean {
    const f = verbund.federation(editor.topology);
    if (!f) return false;
    const [probe] = probeSites(f, new Simulation(f.topology), 8000, 3000, own);
    return !!probe && probe.level !== 'offline' && probe.level !== 'connected';
  }

  async function send(event: SubmitEvent) {
    event.preventDefault();
    error = null;
    sent = false;
    if (!reachable()) {
      error = t('verbund.msg.unreachable');
      return;
    }
    sending = true;
    try {
      await verbund.send(to, subject.trim(), text.trim());
      subject = '';
      text = '';
      sent = true;
    } catch (e) {
      error = t((e as { status?: number }).status === 429 ? 'verbund.msg.tooMany' : 'verbund.msg.failed');
    } finally {
      sending = false;
    }
  }
</script>

<Modal title={t('verbund.map.title', { label: verbund.label })} {onclose} width={1100}>
  <div class="layout">
    <div class="map">
      <VerbundMap {sites} hubName={t('verbund.hub')} {flights} />
    </div>
    <aside>
      <h3>✉ {t('verbund.msg.title')}</h3>
      <form onsubmit={send}>
        <label>
          {t('verbund.msg.to')}
          <select bind:value={to}>
            <option value={0}>{t('verbund.hub')}</option>
            <option value={-1}>{t('verbund.all')}</option>
            {#each verbund.sites.filter((s) => s.seat !== own) as s (s.seat)}<option value={s.seat}>{siteName(s.seat, s.label)}</option>{/each}
          </select>
        </label>
        <input bind:value={subject} maxlength="30" required placeholder={t('verbund.msg.subject')} aria-label={t('verbund.msg.subject')} />
        <textarea bind:value={text} maxlength="500" rows="3" required placeholder={t('verbund.msg.text')} aria-label={t('verbund.msg.text')}></textarea>
        <button type="submit" disabled={sending || !session.code}>{sending ? '…' : t('verbund.msg.send')}</button>
        {#if error}<p class="error" role="alert">{error}</p>{/if}
        {#if sent}<p class="ok" role="status">{t('verbund.msg.sent')}</p>{/if}
      </form>
      <p class="muted">{t('verbund.msg.hint')}</p>
      <ol class="inbox">
        {#each inbox as m (m.id)}
          <li class:mine={m.from === own}>
            <div class="head"><strong>{nameOf(m.from, m.fromLabel)}</strong> → {nameOf(m.to)} <time>{time(m.time)}</time></div>
            <div class="subject">{m.subject}</div>
            <div class="text">{m.text}</div>
          </li>
        {:else}
          <li class="muted">{t('verbund.msg.none')}</li>
        {/each}
      </ol>
    </aside>
  </div>
</Modal>

<style>
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(240px, 1fr);
    gap: 14px;
  }
  .map {
    min-height: 360px;
    display: flex;
  }
  aside {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  h3 {
    margin: 0;
    font-size: 1rem;
  }
  form {
    display: grid;
    gap: 6px;
  }
  label {
    display: grid;
    gap: 2px;
    font-size: 0.85rem;
  }
  .muted {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .error {
    color: var(--danger);
    margin: 0;
  }
  .ok {
    color: #16a34a;
    margin: 0;
  }
  .inbox {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
    max-height: 300px;
    overflow: auto;
  }
  .inbox li {
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 0.82rem;
  }
  .inbox li.mine {
    border-left: 3px solid var(--accent);
  }
  .head time {
    color: var(--muted);
    float: right;
  }
  .subject {
    font-weight: 600;
  }
  .text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  @media (max-width: 800px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
</style>
