<script lang="ts">
  import { networkInfo, parseIp, parsePorts, parseTargets, SCAN_DEFAULT_PORTS, SCAN_DEFAULT_UDP_PORTS, type Device, type ScanError, type ScanHost } from '../../core';
  import { t } from '../../i18n';
  import { simStore } from '../state/sim.svelte';

  /**
   * Netzscanner auf dem Desktop: Geräte finden, TCP- oder UDP-Ports prüfen (IPv4 und IPv6). Aussehen wie der Auftritt von
   * leyoNET: Schreibmaschine für Überschriften, Punktraster, Farben nur mit Bedeutung.
   */
  let { device }: { device: Device } = $props();

  const deviceState = $derived((simStore.tick, simStore.sim?.getDeviceState(device.id)));
  const scan = $derived(deviceState?.scan);
  const running = $derived(scan?.status === 'running');

  /** Vorschlag: das eigene Netz. */
  const ownNet = $derived.by(() => {
    const a = deviceState?.address;
    const net = a?.ip && a.mask ? networkInfo(`${a.ip}/${maskBits(a.mask)}`) : null;
    return net ? net.network : '';
  });
  function maskBits(mask: string): number {
    const value = parseIp(mask);
    return value === null ? 24 : value.toString(2).replace(/0/g, '').length;
  }

  let target = $state('');
  let mode = $state<'discover' | 'ports' | 'direct'>('ports');
  let portText = $state('');
  let protocol = $state<'tcp' | 'udp'>('tcp');
  const defaults = $derived(protocol === 'udp' ? SCAN_DEFAULT_UDP_PORTS : SCAN_DEFAULT_PORTS);
  let error = $state<ScanError | null>(null);
  let selected = $state<string | null>(null);

  const shownTarget = $derived(target || ownNet);

  function start(event: SubmitEvent) {
    event.preventDefault();
    const text = shownTarget.trim();
    const targets = parseTargets(text);
    if ('error' in targets) return void (error = targets.error);
    let ports: number[] | undefined;
    if (mode !== 'discover' && portText.trim()) {
      const parsed = parsePorts(portText);
      if ('error' in parsed) return void (error = parsed.error);
      ports = parsed.ports;
    }
    selected = null;
    error = simStore.scan(device.id, { target: text, discoverOnly: mode === 'discover', skipDiscovery: mode === 'direct', ...(protocol === 'udp' ? { udp: true } : {}), ...(ports ? { ports } : {}) });
  }

  const hosts = $derived(new Map((scan?.hosts ?? []).map((h) => [h.ip, h])));
  const shown = $derived((scan?.hosts ?? []).filter((h) => !selected || h.ip === selected));
  const percent = $derived(scan ? (scan.status === 'running' ? Math.round((100 * scan.done) / Math.max(1, scan.total)) : 100) : 0);
  const open = (h: ScanHost) => h.ports.filter((p) => p.state === 'open');
  const maybe = (h: ScanHost) => h.ports.filter((p) => p.state === 'openFiltered');
  const count = (h: ScanHost, state: string) => h.ports.filter((p) => p.state === state).length;
  const tone = (ip: string) => {
    const h = hosts.get(ip);
    return !h ? 'off' : open(h).length ? 'open' : 'up';
  };
  const last = (ip: string) => ip.slice(Math.max(ip.lastIndexOf('.'), ip.lastIndexOf(':')) + 1) || '0';
</script>

