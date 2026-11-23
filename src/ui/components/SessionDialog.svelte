<script lang="ts">
  import { codeInput } from '../codeInput';
  import { emptyTopology, serializeProject } from '../../core';
  import { locale, t } from '../../i18n';
  import { editor } from '../state/editor.svelte';
  import { session, ApiError } from '../state/session.svelte';
  import { ensureProjectFeatures } from '../actions';
  import { startWatch } from '../watch';
  import Modal from './Modal.svelte';

  /**
   * Online-Session: Code anzeigen, mit einem Code weiterarbeiten, einer Klasse
   * beitreten oder die eigene Session löschen. Es gibt keine Namen.
   */
  let { onclose }: { onclose: () => void } = $props();

  let resumeCode = $state('');
  let classCode = $state('');
  /** Platz (leer = nächster freier) und Gruppe für den Klassen-Verbund. */
  let seat = $state('');
  let group = $state('');
  let message = $state<{ kind: 'ok' | 'error'; text: string } | null>(null);
  let busy = $state(false);
  /** Gesperrte Session: PIN abfragen; offen an anderem Gerät: Ansehen anbieten. */
  let needPin = $state(false);
  let pin = $state('');
  let inUse = $state(false);
  let lockPin = $state('');
  let watchCode = $state('');

  /** Was die Person tun will: grosse Knöpfe statt einer langen Liste (Klassencode nicht mit dem eigenen Code verwechseln). */
  type Choice = 'join' | 'resume' | 'new' | 'watch' | 'manage';
  const CHOICES: { id: Choice; icon: string }[] = [
    { id: 'join', icon: '🏫' },
    { id: 'resume', icon: '↩' },
    { id: 'new', icon: '＋' },
    { id: 'watch', icon: '👁' },
    { id: 'manage', icon: '⚙' },
  ];
  let choice = $state<Choice>(session.classCode ? 'resume' : 'join');

  const project = () => serializeProject(editor.topology, editor.tasks, editor.snapshots);
  const until = $derived(
    session.expires ? new Date(session.expires).toLocaleString(locale() === 'en' ? 'en-GB' : 'de-CH', { dateStyle: 'short', timeStyle: 'short' }) : '',
  );

  function errorText(error: unknown): string {
    const code = error instanceof ApiError ? error.code : 'error';
    return t(`session.error.${['unknownSession', 'unknownClass', 'rateLimited', 'offline', 'wrongPin', 'sessionInUse', 'sessionLocked', 'invalidPin'].includes(code) ? code : 'other'}`);
  }

  async function run(action: () => Promise<string>) {
    busy = true;
    message = null;
    try {
      message = { kind: 'ok', text: await action() };
    } catch (error) {
      message = { kind: 'error', text: errorText(error) };
    } finally {
      busy = false;
    }
  }

  const resume = () =>
    run(async () => {
      try {
        const loaded = await session.open(resumeCode, needPin ? pin : undefined);
        editor.replace(loaded.topology, { undoable: true, tasks: loaded.tasks ?? null, snapshots: loaded.snapshots ?? [] });
        ensureProjectFeatures();
      } catch (error) {
        if (error instanceof ApiError && error.status === 423 && error.code !== 'wrongPin') needPin = true;
        if (error instanceof ApiError && error.status === 409) inUse = true;
        throw error;
      }
      resumeCode = '';
      needPin = false;
      inUse = false;
      pin = '';
      return t('session.resumed', { code: session.code ?? '' });
    });

  async function watch(code: string) {
    if (await startWatch(code)) onclose();
  }

  const lock = () =>
    run(async () => {
      await session.lock(lockPin);
      lockPin = '';
      return t('session.lockedOk');
    });

  const unlock = () =>
    run(async () => {
      await session.unlock();
      return t('session.unlockedOk');
    });

  const join = () =>
    run(async () => {
      const n = Number(seat);
      await session.joinClass(classCode, project(), { ...(seat.trim() && Number.isInteger(n) ? { seat: n } : {}), ...(group.trim() ? { label: group.trim() } : {}) });
      classCode = '';
      return t('session.joined', { label: session.classLabel ?? '', code: session.code ?? '' });
    });

  const fresh = () =>
    run(async () => {
      // Neue Session: Es beginnt leer (der alte Stand bleibt unter dem alten Code erreichbar).
      session.detach();
      editor.replace(emptyTopology(), { undoable: false, tasks: null, snapshots: [] });
      const code = await session.create(project(), null);
      return t('session.created', { code });
    });

  const remove = () =>
    run(async () => {
      await session.remove();
      return t('session.deleted');
    });

  async function copy() {
    if (!session.code) return;
    try {
      await navigator.clipboard.writeText(session.code);
      message = { kind: 'ok', text: t('session.copied') };
    } catch {
      message = null;
    }
  }
</script>

