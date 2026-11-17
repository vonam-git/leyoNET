<script lang="ts">
  import Icon from './Icon.svelte';
  import { parseBundle, serializeBundle } from '../../core';
  import { locale, t } from '../../i18n';
  import { pickFile } from '../actions';
  import { downloadText } from '../persist/files';
  import { dialogs } from '../state/dialogs.svelte';
  import { reviewInbox } from '../state/reviewInbox';
  import { examSheetsHtml, seatCardsHtml, type SheetSeat } from '../seatCards';
  import SebPanel from './SebPanel.svelte';

  /**
   * Admin-Konsole, Reiter «Prüfungen»: Prüfung auf den Server laden, Platz-Codes
   * drucken und verteilen, starten, Nachteilsausgleich je Platz, beenden,
   * automatisch auswerten oder alle Abgaben herunterladen.
   */
  let {
    call,
    notify,
    version = 0,
    focus = null,
    onwatch,
  }: {
    version?: number;
    /** Diese Prüfung gleich öffnen (z.B. aus der Leiste «Prüfung läuft»). */
    focus?: string | null;
    call: <T>(method: string, path: string, body?: unknown) => Promise<T>;
    notify: (kind: 'ok' | 'error', text: string) => void;
    /** Platz live ansehen (nur lesen). */
    onwatch?: (session: string, label: string) => void;
  } = $props();

  interface Seat {
    id: string;
    code: string;
    extra: number;
    until: number | null;
    /** Von den Lernenden abgegeben um (ms); fehlt, wenn die Zeit ablief oder die Lehrperson beendete. */
    submitted?: number | null;
    state: 'waiting' | 'open' | 'closed';
    joined: boolean;
    saved: number | null;
    /** Gerät hat sich in der letzten Minute gemeldet. */
    online?: boolean;
    session?: string | null;
  }
  interface Exam {
    id: string;
    label: string;
    title: string;
    minutes: number;
    state: 'ready' | 'running' | 'ended';
    started: number | null;
    created: number;
    expires: number;
    hasKey: boolean;
    /** Nur im Safe Exam Browser; key fehlt, sobald die Prüfung beendet ist. */
    seb: { key: string | null } | null;
    seats: Seat[] | number;
    joined?: number;
  }
  interface Submissions {
    title: string;
    label: string;
    key: unknown;
    keyError: string | null;
    submissions: { seat: string; code: string; updated: number; project: unknown }[];
  }

  let exams = $state<Exam[]>([]);
  let open = $state<Exam | null>(null);
  let label = $state('');
  let learner = $state<{ name: string; data: Record<string, unknown>; variants: number; minutes: number | null; title: string } | null>(null);
  let key = $state<{ name: string; data: unknown } | null>(null);
  let seats = $state(20);
  let seb = $state(false);
  let minutes = $state(60);
  let busy = $state(false);
  let now = $state(Date.now());

  const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString(locale() === 'en' ? 'en-GB' : 'de-CH', { dateStyle: 'short', timeStyle: 'short' }) : '–');
  const time = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString(locale() === 'en' ? 'en-GB' : 'de-CH', { hour: '2-digit', minute: '2-digit' }) : '–');
  const seatList = $derived(open && Array.isArray(open.seats) ? open.seats : []);

  async function load() {
    exams = await call<Exam[]>('GET', 'exams');
    if (open) open = await call<Exam>('GET', `exams/${open.id}`);
  }

  $effect(() => {
    if (!focus) return;
    void call<Exam>('GET', `exams/${focus}`)
      .then((e) => (open = e))
      .catch(() => undefined);
  });

  $effect(() => {
    void version;
    void load().catch(() => undefined);
    // Während einer Prüfung die Platztabelle laufend nachführen.
    const timer = setInterval(() => {
      now = Date.now();
      if (open && open.state !== 'ended') void load().catch(() => undefined);
    }, 10_000);
    return () => clearInterval(timer);
  });

  async function chooseLearner() {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    try {
      const data = JSON.parse(file.text) as Record<string, unknown> & { tasks?: { title?: string; exam?: { variants?: unknown[]; minutes?: number } } };
      const exam = data.tasks?.exam;
      if (!exam) throw new Error();
      learner = { name: file.name, data, variants: exam.variants?.length ?? 1, minutes: exam.minutes ?? null, title: data.tasks?.title ?? file.name };
      if (exam.minutes) minutes = exam.minutes;
      if (!label) label = learner.title.slice(0, 60);
    } catch {
      notify('error', t('admin.exams.notAnExam'));
    }
  }

  async function chooseKey() {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    try {
      const data = JSON.parse(file.text) as { meta?: { format?: string } };
      if (data.meta?.format !== 'netzwerk-simulator-pruefungsschluessel') throw new Error();
      key = { name: file.name, data };
    } catch {
      notify('error', t('review.keyInvalid'));
    }
  }

  function errorText(error: unknown): string {
    const code = (error as { code?: string }).code ?? 'other';
    return t(`admin.exams.error.${['notAnExam', 'labelRequired', 'badSeats', 'badMinutes', 'keyMismatch', 'alreadyStarted', 'notStarted', 'unknownExam', 'tooLarge', 'examEnded'].includes(code) ? code : 'other'}`);
  }

  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (!learner) return;
    busy = true;
    try {
      const exam = await call<Exam>('POST', 'exams', { label, learner: learner.data, key: key?.data ?? null, seats, minutes, seb });
      learner = null;
      seb = false;
      key = null;
      label = '';
      open = exam;
      await load();
      notify('ok', t('admin.exams.created', { label: exam.label }));
    } catch (error) {
      notify('error', errorText(error));
    } finally {
      busy = false;
    }
  }

  async function act(path: string, body?: unknown, confirmText?: string) {
    if (!open || (confirmText && !confirm(confirmText))) return;
    try {
      open = await call<Exam>('POST', `exams/${open.id}/${path}`, body);
      await load();
    } catch (error) {
      notify('error', errorText(error));
    }
  }

  async function remove(exam: Exam) {
    if (!confirm(t('admin.exams.confirmDelete', { label: exam.label }))) return;
    try {
      await call('DELETE', `exams/${exam.id}`);
      if (open?.id === exam.id) open = null;
      await load();
    } catch (error) {
      notify('error', errorText(error));
    }
  }

  async function submissions(): Promise<Submissions | null> {
    if (!open) return null;
    try {
      const data = await call<Submissions>('GET', `exams/${open.id}/submissions`);
      if (data.keyError) notify('error', t('admin.exams.keyUnreadable'));
      return data;
    } catch (error) {
      notify('error', errorText(error));
      return null;
    }
  }

  const bundleText = (data: Submissions) =>
    serializeBundle({ title: data.title, label: data.label, key: data.key ? JSON.stringify(data.key) : null, submissions: data.submissions.map(({ seat, updated, project }) => ({ seat, updated, project })) });

  /** Abgaben samt Schlüssel an die Auswertung übergeben: sofortige automatische Korrektur. */
  async function evaluate() {
    const data = await submissions();
    if (!data) return;
    if (data.submissions.length === 0) return notify('error', t('admin.exams.noSubmissions'));
    const parsed = parseBundle(bundleText(data), t('exam.seatWord'))!;
    reviewInbox.value = { title: data.title, key: parsed.key, files: parsed.files };
    if (!parsed.key) notify('error', t('admin.exams.noKey'));
    dialogs.show('review');
  }

  async function download() {
    const data = await submissions();
    if (!data) return;
    const slug = data.label.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase() || 'pruefung';
    downloadText(`abgaben-${slug}.json`, bundleText(data));
  }

  function printCards() {
    if (!open) return;
    const html = seatCardsHtml({ title: open.title, label: open.label, minutes: open.minutes, seats: seatList.map((s) => ({ id: s.id, code: s.code, extra: s.extra })), url: location.origin + location.pathname });
    downloadText(`platzkarten-${open.label.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.html`, html, 'text/html');
  }

  /** Code zum Beenden des Prüfungsmodus (aus dem Schlüssel), erst auf Klick geladen. */
  let unlock = $state<{ exam: string; code: string | null } | null>(null);
  const slug = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase();

  async function sheet() {
    return call<{ code: string | null; seats: SheetSeat[] }>('GET', `exams/${open!.id}/sheet`);
  }

  async function printSheets() {
    if (!open) return;
    try {
      const data = await sheet();
      const html = examSheetsHtml({ title: open.title, label: open.label, minutes: open.minutes, url: location.origin + location.pathname, seats: data.seats });
      downloadText(`pruefungsblaetter-${slug(open.label)}.html`, html, 'text/html');
    } catch {
      notify('error', t('admin.exams.sheetError'));
    }
  }

  async function showUnlock() {
    if (!open) return;
    try {
      unlock = { exam: open.id, code: (await sheet()).code };
    } catch {
      notify('error', t('admin.exams.sheetError'));
    }
  }

  const left = (seat: Seat) => {
    if (!seat.until) return '';
    const s = Math.round((seat.until - now) / 1000);
    return s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '';
  };
