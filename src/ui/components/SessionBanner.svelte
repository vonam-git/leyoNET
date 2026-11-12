<script lang="ts">
  import { serializeProject } from '../../core';
  import { t } from '../../i18n';
  import { editor } from '../state/editor.svelte';
  import { session } from '../state/session.svelte';
  import { startWatch, stopWatch } from '../watch';

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

  async function watchOwn() {
    if (session.code) await startWatch(session.code);
  }
</script>

{#if session.watching}
  <div class="banner watch" role="status">
    <strong>👁 {t('watch.title', { code: session.watching.label ?? session.watching.code })}</strong>
    <span>{t('watch.readOnly')}</span>
    {#if fresh}<span class="fresh">⟳ {t('watch.fresh')}</span>{/if}
    <span class="muted">{t('watch.updated', { time: time(session.watching.updated) })} · {session.watching.connected ? t('watch.online') : t('watch.offline')}</span>
    {#if session.watching.error}<span class="error">{t('watch.error')}</span>{/if}
    <button onclick={stopWatch}>{t('watch.stop')}</button>
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
