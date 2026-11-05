// Fehlersuche-Prüfungen: In ein funktionierendes Netz werden zufällig einige
// typische Fehler eingebaut (falsche Maske, falsches Gateway, abgeschalteter
// Port, fehlendes Routing, falscher DNS-Eintrag …). Zu jedem Fehler gibt es
// einen Prüfbaustein, der erfüllt ist, sobald der Fehler behoben ist. Mit einem
// Startwert pro Platz bekommt jede Person andere Fehler.

import { routingModeOf } from '../model/devices';
import {
  addDnsRecord,
  configureHost,
  removeCable,
  removeDnsRecord,
  setDhcpServer,
  setInterfaceAddress,
  setInterfaceShutdown,
  setRoutingMode,
} from '../model/topology';
import type { Device, Topology } from '../model/types';
import { formatIp, networkOf, parseIp, parseMask } from '../net/ipv4';
import type { Check } from './tasks';

export type FaultKind = 'hostMask' | 'hostGateway' | 'routerIp' | 'routing' | 'portShutdown' | 'cable' | 'dhcpGateway' | 'dhcpDns' | 'dnsRecord';
export const FAULT_KINDS: readonly FaultKind[] = ['hostMask', 'hostGateway', 'routerIp', 'routing', 'portShutdown', 'cable', 'dhcpGateway', 'dhcpDns', 'dnsRecord'];

export interface Fault {
  kind: FaultKind;
  /** Betroffenes Gerät (Name). */
  device: string;
  /** Werte für Texte, z.B. { wrong: '192.168.1.254', right: '192.168.1.1' }. */
  params: Record<string, string>;
  /** Erfüllt, sobald der Fehler behoben ist. */
  check: Check;
}

const ENDPOINT = new Set(['pc', 'notebook', 'server']);
const ROUTERS = new Set(['router', 'firewall', 'l3switch']);

/** Zufallsgenerator mit Startwert (wiederholbar). */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
  return { next, shuffle: <T>(list: T[]) => list.map((v) => [next(), v] as const).sort((a, b) => a[0] - b[0]).map(([, v]) => v) };
}

function used(topology: Topology): Set<number> {
  const out = new Set<number>();
  for (const d of topology.devices) {
    for (const i of d.interfaces) if (i.ip) out.add(parseIp(i.ip) ?? -1);
    if (d.gateway) out.add(parseIp(d.gateway) ?? -1);
  }
  return out;
}

/** Freie Adresse im Netz, von oben gezählt (nicht Netz- und Broadcastadresse). */
function freeAddress(topology: Topology, ip: number, prefix: number, avoid: number[] = []): string | null {
  const net = networkOf(ip, prefix);
  const size = 2 ** (32 - prefix);
  const taken = used(topology);
  for (let k = size - 2; k >= 1; k--) {
    const candidate = (net + k) >>> 0;
    if (!taken.has(candidate) && !avoid.includes(candidate)) return formatIp(candidate);
  }
  return null;
}

const cidrOf = (ip?: string, mask?: string) => {
  const a = ip ? parseIp(ip) : null;
  const p = mask ? parseMask(mask) : null;
  return a === null || p === null ? null : { ip: a, prefix: p };
};

interface Candidate {
  kind: FaultKind;
  device: string;
  apply(t: Topology): { topology: Topology; params: Record<string, string>; check: Check } | null;
}

