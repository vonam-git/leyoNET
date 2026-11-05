import type { Device } from '../model/types';
import { formatIp } from '../net/ipv4';
import { formatIp6, networkOf6, parseIp6 } from '../net/ipv6';
import { ADMIN_DISTANCE, type IfaceAddress } from '../net/routing';
import { OSPF6_ALL_ROUTERS, RIPNG_MULTICAST, RIPNG_PORT, type Ipv6Packet, type OspfPacket, type RipngMessage, type UdpDatagram } from './frames';
import type { Ip6Stack, Route6 } from './ip6';
import { OSPF_DEAD, OSPF_DEFAULT_COST, OSPF_HELLO, OspfEngine, type OspfFamily, type OspfLink, type Prefix } from './ospf-engine';
import { RipEngine, type RipEntry, type RipFamily } from './rip-engine';
import type { NodeContext } from './simulation';

/** Quelle für Redistribution: «ospf»/«rip» meinen hier OSPFv3 und RIPng. */
export type Source6 = 'connected' | 'static' | 'ospf' | 'rip';

/** Was OSPFv3 und RIPng vom Router brauchen. */
export interface Routing6Host {
  readonly ctx: NodeContext;
  readonly v6: Ip6Stack;
  /** Gerät mit den wirksamen Einstellungen (ohne ruhende Protokolle). */
  device(): Device | undefined;
  /** IPv4-Adressen (für die Router-ID). */
  ipv4Interfaces(): IfaceAddress[];
  ifaceUp(index: number): boolean;
  /** Routen einer Quelle für die Redistribution. */
  sources6(source: Source6): { network: bigint; prefix: number; iface: number }[];
  routesChanged(): void;
}

/** Globale (nicht Link-Local) Präfixe eines IPv6-Anschlusses. */
function prefixesOf(host: Routing6Host, index: number): Prefix[] {
  const iface = host.v6.interfaces().find((i) => i.index === index);
  return (iface?.addresses ?? []).filter((a) => a.origin !== 'link-local').map((a) => ({ network: formatIp6(networkOf6(a.address, a.prefix)), prefix: a.prefix }));
}

function ownPrefixes(host: Routing6Host): Set<string> {
  return new Set(host.v6.interfaces().flatMap((i) => prefixesOf(host, i.index).map((p) => `${p.network}/${p.prefix}`)));
}

function route6(p: Prefix, iface: number, via: string, metric: number, kind: 'ospf' | 'rip'): Route6 | null {
  const network = parseIp6(p.network);
  const gateway = parseIp6(via);
  return network === null || gateway === null ? null : { network, prefix: p.prefix, iface, via: gateway, kind, metric, distance: ADMIN_DISTANCE[kind] };
}

/** Routen aus anderen Quellen als Präfixe (ohne die Anschlüsse, die selbst am Protokoll teilnehmen). */
function externals(host: Routing6Host, sources: readonly string[] | undefined, self: Source6, participating: Set<number>): (Prefix & { iface: number })[] {
  const result: (Prefix & { iface: number })[] = [];
  for (const source of new Set(sources ?? [])) {
    if (source === self || source === 'bgp') continue;
    for (const r of host.sources6(source as Source6)) {
      if (source === 'connected' && participating.has(r.iface)) continue;
      result.push({ network: formatIp6(r.network), prefix: r.prefix, iface: r.iface });
    }
  }
  return result;
}

/**
 * Router-ID für OSPFv3: konfiguriert, sonst die höchste IPv4-Adresse; ein
 * reines IPv6-Netz hat keine, dann bilden die letzten vier Bytes der MAC die ID
 * (in FRRouting müsste man sie dann von Hand setzen).
 */
export function routerId6(host: Routing6Host, configured?: string): string {
  if (configured) return configured;
  const ips = host.ipv4Interfaces().map((i) => i.ip);
  if (ips.length) return formatIp(Math.max(...ips));
  const mac = host.device()?.interfaces[0]?.mac ?? '00:00:00:00:00:00';
  return mac
    .split(':')
    .slice(2)
    .map((b) => parseInt(b, 16))
    .join('.');
}

/** OSPFv3 (RFC 5340): Hellos an ff02::5 vom Link-Local, Netze im Intra-Area-Prefix-LSA. */
export class Ospf6 {
  readonly #engine: OspfEngine<Route6>;

