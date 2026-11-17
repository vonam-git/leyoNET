<script lang="ts">
  import { locale, t } from '../../i18n';
  import { qrMatrix, qrPath } from '../qr';

  /**
   * Admin-Konsole, Bereich «Sicherheit»: Zwei-Faktor-Anmeldung mit einer Authenticator-App
   * (TOTP) einrichten, Wiederherstellungscodes, andere Anmeldungen beenden. Für den Hauptadmin:
   * Zwei-Faktor für alle Zugänge verlangen. Datenschutz: Die App rechnet nur lokal, der Server
   * kennt weder Telefonnummer noch E-Mail noch Gerät.
   */
  let {
    call,
    notify,
    role,
    mfaRequired,
    onrequired,
    onchange,
  }: {
    call: <T>(method: string, path: string, body?: unknown) => Promise<T>;
    notify: (kind: 'ok' | 'error', text: string) => void;
    role: 'super' | 'school' | 'teacher';
    mfaRequired: boolean;
    onrequired?: (on: boolean) => Promise<void>;
    onchange?: () => void;
  } = $props();

  interface Me {
    role: string;
    label: string | null;
    mfa: { enabled: boolean; recoveryLeft: number; required: boolean; setupNeeded: boolean };
    previousLogin: number | null;
    logins: number;
    idleMinutes: number;
  }
  let me = $state<Me | null>(null);
  let setup = $state<{ secret: string; uri: string } | null>(null);
  let code = $state('');
  let recovery = $state<string[] | null>(null);
  let busy = $state(false);
  let action = $state<'disable' | 'recovery' | null>(null);

  const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString(locale() === 'en' ? 'en-GB' : 'de-CH', { dateStyle: 'medium', timeStyle: 'short' }) : '–');

  async function load() {
    me = await call<Me>('GET', 'me');
  }
  $effect(() => {
    void load().catch(() => undefined);
  });

  const qr = $derived.by(() => {
    if (!setup) return null;
    try {
      return qrPath(qrMatrix(setup.uri));
    } catch {
      return null;
    }
  });
  const grouped = (s: string) => s.replace(/(.{4})/g, '$1 ').trim();

  const errorText = (error: unknown) => {
    const c = (error as { code?: string })?.code ?? '';
    return t(`admin.mfa.error.${['wrongCode', 'rateLimited', 'mfaNoSetup', 'mfaRequired', 'mfaUnreadable', 'mfaOwnFirst'].includes(c) ? c : 'other'}`);
  };

  async function start() {
    busy = true;
    try {
      setup = await call<{ secret: string; uri: string }>('POST', 'mfa/setup', {});
      code = '';
    } catch (error) {
      notify('error', errorText(error));
    } finally {
      busy = false;
    }
  }

  async function confirm(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    try {
      const data = await call<{ recovery: string[] }>('POST', 'mfa/enable', { code });
      recovery = data.recovery;
      setup = null;
      code = '';
      notify('ok', t('admin.mfa.enabledOk'));
      await load();
      onchange?.();
    } catch (error) {
      notify('error', errorText(error));
    } finally {
      busy = false;
    }
  }

  async function run(event: SubmitEvent) {
    event.preventDefault();
    if (!action) return;
    busy = true;
    try {
      const data = await call<{ enabled: boolean; recovery?: string[] }>('POST', `mfa/${action}`, { code });
      if (data.recovery) recovery = data.recovery;
      notify('ok', t(action === 'disable' ? 'admin.mfa.disabledOk' : 'admin.mfa.newCodesOk'));
      action = null;
      code = '';
      await load();
      onchange?.();
    } catch (error) {
      notify('error', errorText(error));
    } finally {
      busy = false;
    }
  }

  async function logoutOthers() {
    try {
      const data = await call<{ ended: number }>('POST', 'logout', { others: true });
      notify('ok', t('admin.security.othersEnded', { n: data.ended }));
      await load();
    } catch {
      notify('error', t('admin.loadFailed'));
    }
  }

  function printCodes() {
    if (!recovery) return;
    const text = `leyoNET – ${t('admin.mfa.recoveryTitle')}\n${new Date().toLocaleDateString(locale() === 'en' ? 'en-GB' : 'de-CH')}\n\n${recovery.join('\n')}\n`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'leyoNET-Wiederherstellungscodes.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  }
</script>

{#if me}
  <section class="card" class:warn={!me.mfa.enabled}>
    <h3>🔐 {t('admin.mfa.title')}</h3>
    {#if me.mfa.setupNeeded}<p class="alert" role="alert">{t('admin.mfa.setupNeeded')}</p>{/if}
    <p class="status">
      {#if me.mfa.enabled}
        <strong class="on">✓ {t('admin.mfa.on')}</strong> · {t('admin.mfa.codesLeft', { n: me.mfa.recoveryLeft })}
      {:else}
        <strong class="off">{t('admin.mfa.off')}</strong>
      {/if}
    </p>
    <p class="muted">{t('admin.mfa.explain')}</p>

    {#if recovery}
      <div class="recovery" role="status">
        <strong>{t('admin.mfa.recoveryTitle')}</strong>
        <p>{t('admin.mfa.recoveryHint')}</p>
        <ol>{#each recovery as r (r)}<li><code>{r}</code></li>{/each}</ol>
        <div class="row">
          <button onclick={printCodes}>⬇ {t('admin.mfa.recoverySave')}</button>
          <button onclick={() => (recovery = null)}>{t('admin.mfa.recoveryDone')}</button>
        </div>
      </div>
    {/if}

    {#if !me.mfa.enabled && !setup}
      <button class="primary" onclick={start} disabled={busy}>{t('admin.mfa.start')}</button>
    {:else if setup}
      <ol class="steps">
        <li>{t('admin.mfa.step1')}</li>
        <li>
          {t('admin.mfa.step2')}
          <div class="qr-row">
            {#if qr}
              <svg class="qr" viewBox="0 0 {qr.size} {qr.size}" role="img" aria-label={t('admin.mfa.qrLabel')}>
                <rect width={qr.size} height={qr.size} fill="#fff" />
                <path d={qr.d} fill="#000" />
              </svg>
            {/if}
            <div>
              <p class="muted">{t('admin.mfa.manual')}</p>
              <code class="secret">{grouped(setup.secret)}</code>
              <p class="muted small">{t('admin.mfa.manualHint')}</p>
            </div>
          </div>
        </li>
        <li>
          <form class="row" onsubmit={confirm}>
            <label>{t('admin.mfa.step3')} <input bind:value={code} inputmode="numeric" autocomplete="one-time-code" maxlength="7" pattern="[0-9 ]*" required /></label>
            <button type="submit" class="primary" disabled={busy}>{t('admin.mfa.confirm')}</button>
            <button type="button" onclick={() => (setup = null)}>{t('admin.mfa.cancel')}</button>
          </form>
        </li>
      </ol>
    {:else}
      {#if action}
        <form class="row" onsubmit={run}>
          <label>{t('admin.mfa.codeOrRecovery')} <input bind:value={code} autocomplete="one-time-code" maxlength="20" required /></label>
          <button type="submit" class={action === 'disable' ? 'danger' : 'primary'} disabled={busy}>{t(action === 'disable' ? 'admin.mfa.disable' : 'admin.mfa.newCodes')}</button>
          <button type="button" onclick={() => ((action = null), (code = ''))}>{t('admin.mfa.cancel')}</button>
        </form>
      {:else}
        <div class="row">
          <button onclick={() => (action = 'recovery')}>{t('admin.mfa.newCodes')}</button>
          {#if !me.mfa.required}<button class="danger" onclick={() => (action = 'disable')}>{t('admin.mfa.disable')}</button>{/if}
        </div>
      {/if}
    {/if}
  </section>

  {#if role === 'super'}
    <section class="card">
      <h3>{t('admin.mfa.policyTitle')}</h3>
      <label class="check">
        <input type="checkbox" checked={mfaRequired} disabled={!me.mfa.enabled && !mfaRequired} onchange={(e) => onrequired?.(e.currentTarget.checked)} />
        {t('admin.mfa.policy')}
      </label>
      <p class="muted">{me.mfa.enabled ? t('admin.mfa.policyHint') : t('admin.mfa.policyOwnFirst')}</p>
    </section>
  {/if}

  <section class="card">
    <h3>{t('admin.security.loginsTitle')}</h3>
    <p>{t('admin.security.previous', { time: when(me.previousLogin) })}</p>
    <p>{t('admin.security.logins', { n: me.logins })}</p>
    <p class="muted">{t('admin.security.idle', { n: me.idleMinutes })}</p>
    <button onclick={logoutOthers} disabled={me.logins <= 1}>{t('admin.security.logoutOthers')}</button>
  </section>
  <p class="muted small">{t('admin.security.privacy')}</p>
{:else}
  <p class="muted">…</p>
{/if}

<style>
  .card {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 12px;
    background: var(--surface);
  }
  .card.warn {
    border-left: 4px solid #d97706;
  }
  .card h3 {
    margin: 0 0 6px;
  }
  .status .on {
    color: #15803d;
  }
  .status .off {
    color: #b45309;
  }
  .alert {
    background: color-mix(in srgb, #d97706 15%, var(--surface));
    border-radius: 6px;
    padding: 6px 10px;
    font-weight: 600;
  }
  .steps {
    display: grid;
    gap: 10px;
    padding-left: 20px;
  }
  .qr-row {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 6px;
  }
  .qr {
    width: 200px;
    height: 200px;
    image-rendering: pixelated;
    shape-rendering: crispEdges;
    border-radius: 6px;
  }
  .secret {
    display: inline-block;
    font-size: 1rem;
    letter-spacing: 0.05em;
    padding: 4px 8px;
    border: 1px dashed var(--border);
    border-radius: 6px;
    user-select: all;
  }
  .recovery {
    border: 1px solid #15803d;
    border-radius: 8px;
    padding: 10px 14px;
    margin: 8px 0;
    background: color-mix(in srgb, #15803d 8%, var(--surface));
  }
  .recovery ol {
    columns: 2;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin: 6px 0;
  }
  .row label {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .row input {
    width: 10rem;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    letter-spacing: 0.1em;
  }
  .check {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .primary {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
  .danger {
    color: var(--danger);
    border-color: var(--danger);
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 0.78rem;
  }
</style>
