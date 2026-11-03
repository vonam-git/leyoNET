<script lang="ts">
  import { emptyTopology, pointsOf, randomCode, randomExamId, type ExamBuildVariant } from '../../core';
  import { t } from '../../i18n';
  import { downloadKeyFile, downloadLearnerFile, faultVariants, prepareExam, stripConfiguration, type BuiltExam } from '../examFiles';
  import { editor } from '../state/editor.svelte';
  import Modal from './Modal.svelte';

  /**
   * Aktuelle Aufgabe als Prüfung speichern: Startnetz wählen (leer, nur Geräte,
   * aktuelles Netz oder Fehlersuche mit zufälligen Fehlern je Platz), dann
   * Prüfungsdatei (für die Lernenden) und Schlüssel (für die Lehrperson) speichern.
   */
  let { onclose }: { onclose: () => void } = $props();

  type Start = 'empty' | 'devices' | 'current' | 'faults';
  const tasks = editor.tasks;
  let title = $state(tasks?.title ?? '');
  let minutes = $state('45');
  let code = $state(randomCode());
  let start = $state<Start>('empty');
  let seats = $state('20');
  let faults = $state('3');
  let built = $state<BuiltExam | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);

  const total = $derived((tasks?.goals.reduce((s, g) => s + pointsOf(g), 0) ?? 0) + (start === 'faults' ? 2 * Number(faults || 0) : 0));

  // Jede Änderung macht die erzeugten Dateien ungültig.
  $effect(() => {
    void [title, minutes, code, start, seats, faults];
    built = null;
  });

  async function create() {
    if (!tasks) return;
    error = null;
    const n = Number(seats);
    const k = Number(faults);
    const m = Number(minutes);
    if (!title.trim()) return (error = t('exam.export.needTitle'));
    if (!/^[A-Za-z0-9]{4,12}$/.test(code.trim())) return (error = t('exam.export.badCode'));
    if (minutes && (!Number.isInteger(m) || m < 1 || m > 600)) return (error = t('exam.export.badMinutes'));
    if (start === 'faults' && (!Number.isInteger(n) || n < 1 || n > 40 || !Number.isInteger(k) || k < 1 || k > 6)) return (error = t('exam.export.badSeats'));
    busy = true;
    try {
      const base = { ...tasks, title: title.trim() };
      let variants: ExamBuildVariant[];
      if (start === 'faults') {
        variants = faultVariants(editor.topology, base, { seats: n, count: k, seed: Math.floor(Math.random() * 1e9) });
        const short = variants.find((v) => (v.notes?.length ?? 0) < k);
        if (short) error = t('exam.export.fewFaults', { found: short.notes?.length ?? 0, wanted: k });
      } else {
        const topology = start === 'current' ? editor.topology : start === 'devices' ? stripConfiguration(editor.topology) : emptyTopology();
        variants = [{ id: '1', tasks: base, topology, ...(start === 'current' ? { prebuilt: true } : {}) }];
      }
      built = await prepareExam({ id: randomExamId(), title: title.trim(), ...(tasks.description ? { description: tasks.description } : {}), ...(m ? { minutes: m } : {}), code: code.trim().toUpperCase(), variants });
    } finally {
      busy = false;
    }
  }
</script>

<Modal title={t('exam.export.title')} {onclose} width={620}>
  <p class="muted">{t('exam.export.intro')}</p>
  <div class="grid">
    <label class="wide">{t('exam.export.name')}<input bind:value={title} maxlength="120" /></label>
    <label>{t('exam.export.minutes')}<input bind:value={minutes} inputmode="numeric" /></label>
    <label>{t('exam.export.code')}<span class="code"><input bind:value={code} spellcheck="false" autocomplete="off" /><button type="button" onclick={() => (code = randomCode())} title={t('exam.export.newCode')}>🎲</button></span></label>
  </div>
  <fieldset>
    <legend>{t('exam.export.start')}</legend>
    {#each ['empty', 'devices', 'current', 'faults'] as const as s (s)}
      <label class="radio"><input type="radio" bind:group={start} value={s} /> <span><strong>{t(`exam.export.start.${s}`)}</strong> – {t(`exam.export.start.${s}.hint`)}</span></label>
    {/each}
    {#if start === 'faults'}
      <div class="grid">
        <label>{t('exam.export.seats')}<input bind:value={seats} inputmode="numeric" /></label>
        <label>{t('exam.export.faults')}<input bind:value={faults} inputmode="numeric" /></label>
      </div>
    {/if}
  </fieldset>
  <p class="muted">{t('exam.export.total', { points: total, goals: tasks?.goals.length ?? 0 })}</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if built}
    <div class="done" role="status">
      <p>{t('exam.export.ready', { variants: built.key.variants.length, code: built.key.code })}</p>
      <p class="muted">{t('exam.export.keyWarning')}</p>
      <div class="buttons">
        <button class="primary" onclick={() => built && downloadLearnerFile(built)}>{t('exam.export.saveLearner')}</button>
        <button onclick={() => built && downloadKeyFile(built)}>{t('exam.export.saveKey')}</button>
      </div>
    </div>
  {/if}
  {#snippet actions()}
    <button class="primary" onclick={create} disabled={busy || !tasks}>{t('exam.export.create')}</button>
  {/snippet}
</Modal>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px 12px;
    margin: 8px 0;
  }
  .wide {
    grid-column: 1 / -1;
  }
  label {
    display: grid;
    gap: 3px;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .radio {
    display: flex;
    gap: 8px;
    align-items: baseline;
    color: var(--text);
    font-size: 0.85rem;
    margin: 4px 0;
  }
  .radio input {
    width: auto;
  }
  .code {
    display: flex;
    gap: 4px;
  }
  .code input {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    min-width: 0;
    flex: 1;
  }
  fieldset {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px;
  }
  legend {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .muted {
    color: var(--muted);
    font-size: 0.82rem;
  }
  .error {
    color: var(--danger);
    font-size: 0.85rem;
  }
  .done {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px;
    background: color-mix(in srgb, #16a34a 8%, var(--surface));
  }
  .done p {
    margin: 4px 0;
  }
  .buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .primary {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
</style>
