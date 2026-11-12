<script lang="ts">
  import { t } from '../../i18n';

  /**
   * Zugänge für Schulen und Lehrpersonen, ohne Personendaten: nur eine Bezeichnung und ein
   * Zugangsschlüssel, der einmal angezeigt wird. Der Hauptadmin legt Schulen (und Lehrpersonen)
   * an, eine Schule ihre Lehrpersonen.
   */
  interface Tenant {
    id: string;
    label: string;
    role: 'school' | 'teacher';
    school: string | null;
    created: number;
  }
  let { call, role, notify }: { call: <T>(method: string, path: string, body?: unknown) => Promise<T>; role: 'super' | 'school'; notify: (kind: 'ok' | 'error', text: string) => void } = $props();

  let list = $state<Tenant[]>([]);
  let label = $state('');
  let kind = $state<'school' | 'teacher'>(role === 'school' ? 'teacher' : 'school');
  let school = $state('');
  let shown = $state<{ label: string; key: string } | null>(null);

  const schools = $derived(list.filter((x) => x.role === 'school'));
  const nameOf = (id: string | null) => list.find((x) => x.id === id)?.label ?? '';

  async function load() {
    list = await call<Tenant[]>('GET', 'tenants');
  }
  $effect(() => {
    void load().catch(() => notify('error', t('admin.loadFailed')));
  });

  async function create(event: SubmitEvent) {
    event.preventDefault();
    try {
      const made = await call<Tenant & { key: string }>('POST', 'tenants', { label, role: kind, ...(kind === 'teacher' && school ? { school } : {}) });
      shown = { label: made.label, key: made.key };
      label = '';
      await load();
    } catch {
      notify('error', t('admin.tenants.failed'));
    }
  }

  async function newKey(x: Tenant) {
    if (!confirm(t('admin.tenants.newKeyConfirm', { label: x.label }))) return;
    const made = await call<Tenant & { key: string }>('POST', `tenants/${x.id}/key`);
    shown = { label: made.label, key: made.key };
  }

  async function rename(x: Tenant) {
    const next = prompt(t('admin.tenants.rename'), x.label);
    if (!next?.trim()) return;
    await call('PATCH', `tenants/${x.id}`, { label: next.trim() });
    await load();
  }

  async function remove(x: Tenant) {
    if (!confirm(t(x.role === 'school' ? 'admin.tenants.removeSchoolConfirm' : 'admin.tenants.removeConfirm', { label: x.label }))) return;
    await call('DELETE', `tenants/${x.id}`);
    await load();
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify('ok', t('admin.tenants.copied'));
    } catch {
      /* Zwischenablage gesperrt: Schlüssel steht sichtbar da */
    }
  }
</script>

<p class="muted">{t(role === 'super' ? 'admin.tenants.hintSuper' : 'admin.tenants.hintSchool')}</p>
<form class="row" onsubmit={create}>
  <input bind:value={label} maxlength="40" required placeholder={t('admin.tenants.labelPlaceholder')} aria-label={t('admin.tenants.label')} />
  {#if role === 'super'}
    <select bind:value={kind} aria-label={t('admin.tenants.role')}>
      <option value="school">{t('admin.tenants.school')}</option>
      <option value="teacher">{t('admin.tenants.teacher')}</option>
    </select>
    {#if kind === 'teacher'}
      <select bind:value={school} aria-label={t('admin.tenants.ofSchool')}>
        <option value="">{t('admin.tenants.noSchool')}</option>
        {#each schools as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
      </select>
    {/if}
  {/if}
  <button type="submit">{t('admin.tenants.create')}</button>
</form>
<p class="warn">⚠ {t('admin.tenants.noNames')}</p>

{#if shown}
  <div class="key" role="status">
    <p>{t('admin.tenants.keyFor', { label: shown.label })}</p>
    <code>{shown.key}</code>
    <div class="row">
      <button type="button" onclick={() => copy(shown!.key)}>{t('admin.tenants.copy')}</button>
      <button type="button" class="ghost" onclick={() => (shown = null)}>{t('admin.tenants.keyNoted')}</button>
    </div>
    <p class="muted">{t('admin.tenants.keyOnce')}</p>
  </div>
{/if}

{#if list.length === 0}
  <p class="muted">{t('admin.tenants.none')}</p>
{:else}
  <table>
    <thead><tr><th>{t('admin.tenants.label')}</th><th>{t('admin.tenants.role')}</th><th>{t('admin.tenants.ofSchool')}</th><th></th></tr></thead>
    <tbody>
      {#each list as x (x.id)}
        <tr>
          <td>{x.label}</td>
          <td>{t(x.role === 'school' ? 'admin.tenants.school' : 'admin.tenants.teacher')}</td>
          <td>{nameOf(x.school)}</td>
          <td class="actions">
            <button onclick={() => rename(x)}>{t('admin.tenants.renameShort')}</button>
            <button onclick={() => newKey(x)}>🔑 {t('admin.tenants.newKey')}</button>
            <button class="danger" onclick={() => remove(x)}>{t('admin.tenants.remove')}</button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .muted {
    color: var(--muted);
    font-size: 0.82rem;
  }
  .warn {
    color: #b45309;
    font-size: 0.8rem;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .key {
    margin: 10px 0;
    padding: 10px 12px;
    border: 2px solid var(--accent);
    border-radius: 8px;
  }
  code {
    display: block;
    margin: 6px 0;
    font-size: 1rem;
    word-break: break-all;
    user-select: all;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    margin-top: 8px;
  }
  th,
  td {
    text-align: left;
    padding: 4px 6px;
    border-bottom: 1px solid var(--border);
  }
  .actions {
    display: flex;
    gap: 4px;
    justify-content: flex-end;
  }
</style>
