import { DNS_TYPES, type DnsRecord, type DnsType } from '../model/types';
import { reverseName } from '../net/dns';
import { parseIp, parseMask } from '../net/ipv4';
import { parseIp6 } from '../net/ipv6';
import { parseDscp } from '../net/qos';
import type { HostNode } from './host';

/** Befehle der simulierten Befehlszeile, angelehnt an Windows ("ipconfig", "tracert"). */
export const COMMANDS = ['ping', 'tracert', 'nslookup', 'ipconfig', 'ifdown', 'arp', 'netsh', 'netstat', 'ssh', 'call', 'hangup', 'iperf', 'cls', 'help'] as const;

/**
 * Anschluss eines Endgeräts ab- oder einschalten, wie unter Windows oder Linux:
 * «netsh interface set interface Ethernet disable|enable» (auch «admin=disabled»),
 * «ip link set eth0 down|up», «ifdown eth0», «ifup eth0». Ohne Namen der erste Anschluss.
 * Gibt den Anschluss (Index) zurück; die Oberfläche ändert damit die Topologie, die Simulation meldet es.
 */
export function parseInterfaceCommand(line: string, ports: number): { index: number; up: boolean } | { error: 'usage' | 'unknown'; name?: string } | null {
  const words = line.trim().replace(/"/g, ' ').split(/\s+/).filter(Boolean);
  const lower = words.map((w) => w.toLowerCase());
  let name: string | undefined;
  let up: boolean | undefined;
  if (lower[0] === 'ifdown' || lower[0] === 'ifup') {
    up = lower[0] === 'ifup';
    name = words[1];
  } else if (lower[0] === 'ip' && /^l(i(nk?)?)?$/.test(lower[1] ?? '') && lower[2] === 'set') {
    name = lower[3] === 'dev' ? words[4] : words[3];
    const state = lower.slice(4).find((w) => w === 'up' || w === 'down');
    if (!state) return { error: 'usage' };
    up = state === 'up';
  } else if (lower[0] === 'netsh' && /^int/.test(lower[1] ?? '') && lower[2] === 'set' && /^int/.test(lower[3] ?? '')) {
    const rest = words.slice(4);
    const state = rest.map((w) => w.toLowerCase().replace(/^admin=/, '')).find((w) => /^(en|dis)abled?$/.test(w));
    if (!state) return { error: 'usage' };
    up = state.startsWith('en');
    name = rest
      .filter((w) => !/^(admin=)?(en|dis)abled?$/i.test(w))
      .map((w) => w.replace(/^name=/i, ''))
      .join(' ');
  } else return null;
  // Name: eth0, eth1 …, Ethernet (= erster), Ethernet 2 (= zweiter), Zahl, oder leer (= erster).
  const n = (name ?? '').trim().toLowerCase();
  let index: number | null = null;
  if (!n || n === 'ethernet' || n === 'lan' || n === 'wlan' || n === 'wi-fi') index = 0;
  else if (/^(?:eth|en|e|wlan)(\d+)$/.test(n)) index = Number(/(\d+)$/.exec(n)![1]);
  else if (/^ethernet\s*(\d+)$/.test(n)) index = Number(/(\d+)$/.exec(n)![1]) - 1;
  if (index === null || index < 0 || index >= ports) return { error: 'unknown', name: name ?? '' };
  return { index, up: up === true };
}

export function runCommand(host: HostNode, line: string) {
  const ctx = host.ctx;
  const trimmed = line.trim();
  ctx.print('cmd.echo', { line: trimmed });
  if (!trimmed) return;
  const [command = '', ...args] = trimmed.split(/\s+/);
  const arg = args[0]?.toLowerCase();

  // Anschluss ab-/einschalten: Die Topologie ändert die Oberfläche (sie ruft parseInterfaceCommand auf), hier nur die Meldung.
  const iface = parseInterfaceCommand(trimmed, ctx.device()?.interfaces.length ?? 0);
  if (iface) {
    if ('error' in iface) return ctx.print(iface.error === 'usage' ? 'cmd.usage.ifdown' : 'iface.unknown', { name: iface.name ?? '' });
    return ctx.print(iface.up ? 'iface.up' : 'iface.down', { name: `eth${iface.index}` });
  }

  switch (command.toLowerCase()) {
    case 'ping':
      if (args[0]) host.ping(args[0]);
      else ctx.print('cmd.usage.ping');
      return;
    case 'tracert':
    case 'traceroute':
      if (args[0]) host.traceroute(args[0]);
      else ctx.print('cmd.usage.tracert');
      return;
    case 'nslookup':
      nslookup(host, args);
      return;
    // Linux-Schreibweisen: «ifconfig», «ip a», «dhclient -r» (abgeben), «dhclient» (neu holen).
    case 'ifconfig':
      printIpconfig(host);
      return;
    case 'ip':
      if (!arg || /^a(d(dr?)?)?$|^address$/.test(arg)) printIpconfig(host);
      else ctx.print('cmd.usage.ifdown');
      return;
    case 'dhclient':
      if (arg === '-r') host.releaseDhcp();
      else host.renewDhcp();
      return;
    case 'ipconfig':
      if (!arg || arg === '/all') printIpconfig(host);
      else if (arg === '/release') host.releaseDhcp();
      else if (arg === '/renew') host.renewDhcp();
      else if (arg === '/displaydns') printDnsCache(host);
      else if (arg === '/flushdns') {
        host.resolver.flush();
        ctx.print('dnscache.flushed');
      } else ctx.print('cmd.usage.ipconfig');
      return;
    case 'arp':
      if (!arg || arg === '-a') printArp(host);
      else if (arg === '-d') {
        host.clearArp();
        ctx.print('arp.cleared');
      } else ctx.print('cmd.usage.arp');
      return;
    case 'netstat':
      printConnections(host);
      return;
    case 'netsh':
      // «netsh interface ipv6 show neighbors»: Nachbartabelle aus Neighbor Discovery (wie «arp -a» bei IPv4).
      if (/^interface\s+ipv6\s+show\s+neigh/i.test(args.join(' '))) printNeighbors(host);
      else ctx.print('cmd.usage.netsh');
      return;
    case 'ssh':
      // Mit Ziel fragt die Oberfläche das Passwort ab und ruft dann Simulation.ssh() auf.
      if (!args[0] || !/@|-l/.test(args.join(' '))) ctx.print('cmd.usage.ssh');
      return;
    case 'call':
    case 'anrufen': {
      if (host.ctx.device()?.type !== 'ipphone') return ctx.print('voip.notAPhone');
      const seconds = args[1] === undefined ? undefined : Number(args[1]);
      if (!args[0] || (seconds !== undefined && (!Number.isInteger(seconds) || seconds < 1 || seconds > 120))) return ctx.print('cmd.usage.call');
      host.phone.call(args[0], seconds);
      return;
    }
    case 'hangup':
    case 'auflegen':
      if (host.ctx.device()?.type !== 'ipphone') return ctx.print('voip.notAPhone');
      host.phone.hangup();
      return;
    case 'iperf':
    case 'iperf3':
      iperf(host, args);
      return;
    case 'cls':
    case 'clear':
      ctx.clearConsole();
      return;
    case 'help':
    case 'hilfe':
    case '?':
      for (const name of COMMANDS) ctx.print(`help.${name}`);
      return;
    default:
      ctx.print('cmd.unknown', { cmd: command });
  }
}

/**
 * Lastgenerator wie iperf3 im UDP-Modus: «iperf -c <Ziel> -u -b <Rate> [-t <Sekunden>] [--dscp <EF|46>]».
 * Rate mit k oder M (z.B. 1500k, 3M); Standard 10 Sekunden.
 */
function iperf(host: HostNode, args: string[]) {
  const ctx = host.ctx;
  const value = (flag: string) => {
    const i = args.findIndex((a) => a === flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const target = value('-c');
  const rateText = value('-b') ?? '1M';
  const m = /^(\d+(?:[.,]\d+)?)([kKmM]?)$/.exec(rateText);
  const kbps = m ? Math.round(Number(m[1]!.replace(',', '.')) * (m[2]!.toLowerCase() === 'm' ? 1000 : m[2] ? 1 : 0.001)) : NaN;
  const seconds = Number(value('-t') ?? 10);
  const dscpText = value('--dscp') ?? value('--tos');
  const dscp = dscpText === undefined ? 0 : parseDscp(dscpText);
  if (!target || !Number.isFinite(kbps) || kbps < 8 || kbps > 100_000 || !Number.isInteger(seconds) || seconds < 1 || seconds > 60 || dscp === null) return ctx.print('cmd.usage.iperf');
  host.iperf.start(target, kbps, seconds, dscp);
}

/** Fragt den DNS-Server direkt, am eigenen Cache vorbei. */
/**
 * nslookup wie unter Windows: «nslookup [-type=A|AAAA|CNAME|MX|TXT|NS|PTR] <Name|Adresse> [Server]».
 * Eine Adresse statt eines Namens fragt nach dem PTR-Eintrag (Rückwärtsauflösung).
 * Ohne Typ: Adressen (A, bei IPv6 zusätzlich AAAA).
 */
function nslookup(host: HostNode, args: string[]) {
  const ctx = host.ctx;
  let type: DnsType | null = null;
  const rest: string[] = [];
  for (const arg of args) {
    const option = /^-(?:type|q|querytype)=(\w+)$/i.exec(arg);
    if (option) {
      const wanted = option[1]!.toUpperCase();
      if (!(DNS_TYPES as readonly string[]).includes(wanted)) return ctx.print('nslookup.badType', { type: wanted, types: DNS_TYPES.join(', ') });
      type = wanted as DnsType;
    } else rest.push(arg);
  }
  const [target, serverArg] = rest;
  if (!target) return ctx.print('cmd.usage.nslookup');
  if (serverArg && parseIp(serverArg) === null && parseIp6(serverArg) === null) return ctx.print('nslookup.badServer', { server: serverArg });
  const server = serverArg ?? host.resolver.defaultServer();
  if (!server) return ctx.print('nslookup.noServer');
  ctx.print('nslookup.server', { server });

  // Adresse statt Name: PTR-Eintrag unter in-addr.arpa bzw. ip6.arpa.
  const reverse = reverseName(target);
  const name = reverse && (!type || type === 'PTR') ? reverse : target;
  const mode = ctx.topology().ipMode;
  const types: DnsType[] = reverse && (!type || type === 'PTR') ? ['PTR'] : type ? [type] : !host.v6.enabled() || mode === 'ipv4' ? ['A'] : mode === 'ipv6' ? ['AAAA'] : ['A', 'AAAA'];
  if (reverse && name === reverse) ctx.print('nslookup.reverse', { address: target, name });

  let nonAuthorityNoted = false;
  let anything = false;
  const next = (i: number) => {
    const current = types[i];
    if (!current) return;
    host.resolver.resolve(
      name,
      current,
      (result) => {
        if (result.ok) {
          anything = true;
          if (!result.authoritative && !nonAuthorityNoted) {
            nonAuthorityNoted = true;
            ctx.print('nslookup.nonAuthoritative');
          }
          printRecords(host, result.records, current);
        } else if (result.error === 'nodata') {
          // Ohne Typ angefragt: fehlendes AAAA nur melden, wenn gar nichts gefunden wurde.
          if (type || (i === types.length - 1 && !anything)) ctx.print('nslookup.nodata', { name, type: current, server: result.server });
        } else {
          const code = result.error === 'nxdomain' || result.error === 'invalidName' ? 'nxdomain' : result.error === 'servfail' ? 'servfail' : 'failed';
          ctx.print(`nslookup.${code}`, { name, server: result.server });
          return;
        }
        next(i + 1);
      },
      { useCache: false, ...(serverArg ? { server: serverArg } : {}) },
    );
  };
  next(0);
}

function printRecords(host: HostNode, records: readonly DnsRecord[], type: DnsType) {
  const ctx = host.ctx;
  const aliases = records.filter((r) => r.type === 'CNAME' && type !== 'CNAME');
  for (const r of records) {
    if (r.type !== type) continue;
    switch (r.type) {
      case 'A':
      case 'AAAA':
        ctx.print('nslookup.answer', { name: r.name, ip: r.value });
        break;
      case 'MX':
        ctx.print('nslookup.mx', { name: r.name, priority: r.priority ?? 10, value: r.value });
        break;
      default:
        ctx.print(`nslookup.${r.type.toLowerCase()}`, { name: r.name, value: r.value });
    }
  }
  if (aliases.length) ctx.print('nslookup.aliases', { names: aliases.map((a) => a.name).join(', ') });
}

function printIpconfig(host: HostNode) {
  const ctx = host.ctx;
  const device = ctx.device();
  ctx.print('ipconfig.adapter', { name: device?.name ?? '', mac: device?.interfaces[0]?.mac ?? '' });
  if (ctx.topology().ipMode !== 'ipv6') printIpv4(host);
  const v6 = host.v6.state();
  if (!v6) return;
  ctx.print(`ipconfig.mode6.${v6.config ?? 'manual'}`);
  for (const a of v6.addresses) {
    if (a.origin === 'link-local') ctx.print('ipconfig.linkLocal', { address: a.address });
    else ctx.print('ipconfig.ipv6', { address: a.address, prefix: a.prefix, origin: a.origin });
  }
  ctx.print('ipconfig.gateway6', { gateway: v6.gateway ?? '–' });
  ctx.print('ipconfig.dns6', { dns: host.dnsServer6() ?? '–' });
}

function printIpv4(host: HostNode) {
  const ctx = host.ctx;
  const address = host.address();
  ctx.print(`ipconfig.mode.${address.mode}`);
  if (!address.ip) {
    ctx.print(address.mode === 'dhcp' ? 'ipconfig.noLease' : 'ipconfig.noAddress');
    return;
  }
  ctx.print('ipconfig.ip', { ip: address.ip });
  ctx.print('ipconfig.mask', { mask: address.mask ?? '', prefix: address.mask ? (parseMask(address.mask) ?? '') : '' });
  ctx.print('ipconfig.gateway', { gateway: address.gateway ?? '–' });
  ctx.print('ipconfig.dns', { dns: address.dns ?? '–' });
  if (address.mode === 'dhcp' && address.server && address.expires !== undefined) {
    ctx.print('ipconfig.lease', { server: address.server, remaining: Math.max(0, Math.round((address.expires - ctx.now) / 1000)) });
  }
}

function printDnsCache(host: HostNode) {
  const ctx = host.ctx;
  const entries = host.resolver.cacheEntries();
  if (entries.length === 0) return ctx.print('dnscache.empty');
  for (const entry of entries) {
    for (const record of entry.records) {
      ctx.print('dnscache.entry', {
        name: record.name,
        type: record.type,
        value: record.value,
        remaining: Math.max(0, Math.round((entry.expires - ctx.now) / 1000)),
      });
    }
  }
}

function printArp(host: HostNode) {
  const ctx = host.ctx;
  const entries = host.arpEntries();
  if (entries.length === 0) {
    ctx.print('arp.empty');
    return;
  }
  ctx.print('arp.header');
  for (const entry of entries) ctx.print('arp.entry', { ip: entry.ip, mac: entry.mac });
}

function printNeighbors(host: HostNode) {
  const ctx = host.ctx;
  const neighbors = host.v6.state()?.neighbors ?? [];
  if (neighbors.length === 0) return ctx.print('ndp.empty');
  ctx.print('ndp.header');
  for (const n of neighbors) ctx.print('ndp.entry', { ip: n.ip, mac: n.mac, router: n.router ? 'Router' : '' });
}

function printConnections(host: HostNode) {
  const ctx = host.ctx;
  const connections = host.connections();
  if (connections.length === 0) return ctx.print('netstat.empty');
  ctx.print('netstat.header');
  for (const c of connections) ctx.print('netstat.entry', { local: c.local, remote: c.remote, state: c.state });
}
