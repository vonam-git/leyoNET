<script lang="ts">
  import { t } from '../../i18n';
  import { editor } from '../state/editor.svelte';
  import { dialogs } from '../state/dialogs.svelte';
  import { ui } from '../state/ui.svelte';
  import { examMode } from '../state/exam.svelte';
  import { session } from '../state/session.svelte';
  import { isLargeTask, taskView } from '../state/taskView.svelte';
  import TaskBody from './TaskBody.svelte';

  /** Aufgabe in der Seitenleiste; «Gross anzeigen» öffnet sie in einem eigenen Fenster. */
  const tasks = $derived(editor.tasks);
  const locked = $derived(!!examMode.active);

  // Neue Aufgabe oder anderes Netz: alte Ergebnisse gelten nicht mehr.
  $effect(() => {
    void editor.tasks;
    void editor.generation;
    taskView.reset();
  });

  // Neue grosse Aufgabe (z.B. aus dem Katalog): gleich im Fenster zeigen. Nicht beim Ansehen
  // einer Session: dort kommt bei jedem neuen Stand dieselbe Aufgabe neu an.
  let shownFor: unknown = null;
  $effect(() => {
    const current = editor.tasks;
    if (current && current !== shownFor && shownFor !== null && isLargeTask(current) && !locked && !session.watching) taskView.show();
    if (!current) taskView.close();
    shownFor = current ?? 0;
  });
</script>

<section class="tasks" aria-labelledby="tasks-title">
  <div class="head">
    <h2 id="tasks-title">{t('tasks.title')}</h2>
    {#if ui.has('tool.taskEditor') && !locked}
    <button class="small" onclick={() => dialogs.show('taskEditor')} disabled={!editor.editable} title={t('tasks.editHint')}>
      {tasks ? t('tasks.edit') : t('tasks.create')}
    </button>
    {/if}
  </div>

  {#if !locked}<button class="catalog" onclick={() => dialogs.show('catalog')} title={t('catalog.openHint')} disabled={editor.acting}>★ {t('catalog.open')}</button>{/if}

  {#if !tasks}
    <p class="muted">{t('tasks.none')}</p>
  {:else}
    <button class="small enlarge" onclick={() => taskView.toggle()} aria-pressed={taskView.open} title={t('tasks.enlargeHint')}>⤢ {taskView.open ? t('tasks.shrink') : t('tasks.enlarge')}</button>
    <TaskBody {tasks} />
  {/if}
  {#if ui.has('tool.taskEditor') && !locked}<button class="small review" onclick={() => dialogs.show('review')} title={t('review.openHint')}>{t('review.open')}</button>{/if}
</section>

<style>
  .tasks {
    padding: 12px;
    border-top: 1px solid var(--border);
    font-size: 0.8rem;
  }
  .catalog {
    width: 100%;
    margin: 4px 0 8px;
    font-weight: 600;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  h2 {
    margin: 0;
    font-size: 0.95rem;
  }
  .small {
    font-size: 0.7rem;
    padding: 2px 6px;
  }
  .enlarge {
    float: right;
    margin-left: 6px;
  }
  .review {
    margin-top: 10px;
  }
  .muted {
    color: var(--muted);
    margin: 4px 0 0;
  }
</style>
