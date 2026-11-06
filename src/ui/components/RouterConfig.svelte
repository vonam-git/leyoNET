<script lang="ts">
  import { cableAt, isRouterLike, parseMask, subifId, type Device, type SerialEncapsulation } from '../../core';
  import { t } from '../../i18n';
  import { interfaceLabel } from '../labels';
  import { autosave } from '../autosave';
  import { dialogs } from '../state/dialogs.svelte';
  import { duplicates } from '../state/duplicates.svelte';
  import { editor } from '../state/editor.svelte';
  import { subnetSummary } from '../subnet';
  import { ui } from '../state/ui.svelte';
  import Icon from './Icon.svelte';
  import ScopeBadge from './ScopeBadge.svelte';
  import SubinterfaceConfig from './SubinterfaceConfig.svelte';
  import LoopbackConfig from './LoopbackConfig.svelte';

  /**
   * Router und Internet-Knoten. `part` wählt einen Teil (rechts im Inspektor nur
   * «interfaces», im erweiterten Dialog je Reiter einer); ohne `part` alles.
   */
  type Part = 'interfaces' | 'nat' | 'relay';
  /** compact: rechts im Inspektor ohne Subinterfaces (die stehen im Dialog unter «Adressen»). */
  let { device, part, compact = false }: { device: Device; part?: Part; compact?: boolean } = $props();
  const show = (p: Part) => !part || part === p;
  /** Im Dialog als Abschnitt mit Überschrift, sonst aufklappbar. */
  const box = $derived(part ? 'section' : 'details');
  const head = $derived(part ? 'h3' : 'summary');

  // --- Interfaces ------------------------------------------------------------

  let drafts = $state<{ ip: string; mask: string }[]>([]);
  let ifaceError = $state<{ index: number; field?: string; text: string } | null>(null);

  $effect(() => {
    // Masken kurz als Präfix (/24) zeigen; gespeichert werden sie in Punktschreibweise.
    drafts = device.interfaces.map((i) => ({ ip: i.ip ?? '', mask: i.mask && parseMask(i.mask) !== null ? `/${parseMask(i.mask)}` : (i.mask ?? '') }));
    ifaceError = null;
  });

  function saveInterface(index: number, quiet: boolean): boolean {
    const draft = drafts[index];
    if (!draft || !ifaceDirty(index)) return true;
    const failure = editor.setInterfaceAddress(device.id, index, draft.ip, draft.mask);
    if (failure) {
      if (!quiet) ifaceError = { index, field: failure.field, text: t(`error.${failure.code}`, failure.params) };
      return false;
    }
    if (ifaceError?.index === index) ifaceError = null;
    return true;
  }

  /** IP-Rechner öffnen; «Übernehmen» setzt die erste nutzbare Adresse (typisch für Router). */
  function calc(index: number) {
    const draft = drafts[index];
    dialogs.ipCalculator({
      ip: draft?.ip || undefined,
      mask: draft?.mask || undefined,
      apply: (v) => {
        const failure = editor.setInterfaceAddress(device.id, index, v.gateway, v.mask);
        ifaceError = failure ? { index, field: failure.field, text: t(`error.${failure.code}`, failure.params) } : null;
      },
    });
  }

  const connected = (index: number) => !!cableAt(editor.topology, { device: device.id, iface: index });

  // --- Statisches NAT -----------------------------------------------------------

  // Drei Arten: SNAT (nur ausgehend), DNAT (nur eingehend), 1:1 (beides).
  type StaticKind = 'snat' | 'dnat' | 'both';
  let staticDraft = $state<Record<StaticKind, { inside: string; outside: string }>>({ snat: { inside: '', outside: '' }, dnat: { inside: '', outside: '' }, both: { inside: '', outside: '' } });
  let staticError = $state<{ kind: StaticKind; text: string } | null>(null);
  const kindOf = (k: StaticKind) => (k === 'both' ? undefined : k);
  const rulesOf = (k: StaticKind) => (device.staticNat ?? []).map((rule, index) => ({ rule, index })).filter(({ rule }) => rule.kind === kindOf(k));

  function addStatic(event: SubmitEvent, kind: StaticKind) {
    event.preventDefault();
    const draft = staticDraft[kind];
    const failure = editor.addStaticNat(device.id, { inside: draft.inside, outside: draft.outside, ...(kind !== 'both' ? { kind } : {}) });
    staticError = failure ? { kind, text: t(`error.${failure.code}`, failure.params) } : null;
    if (!failure) staticDraft[kind] = { inside: '', outside: '' };
  }

  // --- CGNAT (Provider) ---------------------------------------------------------

  let cgnatAddress = $state('');
  let cgnatError = $state<string | null>(null);
  $effect(() => {
    cgnatAddress = device.cgnatAddress ?? '';
  });

  function saveCgnat(quiet: boolean): boolean {
    if (cgnatAddress.trim() === (device.cgnatAddress ?? '')) return true;
    const failure = editor.setCgnatAddress(device.id, cgnatAddress);
    if (failure) {
      if (!quiet) cgnatError = t(`error.${failure.code}`, failure.params);
      return false;
    }
    cgnatError = null;
    return true;
  }

  const ifaceDirty = (index: number) => {
    const saved = device.interfaces[index];
    const draft = drafts[index];
    const mask = (m?: string) => (m?.trim() ? parseMask(m) : null);
    return !!draft && (draft.ip.trim() !== (saved?.ip ?? '') || mask(draft.mask) !== mask(saved?.mask));
  };

  // --- NAT-Portweiterleitungen -------------------------------------------------

  let forwardDraft = $state({ protocol: 'tcp' as 'tcp' | 'udp', port: '80', to: '', toPort: '80' });
  let forwardError = $state<string | null>(null);

  function addForward(event: SubmitEvent) {
    event.preventDefault();
    const failure = editor.addPortForward(device.id, {
      protocol: forwardDraft.protocol,
      port: Number(forwardDraft.port),
      to: forwardDraft.to,
      toPort: Number(forwardDraft.toPort || forwardDraft.port),
    });
    forwardError = failure ? t(`error.${failure.code}`, failure.params) : null;
    if (!failure) forwardDraft = { ...forwardDraft, to: '' };
  }

  // --- DHCP-Relay ------------------------------------------------------------

  let relays = $state<string[]>([]);
  let relayError = $state<string | null>(null);

  $effect(() => {
    relays = device.interfaces.map((i) => i.dhcpRelay ?? '');
    relayError = null;
  });

  function saveRelay(index: number, quiet: boolean): boolean {
    if ((relays[index] ?? '').trim() === (device.interfaces[index]?.dhcpRelay ?? '')) return true;
    const failure = editor.setInterfaceRelay(device.id, index, relays[index] ?? '');
    if (failure) {
      if (!quiet) relayError = t(`error.${failure.code}`, failure.params);
      return false;
    }
    relayError = null;
    return true;
  }

