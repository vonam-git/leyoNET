<script lang="ts">
  import { pointsOf, scoreOf, swissGrade, type TaskSet } from '../../core';
  import { t } from '../../i18n';
  import { editor } from '../state/editor.svelte';
  import { taskView } from '../state/taskView.svelte';
  import RichText from './RichText.svelte';
  import Stars from './Stars.svelte';

  /**
   * Inhalt einer Aufgabe: Titel, Auftrag, Lernziele mit Antworten, «Prüfen».
   * In der Seitenleiste kompakt, im grossen Fenster mit mehr Platz.
   */
  let { tasks, large = false }: { tasks: TaskSet; large?: boolean } = $props();

  const results = $derived(taskView.results);
  const passedCount = $derived(results?.filter((r) => r.passed).length ?? 0);
  /** Punkte anzeigen, sobald ein Ziel eigene Punkte hat oder benotet wird. */
  const withPoints = $derived(tasks.grading || tasks.goals.some((g) => g.points !== undefined));
  const maxPoints = $derived(tasks.goals.reduce((sum, g) => sum + pointsOf(g), 0));
  const score = $derived(results ? scoreOf(tasks, results) : null);
  const resultOf = (id: string) => results?.find((r) => r.id === id);
  /** Prüfungsdatei: Punkte je Teil statt Prüfbausteinen. */
  const raster = $derived(tasks.exam?.raster ?? null);
  const rasterTotal = $derived(raster?.reduce((s, r) => s + r.points, 0) ?? 0);
</script>

<div class="task-body" class:large>
  {#if tasks.difficulty}<Stars n={tasks.difficulty} />{/if}
  <h3>{tasks.title}</h3>
  {#if raster}
    <table class="raster">
      <caption>{t('tasks.raster')}</caption>
      <tbody>
        {#each raster as row (row.label)}<tr><td>{row.label}</td><td class="num">{row.points}</td></tr>{/each}
        <tr class="sum"><td>{t('exam.rasterTotal')}</td><td class="num">{rasterTotal}</td></tr>
      </tbody>
    </table>
    {#if tasks.grading}<p class="muted">{t('tasks.gradeFormula')}</p>{/if}
  {:else if withPoints}<p class="muted">{t('tasks.maxPoints', { max: maxPoints })}{tasks.grading ? ` · ${t('tasks.gradeFormula')}` : ''}</p>{/if}
  {#if tasks.description}
    <div class="description"><RichText text={tasks.description} /></div>
  {/if}
  <ol class="goals">
    {#each tasks.goals as goal (goal.id)}
      {@const result = resultOf(goal.id)}
      <li class:passed={result?.passed} class:failed={result && !result.passed}>
        <span class="mark" aria-hidden="true">{result ? (result.passed ? '✓' : '✗') : '○'}</span>
        <span>
          <RichText text={goal.text} inline />
          {#if withPoints}<span class="pts">({t('tasks.points', { n: pointsOf(goal) })})</span>{/if}
          {#if goal.check.type === 'answer'}
            {#if goal.check.kind === 'choice' && goal.check.options}
              <span class="answer" role="radiogroup" aria-label={goal.text}>
                {#each goal.check.options as option (option)}
                  <label><input type="radio" name="answer-{large ? "w" : "p"}-{goal.id}" checked={tasks.answers?.[goal.id] === option} onchange={() => editor.setAnswer(goal.id, option)} /> {option}</label>
                {/each}
              </span>
            {:else}
              <input class="answer" value={tasks.answers?.[goal.id] ?? ''} onchange={(e) => editor.setAnswer(goal.id, e.currentTarget.value)} aria-label={goal.text} placeholder={t('tasks.answerPlaceholder')} />
            {/if}
          {/if}
          {#if result}
            <span class="visually-hidden">{t(result.passed ? 'tasks.passed' : 'tasks.failed')}</span>
          {/if}
          {#if result && !result.passed}
            {#if result.reason}
              <span class="reason">{t(`tasks.reason.${result.reason.code}`, result.reason.params)}</span>
            {/if}
            {#if goal.hint}
              <span class="hint">💡 {goal.hint}</span>
            {/if}
          {/if}
        </span>
      </li>
    {/each}
  </ol>
  {#if tasks.noSelfCheck}
    <p class="muted">{t('tasks.noSelfCheck')}</p>
  {:else}
    <button class="check" onclick={() => taskView.check(tasks)} disabled={taskView.checking}>{taskView.checking ? t('tasks.checking') : t('tasks.check')}</button>
  {/if}
  {#if taskView.results}
    <p class="summary" role="status">
      {t('tasks.summary', { passed: passedCount, total: tasks.goals.length })}
      {#if withPoints && score}<br />{t('tasks.score', { points: score.points, max: score.max })}{#if tasks.grading} · {t('tasks.grade', { grade: swissGrade(score.points, score.max).toFixed(1) })}{/if}{/if}
    </p>
  {/if}
</div>

<style>
  .task-body {
    font-size: 0.8rem;
  }
  .large {
    font-size: 0.95rem;
  }
  .large h3 {
    font-size: 1.15rem;
    margin: 4px 0 10px;
  }
  .large .description {
    padding: 12px 14px;
    margin: 0 0 14px;
    border-left: 3px solid var(--accent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--accent) 6%, var(--surface));
  }
  .large .goals {
    gap: 10px;
  }
  .large .goals li {
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .large .goals li.passed {
    border-color: color-mix(in srgb, var(--distribution) 50%, var(--border));
    background: color-mix(in srgb, var(--distribution) 7%, transparent);
  }
  .large .goals li.failed {
    border-color: color-mix(in srgb, var(--danger) 45%, var(--border));
  }
  .large .answer {
    font-size: 0.95rem;
    max-width: 28em;
  }
  h3 {
    margin: 8px 0 4px;
    font-size: 0.85rem;
  }
  .description {
    margin: 0 0 8px;
  }
  .goals {
    list-style: none;
    margin: 0 0 8px;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .goals li {
    display: grid;
    grid-template-columns: 1.2em 1fr;
    gap: 4px;
  }
  .mark {
    font-weight: 700;
    color: var(--muted);
  }
  .passed .mark {
    color: var(--distribution);
  }
  .failed .mark {
    color: var(--danger);
  }
  .reason,
  .hint {
    display: block;
    margin-top: 2px;
    color: var(--muted);
  }
  .raster {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
    margin: 6px 0;
  }
  .raster caption {
    text-align: left;
    color: var(--muted);
    font-size: 0.75rem;
  }
  .raster td {
    padding: 2px 4px;
    border-bottom: 1px solid var(--border);
  }
  .raster .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .raster .sum td {
    font-weight: 600;
  }
  .answer {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 4px;
    width: 100%;
    font-size: 0.82rem;
  }
  .answer label {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .answer input[type='radio'] {
    width: auto;
  }
  .pts {
    color: var(--muted);
    white-space: nowrap;
  }
  .check {
    width: 100%;
    font-weight: 600;
  }
  .summary {
    margin: 6px 0 0;
    font-weight: 600;
  }
  .muted {
    color: var(--muted);
    margin: 4px 0 0;
  }
</style>
