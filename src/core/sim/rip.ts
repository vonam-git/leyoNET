import { formatIp, maskToText, networkOf, parseIp, parseMask } from '../net/ipv4';
import { inNetworks } from '../net/dynamic';
import { ADMIN_DISTANCE, type Route } from '../net/routing';
import { RIP_MULTICAST, RIP_PORT, type Ipv4Packet, type RipMessage, type UdpDatagram } from './frames';
import { RIP_INFINITY, RIP_TIMEOUT, RIP_UPDATE, RipEngine, type RipEntry, type RipFamily } from './rip-engine';
import type { RoutingHost } from './routing-host';

export { RIP_INFINITY, RIP_TIMEOUT, RIP_UPDATE };

const datagram = (message: RipMessage): UdpDatagram => ({ kind: 'udp', srcPort: RIP_PORT, dstPort: RIP_PORT, payload: message });
const toMessage = (command: RipMessage['command'], entries: RipEntry[]): RipMessage => ({
  kind: 'rip',
  command,
  entries: entries.map((e) => ({ network: e.network, mask: maskToText(e.prefix), nextHop: '0.0.0.0', metric: e.metric })),
});

/**
 * RIP Version 2 (RFC 2453) über IPv4: Updates an 224.0.0.9, Netze mit Maske.
 * Der Ablauf (Distanzvektor, Split Horizon, Timeout) ist mit RIPng gemeinsam (rip-engine.ts).
 */
export class Rip {
  readonly #engine: RipEngine<Route>;

  constructor(host: RoutingHost) {
    const config = () => host.device()?.rip;
    const participating = () => {
      const c = config();
      return c ? host.interfaces().filter((i) => inNetworks(i.ip, c.networks)) : [];
    };
    const family: RipFamily<Route> = {
      ctx: host.ctx,
      config,
      links: () => participating().map((i) => ({ index: i.index, prefixes: [{ network: formatIp(networkOf(i.ip, i.prefix)), prefix: i.prefix }] })),
      up: (index) => host.ifaceUp(index),
      ownPrefixes: () => new Set(host.interfaces().map((i) => `${formatIp(networkOf(i.ip, i.prefix))}/${i.prefix}`)),
      externals: () => {
        const sources = new Set(config()?.redistribute ?? []);
        if (!sources.size) return [];
        return host.routesExcept('rip').flatMap((r) => {
          const source = r.kind === 'default' ? 'static' : r.kind;
          return sources.has(source as never) ? [{ network: formatIp(r.network), prefix: r.prefix, iface: r.iface }] : [];
        });
      },
      defaultPrefix: () => ({ network: '0.0.0.0', prefix: 0 }),
      sendMulticast: (index, command, entries) => host.sendMulticast(index, RIP_MULTICAST, datagram(toMessage(command, entries))),
      sendTo: (src, index, entries) => {
        const iface = participating().find((i) => i.index === index);
        if (iface) host.sendIp(src, datagram(toMessage('response', entries)), { src: formatIp(iface.ip), ttl: 1 });
      },
      route: (p, iface, via, metric) => {
        const network = parseIp(p.network);
        const gateway = parseIp(via);
        return network === null || gateway === null ? null : { network, prefix: p.prefix, iface, via: gateway, kind: 'rip', metric, distance: ADMIN_DISTANCE.rip };
      },
      routesChanged: () => host.routesChanged(),
    };
    this.#engine = new RipEngine(family);
  }

  routes(): Route[] {
    return this.#engine.routes();
  }

  boot() {
    this.#engine.boot();
  }

  receive(packet: Ipv4Packet, message: RipMessage, index: number) {
    const entries = message.entries.flatMap((e): RipEntry[] => {
      const network = parseIp(e.network);
      const prefix = parseMask(e.mask);
      return network === null || prefix === null ? [] : [{ network: formatIp(network), prefix, metric: e.metric }];
    });
    this.#engine.receive(packet.src, message.command, entries, index);
  }

  state() {
    return this.#engine.state();
  }
}
