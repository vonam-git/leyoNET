<script lang="ts">
  import { parseBundle, serializeBundle } from '../../core';
  import { locale, t } from '../../i18n';
  import { pickFile } from '../actions';
  import { downloadText } from '../persist/files';
  import { dialogs } from '../state/dialogs.svelte';
  import { reviewInbox } from '../state/reviewInbox';
  import { seatCardsHtml } from '../seatCards';

  /**
   * Admin-Konsole, Reiter «Prüfungen»: Prüfung auf den Server laden, Platz-Codes
   * drucken und verteilen, starten, Nachteilsausgleich je Platz, beenden,
   * automatisch auswerten oder alle Abgaben herunterladen.
   */
  let {
    call,
    notify,
    version = 0,
    onwatch,
  }: {
    version?: number;
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
    return t(`admin.exams.error.${['notAnExam', 'labelRequired', 'badSeats', 'keyMismatch', 'alreadyStarted', 'notStarted', 'unknownExam', 'tooLarge'].includes(code) ? code : 'other'}`);
  }

  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (!learner) return;
    busy = true;
    try {
      const exam = await call<Exam>('POST', 'exams', { label, learner: learner.data, key: key?.data ?? null, seats, minutes });
      learner = null;
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

  const left = (seat: Seat) => {
    if (!seat.until) return '';
    const s = Math.round((seat.until - now) / 1000);
    return s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '';
  };
</script>

<h3>{t('admin.exams.createTitle')}</h3>
<form class="create" onsubmit={create}>
  <div class="row">
    <button type="button" onclick={chooseLearner}>📄 {learner ? learner.name : t('admin.exams.learnerFile')}</button>
    <button type="button" onclick={chooseKey}>🔑 {key ? key.name : t('admin.exams.keyFile')}</button>
  </div>
  {#if learner}
    <div class="row">
      <label>{t('admin.exams.label')}<input bind:value={label} maxlength="60" required /></label>
      {#if learner.variants > 1}
        <span class="muted">{t('admin.exams.seatsFromVariants', { n: learner.variants })}</span>
      {:else}
        <label class="short">{t('exam.seats')}<input type="number" min="1" max="60" bind:value={seats} /></label>
      {/if}
      <label class="short">{t('admin.exams.minutes')}<input type="number" min="1" max="600" bind:value={minutes} /></label>
      <button type="submit" class="primary" disabled={busy || !label.trim()}>{t('admin.exams.create')}</button>
    </div>
    {#if !key}<p class="warn">{t('admin.exams.withoutKey')}</p>{/if}
  {/if}
  <p class="muted">{t('admin.exams.hint')}</p>
</form>

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
          <td>{e.label}{#if !e.hasKey} <span class="warn" title={t('admin.exams.withoutKey')}>⚠</span>{/if}</td>
          <td>{t(`admin.exams.state.${e.state}`)}</td>
          <td>{Array.isArray(e.seats) ? e.seats.length : `${e.joined ?? 0}/${e.seats}`}</td>
          <td>{when(e.expires)}</td>
          <td class="actions">
            <button onclick={async () => (open = await call<Exam>('GET', `exams/${e.id}`))}>{t('admin.show')}</button>
            <button class="danger" onclick={() => remove(e)}>{t('inspector.delete')}</button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

{#if open}
  <h3>{open.label}{open.title !== open.label ? ` · ${open.title}` : ''}</h3>
  <div class="row">
    {#if open.state === 'ready'}
      <button onclick={printCards}>🖨 {t('admin.exams.print')}</button>
      <button class="primary" onclick={() => act('start', undefined, t('admin.exams.confirmStart', { n: seatList.length, min: open!.minutes }))}>▶ {t('admin.exams.start')}</button>
    {:else}
      <span>{t('admin.exams.startedAt', { time: time(open.started) })}</span>
      {#if open.state === 'running'}
        <button class="danger" onclick={() => act('end', undefined, t('admin.exams.confirmEnd'))}>■ {t('admin.exams.end')}</button>
        <button onclick={printCards}>🖨 {t('admin.exams.print')}</button>
      {/if}
    {/if}
    <button onclick={evaluate} disabled={open.state === 'ready'}>✓ {t('admin.exams.evaluate')}</button>
    <button onclick={download} disabled={open.state === 'ready'}>⬇ {t('admin.exams.download')}</button>
  </div>
  <p class="muted">{t(`admin.exams.help.${open.state}`)}</p>
  <table>
    <thead>
      <tr><th>{t('exam.seatWord')}</th><th>{t('admin.exams.code')}</th><th>{t('admin.exams.state')}</th><th>{t('admin.exams.saved')}</th><th>{t('admin.exams.until')}</th><th>{t('admin.exams.extra')}</th><th>{t('admin.exams.live')}</th></tr>
    </thead>
    <tbody>
      {#each seatList as s (s.id)}
        <tr>
          <td>{s.id}</td>
          <td class="code">{s.code}</td>
          <td class={s.state}>{s.state === 'open' && !s.joined ? t('admin.exams.seat.absent') : t(`admin.exams.seat.${s.state}`)}</td>
          <td>{time(s.saved)}</td>
          <td>{time(s.until)} {#if s.state === 'open'}<span class="muted">({left(s)})</span>{/if}</td>
          <td class="actions">
            <span class="extra">{s.extra ? `+${s.extra}′` : ''}</span>
            <button title={t('admin.exams.extraAdd', { n: 5 })} onclick={() => act(`seats/${s.id}/extra`, { minutes: 5 })}>+5′</button>
            <button title={t('admin.exams.extraAdd', { n: 15 })} onclick={() => act(`seats/${s.id}/extra`, { minutes: 15 })}>+15′</button>
            <button title={t('admin.exams.extraRemove')} disabled={!s.extra} onclick={() => act(`seats/${s.id}/extra`, { minutes: -5 })}>−5′</button>
          </td>
          <td class="actions">
            <span class="dot" class:on={s.online} title={s.online ? t('admin.exams.online') : t('admin.exams.offline')} aria-label={s.online ? t('admin.exams.online') : t('admin.exams.offline')}></span>
            <button disabled={!s.session || !onwatch} title={t('admin.exams.watchHint')} onclick={() => s.session && onwatch?.(s.session, `${open?.label ?? ''} · ${t('exam.seatWord')} ${s.id}`)}>👁 {t('admin.exams.watch')}</button>
            <button disabled={!s.joined} title={t('admin.exams.releaseHint')} onclick={() => act(`seats/${s.id}/release`, {}, t('admin.exams.releaseConfirm', { seat: s.id }))}>{t('admin.exams.release')}</button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .create {
    display: grid;
    gap: 6px;
    margin-bottom: 10px;
  }
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: end;
  }
  label {
    display: grid;
    gap: 2px;
    font-size: 0.8rem;
  }
  .short input {
    width: 6em;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.85rem;
    margin: 6px 0;
  }
  th,
  td {
    text-align: left;
    padding: 3px 6px;
    border-bottom: 1px solid var(--border);
  }
  tr.active {
    background: var(--surface-2);
  }
  .code {
    font-family: ui-monospace, Consolas, monospace;
    letter-spacing: 0.06em;
  }
  .actions {
    white-space: nowrap;
    text-align: right;
  }
  .actions button {
    padding: 1px 6px;
  }
  .dot {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--border);
    margin-right: 4px;
  }
  .dot.on {
    background: #16a34a;
  }
  .extra {
    color: #b45309;
    font-weight: 600;
    margin-right: 4px;
  }
  .open {
    color: #15803d;
  }
  .closed {
    color: var(--muted);
  }
  .warn {
    color: #b45309;
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .primary {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
  .danger {
    color: var(--danger);
  }
</style>