function candidates(topology: Topology): Candidate[] {
  const out: Candidate[] = [];
  const name = (d: Device) => d.name;
  for (const d of topology.devices) {
    const c = cidrOf(d.interfaces[0]?.ip, d.interfaces[0]?.mask);
    if (ENDPOINT.has(d.type) && !d.dhcp && c && d.gateway) {
      const gw = parseIp(d.gateway);
      // Maske, bei der das Gateway nicht mehr im eigenen Netz liegt.
      out.push({
        kind: 'hostMask',
        device: name(d),
        apply: (t) => {
          if (gw === null) return null;
          let p = c.prefix + 1;
          while (p <= 30 && networkOf(c.ip, p) === networkOf(gw, p)) p++;
          if (p > 30) return null;
          const r = configureHost(t, d.id, { ip: d.interfaces[0]!.ip!, mask: String(p), gateway: d.gateway!, ...(d.dns ? { dns: d.dns } : {}) });
          return r.ok ? { topology: r.value, params: { wrong: `/${p}`, right: `/${c.prefix}` }, check: { type: 'address', device: d.name, address: `${d.interfaces[0]!.ip}/${c.prefix}` } } : null;
        },
      });
      out.push({
        kind: 'hostGateway',
        device: name(d),
        apply: (t) => {
          const wrong = freeAddress(t, c.ip, c.prefix);
          if (!wrong) return null;
          const r = configureHost(t, d.id, { ip: d.interfaces[0]!.ip!, mask: String(c.prefix), gateway: wrong, ...(d.dns ? { dns: d.dns } : {}) });
          return r.ok ? { topology: r.value, params: { wrong, right: d.gateway! }, check: { type: 'gateway', device: d.name, gateway: d.gateway! } } : null;
        },
      });
    }
    if (ROUTERS.has(d.type)) {
      d.interfaces.forEach((iface, index) => {
        const ic = cidrOf(iface.ip, iface.mask);
        if (!ic || ic.prefix >= 30) return;
        // Nur LAN-Anschlüsse, die als Gateway dienen.
        const isGateway = topology.devices.some((h) => h.gateway === iface.ip || h.dhcpServer?.gateway === iface.ip);
        if (!isGateway) return;
        out.push({
          kind: 'routerIp',
          device: name(d),
          apply: (t) => {
            const wrong = freeAddress(t, ic.ip, ic.prefix);
            if (!wrong) return null;
            const r = setInterfaceAddress(t, d.id, index, wrong, String(ic.prefix));
            return r.ok ? { topology: r.value, params: { wrong, right: iface.ip! }, check: { type: 'address', device: d.name, address: `${iface.ip}/${ic.prefix}` } } : null;
          },
        });
      });
      const remote = remoteNetwork(topology, d);
      if (routingModeOf(d) === 'auto' && remote) {
        out.push({
          kind: 'routing',
          device: name(d),
          apply: (t) => {
            const r = setRoutingMode(t, d.id, 'static');
            return r.ok ? { topology: r.value, params: { network: remote }, check: { type: 'routeLearned', device: d.name, network: remote } } : null;
          },
        });
      }
    }
    if (d.dhcpServer?.gateway) {
      const sc = cidrOf(d.interfaces[0]?.ip, d.interfaces[0]?.mask);
      out.push({
        kind: 'dhcpGateway',
        device: name(d),
        apply: (t) => {
          const s = d.dhcpServer!;
          const wrong = sc ? freeAddress(t, sc.ip, sc.prefix, [parseIp(s.start) ?? 0, parseIp(s.end) ?? 0]) : null;
          if (!wrong) return null;
          const r = setDhcpServer(t, d.id, { ...s, gateway: wrong });
          return r.ok
            ? { topology: r.value, params: { wrong, right: s.gateway! }, check: { type: 'dhcpServer', device: d.name, start: s.start, end: s.end, gateway: s.gateway! } }
            : null;
        },
      });
    }
    if (d.dhcpServer?.dns) {
      const sc = cidrOf(d.interfaces[0]?.ip, d.interfaces[0]?.mask);
      out.push({
        kind: 'dhcpDns',
        device: name(d),
        apply: (t) => {
          const s = d.dhcpServer!;
          const wrong = sc ? freeAddress(t, sc.ip, sc.prefix, [parseIp(s.start) ?? 0, parseIp(s.end) ?? 0]) : null;
          if (!wrong) return null;
          const r = setDhcpServer(t, d.id, { ...s, dns: wrong });
          return r.ok ? { topology: r.value, params: { wrong, right: s.dns! }, check: { type: 'dhcpServer', device: d.name, start: s.start, end: s.end, dns: s.dns! } } : null;
        },
      });
    }
    d.dnsServer?.records.forEach((record, index) => {
      if (record.type !== 'A') return;
      const ip = parseIp(record.value);
      if (ip === null) return;
      out.push({
        kind: 'dnsRecord',
        device: name(d),
        apply: (t) => {
          const wrong = formatIp((ip & ~0xff) | ((((ip & 0xff) + 7) % 254) + 1));
          const removed = removeDnsRecord(t, d.id, index);
          if (!removed.ok) return null;
          const r = addDnsRecord(removed.value, d.id, { ...record, value: wrong });
          return r.ok ? { topology: r.value, params: { name: record.name, wrong, right: record.value }, check: { type: 'dnsRecord', device: d.name, name: record.name, value: record.value } } : null;
        },
      });
    });
  }
  // Kabel zwischen Endgerät und Switch: Port abschalten oder Kabel ziehen.
  for (const cable of topology.cables) {
    const a = topology.devices.find((d) => d.id === cable.a.device);
    const b = topology.devices.find((d) => d.id === cable.b.device);
    if (!a || !b) continue;
    const [host, sw, port] = ENDPOINT.has(a.type) && b.type === 'switch' ? [a, b, cable.b.iface] : ENDPOINT.has(b.type) && a.type === 'switch' ? [b, a, cable.a.iface] : [null, null, -1];
    if (!host || !sw) continue;
    out.push({
      kind: 'portShutdown',
      device: sw.name,
      apply: (t) => {
        const r = setInterfaceShutdown(t, sw.id, port, true);
        return r.ok ? { topology: r.value, params: { host: host.name, port: String(port + 1) }, check: { type: 'linkUp', a: host.name, b: sw.name } } : null;
      },
    });
    out.push({
      kind: 'cable',
      device: host.name,
      apply: (t) => {
        const r = removeCable(t, cable.id);
        return r.ok ? { topology: r.value, params: { host: host.name, switch: sw.name }, check: { type: 'connected', a: host.name, b: sw.name } } : null;
      },
    });
  }
  return out;
}

