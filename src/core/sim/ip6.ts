import { DEVICE_SPECS, hasRoutingTable, routingModeOf } from '../model/devices';
import type { Device, Topology } from '../model/types';
import {
  ALL_DHCP6,
  ALL_NODES,
  ALL_ROUTERS,
  eui64,
  formatIp6,
  isLinkLocal6,
  isMulticast6,
  linkLocal,
  multicastMac6,
  networkOf6,
  parseCidr6,
  parseIp6,
  solicitedNode,
} from '../net/ipv6';
import { autoRoutes6 } from '../net/autoroute';
import { ADMIN_DISTANCE, type RouteKind } from '../net/routing';
import { DHCP6_CLIENT_PORT, DHCP6_SERVER_PORT, type Dhcpv6Message, type EthernetFrame, type Icmpv6Message, type Ipv4Packet, type Ipv6Packet, type TcpSegment, type UdpDatagram } from './frames';
import type { NodeContext } from './simulation';

/**
 * IPv6-Stack eines Geräts (RFC 8200) mit Neighbor Discovery (RFC 4861),
 * zustandsloser Autokonfiguration SLAAC (RFC 4862), ICMPv6 (RFC 4443) und
 * DHCPv6 (RFC 9915). Jedes IPv6-Interface hat eine Link-Local-Adresse
 * (fe80::/64 + EUI-64); globale Adressen kommen von Hand, per SLAAC oder
 * per DHCPv6. Statt ARP lösen Neighbor Solicitation/Advertisement Adressen
 * auf, Router Advertisements teilen Präfix und Standardrouter mit.
 *
 * Vereinfachungen: keine Erweiterungs-Header, kein MLD (Multicast-Gruppen
 * werden ohne Anmeldung empfangen), keine Privacy-Adressen, Router
 * Advertisements alle 30 s.
 */

export const IPV6_ENABLED = (t: Topology) => t.ipMode === 'dual' || t.ipMode === 'ipv6';
export const IPV4_ENABLED = (t: Topology) => t.ipMode !== 'ipv6';

export const ND_TIMEOUT = 1000;
export const ND_ATTEMPTS = 3;
export const NEIGHBOR_TTL = 300_000;
export const RA_INTERVAL = 30_000;
export const RA_LIFETIME = 1800;
export const PREFIX_VALID = 86_400;
export const DEFAULT_HOP_LIMIT = 64;

export type AddressOrigin = 'link-local' | 'manual' | 'slaac' | 'dhcpv6';

export interface Address6 {
  address: bigint;
  prefix: number;
  origin: AddressOrigin;
}

export interface Iface6 {
  index: number;
  mac: string;
  addresses: Address6[];
}

export interface Route6 {
  network: bigint;
  prefix: number;
  iface: number;
  /** Nächster Router; null = Ziel liegt im direkt angeschlossenen Netz. */
  via: bigint | null;
  kind: RouteKind;
  metric?: number;
  distance?: number;
}

export interface Neighbor6 {
  ip: string;
  mac: string;
  iface: number;
  router: boolean;
  expires: number;
}

export interface Ip6State {
  addresses: { iface: number; address: string; prefix: number; origin: AddressOrigin }[];
  neighbors: Neighbor6[];
  routes6: Route6[];
  /** Endgeräte: Standardrouter aus dem Router Advertisement oder von Hand. */
  gateway?: string;
  /** Wie die Adresse entsteht: «manual», «slaac», «dhcpv6» oder «waiting» (noch kein Router Advertisement). */
  config?: 'manual' | 'slaac' | 'dhcpv6' | 'waiting';
  /** Endgeräte mit automatischer Konfiguration: DNS-Server aus RDNSS bzw. DHCPv6. */
  dns?: string;
}

export type Send6Error = 'noRoute' | 'hostUnreachable' | 'gatewayUnreachable';

