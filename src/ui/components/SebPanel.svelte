<script lang="ts">
  import { t } from '../../i18n';
  import { downloadText } from '../persist/files';
  import { SEB_DEFAULTS, cleanSebSettings, isSebHash, randomPassword, sebFile, validSebHost, type SebSettings } from '../seb';

  /**
   * Prüfung im Safe Exam Browser: SEB-Datei mit Start-Adresse (Schlüssel der Prüfung), drei
   * Passwörtern und den wichtigsten SEB-Einstellungen erzeugen. Die Passwörter entstehen hier im
   * Browser, werden nirgends gespeichert und stehen nur in der Datei (Admin und Beenden nur als
   * Hash). Statt eines Passworts lässt sich ein vorhandener SHA-256-Hash eintragen (z.B. das
   * Admin-Passwort der Schule). Die übrigen Einstellungen merkt sich dieser Browser.
   */
  let {
    exam,
    onchange,
    onquitlink,
  }: {
    exam: { id: string; label: string; state: 'ready' | 'running' | 'ended'; seb: { key: string | null; quitLink?: boolean } | null };
    /** Server: SEB verlangen (neuer Schlüssel) oder nicht mehr. */
    onchange: (on: boolean, confirmText?: string) => void;
    /** Server: nach der Abgabe den Knopf «Safe Exam Browser beenden» zeigen. */
    onquitlink?: (on: boolean) => void;
  } = $props();

  const STORE = 'netzwerk-simulator.seb';
  function loadSettings(): SebSettings {
    try {
      return cleanSebSettings(JSON.parse(localStorage.getItem(STORE) ?? '{}'));
    } catch {
      return { ...SEB_DEFAULTS };
    }
  }

  let settingsPw = $state(randomPassword());
  let admin = $state(randomPassword());
  let quit = $state(randomPassword());
  const initial = loadSettings();
  let options = $state<SebSettings>(initial);
  let hostsText = $state(initial.extraHosts.join('\n'));
  let busy = $state(false);
  let error = $state<string | null>(null);

  const hosts = $derived(hostsText.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean));
  const badHost = $derived(hosts.find((h) => !validSebHost(h)) ?? null);

  // Einstellungen (ohne Passwörter) für die nächste Prüfung merken.
  $effect(() => {
    const snapshot = { ...$state.snapshot(options), extraHosts: hosts.filter(validSebHost) };
    try {
      localStorage.setItem(STORE, JSON.stringify(snapshot));
    } catch {
      /* ohne Speicher: gilt bis zum Neuladen */
    }
  });

  function regenerate() {
    settingsPw = randomPassword();
    admin = randomPassword();
    quit = randomPassword();
  }

  function reset() {
    options = { ...SEB_DEFAULTS };
    hostsText = '';
  }

  const slug = (text: string) => text.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase() || 'pruefung';

  async function download() {
    if (!exam.seb?.key || badHost) return;
    busy = true;
    error = null;
    try {
      const startUrl = `${location.origin}${location.pathname}?seb=${exam.seb.key}`;
      const settings = { ...$state.snapshot(options), quitLink: !!exam.seb.quitLink, extraHosts: hosts };
      const bytes = await sebFile({ startUrl, settingsPassword: settingsPw.trim() || undefined, adminPassword: admin.trim() || undefined, quitPassword: quit.trim() || undefined, settings });
      downloadText(`leyonet-${slug(exam.label)}.seb`, bytes, 'application/seb');
    } catch {
      error = t('seb.error');
    } finally {
      busy = false;
    }
  }

  /** Passwörter als Textdatei für die Lehrperson (nicht für die Lernenden). Ein Hash bleibt ein Hash. */
  function notes() {
    const line = (label: string, v: string) => `${label}: ${v.trim() ? (isSebHash(v) ? t('seb.hashGiven') : v) : '–'}`;
    downloadText(`seb-passwoerter-${slug(exam.label)}.txt`, `${t('seb.notesTitle', { label: exam.label })}\n\n${line(t('seb.settings'), settingsPw)}\n${line(t('seb.admin'), admin)}\n${line(t('seb.quit'), quit)}\n`, 'text/plain');
  }

  const CHECKS: { key: keyof SebSettings; group: 'quit' | 'view' | 'lock' }[] = [
    { key: 'allowQuit', group: 'quit' },
    { key: 'quitConfirm', group: 'quit' },
    { key: 'ignoreExitKeys', group: 'quit' },
    { key: 'reload', group: 'view' },
    { key: 'taskbar', group: 'view' },
    { key: 'clock', group: 'view' },
    { key: 'zoom', group: 'view' },
    { key: 'spellCheck', group: 'view' },
    { key: 'appSwitcherCheck', group: 'lock' },
    { key: 'privateClipboard', group: 'lock' },
    { key: 'virtualMachine', group: 'lock' },
    { key: 'screenSharing', group: 'lock' },
    { key: 'wlan', group: 'lock' },
    { key: 'audio', group: 'lock' },
    { key: 'video', group: 'lock' },
  ];
