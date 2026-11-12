<script lang="ts">
  import { t } from '../../i18n';
  import { downloadText } from '../persist/files';
  import { randomPassword, sebFile } from '../seb';

  /**
   * Prüfung im Safe Exam Browser: SEB-Datei mit Start-Adresse (Schlüssel der Prüfung) und
   * drei Passwörtern erzeugen. Die Passwörter entstehen hier im Browser, werden nirgends
   * gespeichert und stehen nur in der Datei (Admin und Beenden nur als Hash).
   */
  let {
    exam,
    onchange,
  }: {
    exam: { id: string; label: string; state: 'ready' | 'running' | 'ended'; seb: { key: string | null } | null };
    /** Server: SEB verlangen (neuer Schlüssel) oder nicht mehr. */
    onchange: (on: boolean, confirmText?: string) => void;
  } = $props();

  let settings = $state(randomPassword());
  let admin = $state(randomPassword());
  let quit = $state(randomPassword());
  let busy = $state(false);
  let error = $state<string | null>(null);

  function regenerate() {
    settings = randomPassword();
    admin = randomPassword();
    quit = randomPassword();
  }

  const slug = (text: string) => text.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase() || 'pruefung';

  async function download() {
    if (!exam.seb?.key) return;
    busy = true;
    error = null;
    try {
      const startUrl = `${location.origin}${location.pathname}?seb=${exam.seb.key}`;
      const bytes = await sebFile({ startUrl, settingsPassword: settings.trim() || undefined, adminPassword: admin.trim() || undefined, quitPassword: quit.trim() || undefined });
      downloadText(`leyonet-${slug(exam.label)}.seb`, bytes, 'application/seb');
    } catch {
      error = t('seb.error');
    } finally {
      busy = false;
    }
  }

  /** Passwörter als Textdatei für die Lehrperson (nicht für die Lernenden). */
  function notes() {
    downloadText(`seb-passwoerter-${slug(exam.label)}.txt`, `${t('seb.notesTitle', { label: exam.label })}\n\n${t('seb.settings')}: ${settings}\n${t('seb.admin')}: ${admin}\n${t('seb.quit')}: ${quit}\n`, 'text/plain');
  }
</script>

<section class="seb" data-help="exam">
  <h4>🔒 {t('seb.title')}</h4>
  {#if !exam.seb}
    <p class="muted">{t('seb.off')}</p>
    <button disabled={exam.state === 'ended'} onclick={() => onchange(true)}>{t('seb.enable')}</button>
  {:else if !exam.seb.key}
    <p class="muted">{t('seb.expired')}</p>
  {:else}
    <p class="muted">{t('seb.on')}</p>
    <div class="grid">
      <label>{t('seb.settings')}<input bind:value={settings} autocomplete="off" spellcheck="false" /><small>{t('seb.settingsHint')}</small></label>
      <label>{t('seb.admin')}<input bind:value={admin} autocomplete="off" spellcheck="false" /><small>{t('seb.adminHint')}</small></label>
      <label>{t('seb.quit')}<input bind:value={quit} autocomplete="off" spellcheck="false" /><small>{t('seb.quitHint')}</small></label>
    </div>
    <div class="row">
      <button onclick={regenerate} title={t('seb.regenerateHint')}>🎲 {t('seb.regenerate')}</button>
      <button class="primary" disabled={busy} onclick={download}>⬇ {t('seb.download')}</button>
      <button onclick={notes}>📝 {t('seb.notes')}</button>
      <button disabled={exam.state === 'ended'} onclick={() => onchange(true, t('seb.newKeyConfirm'))} title={t('seb.newKeyHint')}>{t('seb.newKey')}</button>
      <button disabled={exam.state !== 'ready'} onclick={() => onchange(false, t('seb.disableConfirm'))}>{t('seb.disable')}</button>
    </div>
    <p class="muted small">{t('seb.keyInfo', { key: `${exam.seb.key.slice(0, 8)}…` })}</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  {/if}
</section>

<style>
  .seb {
    margin: 10px 0;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  h4 {
    margin: 0 0 4px;
    font-size: 0.9rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 6px 12px;
    margin: 6px 0;
  }
  label {
    display: grid;
    gap: 2px;
    font-size: 0.8rem;
  }
  input {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 0.85rem;
    padding: 3px 6px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  small,
  .muted {
    color: var(--muted);
    font-size: 0.75rem;
  }
  .small {
    margin: 4px 0 0;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .error {
    color: var(--danger);
    font-size: 0.8rem;
  }
</style>
