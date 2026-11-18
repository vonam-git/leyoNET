<script lang="ts">
  import { randomCode, type FaultKind } from '../../core';
  import { t } from '../../i18n';
  import { COCKPIT_FAULT_KINDS, cockpitExam } from '../examCockpit';
  import Icon from './Icon.svelte';

  /**
   * Admin-Konsole, Prüfungen: eine Prüfung direkt hier erstellen, ohne Prüfungsdatei.
   * «Aufbauen (M117)»: je Platz eine gewürfelte Variante des Firmennetzes.
   * «Fehlersuche»: das fertige Firmennetz mit zufälligen Fehlern, an jedem Platz andere.
   * Prüfungsdatei und Schlüssel entstehen hier im Browser und gehen nur an den eigenen Server
   * (der Schlüssel verschlüsselt). Die Lernenden sehen weder Prüfbausteine noch Lösung.
   */
  let {
    call,
    notify,
    oncreated,
  }: {
    call: <T>(method: string, path: string, body?: unknown) => Promise<T>;
    notify: (kind: 'ok' | 'error', text: string) => void;
    oncreated: (exam: unknown) => void;
  } = $props();

  type Template = 'build' | 'faults';
  const KINDS = COCKPIT_FAULT_KINDS;

  let template = $state<Template>('faults');
  let label = $state('');
  let seats = $state(20);
  let minutes = $state(45);
  let code = $state(randomCode(8));
  let count = $state(5);
  let kinds = $state<FaultKind[]>([...KINDS]);
  let hideHints = $state(true);
  let seb = $state(false);
  let sebQuitLink = $state(true);
  let attempts = $state(5);
  let lockMinutes = $state(10);
  let busy = $state(false);
  let created = $state<{ code: string; notes: number } | null>(null);

  const valid = $derived(
    label.trim().length > 0 &&
      seats >= 1 &&
      seats <= 60 &&
      minutes >= 1 &&
      minutes <= 600 &&
      /^[A-Za-z0-9]{6,12}$/.test(code.trim()) &&
      attempts >= 1 &&
      attempts <= 20 &&
      lockMinutes >= 0 &&
      lockMinutes <= 240 &&
      (template === 'build' || (count >= 1 && count <= 8 && kinds.length > 0)),
  );

  function pick(t2: Template) {
    template = t2;
    minutes = t2 === 'build' ? 80 : 45;
  }

  function toggle(kind: FaultKind, on: boolean) {
    kinds = on ? [...kinds, kind] : kinds.filter((k) => k !== kind);
  }

  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    busy = true;
    created = null;
    try {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
      const title = label.trim();
      const result = await cockpitExam({ template, title, seats, minutes, code: code.trim().toUpperCase(), seed, count, kinds, hideHints });
      if (!result.ok) {
        notify('error', t('exam.export.fewFaults', { found: result.found, wanted: result.wanted }));
        return;
      }
      const exam = await call<unknown>('POST', 'exams', { label: title.slice(0, 60), learner: result.learner, key: result.key, seats, minutes, seb, sebQuitLink: seb && sebQuitLink, unlock: { attempts, lockMinutes } });
      created = { code: code.trim().toUpperCase(), notes: result.variants.length };
      notify('ok', t('admin.exams.created', { label: title }));
      label = '';
      code = randomCode(8);
      oncreated(exam);
    } catch (error) {
      const c = (error as { code?: string }).code ?? '';
      notify('error', t(`admin.exams.error.${['labelRequired', 'badSeats', 'badMinutes', 'tooLarge'].includes(c) ? c : 'other'}`));
    } finally {
      busy = false;
    }
  }
</script>

