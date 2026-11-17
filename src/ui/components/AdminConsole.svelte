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
  import Icon from './Icon.svelte';
  import Logo from './Logo.svelte';
  import '../admin.css';
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

  /**
   * Letzte Eingabe in dieser Konsole. Abfragen ohne Eingabe in der letzten Minute (automatisches
   * Nachführen) tragen «X-Leyonet-Auto»: Sie halten die Anmeldung nicht wach, nach 60 Minuten ohne
   * Tätigkeit meldet der Server ab.
   */
  let lastInput = Date.now();
  const touched = () => (lastInput = Date.now());

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    try {
      return await api<T>(method, `admin/${path}`, body, token ?? undefined, Date.now() - lastInput > 60_000 ? { 'X-Leyonet-Auto': '1' } : {});
    } catch (error) {
      // Zwei-Faktor inzwischen verlangt: nur noch der Bereich «Sicherheit».
      if (error instanceof ApiError && error.code === 'mfaSetupRequired') {
        mfaSetup = true;
        section = 'security';
      }
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
      // Gesperrt wegen vieler Fehlversuche anderer: Mit Zwei-Faktor geht es trotzdem.
      if (c === 'rateLimited' && !needCode) needCode = true;
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
  const failedChecks = $derived(checks ? checks.checks.filter((c) => c.status === 'fail').length : 0);
  type NavItem = { id: Section; icon: string; badge?: string; tone?: 'live' | 'alert' | 'warn' };
  const navGroups = $derived<{ id: 'teach' | 'manage' | 'secure'; items: NavItem[] }[]>(
    [
      {
        id: 'teach' as const,
        items: [
          { id: 'overview' as Section, icon: 'home' },
          { id: 'exams' as Section, icon: 'clipboard', ...(running.length ? { badge: t('admin.page.live'), tone: 'live' as const } : {}) },
          { id: 'classes' as Section, icon: 'users', badge: overview?.classes.length ? String(overview.classes.length) : undefined },
          { id: 'sessions' as Section, icon: 'chart', badge: stats?.total ? String(stats.total) : undefined },
        ],
      },
      {
        id: 'manage' as const,
        items: [
          ...(role !== 'teacher' ? [{ id: 'tenants' as Section, icon: 'key' }] : []),
          ...(role === 'super'
            ? [
                { id: 'catalog' as Section, icon: 'star' },
                { id: 'feedback' as Section, icon: 'message', ...(overview?.feedbackOpen ? { badge: String(overview.feedbackOpen), tone: 'warn' as const } : {}) },
                { id: 'settings' as Section, icon: 'gear' },
              ]
            : []),
        ],
      },
      {
        id: 'secure' as const,
        items: [
          { id: 'security' as Section, icon: 'shield', ...(me && !me.mfa.enabled ? { badge: '!', tone: 'warn' as const } : {}) },
          ...(role === 'super' ? [{ id: 'checks' as Section, icon: 'checks', ...(failedChecks ? { badge: String(failedChecks), tone: 'alert' as const } : {}) }] : []),
        ],
      },
    ].filter((g) => g.items.length > 0),
  );

  /** Zustand eines Platzes wie eine Port-Leuchte: wartet, arbeitet, fehlt, abgegeben, Zeit um. */
  function seatTone(s: ExamSeat): 'idle' | 'live' | 'absent' | 'ok' | 'over' {
    if (s.submitted) return 'ok';
    if (s.state === 'closed') return 'over';
    if (s.state === 'waiting') return 'idle';
    return s.joined ? 'live' : 'absent';
  }

  /** «Zu erledigen» in der Übersicht: nur was wirklich Handlung braucht. */
  const todos = $derived.by(() => {
    const out: { tone: 'warn' | 'alert' | 'live'; text: string; go: Section }[] = [];
    if (me && !me.mfa.enabled) out.push({ tone: 'warn', text: t('admin.page.todo.mfa'), go: 'security' });
    if (me?.mfa.enabled && me.mfa.recoveryLeft <= 2) out.push({ tone: 'warn', text: t('admin.page.todo.recovery', { n: me.mfa.recoveryLeft }), go: 'security' });
    if (failedChecks) out.push({ tone: 'alert', text: t('admin.page.checksBad', { n: failedChecks }), go: 'checks' });
    if (overview?.feedbackOpen) out.push({ tone: 'live', text: t('admin.page.todo.feedback', { n: overview.feedbackOpen }), go: 'feedback' });
    const st = overview?.storage;
    if (st && Math.max(st.bytes / st.maxBytes, st.sessions / st.maxSessions) > 0.8) out.push({ tone: 'warn', text: t('admin.page.todo.storage'), go: 'settings' });
    for (const e of readyExams) out.push({ tone: 'live', text: t('admin.page.todo.ready', { label: e.label }), go: 'exams' });
    return out;
  });
</script>

<svelte:window onpointerdown={touched} onkeydown={touched} />
<div class="admin-page" class:gone={hidden}>
  {#if examMode.active || !ui.online || !token}
    <div class="login-wrap">
      <div class="login-side" aria-hidden="true">
        <svg viewBox="0 0 320 320" class="topo">
          <g class="links">
            <path d="M60 80 L160 160 L270 90 M160 160 L110 260 M160 160 L250 240 M60 80 L40 190 L110 260" />
          </g>
          <g class="nodes">
            <circle cx="60" cy="80" r="9" /><circle cx="270" cy="90" r="9" /><circle cx="40" cy="190" r="7" />
            <circle cx="110" cy="260" r="9" /><circle cx="250" cy="240" r="7" /><rect x="146" y="146" width="28" height="28" rx="7" class="hub" />
          </g>
        </svg>
      </div>
      {#if examMode.active}
        <div class="login-card">
          <Logo height={30} />
          <h1>{t('admin.page.title')}</h1>
          <p class="note"><Icon name="lock" size={16} /> {t('admin.page.examLocked')}</p>
        </div>
      {:else if !ui.online}
        <div class="login-card">
          <Logo height={30} />
          <h1>{t('admin.page.title')}</h1>
          <p class="muted">{t('settings.onlineOnly')}</p>
        </div>
      {:else}
        <form class="login-card" onsubmit={login}>
          <Logo height={30} />
          <h1>{t('admin.page.title')}</h1>
          <p class="muted">{t('admin.loginHint')}</p>
          <label class="field">
            <span>{t('admin.password')}</span>
            <!-- svelte-ignore a11y_autofocus -->
            <input type="password" bind:value={password} autocomplete="current-password" required autofocus={!needCode} readonly={needCode} />
          </label>
          {#if needCode}
            <label class="field">
              <span>{t('admin.mfa.loginCode')}</span>
              <!-- svelte-ignore a11y_autofocus -->
              <input class="otp" bind:value={code} autocomplete="one-time-code" inputmode="numeric" maxlength="20" required autofocus />
              <small class="muted">{t('admin.mfa.loginHint')}</small>
            </label>
          {/if}
          {#if message}<p class="msg {message.kind}" role="alert">{message.text}</p>{/if}
          <button type="submit" class="primary wide">{t('admin.login')}</button>
          {#if needCode}<button type="button" class="quiet wide" onclick={() => ((needCode = false), (password = ''), (code = ''))}>{t('admin.mfa.cancel')}</button>{/if}
          <p class="muted small">{t('admin.loginKeyHint')}</p>
        </form>
      {/if}
    </div>
  {:else}
    <aside class="nav">
      <div class="brand">
        <Logo height={24} />
        <span class="brand-sub">{t('admin.page.brand')}</span>
        {#if session.config?.channel === 'beta'}<span class="pill warn">{t('beta.label')}</span>{/if}
      </div>
      <nav aria-label={t('admin.page.nav')}>
        {#each navGroups as group (group.id)}
          <div class="group">
            <span class="group-label">{t(`admin.page.group.${group.id}`)}</span>
            {#each group.items as item (item.id)}
              <button class="nav-item" class:active={section === item.id} aria-current={section === item.id ? 'page' : undefined} disabled={mfaSetup && item.id !== 'security'} onclick={() => (section = item.id)}>
                <Icon name={item.icon} size={18} />
                <span class="label">{t(`admin.page.section.${item.id}`)}</span>
                {#if item.badge}<span class="count {item.tone ?? ''}">{#if item.tone === 'live'}<span class="led live"></span>{/if}{item.badge}</span>{/if}
              </button>
            {/each}
          </div>
        {/each}
      </nav>
      <div class="foot">
        {#if overview}
          <div class="account">
            <span class="avatar" aria-hidden="true"><Icon name={role === 'super' ? 'shield' : 'key'} size={16} /></span>
            <span><strong>{t(`admin.role.${role}`)}</strong>{#if overview.me.label}<br /><span class="muted small">{overview.me.label}</span>{/if}</span>
          </div>
        {/if}
        <button class="quiet nav-item" onclick={oneditor}><Icon name="desktop" size={18} /><span class="label">{t('admin.page.toEditor')}</span></button>
        {#if ui.has('tool.taskEditor') && !mfaSetup}<button class="quiet nav-item" onclick={examAi}><Icon name="sparkle" size={18} /><span class="label">{t('menu.tool.examAi')}</span></button>{/if}
        <button class="quiet nav-item" onclick={logout}><Icon name="logout" size={18} /><span class="label">{t('admin.logout')}</span></button>
      </div>
    </aside>

    <main class="content">
      <div class="inner">
        {#each running as e (e.id)}
          {@const seats = seatsOf(e)}
          {@const done = seats.filter((s) => s.submitted).length}
          {@const working = seats.filter((s) => s.state === 'open' && s.joined && !s.submitted).length}
          <div class="live-bar" role="status">
            <span class="led live"></span>
            <span class="live-title"><strong>{t('admin.page.examRunning')}</strong> {e.label}</span>
            <span class="live-stats">{t('admin.page.examProgress', { working, done, total: seats.length })}</span>
            <div class="bar" aria-hidden="true"><span class="done" style:width="{(done / Math.max(1, seats.length)) * 100}%"></span><span class="work" style:width="{(working / Math.max(1, seats.length)) * 100}%"></span></div>
            {#if leftOf(e)}<span class="clock"><Icon name="clock" size={16} />{leftOf(e)}</span>{/if}
            {#if section !== 'exams'}<button class="small" onclick={() => openExam(e.id)}>{t('admin.page.toCockpit')}</button>{/if}
          </div>
        {/each}

        <header class="page-head">
          <div>
            <h2>{t(`admin.page.section.${section}`)}</h2>
            <p class="muted">{t(`admin.page.desc.${section}`)}</p>
          </div>
          <div class="head-actions">
            <span class="muted small sync"><span class="led ok"></span>{t('admin.page.auto')}</span>
            <button class="quiet" onclick={() => (version++, refresh())} title={t('admin.refresh')}><Icon name="refresh" size={16} />{t('admin.refresh')}</button>
          </div>
        </header>
        {#if message}<p class="msg {message.kind}" role="status">{message.text}</p>{/if}

      {#if mfaSetup || section === 'security'}
        <AdminSecurity {call} {notify} {role} mfaRequired={!!draft?.mfaRequired} onrequired={setMfaRequired} onchange={() => void refresh().catch(() => undefined)} />
      {:else if !overview || !draft}
        <p class="muted">…</p>
      {:else if section === 'overview'}
        <section class="exam-panel" class:hot={running.length > 0}>
          {#if running.length}
            {#each running as e (e.id)}
              {@const seats = seatsOf(e)}
              <div class="exam-head">
                <div>
                  <h3>{e.label}</h3>
                  <p class="muted small">{e.title}</p>
                </div>
                <button class="primary" onclick={() => openExam(e.id)}>{t('admin.page.toCockpit')}</button>
              </div>
              <ol class="ports" aria-label={t('admin.page.seats')}>
                {#each seats as s (s.id)}
                  {@const tone = seatTone(s)}
                  <li class="port {tone}" title={`${t('exam.seatWord')} ${s.id}: ${t(`admin.page.seat.${tone}`)}${s.submitted ? ` ${new Date(s.submitted).toLocaleTimeString(locale() === 'en' ? 'en-GB' : 'de-CH', { hour: '2-digit', minute: '2-digit' })}` : ''}`}>
                    <span class="led {tone === 'idle' || tone === 'over' ? '' : tone === 'absent' ? 'warn' : tone}"></span>
                    <span class="seat-no">{s.id}</span>
                  </li>
                {/each}
              </ol>
              <ul class="port-legend">
                {#each ['live', 'ok', 'absent', 'idle', 'over'] as const as tone (tone)}
                  <li><span class="led {tone === 'idle' || tone === 'over' ? '' : tone === 'absent' ? 'warn' : tone}"></span>{t(`admin.page.seat.${tone}`)} {seats.filter((x) => seatTone(x) === tone).length}</li>
                {/each}
              </ul>
            {/each}
          {:else}
            <div class="exam-head">
              <div>
                <h3>{t('admin.page.noRunning')}</h3>
                <p class="muted small">{readyExams.length ? t('admin.page.examsReady', { n: readyExams.length }) + ': ' + readyExams.map((e) => e.label).join(', ') : t('admin.page.noExamHint')}</p>
              </div>
              <button onclick={() => (section = 'exams')}>{t('admin.page.toExams')}</button>
            </div>
          {/if}
        </section>

        <section class="figures">
          <button class="fig" onclick={() => (section = 'classes')}>
            <span class="num">{overview.classes.length}</span>
            <span class="lbl">{t('admin.page.figClasses', { n: overview.classes.reduce((sum, c) => sum + c.sessions, 0) })}</span>
          </button>
          <button class="fig" onclick={() => (section = 'sessions')}>
            <span class="num">{stats?.total ?? '–'}</span>
            <span class="lbl">{t('admin.stats.active')}</span>
          </button>
          <button class="fig" onclick={() => (section = 'sessions')}>
            <span class="num"><span class="led" class:ok={!!stats?.counts.connected}></span>{stats?.counts.connected ?? '–'}</span>
            <span class="lbl">{t('admin.stats.connected')}</span>
          </button>
          <button class="fig" onclick={() => (section = 'sessions')}>
            <span class="num">{stats?.counts.changed24h ?? '–'}</span>
            <span class="lbl">{t('admin.stats.changed24h')}</span>
          </button>
        </section>

        <div class="columns">
          <section class="panel">
            <div class="panel-head">
              <h3>{t('admin.page.section.classes')}</h3>
              <button class="quiet small" onclick={() => (section = 'classes')}>{t('admin.page.manage')}</button>
            </div>
            {#if overview.classes.length === 0}
              <p class="muted">{t('admin.noClasses')}</p>
            {:else}
              <ul class="list">
                {#each overview.classes.slice(0, 6) as c (c.code)}
                  <li>
                    <button class="list-item" onclick={() => ((section = 'classes'), void showClass(c))}>
                      <span class="grow"><strong>{c.label}</strong>{#if c.verbund.enabled} <span class="pill live">{t('admin.page.verbund')}</span>{/if}<br /><code class="muted">{c.code}</code></span>
                      <span class="side"><strong>{c.sessions}</strong> <span class="muted small">{t('admin.sessions')}</span><br /><span class="muted small">{t('admin.page.until', { time: when(c.expires) })}</span></span>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
          <section class="panel">
            <div class="panel-head"><h3>{t('admin.page.todoTitle')}</h3></div>
            {#if todos.length === 0}
              <p class="all-good"><span class="led ok"></span>{t('admin.page.todoNone')}</p>
            {:else}
              <ul class="list">
                {#each todos as todo, n (n)}
                  <li>
                    <button class="list-item" onclick={() => (section = todo.go)}>
                      <span class="led {todo.tone}"></span>
                      <span class="grow">{todo.text}</span>
                      <Icon name="chevron" size={16} />
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
            {#if me?.previousLogin}<p class="muted small last-login">{t('admin.security.previous', { time: when(me.previousLogin) })}</p>{/if}
          </section>
        </div>
      {:else if section === 'exams'}
        <AdminExams {call} {version} focus={focusExam ?? running[0]?.id ?? null} {notify} onwatch={(code, name) => void watch(code, name)} />
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
                  <td><strong>{c.label}</strong>{#if c.verbund.enabled} <span class="pill live">{t('admin.page.verbund')}</span>{/if}</td>
                  <td><code>{c.code}</code></td>
                  <td>{c.sessions}</td>
                  <td>{when(c.expires)}</td>
                  <td class="actions">
                    <button onclick={() => showClass(c)}>{t('admin.show')}</button>
                    {#each [7, 30] as days (days)}
                      <button onclick={() => extendClass(c, days)} title={t('admin.extendHint', { days })}>{t('admin.extend', { days })}</button>
                    {/each}
                    {#if c.verbund.enabled}<button onclick={() => (dashboard = c)}><Icon name="desktop" size={16} />{t('admin.verbund.dashboard')}</button>{/if}
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
            <h3 class="with-icon"><Icon name="globe" size={18} />{t('admin.verbund.title')}</h3>
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
                <button class="primary" onclick={() => (dashboard = oc)}><Icon name="desktop" size={16} />{t('admin.verbund.dashboard')}</button>
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
                    <td><span class="who-cell"><span class="led" class:ok={s.connected} title={s.connected ? t('verbund.dash.present') : undefined}></span><code>{s.code}</code></span></td>
                    <td>{s.site ? siteName(s.site.seat, s.site.label) : ''}</td>
                    <td>{when(s.updated)}</td>
                    <td>{s.devices} / {s.cables}</td>
                    <td>{s.progress?.total ? `${s.progress.goals}/${s.progress.total}` : ''}</td>
                    <td>{score(reviews[s.code])}</td>
                    <td class="actions">
                      <button onclick={() => loadSession(s.code)}>{t('admin.open')}</button>
                      <button title={t('admin.exams.watchHint')} onclick={() => watch(s.code, s.site ? siteName(s.site.seat, s.site.label) : s.code)}><Icon name="eye" size={16} />{t('admin.exams.watch')}</button>
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
      </div>
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
  /* --- Seite ------------------------------------------------------------------------- */
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

  /* --- Anmeldung -------------------------------------------------------------------- */
  .login-wrap {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 440px) minmax(0, 1fr);
    align-items: center;
    padding: 24px;
    overflow: auto;
  }
  .login-side {
    grid-column: 1;
    justify-self: end;
    width: min(320px, 100%);
    color: var(--accent);
    opacity: 0.9;
  }
  .topo .links path {
    fill: none;
    stroke: color-mix(in srgb, var(--accent) 45%, var(--border));
    stroke-width: 2;
    stroke-linecap: round;
    stroke-dasharray: 4 7;
  }
  .topo .nodes circle {
    fill: var(--surface);
    stroke: var(--accent);
    stroke-width: 2.5;
  }
  .topo .hub {
    fill: var(--accent);
  }
  .login-card {
    grid-column: 2;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 32px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: 0 18px 40px -24px rgb(15 23 42 / 0.35);
  }
  .login-card > :global(.logo),
  .brand :global(.logo) {
    align-self: flex-start;
    flex: none;
  }
  .login-card h1 {
    margin: 4px 0 0;
    font-size: 1.5rem;
    font-weight: 650;
    letter-spacing: -0.015em;
  }
  .login-card p {
    margin: 0;
  }
  .field {
    display: grid;
    gap: 6px;
    font-weight: 550;
  }
  .otp {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 1.25rem !important;
    letter-spacing: 0.25em;
  }
  .note {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    padding: 10px 12px;
    border-radius: var(--a-radius-s);
    background: var(--a-warn-soft);
  }
  .wide {
    width: 100%;
    min-height: 40px;
  }

  /* --- Seitenleiste ------------------------------------------------------------------- */
  .nav {
    width: 252px;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 20px 12px 14px;
    background: var(--surface);
    border-right: 1px solid var(--border);
    overflow: auto;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 10px;
    color: var(--text);
  }
  .brand-sub {
    padding-left: 10px;
    border-left: 1px solid var(--border);
    color: var(--muted);
    font-weight: 550;
  }
  nav {
    display: grid;
    gap: 16px;
  }
  .group {
    display: grid;
    gap: 2px;
  }
  .group-label {
    padding: 0 12px 4px;
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--muted);
  }
  .nav-item {
    position: relative;
    justify-content: flex-start;
    width: 100%;
    gap: 12px;
    min-height: 38px;
    padding: 0 12px;
    border: none;
    background: transparent;
    color: var(--muted);
    font-size: 0.92rem;
  }
  .nav-item:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }
  .nav-item.active {
    background: var(--selected-soft);
    color: var(--text);
    font-weight: 620;
  }
  .nav-item.active::before {
    content: '';
    position: absolute;
    left: -12px;
    top: 8px;
    bottom: 8px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--accent);
  }
  .nav-item.active :global(.icon) {
    color: var(--accent);
  }
  .nav-item .label {
    flex: 1;
    text-align: left;
    white-space: normal;
  }
  .count {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 22px;
    justify-content: center;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 0.74rem;
    font-weight: 600;
    background: var(--surface-2);
    color: var(--muted);
  }
  .count.live {
    background: var(--a-live-soft);
    color: var(--a-live);
  }
  .count.warn {
    background: var(--a-warn-soft);
    color: var(--a-warn);
  }
  .count.alert {
    background: var(--a-alert);
    color: #fff;
  }
  .foot {
    margin-top: auto;
    display: grid;
    gap: 2px;
    padding-top: 12px;
    border-top: 1px solid var(--a-line);
  }
  .account {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px 10px;
    font-size: 0.88rem;
    line-height: 1.3;
  }
  .avatar {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--a-live-soft);
    color: var(--accent);
    flex: none;
  }

  /* --- Inhalt ------------------------------------------------------------------------ */
  .content {
    flex: 1;
    min-width: 0;
    overflow: auto;
  }
  .inner {
    max-width: 1280px;
    margin: 0 auto;
    padding: 28px 36px 56px;
  }
  .page-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin: 4px 0 22px;
  }
  .page-head p {
    margin: 6px 0 0;
    max-width: 68ch;
  }
  .head-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
  }
  .sync {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .msg {
    padding: 10px 14px;
    border-radius: var(--a-radius-s);
    margin: 0 0 16px;
  }
  .msg.ok {
    background: var(--a-ok-soft);
    color: var(--a-ok);
  }
  .msg.error {
    background: var(--a-alert-soft);
    color: var(--a-alert);
  }

  /* Laufende Prüfung: schmale Leiste oben auf jeder Seite. */
  .live-bar {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    padding: 10px 14px 10px 16px;
    margin-bottom: 20px;
    border-radius: var(--a-radius);
    background: var(--a-live-soft);
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  }
  .live-title strong {
    margin-right: 6px;
  }
  .live-stats {
    color: var(--muted);
    font-size: 0.88rem;
  }
  .bar {
    flex: 1;
    min-width: 120px;
    height: 6px;
    display: flex;
    border-radius: 999px;
    overflow: hidden;
    background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  }
  .bar .done {
    background: var(--a-ok);
  }
  .bar .work {
    background: var(--accent);
  }
  .clock {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 650;
    font-size: 1.05rem;
  }

  /* --- Übersicht: Patchfeld der Plätze --------------------------------------------- */
  .exam-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--a-radius);
    padding: 20px 22px;
    margin-bottom: var(--a-gap);
  }
  .exam-panel.hot {
    border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  }
  .exam-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }
  .exam-head h3 {
    margin: 0 0 2px;
    font-size: 1.15rem;
  }
  .exam-head p {
    margin: 0;
  }
  .ports {
    list-style: none;
    margin: 18px 0 12px;
    padding: 12px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
    gap: 8px;
    background: var(--surface-2);
    border-radius: var(--a-radius-s);
  }
  .port {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 1.15;
    border-radius: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: inset 0 -3px 0 color-mix(in srgb, var(--border) 60%, transparent);
  }
  .port .led {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 7px;
    height: 7px;
    box-shadow: none;
  }
  .seat-no {
    font-weight: 650;
    font-size: 0.95rem;
  }
  .port.ok {
    background: var(--a-ok-soft);
    border-color: color-mix(in srgb, var(--a-ok) 35%, var(--border));
  }
  .port.live {
    border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  }
  .port.absent {
    border-style: dashed;
    border-color: color-mix(in srgb, var(--a-warn) 50%, var(--border));
  }
  .port.over {
    opacity: 0.6;
  }
  .port-legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    font-size: 0.84rem;
    color: var(--muted);
  }
  .port-legend li {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  /* Kennzahlen: eine Fläche, durch Linien geteilt. */
  .figures {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--a-radius);
    margin-bottom: var(--a-gap);
    overflow: hidden;
  }
  .fig {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-height: 0;
    padding: 16px 20px;
    border: none;
    border-radius: 0;
    border-left: 1px solid var(--a-line);
    background: transparent;
    text-align: left;
  }
  .fig:first-child {
    border-left: none;
  }
  .fig:hover:not(:disabled) {
    background: var(--hover);
  }
  .num {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.75rem;
    font-weight: 650;
    letter-spacing: -0.02em;
    line-height: 1.15;
  }
  .lbl {
    font-size: 0.84rem;
    font-weight: 400;
    color: var(--muted);
    white-space: normal;
  }
  .columns {
    display: grid;
    grid-template-columns: 3fr 2fr;
    gap: var(--a-gap);
    align-items: start;
  }
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .panel-head h3 {
    margin: 0;
  }
  .list {
    list-style: none;
    margin: 0 -10px;
    padding: 0;
  }
  .list li + li {
    border-top: 1px solid var(--a-line);
  }
  .list-item {
    width: 100%;
    justify-content: flex-start;
    gap: 12px;
    min-height: 52px;
    padding: 8px 10px;
    border: none;
    background: transparent;
    text-align: left;
    font-weight: 400;
    white-space: normal;
    line-height: 1.35;
  }
  .list-item:hover:not(:disabled) {
    background: var(--hover);
  }
  .grow {
    flex: 1;
  }
  .side {
    text-align: right;
  }
  .all-good {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 8px 0;
  }
  .last-login {
    margin: 14px 0 0;
  }

  /* --- Bereiche ---------------------------------------------------------------------- */
  .panel.accent {
    border-left: 4px solid var(--accent);
  }
  .with-icon {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .who-cell {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .checks {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 22px;
  }
  .checks label,
  .feature-groups label,
  .grid .inline {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px 18px;
    margin: 6px 0 10px;
    align-items: end;
  }
  .grid label:not(.inline) {
    display: grid;
    gap: 6px;
  }
  .row input:not([type='number']) {
    flex: 1;
    min-width: 200px;
  }
  .row .days {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .row .days input {
    width: 5.5rem;
  }
  .feature-groups {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
    margin-top: 8px;
  }
  .feature-groups fieldset {
    display: grid;
    gap: 4px;
    font-size: 0.86rem;
  }
  .checklist {
    list-style: none;
    margin: 0 0 var(--a-gap);
    padding: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--a-radius);
  }
  .checklist li {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    padding: 12px 16px;
    font-size: 0.9rem;
  }
  .checklist li + li {
    border-top: 1px solid var(--a-line);
  }
  .checklist .badge {
    flex: none;
    width: 6rem;
    text-align: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.76rem;
    font-weight: 600;
  }
  .status-pass .badge {
    background: var(--a-ok-soft);
    color: var(--a-ok);
  }
  .status-warn .badge {
    background: var(--a-warn-soft);
    color: var(--a-warn);
  }
  .status-fail .badge {
    background: var(--a-alert);
    color: #fff;
  }
  .status-skipped .badge {
    background: var(--surface-2);
    color: var(--muted);
  }
  .feedback {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 12px;
  }
  .feedback li {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--a-radius);
    padding: 14px 18px;
  }
  .feedback li.done {
    opacity: 0.6;
  }
  .feedback p {
    margin: 8px 0 12px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-width: 75ch;
  }
  .feedback .row {
    margin: 0;
  }
  .meta {
    display: flex;
    gap: 12px;
    align-items: baseline;
    flex-wrap: wrap;
  }

  @media (max-width: 1100px) {
    .columns {
      grid-template-columns: 1fr;
    }
    .figures {
      grid-template-columns: repeat(2, 1fr);
    }
    .fig:nth-child(3) {
      border-left: none;
    }
    .fig:nth-child(n + 3) {
      border-top: 1px solid var(--a-line);
    }
  }
  @media (max-width: 860px) {
    .login-wrap {
      grid-template-columns: 1fr;
    }
    .login-side {
      display: none;
    }
    .login-card {
      grid-column: 1;
      justify-self: center;
      width: min(440px, 100%);
    }
    .admin-page {
      flex-direction: column;
      overflow: auto;
    }
    .nav {
      width: auto;
      border-right: none;
      border-bottom: 1px solid var(--border);
      overflow: visible;
    }
    nav {
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    }
    .content {
      overflow: visible;
    }
    .inner {
      padding: 20px 16px 40px;
    }
    .page-head {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