<div class="scanner" data-help="scanner">
  <header>
    <h3><span class="ly">leyo</span><b>NET</b> {t('scanner.title')}</h3>
    <p class="law">{t('scanner.law')}</p>
  </header>

  <form onsubmit={start}>
    <label class="target"
      ><span>{t('scanner.target')}</span>
      <input bind:value={target} placeholder={ownNet || '192.168.1.0/24'} maxlength="200" spellcheck="false" autocomplete="off" /></label
    >
    <label
      ><span>{t('scanner.mode')}</span>
      <select bind:value={mode}>
        {#each ['discover', 'ports', 'direct'] as const as m (m)}<option value={m}>{t(`scanner.mode.${m}`)}</option>{/each}
      </select></label
    >
    <label
      ><span>{t('scanner.protocol')}</span>
      <select bind:value={protocol} disabled={mode === 'discover'}>
        <option value="tcp">TCP</option>
        <option value="udp">UDP</option>
      </select></label
    >
    <label class="ports"
      ><span>{t('scanner.ports')}</span>
      <input bind:value={portText} disabled={mode === 'discover'} placeholder={defaults.slice(0, 7).join(', ') + ' …'} maxlength="200" spellcheck="false" autocomplete="off" title={t('scanner.portsHint', { list: defaults.join(', ') })} /></label
    >
    {#if running}
      <button type="button" class="stop" onclick={() => simStore.scanStop(device.id)}>{t('scanner.stop')}</button>
    {:else}
      <button type="submit" class="primary">{t('scanner.start')}</button>
    {/if}
  </form>
  {#if error}<p class="error" role="alert">{t(`console.scan.${error}`)}</p>{/if}

  {#if scan}
    <div class="progress" role="progressbar" aria-valuenow={percent} aria-valuemin="0" aria-valuemax="100" aria-label={t('scanner.progress')}><span style:width="{percent}%"></span></div>
    <p class="status" role="status">
      {#if running}{t(`scanner.phase.${scan.phase}`, { done: scan.done, total: scan.total })}
      {:else}{t(`scanner.status.${scan.status}`, { hosts: scan.hosts.length, total: scan.addresses.length, seconds: (((scan.finishedAt ?? 0) - scan.startedAt) / 1000).toFixed(1) })}{/if}
      <code>{scan.target}</code>
    </p>
    <div class="result">
      <ul class="hosts">
        {#each shown as h (h.ip)}
          <li class:has-open={open(h).length > 0}>
            <div class="head">
              <strong>{h.ip}</strong>
              <span class="pill">{t(`scanner.via.${h.via}`)}</span>
              {#if h.ttl !== undefined}<span class="meta" title={t('scanner.ttlHint')}>TTL {h.ttl} · {t('scanner.hops', { n: h.hops ?? 0 })}</span>{/if}
              {#if h.mac}<span class="meta">{h.mac}</span>{/if}
            </div>
            {#if h.ports.length}
              <div class="chips">
                {#each open(h) as p (p.port)}<span class="chip open"><b>{p.port}{p.protocol === 'udp' ? '/udp' : ''}</b> {p.service}</span>{/each}
                {#each maybe(h) as p (p.port)}<span class="chip maybe" title={t('scanner.state.openFiltered')}><b>{p.port}/udp</b> {p.service}?</span>{/each}
                {#each h.ports.filter((p) => p.state === 'filtered').slice(0, 8) as p (p.port)}<span class="chip filtered" title={t('scanner.state.filtered')}>{p.port}</span>{/each}
                {#if count(h, 'filtered') > 8}<span class="chip filtered">{t('scanner.more', { n: count(h, 'filtered') - 8 })}</span>{/if}
                {#if count(h, 'closed')}<span class="chip closed">{t('scanner.closedCount', { n: count(h, 'closed') })}</span>{/if}
              </div>
            {/if}
          </li>
        {:else}
          <li class="none">{t(running ? 'scanner.searching' : 'scanner.none')}</li>
        {/each}
      </ul>
      {#if scan.addresses.length > 1}
        <div class="map" role="group" aria-label={t('scanner.map')}>
          {#each scan.addresses as ip (ip)}
            {@const tn = tone(ip)}
            <button type="button" class="cell {tn}" class:sel={selected === ip} disabled={tn === 'off'} title={ip} aria-label="{ip}: {t(`scanner.cell.${tn}`)}" aria-pressed={selected === ip} onclick={() => (selected = selected === ip ? null : ip)}>{last(ip)}</button>
          {/each}
        </div>
      {/if}
    </div>
    <p class="legend">
      <span class="chip open">{t('scanner.state.open')}</span><span class="chip closed">{t('scanner.state.closed')}</span><span class="chip filtered">{t('scanner.state.filtered')}</span>{#if protocol === 'udp'}<span class="chip maybe">{t('scanner.state.openFiltered')}</span>{/if}
    </p>
  {:else}
    <p class="intro">{t('scanner.intro')}</p>
  {/if}
</div>

<style>
  .scanner {
    height: 100%;
    overflow: auto;
    padding: 12px 14px;
    background-color: var(--surface);
    background-image: radial-gradient(var(--border) 1px, transparent 1.3px);
    background-size: 18px 18px;
    font-size: 0.84rem;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: baseline;
    gap: 4px 14px;
    margin-bottom: 10px;
  }
  h3 {
    margin: 0;
    font: 700 1.05rem 'Courier New', Courier, monospace;
  }
  .ly {
    color: #8a8f98;
    font-weight: 400;
  }
  .law {
    margin: 0;
    font-size: 0.75rem;
    color: var(--muted);
  }
  form {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr));
    gap: 8px;
    align-items: end;
    padding: 10px;
    border: 2px solid var(--text);
    border-radius: 10px;
    background: var(--surface);
  }
  label {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  label span {
    font-size: 0.72rem;
    color: var(--muted);
  }
  form {
    min-width: 0;
  }
  input,
  select {
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    padding: 5px 8px;
    font-size: 0.85rem;
    text-overflow: ellipsis;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  input {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  .primary {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
  .stop {
    background: var(--danger);
    color: #fff;
    border-color: var(--danger);
  }
  .error {
    margin: 8px 0 0;
    color: var(--danger);
    background: var(--surface);
  }
  .progress {
    height: 6px;
    margin: 10px 0 6px;
    border-radius: 999px;
    background: var(--border);
    overflow: hidden;
  }
  .progress span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .status {
    margin: 0 0 8px;
    color: var(--muted);
  }
  .result {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: flex-start;
  }
  .map {
    flex: 0 1 auto;
    max-width: 100%;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(16, minmax(0, 18px));
    gap: 2px;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }
  .cell {
    width: 100%;
    min-width: 0;
    overflow: hidden;
    height: 15px;
    padding: 0;
    border: 0;
    border-radius: 3px;
    font: 0.52rem/15px ui-monospace, Consolas, monospace;
    text-align: center;
    background: var(--surface-2);
    color: var(--muted);
    min-height: 0;
  }
  .cell.off {
    opacity: 0.55;
  }
  .cell.up {
    background: var(--endpoint);
    color: #fff;
  }
  .cell.open {
    background: var(--distribution);
    color: #fff;
  }
  :global([data-theme='dark']) .cell.up,
  :global([data-theme='dark']) .cell.open {
    color: #0e131b;
  }
  .cell.sel {
    outline: 2px solid var(--text);
  }
  .hosts {
    flex: 1 1 220px;
    min-width: 0;
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .hosts li {
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-left: 4px solid var(--endpoint);
    border-radius: 8px;
    background: var(--surface);
  }
  .hosts li.has-open {
    border-left-color: var(--distribution);
  }
  .hosts li.none {
    border-left-color: var(--border);
    color: var(--muted);
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    align-items: center;
  }
  .head strong,
  .meta {
    font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  }
  .meta {
    font-size: 0.75rem;
    color: var(--muted);
  }
  .pill {
    padding: 0 8px;
    border-radius: 999px;
    background: var(--surface-2);
    font-size: 0.72rem;
  }
  .chips,
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin: 6px 0 0;
  }
  .chip {
    padding: 1px 8px;
    border-radius: 6px;
    font: 0.76rem ui-monospace, 'Cascadia Mono', Consolas, monospace;
    border: 1px solid var(--border);
    background: var(--surface);
  }
  .chip.open {
    border-color: var(--distribution);
    background: var(--distribution-soft);
  }
  .chip.filtered {
    border-color: var(--routing);
    border-style: dashed;
    background: var(--routing-soft);
  }
  .chip.closed {
    color: var(--muted);
  }
  .intro {
    margin: 14px 0 0;
    max-width: 60ch;
    color: var(--muted);
    background: var(--surface);
  }
  .chip.maybe {
    border-style: dashed;
  }
</style>