/** Was der Stack vom Gerät braucht. */
export interface Ip6Host {
  readonly ctx: NodeContext;
  readonly forwarding: boolean;
  sendFrame(index: number, frame: EthernetFrame): boolean;
  /** Echo-Antworten und ICMPv6-Fehler für Ping und Traceroute. */
  onIcmp6(packet: Ipv6Packet): void;
  /** UDP-Datagramme ausser DHCPv6. */
  onUdp6?(packet: Ipv6Packet, datagram: UdpDatagram, index: number): void;
  /** TCP-Segmente an eine eigene Adresse (Web, Mail, SSH über IPv6). */
  onTcp6?(packet: Ipv6Packet, segment: TcpSegment): void;
  /** Paketfilter für TCP und UDP (Firewall); false = verwerfen. `forwarded`: Paket wird weitergeleitet. */
  filter6?(packet: Ipv6Packet, inIndex: number, forwarded: boolean): boolean;
  /** DS-Lite: getunneltes IPv4-Paket an eine eigene Adresse. true = erledigt. */
  onTunnel?(packet: Ipv6Packet, inner: Ipv4Packet, index: number): boolean;
}

interface Pending {
  iface: number;
  attempts: number;
  waiters: { onMac: (mac: string) => void; onFail: () => void }[];
}

/** Längster Präfix gewinnt; bei Gleichstand die kleinere administrative Distanz. */
export function lookupRoute6(routes: readonly Route6[], dst: bigint): Route6 | undefined {
  let best: Route6 | undefined;
  for (const route of routes) {
    if (networkOf6(dst, route.prefix) !== route.network) continue;
    if (!best || route.prefix > best.prefix || (route.prefix === best.prefix && (route.distance ?? 0) < (best.distance ?? 0))) best = route;
  }
  return best;
}

/** Physische Anschlüsse eines Geräts, die IPv6 sprechen (Endgerät: erster Anschluss). */
export function ipv6Ports(device: Device): number[] {
  if (DEVICE_SPECS[device.type].role === 'endpoint') return device.interfaces[0] ? [0] : [];
  if (device.type === 'l3switch' || !hasRoutingTable(device.type)) return [];
  return device.interfaces.filter((i) => i.ipv6 && !i.serial).map((i) => i.index);
}

/** Konfigurierte (statische) IPv6-Adressen der Anschlüsse, z.B. für das automatische Routing. */
export function configuredAddresses6(device: Device): { index: number; address: bigint; prefix: number }[] {
  return device.interfaces.flatMap((i) => {
    const c = i.ipv6 ? parseCidr6(i.ipv6) : null;
    return c && !i.shutdown ? [{ index: i.index, address: c.address, prefix: c.prefix }] : [];
  });
}

export class Ip6Stack {
  #neighbors = new Map<string, Neighbor6>();
  #pending = new Map<string, Pending>();
  /** Per SLAAC oder DHCPv6 bezogene Adressen je Anschluss. */
  #learned = new Map<number, Address6>();
  /** Gelernter IPv6-DNS-Server (RDNSS oder DHCPv6). */
  #dns6: string | undefined;
  /** Standardrouter aus Router Advertisements je Anschluss. */
  #routers = new Map<number, { address: bigint; expires: number }>();
  /** On-Link-Präfixe aus Router Advertisements. */
  #onLink = new Map<number, { network: bigint; prefix: number; managed: boolean }>();
  /** DHCPv6-Server: vergebene Adressen je Client-MAC. */
  #leases = new Map<string, bigint>();
  #dhcpXid = 0;
  #dhcpState: 'idle' | 'soliciting' | 'requesting' | 'bound' = 'idle';
  #booted = false;
  #raTimer = 0;

  constructor(
    private readonly host: Ip6Host,
    private readonly device: () => Device | undefined,
  ) {}