<Modal title={t('session.title')} {onclose}>
  {#if session.code}
    <div class="mine">
      <p class="muted">{t('session.current')}</p>
      <p class="big code">{session.code} <button onclick={copy}>{t('session.copy')}</button></p>
      <p class="muted">
        {t('session.expires', { time: until })}
        {#if session.classCode}· {t('session.inClass')}{#if session.classLabel} «{session.classLabel}»{/if}{/if}
        {#if session.site}· {t('verbund.siteOf', { seat: session.site.seat, label: session.site.label || '–' })}{/if}
      </p>
      <p class="note">{t('session.ownCodeNote')}</p>
    </div>
  {:else}
    <p class="muted">{t('session.none')}</p>
  {/if}

  <div class="choices" role="tablist" aria-label={t('session.chooseTitle')}>
    {#each CHOICES as c (c.id)}
      <button role="tab" aria-selected={choice === c.id} class:active={choice === c.id} onclick={() => (choice = c.id)}>
        <span class="icon" aria-hidden="true">{c.icon}</span>
        <span>{t(`session.choice.${c.id}`)}</span>
      </button>
    {/each}
  </div>

  {#if choice === 'join'}
    <section class="panel">
      <h3>{t('session.classTitle')}</h3>
      <p class="muted">{t('session.classHint')}</p>
      <form onsubmit={(e) => (e.preventDefault(), join())}>
        <input bind:value={classCode} placeholder="WXYZ-6789" maxlength="14" use:codeInput aria-label={t('session.classCode')} class="code" autocomplete="off" />
        <input bind:value={seat} inputmode="numeric" pattern={"[0-9]{1,2}"} placeholder={t('verbund.seat')} aria-label={t('verbund.seatHint')} title={t('verbund.seatHint')} class="seat" autocomplete="off" />
        <input bind:value={group} maxlength="30" placeholder={t('verbund.group')} aria-label={t('verbund.groupHint')} title={t('verbund.groupHint')} class="group" autocomplete="off" />
        <button type="submit" class="primary" disabled={busy || !classCode.trim()}>{t('session.join')}</button>
      </form>
    </section>
  {:else if choice === 'resume'}
    <section class="panel">
      <h3>{t('session.resumeTitle')}</h3>
      <p class="muted">{t('session.resumeHint')}</p>
      <form onsubmit={(e) => (e.preventDefault(), resume())}>
        <input bind:value={resumeCode} placeholder="ABCD-2345" maxlength="14" use:codeInput aria-label={t('session.code')} class="code" autocomplete="off" />
        <button type="submit" class="primary" disabled={busy || !resumeCode.trim()}>{t('session.resume')}</button>
      </form>
      {#if needPin}
        <p class="muted">{t('session.needPin')}</p>
        <form onsubmit={(e) => (e.preventDefault(), resume())}>
          <input bind:value={pin} type="password" inputmode="numeric" maxlength="8" pattern={"[0-9]{4,8}"} aria-label={t('session.pin')} autocomplete="off" />
          <button type="submit" disabled={busy || pin.length < 4}>{t('session.resume')}</button>
        </form>
      {/if}
      {#if inUse}
        <p class="muted">{t('session.inUse')} <button onclick={() => watch(resumeCode)}>{t('session.watch')}</button></p>
      {/if}
    </section>
  {:else if choice === 'new'}
    <section class="panel">
      <h3>{t('session.newTitle')}</h3>
      <p class="muted">{t('session.newHint')}</p>
      <button class="primary" onclick={fresh} disabled={busy}>{t('session.new')}</button>
    </section>
  {:else if choice === 'watch'}
    <section class="panel">
      <h3>{t('session.watchTitle')}</h3>
      <p class="muted">{t('session.watchHint')}</p>
      <form onsubmit={(e) => (e.preventDefault(), watch(watchCode))}>
        <input bind:value={watchCode} placeholder="ABCD-2345" maxlength="14" use:codeInput aria-label={t('session.watchTitle')} class="code" autocomplete="off" />
        <button type="submit" disabled={busy || !watchCode.trim()}>{t('session.watch')}</button>
      </form>
    </section>
  {:else if choice === 'manage'}
    <section class="panel">
      {#if session.code && !session.takenOver}
        <h3>{t('session.lockTitle')}</h3>
        {#if session.locked}
          <p class="ok">🔒 {t('session.locked')}</p>
          <button onclick={unlock} disabled={busy}>{t('session.unlock')}</button>
        {:else}
          <p class="muted">{t('session.lockHint')}</p>
          <form onsubmit={(e) => (e.preventDefault(), lock())}>
            <input bind:value={lockPin} type="password" inputmode="numeric" maxlength="8" pattern={"[0-9]{4,8}"} aria-label={t('session.pin')} autocomplete="new-password" />
            <button type="submit" disabled={busy || !/^\d{4,8}$/.test(lockPin)}>{t('session.lock')}</button>
          </form>
        {/if}
      {/if}
      <h3>{t('session.deleteTitle')}</h3>
      <button class="danger" onclick={remove} disabled={busy || !session.code}>{t('session.delete')}</button>
    </section>
  {/if}

  {#if message}<p class={message.kind} role="status">{message.text}</p>{/if}
  <p class="muted small">{t('session.privacy', { hours: session.config?.policy.sessionHours ?? 24 })}</p>
</Modal>

<style>
  .seat {
    width: 4.5rem;
  }
  .mine {
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface-2, var(--surface));
  }
  .mine p {
    margin: 2px 0;
  }
  .note {
    font-size: 0.78rem;
    color: var(--muted);
  }
  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: 8px;
    margin: 14px 0 6px;
  }
  .choices button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 6px;
    border-radius: 10px;
    font-weight: 600;
  }
  .choices button.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  }
  .choices .icon {
    font-size: 1.4rem;
    line-height: 1;
  }
  .panel {
    margin-top: 12px;
  }
  .panel h3:first-child {
    margin-top: 0;
  }
  .group {
    width: 9rem;
  }
  .big {
    font-size: 1.6rem;
    font-weight: 700;
    margin: 4px 0;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .big button {
    font-size: 0.8rem;
    font-weight: normal;
    letter-spacing: normal;
  }
  form,
  .row {
    display: flex;
    gap: 8px;
  }
  form input {
    flex: 1;
    text-transform: uppercase;
  }
  .danger {
    color: var(--danger);
    border-color: var(--danger);
  }
  .small {
    font-size: 0.75rem;
    margin-top: 14px;
  }
</style>