  constructor(private readonly host: Routing6Host) {
    const config = () => host.device()?.ospf6;
    const send = (index: number, dst: string, packet: OspfPacket) => host.v6.sendLinkLocal(index, dst, packet, 1);
    const family: OspfFamily<Route6> = {
      version: 3,
      ctx: host.ctx,
      log: 'ospf6',
      config,
      routerId: () => routerId6(host, config()?.routerId),
      links: () => {
        const c = config();
        const device = host.device();
        if (!c || !device) return [];
        const present = new Set(host.v6.interfaces().map((i) => i.index));
        return c.interfaces.flatMap((entry): OspfLink[] =>
          present.has(entry.iface)
            ? [
                {
                  index: entry.iface,
                  area: entry.area,
                  passive: !!c.passive?.includes(entry.iface),
                  cost: device.interfaces[entry.iface]?.ospfCost ?? OSPF_DEFAULT_COST,
                  // Interface-ID: die Nummer des Anschlusses (RFC 5340 lässt sie frei wählen).
                  address: String(entry.iface),
                  prefixes: prefixesOf(host, entry.iface),
                },
              ]
            : [],
        );
      },
      up: (index) => host.ifaceUp(index),
      ownPrefixes: () => ownPrefixes(host),
      hello: (link, neighbors) => ({ mask: '', interfaceId: link.index, helloInterval: OSPF_HELLO / 1000, deadInterval: OSPF_DEAD / 1000, neighbors }),
      helloMatches: (hello) => hello.helloInterval * 1000 === OSPF_HELLO && hello.deadInterval * 1000 === OSPF_DEAD,
      sendMulticast: (link, packet) => send(link.index, OSPF6_ALL_ROUTERS, packet),
      sendTo: (neighbor, link, packet) => send(link.index, neighbor.ip, packet),
      externals: () => externals(host, config()?.redistribute, 'ospf', new Set(config()?.interfaces.map((e) => e.iface))),
      encode: (p) => ({ id: p.network, data: String(p.prefix) }),
      decode: (link) => {
        const network = parseIp6(link.id);
        const prefix = Number(link.data);
        return network === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 128 ? null : { network: formatIp6(network), prefix };
      },
      route: (p, iface, via, metric) => route6(p, iface, via, metric, 'ospf'),
      routesChanged: () => host.routesChanged(),
    };
    this.#engine = new OspfEngine(family);
  }

  routes(): Route6[] {
    return this.#engine.routes();
  }

  boot() {
    this.#engine.boot();
  }

  receive(packet: Ipv6Packet, ospf: OspfPacket, index: number) {
    this.#engine.receive(packet.src, ospf, index);
  }

  state() {
    return this.#engine.state();
  }
}

const datagram = (message: RipngMessage): UdpDatagram => ({ kind: 'udp', srcPort: RIPNG_PORT, dstPort: RIPNG_PORT, payload: message });
const toMessage = (command: RipngMessage['command'], entries: RipEntry[]): RipngMessage => ({ kind: 'ripng', command, entries: entries.map((e) => ({ prefix: e.network, length: e.prefix, metric: e.metric })) });

/** RIPng (RFC 2080): Updates an ff02::9, UDP 521, nächster Hop ist der Absender (Link-Local). */
export class Ripng {
  readonly #engine: RipEngine<Route6>;

  constructor(private readonly host: Routing6Host) {
    const config = () => host.device()?.ripng;
    const links = () => {
      const c = config();
      if (!c) return [];
      const present = new Set(host.v6.interfaces().map((i) => i.index));
      return c.interfaces.filter((i) => present.has(i)).map((index) => ({ index, prefixes: prefixesOf(host, index) }));
    };
    const family: RipFamily<Route6> = {
      ctx: host.ctx,
      config,
      links,
      up: (index) => host.ifaceUp(index),
      ownPrefixes: () => ownPrefixes(host),
      externals: () => externals(host, config()?.redistribute, 'rip', new Set(config()?.interfaces)),
      defaultPrefix: () => ({ network: '::', prefix: 0 }),
      // RFC 2080, 2.5.1: Hop Limit 255, damit Empfänger fremde Absender erkennen.
      sendMulticast: (index, command, entries) => host.v6.sendLinkLocal(index, RIPNG_MULTICAST, datagram(toMessage(command, entries)), 255),
      sendTo: (src, index, entries) => host.v6.sendLinkLocal(index, src, datagram(toMessage('response', entries)), 255),
      route: (p, iface, via, metric) => route6(p, iface, via, metric, 'rip'),
      routesChanged: () => host.routesChanged(),
    };
    this.#engine = new RipEngine(family);
  }

  routes(): Route6[] {
    return this.#engine.routes();
  }

  boot() {
    this.#engine.boot();
  }

  receive(packet: Ipv6Packet, message: RipngMessage, index: number) {
    // Nur Updates von Nachbarn auf derselben Leitung (Link-Local-Absender).
    if (!packet.src.startsWith('fe80:')) return;
    const entries = message.entries.flatMap((e): RipEntry[] => {
      const network = parseIp6(e.prefix);
      return network === null || e.length < 0 || e.length > 128 ? [] : [{ network: formatIp6(networkOf6(network, e.length)), prefix: e.length, metric: e.metric }];
    });
    this.#engine.receive(packet.src, message.command, entries, index);
  }

  state() {
    return this.#engine.state();
  }
}
