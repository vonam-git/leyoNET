<script lang="ts">
  import { serializeProject } from '../../core';
  import { t } from '../../i18n';
  import { editor } from '../state/editor.svelte';
  import { session, SessionStore } from '../state/session.svelte';
  import { startWatch, stopWatch } from '../watch';
  import IdentifyButton from './IdentifyButton.svelte';
  import { showcase } from '../state/showcase.svelte';
  import { tour } from '../state/tour.svelte';

  /**
   * Hinweise zur Online-Session: Ansehen einer fremden Session (nur lesen, wird laufend
   * neu geladen) oder: ein anderes Gerät arbeitet in dieser Session, hier wird nichts gespeichert.
   */
  const time = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString() : '–');
  let busy = $state(false);

  // Beim Ansehen: kurzer Hinweis, wenn ein neuer Stand angekommen ist (nicht beim ersten Laden).
  let fresh = $state(false);
  let last: number | null | undefined;
  let freshTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const updated = session.watching?.updated;
    if (updated === undefined) last = undefined;
    else if (last !== undefined && last !== null && updated !== null && updated !== last) {
      fresh = true;
      clearTimeout(freshTimer);
      freshTimer = setTimeout(() => (fresh = false), 4000);
    }
    if (updated !== undefined) last = updated;
    return () => clearTimeout(freshTimer);
  });

  async function saveAsNew() {
    busy = true;
    try {
      const code = await session.saveAsNew(serializeProject(editor.topology, editor.tasks, editor.snapshots));
      editor.notify(t('session.created', { code }));
    } catch {
      editor.notify(t('session.error.other'), 'error');
    } finally {
      busy = false;
    }
  }

  /** Lehrperson: Hilfe erledigen («Erkennen» siehe IdentifyButton), zwischen Ansehen und Bearbeiten wechseln. */
  async function signal(kind: 'help') {
    const w = session.watching;
    if (!w?.admin) return;
    try {
      await SessionStore.signal(w.admin, w.code, kind);
      editor.notify(t('classLive.help.cleared'));
      if (session.watching) session.watching = { ...session.watching, help: null };
    } catch {
      editor.notify(t('session.error.other'), 'error');
    }
  }
  async function switchMode(edit: boolean) {
    const w = session.watching;
    if (!w?.admin) return;
    busy = true;
    try {
      await startWatch(w.code, w.admin, w.label, edit);
    } finally {
      busy = false;
    }
  }

  async function watchOwn() {
    if (session.code) await startWatch(session.code);
  }
</script>

{#if showcase.active && showcase.demo}
  {@const demo = showcase.demo}
  <div class="banner showcase" role="status">
    <strong>✨ {t('showcase.title', { title: t(`demo.${demo.id}.title`) })}</strong>
    <span>{t('showcase.text')}</span>
    {#if demo.tour?.length}<button onclick={() => tour.start(demo)}>{t('showcase.tour')}</button>{/if}
    <button class="primary" onclick={() => showcase.leave()}>{t('showcase.leave')}</button>
  </div>
{:else if session.watching}
  {@const w = session.watching}
  <div class="banner watch" class:edit={w.edit} role="status">
    <strong>{w.edit ? '✏️' : '👁'} {t(w.edit ? 'classLive.edit.title' : 'watch.title', { code: w.label ?? w.code })}</strong>
    <span>{t(w.edit ? 'classLive.edit.text' : 'watch.readOnly')}</span>
    {#if w.help}<span class="help-pill">🙋 {t('classLive.help.pill')}</span><button onclick={() => signal('help')}>{t('classLive.help.done')}</button>{/if}
    {#if w.admin && w.classCode}
      <IdentifyButton admin={w.admin} code={w.code} onerror={() => editor.notify(t('session.error.other'), 'error')} />
      <button onclick={() => switchMode(!w.edit)} disabled={busy} title={t(w.edit ? 'classLive.edit.toViewHint' : 'classLive.edit.toEditHint')}>{t(w.edit ? 'classLive.edit.toView' : 'classLive.edit.toEdit')}</button>
    {/if}
    {#if fresh}<span class="fresh">⟳ {t('watch.fresh')}</span>{/if}
    <span class="muted">{t('watch.updated', { time: time(session.watching.updated) })} · {session.watching.connected ? t('watch.online') : t('watch.offline')}</span>
    {#if session.watching.error}<span class="error">{t('watch.error')}</span>{/if}
    <button onclick={stopWatch}>{t('watch.stop')}</button>
  </div>
{:else if session.teacherEditing}
  <div class="banner teacher" role="alert">
    <strong>✏️ {t('classLive.teacher.title')}</strong>
    <span>{t('classLive.teacher.text')}</span>
  </div>
{:else if session.takenOver}
  <div class="banner taken" role="alert">
    <strong>{t('session.takenOver.title', { code: session.code ?? '' })}</strong>
    <span>{t(session.locked ? 'session.takenOver.locked' : 'session.takenOver.text')}</span>
    <button onclick={saveAsNew} disabled={busy}>{t('session.takenOver.saveAsNew')}</button>
    <button onclick={watchOwn} disabled={busy || !session.code}>{t('session.takenOver.watch')}</button>
  </div>
{/if}

<style>
  .banner {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    align-items: center;
    padding: 6px 12px;
    font-size: 0.82rem;
    border-bottom: 1px solid var(--border);
  }
  .watch {
    background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  }
  .watch.edit {
    background: color-mix(in srgb, #d97706 16%, var(--surface));
  }
  .teacher {
    background: color-mix(in srgb, #d97706 16%, var(--surface));
  }
  .help-pill {
    padding: 1px 8px;
    border-radius: 999px;
    color: #fff;
    background: #c026d3;
    font-weight: 600;
  }
  .fresh {
    padding: 1px 8px;
    border-radius: 999px;
    color: var(--surface);
    background: var(--accent);
    font-weight: 600;
    animation: pop 0.4s ease-out;
  }
  @keyframes pop {
    from {
      transform: scale(0.85);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .fresh {
      animation: none;
    }
  }
  .showcase {
    background: color-mix(in srgb, #7c3aed 14%, var(--surface));
  }
  .taken {
    background: var(--warning-soft);
  }
  .muted {
    color: var(--muted);
  }
  .error {
    color: var(--danger);
  }
</style>
