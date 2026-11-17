<script lang="ts">
  /**
   * Admin-Konsole der Webversion als eigene Seite (Adresse «/admin», eigener Tab): Übersicht mit
   * laufender Prüfung, Prüfungen, Klassen, Sessions (Statistik), Zugänge, Aufgaben,
   * Rückmeldungen, Einstellungen, Sicherheit (Zwei-Faktor) und Prüfbericht. Die Anmeldung gilt
   * nur in diesem Tab (sessionStorage, kein Cookie). Was den Editor braucht (Session öffnen,
   * live ansehen, Infrastruktur bearbeiten), wechselt in diesem Tab zum Editor und zurück.
   */
  import { adminToken, rememberAdminToken } from '../state/admin.svelte';
  import { parseProject, reviewSubmission, serializeProject, siteName, type SubmissionReview } from '../../core';
  import { locale, t } from '../../i18n';
  import { editor } from '../state/editor.svelte';
  import { examMode } from '../state/exam.svelte';
  import { dialogs } from '../state/dialogs.svelte';
  import { api, ApiError, session } from '../state/session.svelte';
  import { FEATURES, FEATURE_GROUPS, PROFILE_LEVELS } from '../features';
  import { featureName } from '../labels';
  import { normalizePolicy, ui } from '../state/ui.svelte';
  import AdminExams from './AdminExams.svelte';
  import AdminCatalog from './AdminCatalog.svelte';
  import AdminTenants from './AdminTenants.svelte';
  import AdminSessions from './AdminSessions.svelte';
  import AdminSecurity from './AdminSecurity.svelte';
  import VerbundDashboard from './VerbundDashboard.svelte';
  import type { CatalogVisibility } from '../state/session.svelte';
  import { verbundInfra } from '../verbundTemplate';
  import { startWatch } from '../watch';

  let { hidden = false, oneditor }: { hidden?: boolean; oneditor: () => void } = $props();

  interface Settings {
    modes: { design: boolean; simulation: boolean };
    maxLevel: number;
    defaultLevel: number;
    disabled: string[];
    sessionHours: number;
    feedbackEnabled: boolean;
    feedbackDays: number;
    classHours: number;
    catalog: CatalogVisibility;
    mfaRequired?: boolean;
  }
  interface ClassVerbund {
    enabled: boolean;
    shareSites: boolean;
    showMap: boolean;
    hasInfra: boolean;
    infraUpdated?: number;
  }
  interface ClassInfo {
    code: string;
    label: string;
    created: number;
    expires: number;
    sessions: number;
    owner: string | null;
    catalog: CatalogVisibility;
    verbund: ClassVerbund;
  }
  type Role = 'super' | 'school' | 'teacher';
  interface Overview {
    me: { role: Role; label: string };
    settings: Settings;
    sessions: number | null;
    classes: ClassInfo[];
    feedbackOpen: number;
    feedbackTotal: number;
    storage?: { bytes: number; maxBytes: number; sessions: number; maxSessions: number } | null;
  }
  interface Feedback {
    id: string;
    kind: string;
    text: string;
    created: number;
    status: 'open' | 'done';
    version: string;
    locale: string;
    hasProject: boolean;
  }
  interface ClassSession {
    code: string;
    created: number;
    updated: number;
    expires: number;
    devices: number;
    cables: number;
    task: string | null;
    site?: { seat: number; label: string } | null;
    progress?: { goals: number; total: number } | null;
    connected?: boolean;
  }
  interface CheckResult {
    id: string;
    category: 'privacy' | 'security' | 'licenses';
    status: 'pass' | 'warn' | 'fail' | 'skipped';
    detail: string;
  }
  interface ChecksReport {
    version: string;
    date: string;
    checks: CheckResult[];
  }
  interface ExamSeat {
    id: string;
    until: number | null;
    submitted?: number | null;
    state: 'waiting' | 'open' | 'closed';
    joined: boolean;
    online?: boolean;
  }
  interface ExamSummary {
    id: string;
    label: string;
    title: string;
    minutes: number;
    state: 'ready' | 'running' | 'ended';
    seats: ExamSeat[] | number;
    joined?: number;
  }
  interface Me {
    mfa: { enabled: boolean; recoveryLeft: number; required: boolean; setupNeeded: boolean };
    previousLogin: number | null;
    logins: number;
  }
  interface StatsCounts {
    total: number;
    counts: { connected: number; changed24h: number; single: number; class: number; exam: number };
  }

  type Section = 'overview' | 'exams' | 'classes' | 'sessions' | 'tenants' | 'catalog' | 'feedback' | 'settings' | 'security' | 'checks';

  // --- Anmeldung -------------------------------------------------------------------------
  let token = $state<string | null>(adminToken.value);
  let password = $state('');
  let code = $state('');
  let needCode = $state(false);
  let message = $state<{ kind: 'ok' | 'error'; text: string } | null>(null);
  let messageTimer: ReturnType<typeof setTimeout> | undefined;
  function notify(kind: 'ok' | 'error', text: string) {
    message = { kind, text };
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => (message = null), kind === 'ok' ? 5000 : 10000);
  }

  $effect(() => {
    rememberAdminToken(token);
    adminToken.value = token;
  });

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    try {
      return await api<T>(method, `admin/${path}`, body, token ?? undefined);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        token = null;
        overview = null;
        notify('error', t('admin.page.loggedOut'));
      }
      throw error;
    }
  }

  async function login(event: SubmitEvent) {
    event.preventDefault();
    message = null;
    try {
      const data = await api<{ token: string; role: Role; mfaSetup?: boolean }>('POST', 'admin/login', { password, ...(needCode ? { code } : {}) });
      token = data.token;
      password = '';
      code = '';
      needCode = false;
      section = data.mfaSetup ? 'security' : 'overview';
      mfaSetup = !!data.mfaSetup;
    } catch (error) {
      const c = error instanceof ApiError ? error.code : 'error';
      if (c === 'mfaRequired') {
        needCode = true;
        return;
      }
      notify('error', t(`admin.error.${['wrongPassword', 'adminDisabled', 'rateLimited', 'wrongCode', 'mfaUnreadable'].includes(c) ? c : 'other'}`));
    }
  }

  async function logout() {
    await call('POST', 'logout').catch(() => undefined);
    token = null;
    overview = null;
  }

  // --- Daten -------------------------------------------------------------------------------
  let section = $state<Section>('overview');
  let mfaSetup = $state(false);
  let overview = $state<Overview | null>(null);
  const role = $derived<Role>(overview?.me?.role ?? 'super');
  let me = $state<Me | null>(null);
  let feedback = $state<Feedback[]>([]);
  let checks = $state<ChecksReport | null>(null);
  let checksMissing = $state(false);
  let draft = $state<Settings | null>(null);
  let exams = $state<ExamSummary[]>([]);
  let running = $state<ExamSummary[]>([]);
  let stats = $state<StatsCounts | null>(null);
  let version = $state(0);
  let focusExam = $state<string | null>(null);
  let now = $state(Date.now());

  async function refresh() {
    if (mfaSetup) {
      me = await call<Me>('GET', 'me');
      if (!me.mfa.setupNeeded) mfaSetup = false;
      else return;
    }
    overview = await call<Overview>('GET', 'overview');
    if (!classDaysSet) {
      classDays = Math.min(180, Math.max(1, Math.round(overview.settings.classHours / 24)));
      classDaysSet = true;
    }
    draft = $state.snapshot(overview.settings);
    me = await call<Me>('GET', 'me').catch(() => null);
    if (overview.me.role === 'super') {
      feedback = await call<Feedback[]>('GET', 'feedback');
      try {
        checks = await call<ChecksReport>('GET', 'checks');
        checksMissing = false;
      } catch {
        checks = null;
        checksMissing = true;
      }
    } else {
      feedback = [];
      checks = null;
      if (['settings', 'feedback', 'checks', 'catalog'].includes(section) || (section === 'tenants' && overview.me.role !== 'school')) section = 'overview';
    }
    await refreshLive();
    if (openClass) {
      const fresh = overview.classes.find((c) => c.code === openClass!.code);
      if (fresh) await showClass(fresh);
      else openClass = null;
    }
  }

  /** Laufende Prüfungen (für die Leiste oben und die Übersicht) und Kennzahlen der Sessions. */
  async function refreshLive() {
    exams = await call<ExamSummary[]>('GET', 'exams');
    running = await Promise.all(exams.filter((e) => e.state === 'running').map((e) => call<ExamSummary>('GET', `exams/${e.id}`)));
    stats = await call<StatsCounts>('GET', 'stats').catch(() => null);
  }

  $effect(() => {
    if (token && !overview) refresh().catch(() => notify('error', t('admin.loadFailed')));
  });
  $effect(() => {
    if (!token) return;
    const timer = setInterval(() => {
      now = Date.now();
      if (overview && !hidden) void refreshLive().catch(() => undefined);
    }, 15_000);
    const tick = setInterval(() => (now = Date.now()), 1000);
    return () => {
      clearInterval(timer);
      clearInterval(tick);
    };
  });

  const readyExams = $derived(exams.filter((e) => e.state === 'ready'));
  const when = (ms: number) => new Date(ms).toLocaleString(locale() === 'en' ? 'en-GB' : 'de-CH', { dateStyle: 'short', timeStyle: 'short' });
  const seatsOf = (e: ExamSummary) => (Array.isArray(e.seats) ? e.seats : []);
  /** Restzeit der meisten Plätze (Nachteilsausgleich einzelner Plätze verschiebt sie nicht). */
  function leftOf(e: ExamSummary): string {
    const open = seatsOf(e).filter((s) => s.state === 'open' && s.until);
    if (!open.length) return '';
    const count = new Map<number, number>();
    for (const x of open) count.set(x.until!, (count.get(x.until!) ?? 0) + 1);
    const until = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
    const s = Math.max(0, Math.round((until - now) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function openExam(id: string) {
    focusExam = id;
    section = 'exams';
  }

  // --- Editor (in diesem Tab) --------------------------------------------------------------
  async function watch(code: string, label: string) {
    if (token && (await startWatch(code, token, label))) oneditor();
  }

  async function loadSession(code: string) {
    try {
      const data = await call<{ project: unknown }>('GET', `sessions/${code}`);
      const parsed = parseProject(JSON.stringify(data.project));
      if (!parsed.ok) return;
      editor.replace(parsed.topology, { undoable: true, tasks: parsed.tasks ?? null, snapshots: parsed.snapshots ?? [] });
      editor.notify(t('admin.loaded', { code }));
      oneditor();
    } catch {
      notify('error', t('admin.loadFailed'));
    }
  }

  function examAi() {
    oneditor();
    dialogs.show('examAi');
  }

  // --- Klassen -------------------------------------------------------------------------------
  let label = $state('');
  let classDays = $state(14);
  let classDaysSet = false;
  let openClass = $state<ClassInfo | null>(null);
  let classSessions = $state<ClassSession[]>([]);
  let reviews = $state<Record<string, SubmissionReview>>({});
  let dashboard = $state<ClassInfo | null>(null);

  async function createClass(event: SubmitEvent) {
    event.preventDefault();
    const days = Math.round(Number(classDays));
    const created = await call<ClassInfo>('POST', 'classes', { label, ...(days >= 1 && days <= 180 ? { days } : {}) });
    label = '';
    await refresh();
    notify('ok', t('admin.classCreated', { label: created.label, code: created.code }));
  }

  async function extendClass(c: ClassInfo, days: number) {
    try {
      const next = await call<ClassInfo>('PATCH', `classes/${c.code}`, { extendDays: days });
      if (overview) overview.classes = overview.classes.map((x) => (x.code === c.code ? next : x));
      if (openClass?.code === c.code) openClass = next;
      notify('ok', t('admin.extended', { label: next.label, until: when(next.expires) }));
    } catch {
      notify('error', t('admin.loadFailed'));
    }
  }

  async function showClass(c: ClassInfo) {
    openClass = c;
    reviews = {};
    classSessions = await call<ClassSession[]>('GET', `classes/${c.code}/sessions`);
  }

  async function patchClass(c: ClassInfo, change: { catalog?: CatalogVisibility; verbund?: Partial<ClassVerbund> }) {
    try {
      const next = await call<ClassInfo>('PATCH', `classes/${c.code}`, change);
      if (overview) overview.classes = overview.classes.map((x) => (x.code === c.code ? next : x));
      if (openClass?.code === c.code) openClass = next;
      notify('ok', t('admin.saved'));
    } catch {
      notify('error', t('admin.loadFailed'));
    }
  }

  async function setInfra(c: ClassInfo, source: 'current' | 'template' | 'none') {
    if (source === 'none' && !confirm(t('admin.verbund.removeInfraConfirm'))) return;
    const json = source === 'current' ? serializeProject(editor.topology) : source === 'template' ? serializeProject(verbundInfra()) : null;
    try {
      const next = await call<ClassInfo>('PUT', `classes/${c.code}/infra`, { project: json ? JSON.parse(json) : null });
      if (overview) overview.classes = overview.classes.map((x) => (x.code === c.code ? next : x));
      if (openClass?.code === c.code) openClass = next;
      notify('ok', t(source === 'none' ? 'admin.verbund.infraRemoved' : 'admin.verbund.infraSaved'));
    } catch {
      notify('error', t('admin.verbund.infraFailed'));
    }
  }

  async function editInfra(c: ClassInfo) {
    const data = await api<{ infra?: unknown }>('GET', `classes/${encodeURIComponent(c.code)}/verbund`);
    const parsed = data.infra ? parseProject(JSON.stringify(data.infra)) : null;
    if (!parsed?.ok) return;
    editor.replace(parsed.topology, { undoable: true, tasks: null, snapshots: [] });
    editor.notify(t('admin.verbund.infraLoaded'));
    oneditor();
  }

  async function closeClass(c: ClassInfo) {
    if (!confirm(t('admin.closeClassConfirm', { label: c.label, n: c.sessions }))) return;
    await call('DELETE', `classes/${c.code}`);
    if (openClass?.code === c.code) openClass = null;
    await refresh();
  }

  async function reviewAll() {
    const next: Record<string, SubmissionReview> = {};
    for (const s of classSessions) {
      const data = await call<{ project: unknown }>('GET', `sessions/${s.code}`);
      next[s.code] = reviewSubmission(s.code, JSON.stringify(data.project), editor.tasks);
    }
    reviews = next;
  }

  const score = (r: SubmissionReview | undefined) => {
    if (!r) return '';
    if (!r.ok) return t('review.error');
    const counted = r.marks.filter((m) => !m.skipped);
    const goals = `${counted.filter((m) => m.passed).length}/${counted.length}`;
    if (r.grade !== undefined) return `${goals} · ${r.points}/${r.maxPoints} P. · ${r.grade.toFixed(1)}`;
    return goals;
  };

  // --- Rückmeldungen, Einstellungen ------------------------------------------------------------
  async function setStatus(f: Feedback, status: 'open' | 'done') {
    await call('PATCH', `feedback/${f.id}`, { status });
    await refresh();
  }
  async function removeFeedback(f: Feedback) {
    await call('DELETE', `feedback/${f.id}`);
    await refresh();
  }
  async function openFeedbackProject(f: Feedback) {
    const data = await call<{ project: unknown }>('GET', `feedback/${f.id}`);
    const parsed = parseProject(JSON.stringify(data.project));
    if (parsed.ok) {
      editor.replace(parsed.topology, { undoable: true, tasks: parsed.tasks ?? null });
      oneditor();
    }
  }
  async function saveSettings() {
    if (!draft) return;
    try {
      const saved = await call<Settings>('PUT', 'settings', draft);
      draft = saved;
      if (overview) overview.settings = saved;
      ui.setPolicy(normalizePolicy(saved));
      await session.loadConfig();
      notify('ok', t('admin.saved'));
    } catch (error) {
      notify('error', error instanceof ApiError && error.code === 'mfaOwnFirst' ? t('admin.mfa.error.mfaOwnFirst') : t('admin.loadFailed'));
    }
  }
  async function setMfaRequired(on: boolean) {
    if (!draft) return;
    draft.mfaRequired = on;
    await saveSettings();
  }
  async function purgeSessions() {
    if (!confirm(t('admin.purgeConfirm', { n: overview?.sessions ?? 0 }))) return;
    await call('DELETE', 'sessions');
    await refresh();
  }

  // --- Navigation ----------------------------------------------------------------------------
  const nav = $derived<{ id: Section; icon: string; badge?: string; alert?: boolean }[]>(
    [
      { id: 'overview' as Section, icon: '🏠' },
      { id: 'exams' as Section, icon: '📝', ...(running.length ? { badge: t('admin.page.live'), alert: true } : {}) },
      { id: 'classes' as Section, icon: '👥', badge: overview ? String(overview.classes.length) : undefined },
      { id: 'sessions' as Section, icon: '📊', badge: stats ? String(stats.total) : undefined },
      ...(role !== 'teacher' ? [{ id: 'tenants' as Section, icon: '🔑' }] : []),
      ...(role === 'super'
        ? [
            { id: 'catalog' as Section, icon: '⭐' },
            { id: 'feedback' as Section, icon: '💬', badge: overview?.feedbackOpen ? String(overview.feedbackOpen) : undefined },
            { id: 'settings' as Section, icon: '⚙' },
          ]
        : []),
      { id: 'security' as Section, icon: '🔐', ...(me && !me.mfa.enabled ? { badge: '!', alert: true } : {}) },
      ...(role === 'super' ? [{ id: 'checks' as Section, icon: '✅', ...(checks && checks.checks.some((c) => c.status === 'fail') ? { badge: String(checks.checks.filter((c) => c.status === 'fail').length), alert: true } : {}) }] : []),
    ],
  );
</script>

<div class="admin-page" class:gone={hidden}>
  {#if examMode.active}
    <div class="login-wrap">
      <div class="login-card">
        <h1>🔒 {t('admin.page.title')}</h1>
        <p>{t('admin.page.examLocked')}</p>
      </div>
    </div>
  {:else if !ui.online}
    <div class="login-wrap"><div class="login-card"><h1>{t('admin.page.title')}</h1><p class="muted">{t('settings.onlineOnly')}</p></div></div>
  {:else if !token}
    <div class="login-wrap">
      <form class="login-card" onsubmit={login}>
        <h1>{t('admin.page.title')}</h1>
        <p class="muted">{t('admin.loginHint')}</p>
        <label>
          <span>{t('admin.password')}</span>
          <!-- svelte-ignore a11y_autofocus -->
          <input type="password" bind:value={password} autocomplete="current-password" required autofocus={!needCode} readonly={needCode} />
        </label>
        {#if needCode}
          <label>
            <span>{t('admin.mfa.loginCode')}</span>
            <!-- svelte-ignore a11y_autofocus -->
            <input class="otp" bind:value={code} autocomplete="one-time-code" inputmode="numeric" maxlength="20" required autofocus />
          </label>
          <p class="muted small">{t('admin.mfa.loginHint')}</p>
        {/if}
        <button type="submit" class="primary">{t('admin.login')}</button>
        {#if needCode}<button type="button" class="link" onclick={() => ((needCode = false), (password = ''), (code = ''))}>{t('admin.mfa.cancel')}</button>{/if}
        <p class="muted small">{t('admin.loginKeyHint')}</p>
        {#if message}<p class={message.kind} role="alert">{message.text}</p>{/if}
      </form>
    </div>
  {:else}
    <aside class="nav">
      <div class="brand">
        <strong>leyoNET</strong> <span>{t('admin.page.brand')}</span>
        {#if session.config?.channel === 'beta'}<span class="beta">{t('beta.label')}</span>{/if}
      </div>
      {#if overview && role !== 'super'}<div class="who">{t(`admin.role.${role}`)}: {overview.me.label}</div>{/if}
      <nav aria-label={t('admin.page.nav')}>
        {#each nav as item (item.id)}
          <button class:active={section === item.id} aria-current={section === item.id ? 'page' : undefined} disabled={mfaSetup && item.id !== 'security'} onclick={() => (section = item.id)}>
            <span class="icon" aria-hidden="true">{item.icon}</span>
            <span class="label">{t(`admin.page.section.${item.id}`)}</span>
            {#if item.badge}<span class="badge" class:alert={item.alert}>{item.badge}</span>{/if}
          </button>
        {/each}
      </nav>
      <div class="foot">
        <button onclick={oneditor}>🖥 {t('admin.page.toEditor')}</button>
        {#if ui.has('tool.taskEditor') && !mfaSetup}<button onclick={examAi}>✨ {t('menu.tool.examAi')}</button>{/if}
        <button onclick={logout}>⎋ {t('admin.logout')}</button>
      </div>
    </aside>

    <main class="content">
      {#if running.length}
        {#each running as e (e.id)}
          {@const seats = seatsOf(e)}
          {@const done = seats.filter((s) => s.submitted).length}
          {@const working = seats.filter((s) => s.state === 'open' && s.joined).length}
          <div class="live-bar" role="status">
            <span class="pulse" aria-hidden="true"></span>
            <strong>{t('admin.page.examRunning')}</strong>
            <span class="title">{e.label}</span>
            <span>{t('admin.page.examProgress', { working, done, total: seats.length })}</span>
            {#if leftOf(e)}<span class="clock">⏱ {leftOf(e)}</span>{/if}
            <div class="bar" aria-hidden="true"><span class="done" style:width="{(done / Math.max(1, seats.length)) * 100}%"></span><span class="work" style:width="{(working / Math.max(1, seats.length)) * 100}%"></span></div>
            <button onclick={() => openExam(e.id)}>{t('admin.page.toCockpit')}</button>
          </div>
        {/each}
      {/if}

      <header class="page-head">
        <h2>{t(`admin.page.section.${section}`)}</h2>
        <span class="muted small">{t('admin.page.auto')}</span>
        <button class="ghost" onclick={() => (version++, refresh())}>↻ {t('admin.refresh')}</button>
      </header>
      {#if message}<p class="msg {message.kind}" role="status">{message.text}</p>{/if}

      {#if mfaSetup || section === 'security'}
        <AdminSecurity {call} {notify} {role} mfaRequired={!!draft?.mfaRequired} onrequired={setMfaRequired} onchange={() => void refresh().catch(() => undefined)} />
      {:else if !overview || !draft}
        <p class="muted">…</p>
      {:else if section === 'overview'}
        <div class="cards">
          <article class="card wide" class:hot={running.length > 0}>
            <h3>📝 {t('admin.page.section.exams')}</h3>
            {#if running.length}
              {#each running as e (e.id)}
                {@const seats = seatsOf(e)}
                <p><strong>{e.label}</strong> · {t('admin.page.examProgress', { working: seats.filter((s) => s.state === 'open' && s.joined).length, done: seats.filter((s) => s.submitted).length, total: seats.length })} {#if leftOf(e)}· ⏱ {leftOf(e)}{/if}</p>
              {/each}
            {:else}
              <p class="muted">{t('admin.page.noRunning')}</p>
            {/if}
            {#if readyExams.length}<p>{t('admin.page.examsReady', { n: readyExams.length })}: {readyExams.map((e) => e.label).join(', ')}</p>{/if}
            <button onclick={() => (section = 'exams')}>{t('admin.page.manage')}</button>
          </article>
          <article class="card">
            <h3>👥 {t('admin.page.section.classes')}</h3>
            <p class="big">{overview.classes.length}</p>
            <p class="muted">{t('admin.page.classSessions', { n: overview.classes.reduce((s, c) => s + c.sessions, 0) })}</p>
            <button onclick={() => (section = 'classes')}>{t('admin.page.manage')}</button>
          </article>
          <article class="card">
            <h3>📊 {t('admin.page.section.sessions')}</h3>
            <p class="big">{stats?.total ?? '–'}</p>
            {#if stats}<p class="muted">{t('admin.page.sessionsNow', { live: stats.counts.connected, day: stats.counts.changed24h })}</p>{/if}
            <button onclick={() => (section = 'sessions')}>{t('admin.page.show')}</button>
          </article>
          <article class="card" class:warn={!!me && !me.mfa.enabled}>
            <h3>🔐 {t('admin.page.section.security')}</h3>
            {#if me}
              <p>{me.mfa.enabled ? `✓ ${t('admin.mfa.on')}` : t('admin.mfa.off')}</p>
              {#if me.previousLogin}<p class="muted small">{t('admin.security.previous', { time: when(me.previousLogin) })}</p>{/if}
            {/if}
            <button onclick={() => (section = 'security')}>{t('admin.page.show')}</button>
          </article>
          {#if role === 'super'}
            <article class="card">
              <h3>💬 {t('admin.page.section.feedback')}</h3>
              <p class="big">{overview.feedbackOpen}</p>
              <p class="muted">{t('admin.page.feedbackOf', { n: overview.feedbackTotal })}</p>
              <button onclick={() => (section = 'feedback')}>{t('admin.page.show')}</button>
            </article>
            {#if overview.storage}
              {@const st = overview.storage}
              {@const used = Math.max(st.bytes / st.maxBytes, st.sessions / st.maxSessions)}
              <article class="card" class:warn={used > 0.8}>
                <h3>💾 {t('admin.page.storage')}</h3>
                <div class="meter"><span style:width="{Math.min(100, used * 100)}%"></span></div>
                <p class="muted small">{t('admin.storage', { mb: (st.bytes / 1048576).toFixed(1), max: Math.round(st.maxBytes / 1048576), n: st.sessions, maxN: st.maxSessions })}</p>
              </article>
            {/if}
            <article class="card" class:warn={!!checks && checks.checks.some((c) => c.status === 'fail')}>
              <h3>✅ {t('admin.page.section.checks')}</h3>
              {#if checks}
                {@const bad = checks.checks.filter((c) => c.status === 'fail').length}
                <p>{bad ? t('admin.page.checksBad', { n: bad }) : t('admin.page.checksOk', { n: checks.checks.length })}</p>
                <p class="muted small">v{checks.version}</p>
              {:else}
                <p class="muted">{t('admin.checksMissing')}</p>
              {/if}
              <button onclick={() => (section = 'checks')}>{t('admin.page.show')}</button>
            </article>
          {/if}
        </div>
      {:else if section === 'exams'}
        <AdminExams {call} {version} focus={focusExam} {notify} onwatch={(code, name) => void watch(code, name)} />
      {:else if section === 'sessions'}
        <AdminSessions {call} {notify} {version} onopen={(c) => void loadSession(c)} onwatch={(c, name) => void watch(c, name)} />
      {:else if section === 'tenants' && role !== 'teacher'}
        <AdminTenants {call} role={role === 'school' ? 'school' : 'super'} {notify} />
      {:else if section === 'catalog'}
        <AdminCatalog value={draft.catalog} scope="global" onchange={(v) => (draft!.catalog = v)} />
        <div class="row"><button class="primary" onclick={saveSettings}>{t('admin.save')}</button></div>
      {:else if section === 'checks'}
        <p class="muted">{t('admin.checksHint')}</p>
        {#if checksMissing || !checks}
          <p class="muted">{t('admin.checksMissing')}</p>
        {:else}
          <p>{t('admin.checksVersion', { version: checks.version, date: when(Date.parse(checks.date)) })}</p>
          {#each ['privacy', 'security', 'licenses', 'standards'] as const as category (category)}
            <h3>{t(`checks.category.${category}`)}</h3>
            <ul class="checklist">
              {#each checks.checks.filter((c) => c.category === category) as c (c.id)}
                <li class="status-{c.status}">
                  <span class="badge">{t(`checks.status.${c.status}`)}</span>
                  <span><strong>{t(`checks.${c.id}`)}</strong><br /><span class="muted">{c.detail}</span></span>
                </li>
              {/each}
            </ul>
          {/each}
        {/if}
      {:else if section === 'settings'}
        <section class="panel">
          <h3>{t('admin.modesTitle')}</h3>
          <p class="muted">{t('admin.modesHint')}</p>
          <div class="checks">
            {#each ['design', 'simulation'] as const as m (m)}
              <label><input type="checkbox" bind:checked={draft.modes[m]} /> {t(`mode.${m}`)}</label>
            {/each}
          </div>
        </section>
        <section class="panel">
          <h3>{t('admin.profileTitle')}</h3>
          <p class="muted">{t('admin.profileHint')}</p>
          <div class="grid">
            <label><span>{t('admin.defaultLevel')}</span>
              <select bind:value={draft.defaultLevel}>{#each PROFILE_LEVELS as l (l)}<option value={l}>{t(`profile.${l}`)}</option>{/each}</select>
            </label>
            <label><span>{t('admin.maxLevel')}</span>
              <select bind:value={draft.maxLevel}>{#each PROFILE_LEVELS as l (l)}<option value={l}>{t(`profile.${l}`)}</option>{/each}</select>
            </label>
          </div>
          <details class="blocked">
            <summary>{t('admin.disabledTitle', { n: draft.disabled.length })}</summary>
            <p class="muted">{t('admin.disabledHint')}</p>
            <div class="feature-groups">
              {#each FEATURE_GROUPS as group (group)}
                <fieldset>
                  <legend>{t(`features.group.${group}`)}</legend>
                  {#each FEATURES.filter((f) => f.group === group) as spec (spec.id)}
                    <label>
                      <input
                        type="checkbox"
                        checked={draft.disabled.includes(spec.id)}
                        onchange={(e) => (draft!.disabled = e.currentTarget.checked ? [...draft!.disabled, spec.id] : draft!.disabled.filter((x) => x !== spec.id))}
                      />
                      {featureName(spec.id)}
                    </label>
                  {/each}
                </fieldset>
              {/each}
            </div>
          </details>
        </section>
        <section class="panel">
          <h3>{t('admin.retentionTitle')}</h3>
          <div class="grid">
            <label><span>{t('admin.sessionHours')}</span><input type="number" min="1" max="720" bind:value={draft.sessionHours} /></label>
            <label><span>{t('admin.classHours')}</span><input type="number" min="1" max="4320" bind:value={draft.classHours} /></label>
            <label><span>{t('admin.feedbackDays')}</span><input type="number" min="1" max="365" bind:value={draft.feedbackDays} /></label>
            <label class="inline"><input type="checkbox" bind:checked={draft.feedbackEnabled} /> {t('admin.feedbackEnabled')}</label>
          </div>
          <p class="muted">{t('admin.retentionHint')}</p>
        </section>
        <div class="row">
          <button class="primary" onclick={saveSettings}>{t('admin.save')}</button>
          <span class="muted">{t('admin.sessionCount', { n: overview.sessions ?? 0 })}</span>
          <button class="danger" onclick={purgeSessions} disabled={!overview.sessions}>{t('admin.purge')}</button>
        </div>
      {:else if section === 'classes'}
        <form class="row" onsubmit={createClass}>
          <input bind:value={label} maxlength="40" placeholder={t('admin.classLabelPlaceholder')} aria-label={t('admin.classLabel')} required />
          <label class="days" title={t('admin.classDaysHint')}><span>{t('admin.classDays')}</span><input type="number" min="1" max="180" step="1" bind:value={classDays} /></label>
          <button type="submit" class="primary">{t('admin.createClass')}</button>
        </form>
        <p class="muted">{t('admin.classHint')}</p>
        {#if overview.classes.length === 0}
          <p class="muted">{t('admin.noClasses')}</p>
        {:else}
          <table>
            <thead>
              <tr><th>{t('admin.classLabel')}</th><th>{t('admin.classCode')}</th><th>{t('admin.sessions')}</th><th>{t('admin.until')}</th><th></th></tr>
            </thead>
            <tbody>
              {#each overview.classes as c (c.code)}
                <tr class:active={openClass?.code === c.code}>
                  <td>{c.label}{#if c.verbund.enabled} <span title={t('admin.verbund.enabled')}>🌐</span>{/if}</td>
                  <td class="code">{c.code}</td>
                  <td>{c.sessions}</td>
                  <td>{when(c.expires)}</td>
                  <td class="actions">
                    <button onclick={() => showClass(c)}>{t('admin.show')}</button>
                    {#each [7, 30] as days (days)}
                      <button onclick={() => extendClass(c, days)} title={t('admin.extendHint', { days })}>{t('admin.extend', { days })}</button>
                    {/each}
                    {#if c.verbund.enabled}<button onclick={() => (dashboard = c)}>📺 {t('admin.verbund.dashboard')}</button>{/if}
                    <button class="danger" onclick={() => closeClass(c)}>{t('admin.closeClass')}</button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
        {#if openClass}
          {@const oc = openClass}
          <section class="panel accent">
            <h3>🌐 {t('admin.verbund.title')}</h3>
            <p class="muted">{t('admin.verbund.hint')}</p>
            <div class="checks">
              <label><input type="checkbox" checked={oc.verbund.enabled} onchange={(e) => patchClass(oc, { verbund: { enabled: e.currentTarget.checked } })} /> {t('admin.verbund.enabled')}</label>
              <label title={t('admin.verbund.shareSitesHint')}><input type="checkbox" checked={oc.verbund.shareSites} disabled={!oc.verbund.enabled} onchange={(e) => patchClass(oc, { verbund: { shareSites: e.currentTarget.checked } })} /> {t('admin.verbund.shareSites')}</label>
              <label><input type="checkbox" checked={oc.verbund.showMap} disabled={!oc.verbund.enabled} onchange={(e) => patchClass(oc, { verbund: { showMap: e.currentTarget.checked } })} /> {t('admin.verbund.showMap')}</label>
            </div>
            {#if oc.verbund.enabled}
              <p class="muted">{oc.verbund.hasInfra ? t('admin.verbund.infraSet', { time: when(oc.verbund.infraUpdated ?? oc.created) }) : t('admin.verbund.noInfra')}</p>
              <div class="row">
                <button onclick={() => setInfra(oc, 'template')}>{t('admin.verbund.useTemplate')}</button>
                <button onclick={() => setInfra(oc, 'current')} title={t('admin.verbund.useCurrentHint')}>{t('admin.verbund.useCurrent')}</button>
                {#if oc.verbund.hasInfra}
                  <button onclick={() => editInfra(oc)}>{t('admin.verbund.editInfra')}</button>
                  <button class="danger" onclick={() => setInfra(oc, 'none')}>{t('admin.verbund.removeInfra')}</button>
                {/if}
                <button class="primary" onclick={() => (dashboard = oc)}>📺 {t('admin.verbund.dashboard')}</button>
              </div>
            {/if}
            <details>
              <summary>{t('admin.catalog.classTitle')}</summary>
              <AdminCatalog value={oc.catalog} scope="class" onchange={(v) => patchClass(oc, { catalog: v })} />
            </details>
          </section>
          <h3>{t('admin.classSessions', { label: oc.label })}</h3>
          {#if classSessions.length === 0}
            <p class="muted">{t('admin.noSessions', { code: oc.code })}</p>
          {:else}
            <div class="row">
              <button onclick={reviewAll}>{t('admin.reviewAll')}</button>
              <span class="muted">{editor.tasks ? t('review.helpTask', { title: editor.tasks.title }) : t('admin.reviewOwn')}</span>
            </div>
            <table>
              <thead>
                <tr><th>{t('admin.sessionCode')}</th><th>{t('verbund.site')}</th><th>{t('admin.changed')}</th><th>{t('admin.devices')}</th><th>{t('admin.progress')}</th><th>{t('review.score')}</th><th></th></tr>
              </thead>
              <tbody>
                {#each classSessions as s (s.code)}
                  <tr>
                    <td class="code">{#if s.connected}<span class="live" title={t('verbund.dash.present')}>●</span> {/if}{s.code}</td>
                    <td>{s.site ? siteName(s.site.seat, s.site.label) : ''}</td>
                    <td>{when(s.updated)}</td>
                    <td>{s.devices} / {s.cables}</td>
                    <td>{s.progress?.total ? `${s.progress.goals}/${s.progress.total}` : ''}</td>
                    <td>{score(reviews[s.code])}</td>
                    <td class="actions">
                      <button onclick={() => loadSession(s.code)}>{t('admin.open')}</button>
                      <button title={t('admin.exams.watchHint')} onclick={() => watch(s.code, s.site ? siteName(s.site.seat, s.site.label) : s.code)}>👁 {t('admin.exams.watch')}</button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        {/if}
      {:else if section === 'feedback'}
        {#if feedback.length === 0}
          <p class="muted">{t('admin.noFeedback')}</p>
        {:else}
          <ul class="feedback">
            {#each feedback as f (f.id)}
              <li class:done={f.status === 'done'}>
                <div class="meta">
                  <strong>{t(`feedback.kind.${f.kind}`)}</strong>
                  <span class="muted">{when(f.created)} · v{f.version} · {f.locale}</span>
                </div>
                <p>{f.text}</p>
                <div class="row">
                  {#if f.status === 'open'}
                    <button onclick={() => setStatus(f, 'done')}>{t('admin.markDone')}</button>
                  {:else}
                    <button onclick={() => setStatus(f, 'open')}>{t('admin.reopen')}</button>
                  {/if}
                  {#if f.hasProject}<button onclick={() => openFeedbackProject(f)}>{t('admin.openProject')}</button>{/if}
                  <button class="danger" onclick={() => removeFeedback(f)}>{t('inspector.delete')}</button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </main>
  {/if}
</div>

{#if dashboard}
  {@const d = dashboard}
  <VerbundDashboard
    classCode={d.code}
    label={d.label}
    {call}
    onclose={() => (dashboard = null)}
    onwatch={async (code, name) => {
      dashboard = null;
      await watch(code, name);
    }}
  />
{/if}

<style>
  .admin-page {
    display: flex;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    background: var(--bg);
    color: var(--text);
  }
  .admin-page.gone {
    display: none;
  }
  .login-wrap {
    flex: 1;
    display: grid;
    place-items: center;
    padding: 24px;
  }
  .login-card {
    width: min(420px, 100%);
    display: grid;
    gap: 12px;
    padding: 28px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.08);
  }
  .login-card h1 {
    margin: 0;
    font-size: 1.4rem;
  }
  .login-card label {
    display: grid;
    gap: 4px;
    font-size: 0.9rem;
  }
  .otp {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 1.2rem;
    letter-spacing: 0.2em;
  }
  .link {
    border: none;
    background: none;
    text-decoration: underline;
    color: var(--muted);
  }
  .nav {
    position: sticky;
    top: 0;
    height: 100vh;
    height: 100dvh;
    width: 230px;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 10px;
    border-right: 1px solid var(--border);
    background: var(--surface);
    overflow: auto;
  }
  .brand {
    font-size: 1.1rem;
    padding: 0 8px 6px;
  }
  .brand span {
    color: var(--muted);
  }
  .brand .beta {
    margin-left: 4px;
    font-size: 0.7rem;
    color: #fff;
    background: #d97706;
    padding: 1px 6px;
    border-radius: 999px;
  }
  .who {
    font-size: 0.78rem;
    color: var(--muted);
    padding: 0 8px;
  }
  nav {
    display: grid;
    gap: 2px;
  }
  nav button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    text-align: left;
    border: none;
    background: none;
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 0.9rem;
  }
  nav button:hover:not(:disabled) {
    background: var(--hover);
  }
  nav button.active {
    background: var(--selected-soft);
    font-weight: 600;
  }
  nav .label {
    flex: 1;
  }
  .badge {
    font-size: 0.7rem;
    padding: 0 7px;
    border-radius: 999px;
    background: var(--hover);
    color: var(--muted);
  }
  .badge.alert {
    background: #dc2626;
    color: #fff;
  }
  .foot {
    margin-top: auto;
    display: grid;
    gap: 4px;
  }
  .foot button {
    text-align: left;
    font-size: 0.85rem;
  }
  .content {
    flex: 1;
    min-width: 0;
    overflow: auto;
    padding: 16px 24px 40px;
  }
  .live-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    padding: 10px 14px;
    margin-bottom: 12px;
    border-radius: 10px;
    border: 1px solid #dc2626;
    background: color-mix(in srgb, #dc2626 10%, var(--surface));
  }
  .live-bar .title {
    font-weight: 600;
  }
  .live-bar .clock {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .pulse {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #dc2626;
    animation: pulse 1.4s infinite;
  }
  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 rgb(220 38 38 / 0.6);
    }
    70% {
      box-shadow: 0 0 0 10px rgb(220 38 38 / 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgb(220 38 38 / 0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pulse {
      animation: none;
    }
  }
  .bar {
    flex: 1;
    min-width: 120px;
    height: 8px;
    display: flex;
    border-radius: 999px;
    overflow: hidden;
    background: var(--hover);
  }
  .bar .done {
    background: #15803d;
  }
  .bar .work {
    background: #2563eb;
  }
  .page-head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }
  .page-head h2 {
    margin: 0;
    flex: 1;
  }
  .msg {
    padding: 6px 10px;
    border-radius: 8px;
  }
  .msg.ok {
    background: color-mix(in srgb, #15803d 12%, var(--surface));
  }
  .msg.error,
  p.error {
    background: color-mix(in srgb, var(--danger) 12%, var(--surface));
    color: var(--danger);
    padding: 6px 10px;
    border-radius: 8px;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 12px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
  }
  .card.wide {
    grid-column: 1 / -1;
  }
  .card.hot {
    border-color: #dc2626;
  }
  .card.warn {
    border-left: 4px solid #d97706;
  }
  .card h3 {
    margin: 0;
    font-size: 1rem;
  }
  .card p {
    margin: 0;
  }
  .card button {
    align-self: flex-start;
    margin-top: auto;
  }
  .big {
    font-size: 2rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .meter {
    height: 10px;
    border-radius: 999px;
    background: var(--hover);
    overflow: hidden;
  }
  .meter span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .panel {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 14px;
    margin: 0 0 12px;
    background: var(--surface);
  }
  .panel.accent {
    border-left: 4px solid var(--accent);
    margin-top: 12px;
  }
  .panel h3 {
    margin: 0 0 4px;
  }
  .primary {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
  .ghost {
    border-style: dashed;
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
  .live {
    color: #16a34a;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  th {
    text-align: left;
  }
  th,
  td {
    padding: 4px 6px;
    border-bottom: 1px solid var(--border);
  }
  .code {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  tr.active td {
    background: var(--selected-soft);
  }
  .actions {
    white-space: nowrap;
    text-align: right;
  }
  .actions button {
    font-size: 0.8rem;
    padding: 3px 8px;
  }
  .checks {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 18px;
    font-size: 0.9rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 8px 14px;
    font-size: 0.85rem;
  }
  .grid label {
    display: grid;
    gap: 4px;
  }
  .grid .inline {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin: 8px 0;
  }
  .row input {
    flex: 1;
  }
  .row .days {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .row .days input {
    flex: none;
    width: 5rem;
  }
  .feature-groups {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
  }
  .feature-groups fieldset {
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 0.8rem;
  }
  .feature-groups label {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .blocked summary {
    cursor: pointer;
    font-weight: 600;
    margin: 10px 0 4px;
  }
  .checklist {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .checklist li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 5px 0;
    border-bottom: 1px solid var(--border);
    font-size: 0.85rem;
  }
  .checklist .badge {
    flex: none;
    width: 5.5rem;
    text-align: center;
    padding: 1px 6px;
    border-radius: 999px;
    font-size: 0.72rem;
    color: #fff;
  }
  .status-pass .badge {
    background: #16a34a;
  }
  .status-warn .badge {
    background: #d97706;
  }
  .status-fail .badge {
    background: var(--danger);
  }
  .status-skipped .badge {
    background: #6b7280;
  }
  .feedback {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .feedback li {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 10px;
    background: var(--surface);
  }
  .feedback li.done {
    opacity: 0.6;
  }
  .feedback p {
    margin: 6px 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .meta {
    display: flex;
    gap: 10px;
    align-items: baseline;
  }
  @media (max-width: 760px) {
    .admin-page {
      flex-direction: column;
      overflow: auto;
    }
    .content {
      overflow: visible;
    }
    .nav {
      position: static;
      height: auto;
      width: auto;
      border-right: none;
      border-bottom: 1px solid var(--border);
    }
    nav {
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    }
    .content {
      padding: 12px 16px 32px;
    }
  }
</style>