</script>

<section class="seb" data-help="exam">
  <h4>{t('seb.title')}</h4>
  {#if !exam.seb}
    <p class="muted">{t('seb.off')}</p>
    <button disabled={exam.state === 'ended'} onclick={() => onchange(true)}>{t('seb.enable')}</button>
  {:else if !exam.seb.key}
    <p class="muted">{t('seb.expired')}</p>
  {:else}
    <p class="muted">{t('seb.on')}</p>
    <div class="grid">
      {#each [['settings', 'settingsHint'], ['admin', 'adminHint'], ['quit', 'quitHint']] as const as [name, hint] (name)}
        {@const value = name === 'settings' ? settingsPw : name === 'admin' ? admin : quit}
        <label>
          {t(`seb.${name}`)}
          {#if name === 'settings'}<input bind:value={settingsPw} autocomplete="off" spellcheck="false" />
          {:else if name === 'admin'}<input bind:value={admin} autocomplete="off" spellcheck="false" />
          {:else}<input bind:value={quit} autocomplete="off" spellcheck="false" />{/if}
          <small>{name !== 'settings' && isSebHash(value) ? `✓ ${t('seb.hashDetected')}` : t(`seb.${hint}`)}</small>
        </label>
      {/each}
    </div>
    <p class="muted small">{t('seb.hashInfo')}</p>

    <details class="options">
      <summary>{t('seb.opt.title')}</summary>
      <div class="groups">
        {#each ['quit', 'view', 'lock'] as const as group (group)}
          <fieldset>
            <legend>{t(`seb.opt.group.${group}`)}</legend>
            {#each CHECKS.filter((c) => c.group === group) as c (c.key)}
              <label class="check" title={t(`seb.opt.${c.key}Hint`)}>
                <input type="checkbox" bind:checked={options[c.key] as boolean} disabled={c.key === 'quitConfirm' && !exam.seb.quitLink} />
                {t(`seb.opt.${c.key}`)}
              </label>
              {#if c.key === 'allowQuit'}
                <label class="check" title={t('seb.opt.quitLinkHint')}>
                  <input type="checkbox" checked={!!exam.seb.quitLink} disabled={!options.allowQuit || exam.state === 'ended'} onchange={(e) => onquitlink?.(e.currentTarget.checked)} />
                  {t('seb.opt.quitLink')}
                </label>
              {/if}
            {/each}
            {#if group === 'lock'}
              <label class="inline">{t('seb.opt.displays')}
                <select bind:value={options.displays}>{#each [1, 2, 3, 4] as n (n)}<option value={n}>{n}</option>{/each}</select>
              </label>
            {/if}
          </fieldset>
        {/each}
      </div>
      <label class="hosts">
        {t('seb.opt.hosts')}
        <textarea bind:value={hostsText} rows="2" spellcheck="false" placeholder="formeln.example" aria-invalid={!!badHost}></textarea>
        <small class:bad={!!badHost}>{badHost ? t('seb.opt.badHost', { host: badHost }) : t('seb.opt.hostsHint')}</small>
      </label>
      <button class="quiet small" onclick={reset}>{t('seb.opt.reset')}</button>
    </details>

    <div class="row">
      <button onclick={regenerate} title={t('seb.regenerateHint')}>🎲 {t('seb.regenerate')}</button>
      <button class="primary" disabled={busy || !!badHost} onclick={download}>{t('seb.download')}</button>
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
    align-content: start;
    font-size: 0.8rem;
  }
  input:not([type='checkbox']),
  textarea {
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
  small.bad {
    color: var(--danger);
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
  .options {
    margin: 6px 0 10px;
  }
  .options summary {
    font-size: 0.85rem;
  }
  .groups {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 10px;
    margin: 8px 0;
  }
  fieldset {
    display: grid;
    gap: 2px;
    align-content: start;
  }
  legend {
    font-size: 0.8rem;
    font-weight: 600;
  }
  .check {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .inline {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-top: 4px;
  }
  .hosts {
    margin-bottom: 6px;
  }
</style>