<form class="builder" onsubmit={create}>
  <div class="templates" role="radiogroup" aria-label={t('admin.build.template')}>
    {#each ['faults', 'build'] as const as id (id)}
      <label class="template" class:on={template === id}>
        <input type="radio" name="template" value={id} checked={template === id} onchange={() => pick(id)} />
        <span class="t-icon"><Icon name={id === 'faults' ? 'sparkle' : 'clipboard'} size={20} /></span>
        <span>
          <strong>{t(`admin.build.${id}`)}</strong>
          <small>{t(`admin.build.${id}Hint`)}</small>
        </span>
      </label>
    {/each}
  </div>

  <div class="fields">
    <label class="wide">{t('admin.exams.label')}<input bind:value={label} maxlength="60" required placeholder={t(`admin.build.${template}Placeholder`)} /></label>
    <label>{t('exam.seats')}<input type="number" min="1" max="60" bind:value={seats} required /></label>
    <label>{t('admin.exams.minutesRequired')}<input type="number" min="1" max="600" bind:value={minutes} required /></label>
    <label>
      {t('exam.export.code')}
      <span class="code"><input bind:value={code} maxlength="12" spellcheck="false" autocomplete="off" required /><button type="button" class="quiet" onclick={() => (code = randomCode(8))} title={t('exam.export.newCode')} aria-label={t('exam.export.newCode')}><Icon name="refresh" size={16} /></button></span>
    </label>
  </div>

  {#if template === 'faults'}
    <fieldset>
      <legend>{t('admin.build.faultsTitle')}</legend>
      <div class="fields">
        <label>{t('admin.build.count')}<input type="number" min="1" max="8" bind:value={count} /></label>
        <label class="check wide"><input type="checkbox" bind:checked={hideHints} /> {t('admin.build.hideHints')}</label>
      </div>
      <div class="kinds">
        {#each KINDS as kind (kind)}
          <label class="check"><input type="checkbox" checked={kinds.includes(kind)} onchange={(e) => toggle(kind, e.currentTarget.checked)} /> {t(`fault.kind.${kind}`)}</label>
        {/each}
      </div>
    </fieldset>
  {/if}

  <fieldset>
    <legend>{t('admin.build.security')}</legend>
    <div class="fields">
      <label>{t('admin.unlock.attempts')}<input type="number" min="1" max="20" bind:value={attempts} /></label>
      <label>{t('admin.unlock.lockMinutes')}<input type="number" min="0" max="240" bind:value={lockMinutes} /></label>
      <label class="check"><input type="checkbox" bind:checked={seb} /> {t('seb.create')}</label>
      {#if seb}<label class="check"><input type="checkbox" bind:checked={sebQuitLink} /> {t('seb.opt.quitLink')}</label>{/if}
    </div>
    <p class="muted small">{t('admin.unlock.hint')}</p>
  </fieldset>

  <div class="row">
    <button type="submit" class="primary" disabled={!valid || busy}><Icon name="plus" size={16} />{busy ? t('admin.build.busy') : t('admin.build.create')}</button>
    {#if created}<span class="pill ok">{t('admin.build.done', { code: created.code })}</span>{/if}
  </div>
</form>

<style>
  .builder {
    display: grid;
    gap: 14px;
    margin-top: 14px;
  }
  .templates {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 10px;
  }
  .template {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: var(--a-radius-s);
    cursor: pointer;
  }
  .template.on {
    border-color: var(--accent);
    background: var(--a-live-soft);
  }
  .template input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .template:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .template span:last-child {
    display: grid;
    gap: 2px;
  }
  .template small {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .t-icon {
    color: var(--accent);
    padding-top: 2px;
  }
  .fields {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: flex-end;
  }
  .fields label:not(.check) {
    display: grid;
    gap: 6px;
  }
  .fields label:not(.check, .wide) input {
    width: 7rem;
  }
  .fields label.wide:not(.check) input {
    width: 18rem;
    max-width: 100%;
  }
  .code {
    display: flex;
    gap: 4px;
  }
  .code input {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .check {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    min-height: 36px;
  }
  fieldset {
    display: grid;
    gap: 10px;
  }
  legend {
    font-weight: 600;
    padding: 0 4px;
  }
  .kinds {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 2px 12px;
  }
  .row {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .small {
    font-size: 0.8rem;
    margin: 0;
  }
</style>