</script>

<details class="create-box" open={exams.length === 0 || !!learner}>
<summary><Icon name="plus" size={16} />{t('admin.exams.createTitle')}</summary>
<form class="create" onsubmit={create}>
  <div class="row">
    <button type="button" onclick={chooseLearner}><Icon name="book" size={16} />{learner ? learner.name : t('admin.exams.learnerFile')}</button>
    <button type="button" onclick={chooseKey}><Icon name="key" size={16} />{key ? key.name : t('admin.exams.keyFile')}</button>
  </div>
  {#if learner}
    <div class="row">
      <label>{t('admin.exams.label')}<input bind:value={label} maxlength="60" required /></label>
      {#if learner.variants > 1}
        <span class="muted">{t('admin.exams.seatsFromVariants', { n: learner.variants })}</span>
      {:else}
        <label class="short">{t('exam.seats')}<input type="number" min="1" max="60" bind:value={seats} /></label>
      {/if}
      <label class="short">{t('admin.exams.minutesRequired')}<input type="number" min="1" max="600" step="1" bind:value={minutes} required /></label>
      <button type="submit" class="primary" disabled={busy || !label.trim()}>{t('admin.exams.create')}</button>
    </div>
    <label class="check"><input type="checkbox" bind:checked={seb} /> {t('seb.create')}</label>
    {#if !key}<p class="warn">{t('admin.exams.withoutKey')}</p>{/if}
  {/if}
  <p class="muted">{t('admin.exams.hint')}</p>
</form>
</details>

{#if exams.length === 0}
  <p class="muted">{t('admin.exams.none')}</p>
{:else}
  <table>
    <thead>
      <tr><th>{t('admin.exams.label')}</th><th>{t('admin.exams.state')}</th><th>{t('exam.seats')}</th><th>{t('admin.until')}</th><th></th></tr>
    </thead>
    <tbody>
      {#each exams as e (e.id)}
        <tr class:active={open?.id === e.id}>
          <td><span class="name"><strong>{e.label}</strong>{#if e.seb}<span class="pill">{t('seb.short')}</span>{/if}{#if !e.hasKey}<span class="pill warn" title={t('admin.exams.withoutKey')}>{t('admin.exams.noKeyShort')}</span>{/if}</span></td>
          <td><span class="pill {e.state === 'running' ? 'live' : e.state === 'ready' ? 'ok' : ''}">{#if e.state === 'running'}<span class="led live"></span>{/if}{t(`admin.exams.state.${e.state}`)}</span></td>
          <td>{Array.isArray(e.seats) ? e.seats.length : `${e.joined ?? 0}/${e.seats}`}</td>
          <td>{when(e.expires)}</td>
          <td class="actions">
            <button onclick={async () => (open = await call<Exam>('GET', `exams/${e.id}`))}>{t('admin.show')}</button>
            <button class="danger icon" title={t('inspector.delete')} aria-label={`${t('inspector.delete')}: ${e.label}`} onclick={() => remove(e)}><Icon name="trash" size={16} /></button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

{#if open}
  <section class="cockpit">
  <div class="cockpit-head">
    <div>
      <h3>{open.label} <span class="pill {open.state === 'running' ? 'live' : open.state === 'ready' ? 'ok' : ''}">{#if open.state === 'running'}<span class="led live"></span>{/if}{t(`admin.exams.state.${open.state}`)}</span></h3>
      {#if open.title !== open.label}<p class="muted small">{open.title}</p>{/if}
    </div>
    {#if open.state !== 'ready'}
      <div class="progress">
        <strong>{t('admin.exams.submittedCount', { n: seatList.filter((x) => x.submitted).length, total: seatList.length })}</strong>
        <span class="muted small">{t('admin.exams.startedAt', { time: time(open.started) })}</span>
      </div>
    {/if}
  </div>
  <div class="row toolbar">
    {#if open.state === 'ready'}
      <button class="primary" onclick={() => act('start', undefined, t('admin.exams.confirmStart', { n: seatList.length, min: open!.minutes }))}><Icon name="play" size={16} />{t('admin.exams.start')}</button>
      <button onclick={printSheets}><Icon name="printer" size={16} />{t('admin.exams.printSheets')}</button>
      <button onclick={printCards}><Icon name="tag" size={16} />{t('admin.exams.print')}</button>
    {:else if open.state === 'running'}
      <button onclick={printSheets}><Icon name="printer" size={16} />{t('admin.exams.printSheets')}</button>
    {/if}
    <button onclick={showUnlock} title={t('admin.exams.unlockHint')}><Icon name="key" size={16} />{t('admin.exams.unlock')}</button>
    <button onclick={evaluate} disabled={open.state === 'ready'}><Icon name="checks" size={16} />{t('admin.exams.evaluate')}</button>
    <button onclick={download} disabled={open.state === 'ready'}><Icon name="download" size={16} />{t('admin.exams.download')}</button>
    {#if open.state === 'running'}<button class="danger push" onclick={() => act('end', undefined, t('admin.exams.confirmEnd'))}>{t('admin.exams.end')}</button>{/if}
  </div>
  {#if unlock && unlock.exam === open.id}
    <p class="unlock" role="status">
      {#if unlock.code}{t('admin.exams.unlockIs')} <code>{unlock.code}</code>{:else}{t('admin.exams.unlockMissing')}{/if}
      <button class="ghost" onclick={() => (unlock = null)} aria-label={t('about.close')}><Icon name="close" size={16} /></button>
    </p>
  {/if}
  <p class="muted">{t(`admin.exams.help.${open.state}`)}</p>
  <SebPanel exam={open} onchange={(on, text) => act('seb', { on }, text)} />
  <table>
    <thead>
      <tr><th>{t('exam.seatWord')}</th><th>{t('admin.exams.code')}</th><th>{t('admin.exams.state')}</th><th>{t('admin.exams.saved')}</th><th>{t('admin.exams.until')}</th><th>{t('admin.exams.extra')}</th><th>{t('admin.exams.live')}</th></tr>
    </thead>
    <tbody>
      {#each seatList as s (s.id)}
        <tr>
          <td><strong>{s.id}</strong></td>
          <td><code>{s.code}</code></td>
          <td>
            {#if s.submitted}<span class="pill ok">✓ {t('admin.exams.seat.submittedAt', { time: time(s.submitted) })}</span>
            {:else if s.state === 'open' && !s.joined}<span class="pill warn">{t('admin.exams.seat.absent')}</span>
            {:else if s.state === 'open'}<span class="pill live"><span class="led live"></span>{t('admin.exams.seat.open')}</span>
            {:else}<span class="pill">{t(`admin.exams.seat.${s.state}`)}</span>{/if}
          </td>
          <td>{time(s.saved)}</td>
          <td>{time(s.until)} {#if s.state === 'open'}<span class="muted">({left(s)})</span>{/if}</td>
          <td class="actions">
            <span class="extra">{s.extra ? `+${s.extra}′` : ''}</span>
            <button title={t('admin.exams.extraAdd', { n: 5 })} onclick={() => act(`seats/${s.id}/extra`, { minutes: 5 })}>+5′</button>
            <button title={t('admin.exams.extraAdd', { n: 15 })} onclick={() => act(`seats/${s.id}/extra`, { minutes: 15 })}>+15′</button>
            <button title={t('admin.exams.extraRemove')} disabled={!s.extra} onclick={() => act(`seats/${s.id}/extra`, { minutes: -5 })}>−5′</button>
          </td>
          <td class="actions">
            <span class="led" class:ok={s.online} title={s.online ? t('admin.exams.online') : t('admin.exams.offline')} aria-label={s.online ? t('admin.exams.online') : t('admin.exams.offline')} role="img"></span>
            <button class="icon" disabled={!s.session || !onwatch} title={t('admin.exams.watchHint')} aria-label={`${t('admin.exams.watch')}: ${t('exam.seatWord')} ${s.id}`} onclick={() => s.session && onwatch?.(s.session, `${open?.label ?? ''} · ${t('exam.seatWord')} ${s.id}`)}><Icon name="eye" size={16} /></button>
            <button disabled={!s.joined} title={t('admin.exams.releaseHint')} onclick={() => act(`seats/${s.id}/release`, {}, t('admin.exams.releaseConfirm', { seat: s.id }))}>{t('admin.exams.release')}</button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>
{/if}

<style>
  .name {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .create-box summary {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .create {
    display: grid;
    gap: 12px;
    margin-top: 14px;
  }
  .create .row {
    align-items: flex-end;
    margin: 0;
  }
  .create label:not(.check) {
    display: grid;
    gap: 6px;
  }
  .cockpit {
    margin-top: 24px;
    padding: 20px 22px 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--a-radius);
  }
  .cockpit table {
    border-radius: var(--a-radius-s);
  }
  .cockpit-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 14px;
  }
  .cockpit-head h3 {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: 1.2rem;
  }
  .cockpit-head p {
    margin: 2px 0 0;
  }
  .progress {
    display: grid;
    justify-items: end;
    text-align: right;
  }
  .toolbar {
    padding-bottom: 14px;
    border-bottom: 1px solid var(--a-line);
  }
  .toolbar .push {
    margin-left: auto;
  }
  .icon {
    min-width: 32px;
    padding: 0 8px;
  }
  td.actions .led {
    vertical-align: middle;
    margin-right: 4px;
  }
  .create-box {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 8px 12px;
    margin-bottom: 12px;
    background: var(--surface);
  }
  .create-box summary {
    cursor: pointer;
    font-weight: 600;
  }
  .unlock {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 6px;
    background: var(--panel-2, #f1f5f9);
  }
  .unlock code {
    font-size: 1.3rem;
    letter-spacing: 0.12em;
    font-weight: 600;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
  }
  .short input {
    width: 6em;
  }
  .extra {
    color: #b45309;
    font-weight: 600;
    margin-right: 4px;
  }
  .warn {
    color: #b45309;
  }
</style>