</script>

{#if show('interfaces')}
<h3>{t('router.interfaces')}</h3>
{#each device.interfaces as iface, index (iface.index)}
  {@const draft = drafts[index]}
  {#if draft}
    {#if device.type === 'router' && ui.has('medium.serial') && !iface.sfpSlot}
      <div class="kind">
        <select
          value={iface.serial ? 'serial' : 'ethernet'}
          disabled={!editor.editable || connected(index)}
          title={connected(index) ? t('router.kindConnected') : t('router.kindHint')}
          aria-label={t('router.kindOf', { iface: interfaceLabel(device, index) })}
          onchange={(e) => editor.setPortSerial(device.id, index, e.currentTarget.value === 'serial')}
        >
          <option value="ethernet">Ethernet</option>
          <option value="serial">{t('router.serial')}</option>
        </select>
        {#if iface.serial}
          <select
            value={iface.encapsulation ?? 'hdlc'}
            disabled={!editor.editable}
            aria-label={t('router.encapsulation')}
            title={t('router.encapsulationHint')}
            onchange={(e) => editor.setEncapsulation(device.id, index, e.currentTarget.value as SerialEncapsulation)}
          >
            <option value="hdlc">HDLC</option>
            <option value="ppp">PPP</option>
          </select>
        {/if}
      </div>
    {/if}
    <form class="iface" use:autosave={(quiet) => saveInterface(index, quiet)} onsubmit={(e) => (e.preventDefault(), saveInterface(index, false))}>
      <span class="label">{interfaceLabel(device, index)}</span>
      <input
        aria-label={t('router.ifaceIp', { iface: interfaceLabel(device, index) })}
        placeholder={t('config.ip')}
        autocomplete="off"
        spellcheck="false"
        bind:value={draft.ip}
        aria-invalid={ifaceError?.index === index && ifaceError.field === 'ip'}
      />
      <input
        class="mask"
        aria-label={t('router.ifaceMask', { iface: interfaceLabel(device, index) })}
        placeholder="/24"
        autocomplete="off"
        spellcheck="false"
        bind:value={draft.mask}
        aria-invalid={ifaceError?.index === index && ifaceError.field === 'mask'}
      />
      {#if ui.has('tool.ipCalculator')}
        <button type="button" class="calc" onclick={() => calc(index)} aria-label={t('menu.tool.ipcalc')} title={t('ipcalc.openHint')}><Icon name="calc" size={15} /></button>
      {/if}
    </form>
    {#if ifaceError?.index === index}
      <p class="error" role="alert">{ifaceError.text}</p>
    {:else if iface.ip}
      <p class="muted small">{#if ui.has('tool.addressBadges')}<ScopeBadge ip={iface.ip} /> {/if}{subnetSummary(iface.ip, iface.mask)}</p>
      {#if duplicates.has(device.id, iface.ip)}<p class="error small" role="alert">❗ {t('canvas.duplicateIp', { ip: iface.ip })}</p>{/if}
    {/if}
  {/if}
{/each}

{/if}

{#if compact && (device.subinterfaces ?? []).length > 0}
  <ul class="subs">
    {#each device.subinterfaces ?? [] as sub (sub.parent * 10000 + sub.vlan)}
      <li><span class="label">{interfaceLabel(device, subifId(sub.parent, sub.vlan))}</span> <span class="mono">{sub.ip ?? '–'}{sub.mask ? `/${parseMask(sub.mask)}` : ''}</span></li>
    {/each}
  </ul>
{/if}

{#if show('interfaces') && !compact && isRouterLike(device.type) && ui.has('net.subinterfaces')}
  <SubinterfaceConfig {device} />
{/if}

{#if show('interfaces') && !compact && isRouterLike(device.type) && ui.has('net.loopback')}
  <LoopbackConfig {device} />
{/if}

{#if show('nat') && device.type === 'internet' && ui.has('net.cgnat')}
  <svelte:element this={box} class="section" open={part ? undefined : !!device.cgnatAddress} data-help="cgnat">
    <svelte:element this={head}>{t('cgnat.title')}</svelte:element>
    <p class="muted small-text">{t('cgnat.hint')}</p>
    <form class="relay" use:autosave={saveCgnat} onsubmit={(e) => (e.preventDefault(), saveCgnat(false))}>
      <span class="label">{t('cgnat.address')}</span>
      <input bind:value={cgnatAddress} placeholder="192.0.2.1" disabled={!editor.editable} aria-label={t('cgnat.address')} />
    </form>
    {#if cgnatError}<p class="error" role="alert">{cgnatError}</p>{/if}
    {#each device.interfaces as iface, index (iface.index)}
      <label class="nat">
        <input type="checkbox" checked={!!iface.cgnat} disabled={!editor.editable} onchange={(e) => editor.setCgnat(device.id, index, e.currentTarget.checked)} />
        {t('cgnat.customerPort', { iface: interfaceLabel(device, index) })}
      </label>
    {/each}
  </svelte:element>
{/if}

{#if show('nat') && (isRouterLike(device.type) || device.type === 'cpe') && ui.has('net.nat')}
  <svelte:element this={box} class="section" open={part ? undefined : device.interfaces.some((i) => i.nat)} data-help="nat">
  <svelte:element this={head}>{t('nat.title')}</svelte:element>
  <p class="muted small-text">{t('nat.hint')}</p>
  <p class="muted small-text">{t('nat.outsideChoose')}</p>
  {#each device.interfaces as iface, index (iface.index)}
    <label class="nat">
      <input type="checkbox" checked={!!iface.nat} onchange={(e) => editor.setInterfaceNat(device.id, index, e.currentTarget.checked)} />
      {t('nat.outsideIface', { iface: interfaceLabel(device, index) })}
    </label>
  {/each}

  {#if device.interfaces.some((i) => i.nat)}
    {#snippet staticRules(kind: StaticKind, arrow: string, insideFirst: boolean)}
      {#each rulesOf(kind) as { rule, index } (index)}
        <div class="forward">
          <span class="mono">{insideFirst ? `${rule.inside} ${arrow} ${rule.outside}` : `${rule.outside} ${arrow} ${rule.inside}`}</span>
          <button class="small" disabled={!editor.editable} onclick={() => editor.removeStaticNat(device.id, index)} aria-label={t('nat.removeStatic')}>✕</button>
        </div>
      {/each}
      <form class="add-static" onsubmit={(e) => addStatic(e, kind)}>
        {#if insideFirst}
          <input bind:value={staticDraft[kind].inside} placeholder="192.168.0.80" aria-label={t('nat.inside')} disabled={!editor.editable} />
          <span>{arrow}</span>
          <input bind:value={staticDraft[kind].outside} placeholder="203.0.113.5" aria-label={t('nat.outside')} disabled={!editor.editable} />
        {:else}
          <input bind:value={staticDraft[kind].outside} placeholder="203.0.113.5" aria-label={t('nat.outside')} disabled={!editor.editable} />
          <span>{arrow}</span>
          <input bind:value={staticDraft[kind].inside} placeholder="192.168.0.80" aria-label={t('nat.inside')} disabled={!editor.editable} />
        {/if}
        <button type="submit" disabled={!editor.editable || !staticDraft[kind].inside.trim() || !staticDraft[kind].outside.trim()} aria-label={t(`nat.add.${kind}`)} title={t(`nat.add.${kind}`)}>+</button>
      </form>
      {#if staticError?.kind === kind}<p class="error" role="alert">{staticError.text}</p>{/if}
    {/snippet}

    <div class="nat-block snat">
      <h4>{t('nat.snat.title')}</h4>
      <p class="muted small-text">{t('nat.snat.hint')}</p>
      <p class="sub-head">{t('nat.snat.pat')}</p>
      <p class="muted small-text">{t('nat.snat.patHint')}</p>
      {#if ui.has('net.staticNat')}
        <p class="sub-head" data-help="staticNat">{t('nat.snat.static')}</p>
        {@render staticRules('snat', '→', true)}
      {/if}
    </div>

    <div class="nat-block dnat">
      <h4>{t('nat.dnat.title')}</h4>
      <p class="muted small-text">{t('nat.dnat.hint')}</p>
      <p class="sub-head">{t('nat.forwards')}</p>
      {#each device.portForwards ?? [] as forward, i (i)}
        <div class="forward">
          <span class="mono">{forward.protocol.toUpperCase()} :{forward.port} → {forward.to}:{forward.toPort}</span>
          <button class="small" onclick={() => editor.removePortForward(device.id, i)} aria-label={t('nat.removeForward')}>✕</button>
        </div>
      {/each}
      <form class="add-forward" onsubmit={addForward}>
        <select bind:value={forwardDraft.protocol} aria-label={t('nat.protocol')}>
          <option value="tcp">TCP</option>
          <option value="udp">UDP</option>
        </select>
        <input bind:value={forwardDraft.port} inputmode="numeric" placeholder="80" aria-label={t('nat.port')} />
        <input bind:value={forwardDraft.to} placeholder="192.168.0.20" aria-label={t('nat.to')} autocomplete="off" spellcheck="false" />
        <input bind:value={forwardDraft.toPort} inputmode="numeric" placeholder="80" aria-label={t('nat.toPort')} />
        <button type="submit" disabled={!forwardDraft.to.trim()} aria-label={t('nat.addForward')} title={t('nat.addForward')}>+</button>
      </form>
      {#if forwardError}
        <p class="error" role="alert">{forwardError}</p>
      {/if}
      {#if ui.has('net.staticNat')}
        <p class="sub-head">{t('nat.dnat.static')}</p>
        {@render staticRules('dnat', '→', false)}
      {/if}
    </div>

    {#if ui.has('net.staticNat')}
      <div class="nat-block both">
        <h4>{t('nat.static')}</h4>
        <p class="muted small-text">{t('nat.staticHint')}</p>
        {@render staticRules('both', '⇄', true)}
      </div>
    {/if}
  {/if}
  </svelte:element>
{/if}

{#if show('relay') && ui.has('net.dhcpRelay') && device.type !== 'internet'}
<svelte:element this={box} class="section" open={part ? undefined : device.interfaces.some((i) => i.dhcpRelay)} data-help="dhcp">
<svelte:element this={head}>{t('router.relay')}</svelte:element>
<p class="muted small-text">{t('router.relayHint')}</p>
{#each device.interfaces as iface, index (iface.index)}
  <form class="relay" use:autosave={(quiet) => saveRelay(index, quiet)} onsubmit={(e) => (e.preventDefault(), saveRelay(index, false))}>
    <span class="label">{interfaceLabel(device, index)}</span>
    <input
      aria-label={t('router.relayFor', { iface: interfaceLabel(device, index) })}
      placeholder={t('router.relayPlaceholder')}
      autocomplete="off"
      spellcheck="false"
      bind:value={relays[index]}
    />
  </form>
{/each}
{#if relayError}
  <p class="error" role="alert">{relayError}</p>
{/if}
</svelte:element>
{/if}



<style>
  h3 {
    margin: 16px 0 6px;
    font-size: 0.85rem;
  }
  .section {
    margin-top: 10px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .subs {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    font-size: 0.8rem;
    display: grid;
    gap: 2px;
  }
  section.section {
    border: none;
    padding: 0;
  }
  .section summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 0.85rem;
    margin-bottom: 4px;
  }
  .kind {
    display: flex;
    gap: 4px;
    margin: 8px 0 -2px 2.9rem;
  }
  .kind select {
    width: auto;
    font-size: 0.75rem;
    padding: 1px 4px;
  }
  .calc {
    display: grid;
    place-items: center;
    padding: 3px 5px !important;
  }
  .nat-block {
    margin-top: 10px;
    padding: 6px 8px 8px;
    border-left: 4px solid var(--k);
    border-radius: 6px;
    background: color-mix(in srgb, var(--k) 6%, transparent);
  }
  .nat-block h4 {
    margin-top: 2px;
    color: var(--k);
  }
  .nat-block.snat {
    --k: #2563eb;
  }
  .nat-block.dnat {
    --k: #c2410c;
  }
  .nat-block.both {
    --k: #7c3aed;
  }
  .sub-head {
    margin: 8px 0 2px;
    font-size: 0.78rem;
    font-weight: 600;
  }
  .add-static {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto;
    gap: 4px;
    align-items: center;
    margin-top: 4px;
  }
  .nat input {
    width: auto;
    flex: none;
  }
  .nat {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    margin-top: 2px;
  }
  h4 {
    margin: 10px 0 4px;
    font-size: 0.8rem;
  }
  .forward {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
    padding: 2px 0;
    border-bottom: 1px solid var(--border);
  }
  .add-forward {
    display: grid;
    grid-template-columns: 4rem 3.5rem minmax(0, 1fr) 3.5rem auto;
    gap: 4px;
    margin-top: 4px;
  }
  .add-forward button {
    padding: 3px 8px;
  }
  .relay {
    display: grid;
    grid-template-columns: 2.6rem minmax(0, 1fr);
    gap: 4px;
    align-items: center;
    margin-top: 4px;
  }
  .small-text {
    margin: 0 0 4px;
    font-size: 0.75rem;
  }
  .iface {
    display: grid;
    grid-template-columns: 2.6rem minmax(0, 1fr) 4.2rem auto;
    gap: 4px;
    align-items: center;
    margin-top: 6px;
  }
  .label {
    font-size: 0.8rem;
    font-weight: 600;
  }
  input,
  select {
    width: 100%;
    min-width: 0;
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    font-size: 0.8rem;
    padding: 4px 6px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  select {
    font-family: inherit;
  }
  input[aria-invalid='true'] {
    border-color: var(--danger);
  }
  .iface button {
    padding: 3px 8px;
  }
  .small {
    font-size: 0.75rem;
    padding: 2px 8px;
  }
  p.small {
    margin: 2px 0 0 2.9rem;
  }
  .mono {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  .muted {
    color: var(--muted);
  }
  .error {
    margin: 4px 0;
    font-size: 0.8rem;
    color: var(--danger);
  }
</style>