/** Ein Netz, das der Router nur über andere Router erreicht (für «Routing fehlt»). */
function remoteNetwork(topology: Topology, router: Device): string | null {
  const own = new Set(
    router.interfaces.flatMap((i) => {
      const c = cidrOf(i.ip, i.mask);
      return c ? [`${formatIp(networkOf(c.ip, c.prefix))}/${c.prefix}`] : [];
    }),
  );
  for (const other of topology.devices) {
    if (other.id === router.id || !ROUTERS.has(other.type)) continue;
    for (const i of other.interfaces) {
      const c = cidrOf(i.ip, i.mask);
      if (!c || c.prefix >= 30) continue;
      const net = `${formatIp(networkOf(c.ip, c.prefix))}/${c.prefix}`;
      if (!own.has(net)) return net;
    }
  }
  return null;
}

/**
 * Baut `count` verschiedene Fehler ein (möglichst verschiedene Arten und
 * Geräte). `kinds` schränkt die Arten ein. Liefert das kaputte Netz und die Fehler.
 */
export function injectFaults(topology: Topology, options: { seed: number; count: number; kinds?: readonly FaultKind[] }): { topology: Topology; faults: Fault[] } {
  const rng = seeded(options.seed);
  const allowed = new Set(options.kinds ?? FAULT_KINDS);
  const byKind = new Map<FaultKind, Candidate[]>();
  for (const c of rng.shuffle(candidates(topology).filter((c) => allowed.has(c.kind)))) {
    byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c]);
  }
  const kinds = rng.shuffle([...byKind.keys()]);
  let current = topology;
  const faults: Fault[] = [];
  const touched = new Set<string>();
  // Reihum je Art einen Fehler, jedes Gerät höchstens einmal.
  for (let round = 0; faults.length < options.count && round < 20; round++) {
    let progress = false;
    for (const kind of kinds) {
      if (faults.length >= options.count) break;
      const list = byKind.get(kind)!;
      const index = list.findIndex((c) => !touched.has(c.device));
      if (index < 0) continue;
      const [candidate] = list.splice(index, 1);
      const result = candidate!.apply(current);
      if (!result) continue;
      current = result.topology;
      touched.add(candidate!.device);
      faults.push({ kind, device: candidate!.device, params: result.params, check: result.check });
      progress = true;
    }
    if (!progress) break;
  }
  return { topology: current, faults };
}
