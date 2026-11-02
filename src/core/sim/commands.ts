import { parseMask } from '../net/ipv4';
import type { HostNode } from './host';

/** Befehle der simulierten Befehlszeile, angelehnt an Windows ("ipconfig", "tracert"). */
export const COMMANDS = ['ping', 'tracert', 'nslookup', 'ipconfig', 'arp', 'netsh', 'netstat', 'ssh', 'cls', 'help'] as const;

export function runCommand(host: HostNode, line: string) {
  const ctx = host.ctx;
  const trimmed = line.trim();
  ctx.print('cmd.echo', { line: trimmed });
  if (!trimmed) return;
  const [command = '', ...args] = trimmed.split(/\s+/);
  const arg = args[0]?.toLowerCase();

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
      if (args[0]) nslookup(host, args[0]);
      else ctx.print('cmd.usage.nslookup');
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

/** Fragt den DNS-Server direkt, am eigenen Cache vorbei. */
function nslookup(host: HostNode, name: string) {
  const ctx = host.ctx;
  const server = host.dnsServer();
  if (!server) return ctx.print('nslookup.noServer');
  ctx.print('nslookup.server', { server });
  host.resolver.resolve(
    name,
    'A',
    (result) => {
      if (result.ok) for (const record of result.records) ctx.print('nslookup.answer', { name: record.name, ip: record.value });
      else ctx.print(`nslookup.${result.error === 'nxdomain' || result.error === 'invalidName' ? 'nxdomain' : 'failed'}`, { name, server });
    },
    { useCache: false },
  );
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