  get #ctx() {
    return this.host.ctx;
  }

  enabled(): boolean {
    return IPV6_ENABLED(this.#ctx.topology());
  }

  #isEndpoint(device: Device) {
    return DEVICE_SPECS[device.type].role === 'endpoint';
  }

  /** CPE: Der WAN-Anschluss lernt Präfix und Standardrouter vom Provider wie ein Endgerät. */
  #hostLike(device: Device, index: number) {
    return this.#isEndpoint(device) || (device.type === 'cpe' && index === 0);
  }

  interfaces(): Iface6[] {
    const device = this.device();
    if (!device || !this.enabled()) return [];
    return ipv6Ports(device).flatMap((index) => {
      const iface = device.interfaces[index];
      if (!iface || iface.shutdown) return [];
      const addresses: Address6[] = [{ address: linkLocal(iface.mac), prefix: 64, origin: 'link-local' }];
      const manual = iface.ipv6 && !(this.#isEndpoint(device) && device.ipv6Auto) ? parseCidr6(iface.ipv6) : null;
      if (manual) addresses.push({ ...manual, origin: 'manual' });
      const learned = this.#learned.get(index);
      if (learned && !addresses.some((a) => a.address === learned.address)) addresses.push(learned);
      return [{ index, mac: iface.mac, addresses }];
    });
  }

  isOwn(address: bigint): boolean {
    return address === 1n || this.interfaces().some((i) => i.addresses.some((a) => a.address === address));
  }

  /** Empfangene Multicast-MAC: alle Knoten, Solicited-Node der eigenen Adressen, Router bzw. DHCPv6-Server. */
  acceptsMac(mac: string, index: number): boolean {
    if (!mac.startsWith('33:33:')) return false;
    const iface = this.interfaces().find((i) => i.index === index);
    if (!iface) return false;
    return this.#groups(iface).some((g) => multicastMac6(g) === mac.toUpperCase());
  }

  #groups(iface: Iface6): bigint[] {
    const device = this.device();
    const groups = [parseIp6(ALL_NODES)!, ...iface.addresses.map((a) => solicitedNode(a.address))];
    if (this.host.forwarding && device && !this.#hostLike(device, iface.index)) groups.push(parseIp6(ALL_ROUTERS)!);
    if (device?.interfaces[iface.index]?.dhcp6) groups.push(parseIp6(ALL_DHCP6)!);
    return groups;
  }

  // --- Routen ------------------------------------------------------------------

  routes(): Route6[] {
    const device = this.device();
    if (!device || !this.enabled()) return [];
    const ifaces = this.interfaces();
    const routes: Route6[] = [];
    for (const iface of ifaces) {
      for (const a of iface.addresses) {
        if (a.origin === 'link-local') continue;
        const network = networkOf6(a.address, a.prefix);
        if (!routes.some((r) => r.network === network && r.prefix === a.prefix)) routes.push({ network, prefix: a.prefix, iface: iface.index, via: null, kind: 'connected', distance: 0 });
      }
      const onLink = this.#onLink.get(iface.index);
      if (onLink && !routes.some((r) => r.network === onLink.network && r.prefix === onLink.prefix)) routes.push({ network: onLink.network, prefix: onLink.prefix, iface: iface.index, via: null, kind: 'connected', distance: 0 });
    }
    const inRoute = (ip: bigint) => lookupRoute6(routes, ip)?.iface;

    // Standardrouter: von Hand (Endgerät) oder aus dem Router Advertisement.
    const manualGw = this.#isEndpoint(device) && !device.ipv6Auto && device.gateway6 ? parseIp6(device.gateway6) : null;
    if (manualGw !== null) {
      const iface = isLinkLocal6(manualGw) ? ifaces[0]?.index : inRoute(manualGw);
      if (iface !== undefined) routes.push({ network: 0n, prefix: 0, iface, via: manualGw, kind: 'default', distance: ADMIN_DISTANCE.static });
    } else {
      for (const [index, router] of this.#routers) {
        if (router.expires > this.#ctx.now && ifaces.some((i) => i.index === index) && !routes.some((r) => r.prefix === 0)) {
          routes.push({ network: 0n, prefix: 0, iface: index, via: router.address, kind: 'default', distance: ADMIN_DISTANCE.static });
        }
      }
    }
    if (this.#isEndpoint(device)) return routes;

    const mode = routingModeOf(device);
    if (device.type === 'internet' || (mode === 'auto' && device.type === 'router')) {
      routes.push(...autoRoutes6(this.#ctx.topology(), device.id));
    }
    if (mode !== 'auto' || device.type !== 'router') {
      for (const r of device.routes6 ?? []) {
        const net = parseCidr6(r.network);
        if (!net) continue;
        const via = r.gateway ? parseIp6(r.gateway) : null;
        const iface = r.iface ?? (via !== null ? inRoute(via) : undefined);
        if (iface === undefined || !ifaces.some((i) => i.index === iface)) continue;
        routes.push({ network: net.address, prefix: net.prefix, iface, via, kind: 'static', distance: ADMIN_DISTANCE.static });
      }
    }
    return routes;
  }

  // --- Start: DAD, Router Solicitation, Router Advertisements -----------------

  boot() {
    const device = this.device();
    if (!device || !this.enabled() || this.#booted) return;
    this.#booted = true;
    for (const iface of this.interfaces()) {
      if (!this.#ctx.isConnected(iface.index)) continue;
      // Duplicate Address Detection: Gehört die Adresse schon jemandem?
      for (const a of iface.addresses) this.#sendDad(iface, a.address);
      if (this.#hostLike(device, iface.index) && (device.ipv6Auto || device.type === 'cpe')) {
        this.#ctx.schedule(20, () => this.#sendRs(iface.index));
      }
    }
    if (this.host.forwarding) this.#scheduleRa(80);
  }

  #scheduleRa(delay: number) {
    const timer = ++this.#raTimer;
    this.#ctx.schedule(delay, () => {
      if (timer !== this.#raTimer) return;
      for (const iface of this.interfaces()) this.#sendRa(iface.index, null);
      this.#scheduleRa(RA_INTERVAL);
    });
  }

  #sendDad(iface: Iface6, address: bigint) {
    const message: Icmpv6Message = { kind: 'icmpv6', type: 'neighborSolicitation', id: 0, seq: 0, size: 0, target: formatIp6(address) };
    this.#sendRaw(iface.index, '::', formatIp6(solicitedNode(address)), message, 255);
  }

  #sendRs(index: number) {
    const iface = this.interfaces().find((i) => i.index === index);
    if (!iface) return;
    const message: Icmpv6Message = { kind: 'icmpv6', type: 'routerSolicitation', id: 0, seq: 0, size: 0, linkAddr: iface.mac };
    this.#sendRaw(index, formatIp6(iface.addresses[0]!.address), ALL_ROUTERS, message, 255);
  }

  /** Router Advertisement an alle (oder als Antwort auf eine Solicitation). */
  #sendRa(index: number, _to: string | null) {
    const device = this.device();
    if (!device || this.#hostLike(device, index)) return;
    const iface = this.interfaces().find((i) => i.index === index);
    const global = iface?.addresses.find((a) => a.origin === 'manual');
    if (!iface || !global || !this.#ctx.isConnected(index)) return;
    const managed = !!device.interfaces[index]?.dhcp6;
    const message: Icmpv6Message = {
      kind: 'icmpv6',
      type: 'routerAdvertisement',
      id: 0,
      seq: 0,
      size: 0,
      linkAddr: iface.mac,
      routerLifetime: RA_LIFETIME,
      mtu: 1500,
      flags: { managed, other: managed },
      // SLAAC funktioniert nur mit /64; bei DHCPv6 dient das Präfix nur als On-Link-Angabe.
      prefix: { network: formatIp6(networkOf6(global.address, global.prefix)), length: global.prefix, autonomous: !managed && global.prefix === 64, valid: PREFIX_VALID, preferred: PREFIX_VALID / 2 },
      ...(device.interfaces[index]?.dns6 ? { rdnss: device.interfaces[index]!.dns6! } : {}),
    };
    this.#sendRaw(index, formatIp6(iface.addresses[0]!.address), ALL_NODES, message, 255);
  }

  // --- Empfang -----------------------------------------------------------------

  receive(index: number, packet: Ipv6Packet, srcMac: string) {
    if (!this.enabled()) return;
    const iface = this.interfaces().find((i) => i.index === index);
    const dst = parseIp6(packet.dst);
    if (!iface || dst === null) return;
    if (isMulticast6(dst)) {
      if (this.#groups(iface).includes(dst)) this.#deliver(index, packet, srcMac, true);
      return;
    }
    if (this.isOwn(dst)) return this.#deliver(index, packet, srcMac, false);
    if (this.host.forwarding) this.#forward(iface, packet);
  }

  #deliver(index: number, packet: Ipv6Packet, srcMac: string, multicast: boolean) {
    const payload = packet.payload;
    const application = payload.kind === 'tcp' || (payload.kind === 'udp' && payload.payload.kind !== 'dhcpv6');
    if (application && srcMac && this.host.filter6 && !this.host.filter6(packet, index, false)) return;
    if (payload.kind === 'icmpv6') return this.#onIcmp(index, packet, payload, srcMac, multicast);
    if (payload.kind === 'udp') {
      if (payload.payload.kind === 'dhcpv6') return this.#onDhcp(index, packet, payload.payload, srcMac);
      return this.host.onUdp6?.(packet, payload, index);
    }
    if (payload.kind === 'tcp') {
      if (!multicast) this.host.onTcp6?.(packet, payload);
      return;
    }
    if (payload.kind === 'ipv4') this.host.onTunnel?.(packet, payload, index);
  }

  #onIcmp(index: number, packet: Ipv6Packet, m: Icmpv6Message, srcMac: string, multicast: boolean) {
    const device = this.device();
    if (!device) return;
    switch (m.type) {
      case 'neighborSolicitation': {
        const target = m.target ? parseIp6(m.target) : null;
        const iface = this.interfaces().find((i) => i.index === index);
        if (target === null || !iface?.addresses.some((a) => a.address === target)) return;
        const src = parseIp6(packet.src);
        // DAD einer anderen Station mit unserer Adresse: Konflikt melden.
        if (src === 0n) {
          this.#ctx.print('ipv6.duplicate', { address: m.target! });
          this.#sendNa(index, target, ALL_NODES, srcMac, false);
          return;
        }
        if (m.linkAddr) this.#learn(packet.src, m.linkAddr, index, false);
        this.#sendNa(index, target, packet.src, m.linkAddr ?? srcMac, true);
        return;
      }
      case 'neighborAdvertisement': {
        if (!m.target) return;
        const mac = m.linkAddr ?? srcMac;
        // Antwort auf unsere DAD: Die Adresse ist schon vergeben.
        if (!this.#pending.has(m.target) && this.isOwn(parseIp6(m.target) ?? -1n) && !m.flags?.solicited) {
          this.#ctx.print('ipv6.duplicate', { address: m.target });
          return;
        }
        this.#learn(m.target, mac, index, !!m.flags?.router);
        return;
      }
      case 'routerSolicitation':
        if (this.host.forwarding && !this.#hostLike(device, index)) this.#sendRa(index, packet.src);
        return;
      case 'routerAdvertisement':
        return this.#onRa(index, packet, m, srcMac);
      case 'echoRequest':
        if (!multicast) this.send(packet.src, { ...m, type: 'echoReply' }, { src: packet.dst });
        return;
      default:
        this.host.onIcmp6(packet);
    }
  }

  #onRa(index: number, packet: Ipv6Packet, m: Icmpv6Message, srcMac: string) {
    const device = this.device();
    if (!device || !this.#hostLike(device, index)) return;
    const router = parseIp6(packet.src);
    if (router === null) return;
    this.#learn(packet.src, m.linkAddr ?? srcMac, index, true);
    if ((m.routerLifetime ?? 0) > 0) this.#routers.set(index, { address: router, expires: this.#ctx.now + (m.routerLifetime ?? 0) * 1000 });
    const p = m.prefix;
    const net = p ? parseIp6(p.network) : null;
    const auto = this.#isEndpoint(device) ? !!device.ipv6Auto : !device.interfaces[index]?.ipv6;
    if (!p || net === null) return;
    this.#onLink.set(index, { network: net, prefix: p.length, managed: !!m.flags?.managed });
    if (!auto) return;
    if (m.rdnss && m.rdnss !== this.#dns6) {
      this.#dns6 = m.rdnss;
      this.#ctx.print('ipv6.rdnss', { dns: m.rdnss });
    }
    if (m.flags?.managed) {
      if (this.#dhcpState === 'idle') this.#solicit(index);
      return;
    }
    if (p.autonomous && p.length === 64) {
      const iface = device.interfaces[index];
      if (!iface) return;
      const address = net | eui64(iface.mac);
      const known = this.#learned.get(index);
      if (known?.address === address) return;
      this.#learned.set(index, { address, prefix: 64, origin: 'slaac' });
      this.#ctx.print('ipv6.slaac', { address: formatIp6(address), prefix: 64 });
      const fresh = this.interfaces().find((i) => i.index === index);
      if (fresh) this.#sendDad(fresh, address);
    }
  }

  // --- Neighbor Discovery: Adressauflösung -------------------------------------

  #learn(ip: string, mac: string, iface: number, router: boolean) {
    const known = this.#neighbors.get(ip);
    this.#neighbors.set(ip, { ip, mac, iface, router: router || !!known?.router, expires: this.#ctx.now + NEIGHBOR_TTL });
    const pending = this.#pending.get(ip);
    if (!pending) return;
    this.#pending.delete(ip);
    for (const w of pending.waiters) w.onMac(mac);
  }

  #sendNa(index: number, target: bigint, to: string, toMac: string, solicited: boolean) {
    const iface = this.interfaces().find((i) => i.index === index);
    const device = this.device();
    if (!iface || !device) return;
    const message: Icmpv6Message = {
      kind: 'icmpv6',
      type: 'neighborAdvertisement',
      id: 0,
      seq: 0,
      size: 0,
      target: formatIp6(target),
      linkAddr: iface.mac,
      flags: { router: this.host.forwarding && !this.#hostLike(device, index), solicited, override: true },
    };
    const dst = parseIp6(to)!;
    const src = formatIp6(target);
    this.host.sendFrame(index, { src: iface.mac, dst: isMulticast6(dst) ? multicastMac6(dst) : toMac, payload: { kind: 'ipv6', src, dst: to, hopLimit: 255, payload: message } });
  }

  #resolve(index: number, ip: bigint, onMac: (mac: string) => void, onFail: () => void) {
    const key = formatIp6(ip);
    const cached = this.#neighbors.get(key);
    if (cached && cached.expires > this.#ctx.now) return onMac(cached.mac);
    const pending = this.#pending.get(key);
    if (pending) return void pending.waiters.push({ onMac, onFail });
    this.#pending.set(key, { iface: index, attempts: 1, waiters: [{ onMac, onFail }] });
    this.#sendNs(index, ip);
    const retry = () => {
      const current = this.#pending.get(key);
      if (!current) return;
      if (current.attempts >= ND_ATTEMPTS) {
        this.#pending.delete(key);
        for (const w of current.waiters) w.onFail();
        return;
      }
      current.attempts++;
      this.#sendNs(index, ip);
      this.#ctx.schedule(ND_TIMEOUT, retry);
    };
    this.#ctx.schedule(ND_TIMEOUT, retry);
  }

  #sendNs(index: number, target: bigint) {
    const iface = this.interfaces().find((i) => i.index === index);
    if (!iface) return;
    const message: Icmpv6Message = { kind: 'icmpv6', type: 'neighborSolicitation', id: 0, seq: 0, size: 0, target: formatIp6(target), linkAddr: iface.mac };
    this.#sendRaw(index, formatIp6(this.#sourceFor(iface, target)), formatIp6(solicitedNode(target)), message, 255);
  }

  /** Absenderadresse: Link-Local für Link-Local-Ziele, sonst eine globale Adresse des Anschlusses. */
  #sourceFor(iface: Iface6, dst: bigint): bigint {
    if (isLinkLocal6(dst)) return iface.addresses[0]!.address;
    return iface.addresses.find((a) => a.origin !== 'link-local' && networkOf6(dst, a.prefix) === networkOf6(a.address, a.prefix))?.address ?? iface.addresses.find((a) => a.origin !== 'link-local')?.address ?? iface.addresses[0]!.address;
  }

  /** Paket ohne Routing direkt auf einem Anschluss senden (Multicast an Gruppen wie ff02::1). */
  #sendRaw(index: number, src: string, dst: string, payload: Ipv6Packet['payload'], hopLimit: number) {
    const iface = this.interfaces().find((i) => i.index === index);
    const d = parseIp6(dst);
    if (!iface || d === null) return;
    this.host.sendFrame(index, { src: iface.mac, dst: multicastMac6(d), payload: { kind: 'ipv6', src, dst, hopLimit, payload } });
  }

  // --- Senden und Weiterleiten -------------------------------------------------

  /** Eigene Adresse, über die `remote` erreicht wird (oder null). */
  localFor(remote: bigint): bigint | null {
    if (this.isOwn(remote)) return remote;
    const route = lookupRoute6(this.routes(), remote);
    const iface = route && this.interfaces().find((i) => i.index === route.iface);
    // Quelle nach dem Ziel wählen (nicht nach dem Gateway, das oft eine Link-Local-Adresse hat).
    return iface ? this.#sourceFor(iface, remote) : null;
  }

  hasRoute(dst: bigint): boolean {
    return this.isOwn(dst) || !!lookupRoute6(this.routes(), dst);
  }

  send(dstText: string, payload: Ipv6Packet['payload'], options: { src?: string; hopLimit?: number } = {}, onError?: (e: Send6Error) => void) {
    const dst = parseIp6(dstText);
    if (dst === null) return;
    const build = (src: bigint): Ipv6Packet => ({ kind: 'ipv6', src: options.src ?? formatIp6(src), dst: formatIp6(dst), hopLimit: options.hopLimit ?? DEFAULT_HOP_LIMIT, payload });
    if (this.isOwn(dst)) {
      const packet = build(dst);
      this.#ctx.schedule(0, () => this.#deliver(this.interfaces()[0]?.index ?? 0, packet, '', false));
      return;
    }
    const route = lookupRoute6(this.routes(), dst);
    const iface = route && this.interfaces().find((i) => i.index === route.iface);
    if (!route || !iface) return void onError?.('noRoute');
    const packet = build(this.#sourceFor(iface, dst));
    this.#resolve(
      iface.index,
      route.via ?? dst,
      (mac) => this.host.sendFrame(iface.index, { src: iface.mac, dst: mac, payload: packet }),
      () => onError?.(route.via === null ? 'hostUnreachable' : 'gatewayUnreachable'),
    );
  }

  #forward(inIface: Iface6, packet: Ipv6Packet) {
    const src = parseIp6(packet.src);
    if (src === null || isLinkLocal6(src) || isLinkLocal6(parseIp6(packet.dst) ?? 0n)) return;
    if (packet.hopLimit <= 1) return this.#error(inIface, packet, 'timeExceeded');
    if ((packet.payload.kind === 'tcp' || packet.payload.kind === 'udp') && this.host.filter6 && !this.host.filter6(packet, inIface.index, true)) return;
    const dst = parseIp6(packet.dst)!;
    const route = lookupRoute6(this.routes(), dst);
    const out = route && this.interfaces().find((i) => i.index === route.iface);
    if (!route || !out) return this.#error(inIface, packet, 'destUnreachable', 'net');
    const forwarded = { ...packet, hopLimit: packet.hopLimit - 1 };
    this.#resolve(
      out.index,
      route.via ?? dst,
      (mac) => this.host.sendFrame(out.index, { src: out.mac, dst: mac, payload: forwarded }),
      () => this.#error(inIface, packet, 'destUnreachable', 'host'),
    );
  }

  #error(from: Iface6, original: Ipv6Packet, type: 'destUnreachable' | 'timeExceeded', code?: 'net' | 'host') {
    const p = original.payload;
    if (p.kind === 'icmpv6' && (p.type === 'destUnreachable' || p.type === 'timeExceeded')) return;
    const echo = p.kind === 'icmpv6' ? { id: p.id, seq: p.seq } : { id: 0, seq: 0 };
    const message: Icmpv6Message = { kind: 'icmpv6', type, id: 0, seq: 0, size: 0, original: { src: original.src, dst: original.dst, ...echo }, ...(code ? { code } : {}) };
    const src = this.#sourceFor(from, parseIp6(original.src) ?? 0n);
    this.send(original.src, message, { src: formatIp6(src) });
  }

  /** DS-Lite: IPv4-Paket in IPv6 verpacken und an `dst` schicken. */
  tunnel(dst: string, inner: Ipv4Packet, onError?: (e: Send6Error) => void) {
    this.send(dst, inner, { hopLimit: DEFAULT_HOP_LIMIT }, onError);
  }

  // --- DHCPv6 ------------------------------------------------------------------

  #solicit(index: number) {
    const iface = this.interfaces().find((i) => i.index === index);
    if (!iface) return;
    this.#dhcpState = 'soliciting';
    this.#dhcpXid = (this.#dhcpXid + 0x1357) & 0xffffff;
    this.#sendDhcp(index, ALL_DHCP6, { kind: 'dhcpv6', type: 'solicit', xid: this.#dhcpXid, clientMac: iface.mac }, DHCP6_CLIENT_PORT, DHCP6_SERVER_PORT);
  }

  #sendDhcp(index: number, dst: string, message: Dhcpv6Message, srcPort: number, dstPort: number, dstMac?: string) {
    const iface = this.interfaces().find((i) => i.index === index);
    const d = parseIp6(dst);
    if (!iface || d === null) return;
    const packet: Ipv6Packet = { kind: 'ipv6', src: formatIp6(iface.addresses[0]!.address), dst, hopLimit: isMulticast6(d) ? 1 : DEFAULT_HOP_LIMIT, payload: { kind: 'udp', srcPort, dstPort, payload: message } };
    this.host.sendFrame(index, { src: iface.mac, dst: isMulticast6(d) ? multicastMac6(d) : (dstMac ?? ''), payload: packet });
  }

  #onDhcp(index: number, packet: Ipv6Packet, m: Dhcpv6Message, srcMac: string) {
    const device = this.device();
    if (!device) return;
    // Server (Router-Anschluss mit DHCPv6).
    if (m.type === 'solicit' || m.type === 'request') {
      const iface = this.interfaces().find((i) => i.index === index);
      const global = iface?.addresses.find((a) => a.origin === 'manual');
      if (!iface || !global || !device.interfaces[index]?.dhcp6) return;
      let address = this.#leases.get(m.clientMac);
      if (address === undefined) {
        address = networkOf6(global.address, global.prefix) + 0x100n + BigInt(this.#leases.size);
        this.#leases.set(m.clientMac, address);
      }
      const dns = device.interfaces[index]?.dns6;
      const reply: Dhcpv6Message = { kind: 'dhcpv6', type: m.type === 'solicit' ? 'advertise' : 'reply', xid: m.xid, clientMac: m.clientMac, serverMac: iface.mac, address: formatIp6(address), lifetime: PREFIX_VALID, ...(dns ? { dns } : {}) };
      this.#learn(packet.src, srcMac, index, false);
      this.#sendDhcp(index, packet.src, reply, DHCP6_SERVER_PORT, DHCP6_CLIENT_PORT, srcMac);
      return;
    }
    // Client.
    if (m.xid !== this.#dhcpXid || !m.address) return;
    if (m.type === 'advertise' && this.#dhcpState === 'soliciting') {
      this.#dhcpState = 'requesting';
      this.#sendDhcp(index, ALL_DHCP6, { kind: 'dhcpv6', type: 'request', xid: m.xid, clientMac: m.clientMac, serverMac: m.serverMac, address: m.address }, DHCP6_CLIENT_PORT, DHCP6_SERVER_PORT);
    } else if (m.type === 'reply' && this.#dhcpState === 'requesting') {
      const address = parseIp6(m.address);
      if (address === null) return;
      this.#dhcpState = 'bound';
      const prefix = this.#onLink.get(index)?.prefix ?? 64;
      this.#learned.set(index, { address, prefix, origin: 'dhcpv6' });
      if (m.dns) this.#dns6 = m.dns;
      this.#ctx.print('ipv6.dhcpv6', { address: m.address, server: packet.src });
    }
  }

  /** Vergebene DHCPv6-Adressen (Server). */
  leases(): { mac: string; address: string }[] {
    return [...this.#leases].map(([mac, a]) => ({ mac, address: formatIp6(a) }));
  }

  // --- Zustand -------------------------------------------------------------------

  state(): Ip6State | undefined {
    const device = this.device();
    if (!device || !this.enabled()) return undefined;
    const now = this.#ctx.now;
    const routes6 = this.routes();
    const gateway = routes6.find((r) => r.prefix === 0)?.via;
    const learned = [...this.#learned.values()][0];
    const config = this.#isEndpoint(device)
      ? device.ipv6Auto
        ? learned
          ? (learned.origin as 'slaac' | 'dhcpv6')
          : 'waiting'
        : 'manual'
      : undefined;
    return {
      addresses: this.interfaces().flatMap((i) => i.addresses.map((a) => ({ iface: i.index, address: formatIp6(a.address), prefix: a.prefix, origin: a.origin }))),
      neighbors: [...this.#neighbors.values()].filter((n) => n.expires > now).sort((a, b) => a.ip.localeCompare(b.ip)),
      routes6,
      ...(gateway !== undefined && gateway !== null ? { gateway: formatIp6(gateway) } : {}),
      ...(config ? { config } : {}),
      ...(this.#dns6 && config !== 'manual' ? { dns: this.#dns6 } : {}),
    };
  }
}
