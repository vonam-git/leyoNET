import { formatIp, maskToText, networkOf, parseIp, parseMask } from '../net/ipv4';
import { ADMIN_DISTANCE, type Route } from '../net/routing';
import { inNetworks } from '../net/dynamic';
import { OSPF_ALL_ROUTERS, type OspfPacket } from './frames';
import { OSPF_DEFAULT_COST, OSPF_DEAD, OSPF_HELLO, OspfEngine, type OspfFamily, type OspfLink } from './ospf-engine';
import { routerIdOf, type RoutingHost } from './routing-host';

export { OSPF_DEAD, OSPF_DEFAULT_COST, OSPF_HELLO };
export type { OspfNeighbor, OspfNeighborState, OspfState } from './ospf-engine';

/**
 * OSPFv2 (RFC 2328) über IPv4: Hellos an 224.0.0.5, Netze mit Maske im Router-LSA.
 * Den Ablauf (Nachbarn, Datenbankabgleich, SPF) teilt es mit OSPFv3 (siehe ospf-engine.ts).
 */
export class Ospf {
  readonly #engine: OspfEngine<Route>;

  constructor(private readonly host: RoutingHost) {
    const config = () => host.device()?.ospf;
    const family: OspfFamily<Route> = {
      version: 2,
      ctx: host.ctx,
      log: 'ospf',
      config,
      routerId: () => routerIdOf(host, config()?.routerId),
      links: () => {
        const c = config();
        const device = host.device();
        if (!c || !device) return [];
        return host.interfaces().flatMap((iface): OspfLink[] => {
          const net = inNetworks(iface.ip, c.networks);
          if (!net) return [];
          const port = device.interfaces[iface.index];
          return [
            {
              index: iface.index,
              area: net.area,
              passive: !!c.passive?.includes(iface.index),
              cost: port?.ospfCost ?? OSPF_DEFAULT_COST,
              address: formatIp(iface.ip),
              prefixes: [{ network: formatIp(networkOf(iface.ip, iface.prefix)), prefix: iface.prefix }],
            },
          ];
        });
      },
      up: (index) => host.ifaceUp(index),
      ownPrefixes: () => new Set(host.interfaces().map((i) => `${formatIp(networkOf(i.ip, i.prefix))}/${i.prefix}`)),
      hello: (link, neighbors) => ({ mask: maskToText(link.prefixes[0]?.prefix ?? 0), helloInterval: OSPF_HELLO / 1000, deadInterval: OSPF_DEAD / 1000, neighbors }),
      helloMatches: (hello, link) => parseMask(hello.mask) === link.prefixes[0]?.prefix && hello.helloInterval * 1000 === OSPF_HELLO,
      sendMulticast: (link, packet) => host.sendMulticast(link.index, OSPF_ALL_ROUTERS, packet),
      sendTo: (neighbor, link, packet) => host.sendIp(neighbor.ip, packet, { src: link.address, ttl: 1 }),
      externals: () => {
        const c = config();
        const sources = new Set(c?.redistribute ?? []);
        if (!sources.size) return [];
        const participating = new Set(family.links().flatMap((l) => l.prefixes.map((p) => `${p.network}/${p.prefix}`)));
        return host.routesExcept('ospf').flatMap((r) => {
          const source = r.kind === 'default' ? 'static' : r.kind;
          const p = { network: formatIp(r.network), prefix: r.prefix };
          if (!sources.has(source as never) || (r.kind === 'connected' && participating.has(`${p.network}/${p.prefix}`))) return [];
          return [p];
        });
      },
      encode: (p) => ({ id: p.network, data: maskToText(p.prefix) }),
      decode: (link) => {
        const network = parseIp(link.id);
        const prefix = parseMask(link.data);
        return network === null || prefix === null ? null : { network: formatIp(network), prefix };
      },
      route: (p, iface, via, metric) => {
        const network = parseIp(p.network);
        const gateway = parseIp(via);
        return network === null || gateway === null ? null : { network, prefix: p.prefix, iface, via: gateway, kind: 'ospf', metric, distance: ADMIN_DISTANCE.ospf };
      },
      routesChanged: () => host.routesChanged(),
    };
    this.#engine = new OspfEngine(family);
  }

  routerId(): string {
    return this.#engine.routerId();
  }

  routes(): Route[] {
    return this.#engine.routes();
  }

  boot() {
    this.#engine.boot();
  }

  receive(packet: { src: string }, ospf: OspfPacket, index: number) {
    this.#engine.receive(packet.src, ospf, index);
  }

  state() {
    return this.#engine.state();
  }
}
