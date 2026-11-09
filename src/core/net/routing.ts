import { DEVICE_SPECS, routingModeOf } from '../model/devices';
import type { Device, StaticRoute } from '../model/types';
import { formatIp, maskToText, networkOf, parseIp, parseMask } from './ipv4';

export interface IfaceAddress {
  /** Logisches Interface (siehe `ifaceId`); bei physischen Anschlüssen deren Index. */
  index: number;
  mac: string;
  ip: number;
  prefix: number;
}

// --- Logische Interfaces -------------------------------------------------------
//
// Routen, ARP und Pakete beziehen sich auf logische Interfaces. Die Nummer
// verrät, worum es sich handelt, und bleibt stabil, wenn andere Subinterfaces
// hinzukommen oder wegfallen:
//   0 … 9999          physischer Anschluss (Index)
//   10000·(p+1) + v   Subinterface von Anschluss p für VLAN v (Router-on-a-Stick)
//   100000 + v        VLAN-Interface (SVI) eines Layer-3-Switches
//   200000 + n        Loopback n («interface loopback0»)

export const SUBIF_BASE = 10_000;
export const SVI_BASE = 100_000;
export const LOOPBACK_BASE = 200_000;
export const MAX_LOOPBACK = 99;

export type IfaceRef =
  | { kind: 'port'; port: number }
  | { kind: 'sub'; port: number; vlan: number }
  | { kind: 'svi'; vlan: number }
  | { kind: 'loopback'; id: number };

export function loopbackId(n: number): number {
  return LOOPBACK_BASE + n;
}

export function subifId(port: number, vlan: number): number {
  return SUBIF_BASE * (port + 1) + vlan;
}

export function sviId(vlan: number): number {
  return SVI_BASE + vlan;
}

export function decodeIface(id: number): IfaceRef {
  if (id >= LOOPBACK_BASE) return { kind: 'loopback', id: id - LOOPBACK_BASE };
  if (id >= SVI_BASE) return { kind: 'svi', vlan: id - SVI_BASE };
  if (id >= SUBIF_BASE) return { kind: 'sub', port: Math.floor(id / SUBIF_BASE) - 1, vlan: id % SUBIF_BASE };
  return { kind: 'port', port: id };
}

/** MAC-Adresse der SVIs eines Layer-3-Switches: die des ersten Ports mit letztem Byte FF. */
export function sviMac(device: Device): string {
  const base = device.interfaces[0]?.mac ?? '02:00:00:00:00:00';
  return base.slice(0, 15) + 'FF';
}

/** MAC eines logischen Interfaces (Subinterfaces teilen sich die MAC ihres Anschlusses). */
export function macOfIface(device: Device, id: number): string | undefined {
  const ref = decodeIface(id);
  if (ref.kind === 'svi') return sviMac(device);
  if (ref.kind === 'loopback') return undefined;
  return device.interfaces[ref.port]?.mac;
}

/** Alle logischen Interfaces eines Geräts, auch unkonfigurierte (für Auswahllisten). */
export function logicalInterfaces(device: Device): number[] {
  const loopbacks = (device.loopbacks ?? []).map((l) => loopbackId(l.id));
  if (device.type === 'l3switch' || device.type === 'switch') return [...(device.svis ?? []).map((s) => sviId(s.vlan)), ...(device.type === 'l3switch' ? loopbacks : [])];
  return [...device.interfaces.map((i) => i.index), ...(device.subinterfaces ?? []).map((s) => subifId(s.parent, s.vlan)), ...loopbacks];
}

/** Ziel des DHCP-Relays auf einem logischen Interface. */
export function relayOf(device: Device, id: number): string | undefined {
  const ref = decodeIface(id);
  if (ref.kind === 'port') return device.interfaces[ref.port]?.dhcpRelay;
  if (ref.kind === 'sub') return device.subinterfaces?.find((s) => s.parent === ref.port && s.vlan === ref.vlan)?.dhcpRelay;
  if (ref.kind === 'loopback') return undefined;
  return device.svis?.find((s) => s.vlan === ref.vlan)?.dhcpRelay;
}

/** «auto»: vom automatischen Routing aus dem Netzplan berechnet (autoroute.ts). */
export type RouteKind = 'connected' | 'static' | 'default' | 'ospf' | 'rip' | 'bgp' | 'auto';

export interface Route {
  network: number;
  prefix: number;
  iface: number;
  /** Nächster Router; null = Ziel liegt im direkt angeschlossenen Netz. */
  via: number | null;
  kind: RouteKind;
  /** Metrik des Protokolls (OSPF-Kosten, RIP-Hops, BGP-Pfadlänge). */
  metric?: number;
  /** Administrative Distanz: Bei gleichem Präfix gewinnt die kleinere (wie bei FRRouting). */
  distance?: number;
}

/** Administrative Distanzen wie bei FRRouting/Cisco. */
export const ADMIN_DISTANCE = { connected: 0, static: 1, ebgp: 20, ospf: 110, rip: 120, ibgp: 200 } as const;

/** Alle Anschlüsse eines Geräts mit gültiger IP-Konfiguration. */
export function interfaceAddresses(device: Device): IfaceAddress[] {
  const addr = (index: number, mac: string | undefined, ipText?: string, maskText?: string): IfaceAddress[] => {
    const ip = ipText ? parseIp(ipText) : null;
    const prefix = maskText ? parseMask(maskText) : null;
    return mac && ip !== null && prefix !== null ? [{ index, mac, ip, prefix }] : [];
  };
  // Layer-3-Switch: VLAN-Interfaces; Layer-2-Switch: Verwaltungs-Interface («interface vlan 1»).
  // Loopbacks haben keine MAC (sie senden nie einen Rahmen); «lo» als Platzhalter.
  const loopbacks = (device.loopbacks ?? []).flatMap((l) => addr(loopbackId(l.id), 'lo', l.ip, l.mask));
  if (device.type === 'l3switch' || device.type === 'switch') {
    const mac = sviMac(device);
    return [...(device.svis ?? []).flatMap((s) => addr(sviId(s.vlan), mac, s.ip, s.mask)), ...(device.type === 'l3switch' ? loopbacks : [])];
  }
  return [
    ...device.interfaces.flatMap((i) => addr(i.index, i.mac, i.ip, i.mask)),
    ...(device.subinterfaces ?? []).flatMap((s) => addr(subifId(s.parent, s.vlan), device.interfaces[s.parent]?.mac, s.ip, s.mask)),
    ...loopbacks,
  ];
}

/** VRF eines logischen Interfaces; undefined = globale Tabelle. */
export function vrfOfIface(device: Device, id: number): string | undefined {
  const ref = decodeIface(id);
  if (ref.kind === 'port') return device.interfaces[ref.port]?.vrf;
  if (ref.kind === 'sub') return device.subinterfaces?.find((s) => s.parent === ref.port && s.vlan === ref.vlan)?.vrf;
  if (ref.kind === 'svi') return device.svis?.find((s) => s.vlan === ref.vlan)?.vrf;
  return device.loopbacks?.find((l) => l.id === ref.id)?.vrf;
}

export const VRF_NAME = /^[A-Za-z0-9_-]{1,32}$/;
export const MAX_VRFS = 16;

/** Längster Präfix gewinnt; bei Gleichstand die kleinere administrative Distanz, dann die zuerst eingetragene. */
export function lookupRoute(routes: readonly Route[], dst: number): Route | undefined {
  let best: Route | undefined;
  for (const route of routes) {
    if (networkOf(dst, route.prefix) !== route.network) continue;
    if (!best || route.prefix > best.prefix || (route.prefix === best.prefix && (route.distance ?? 0) < (best.distance ?? 0))) best = route;
  }
  return best;
}

/**
 * Routingtabelle eines Geräts: direkt verbundene Netze, dazu bei Endgeräten
 * das Standardgateway und bei Vermittlungsrechnern die statischen Routen.
 * `unusable` nennt statische Routen, deren Gateway in keinem angeschlossenen Netz liegt.
 */
export function buildRoutes(device: Device, vrf?: string): { routes: Route[]; unusable: number[] } {
  // Jede VRF hat ihre eigene Tabelle: nur ihre Anschlüsse und ihre statischen Routen.
  const connected: Route[] = interfaceAddresses(device).filter((i) => vrfOfIface(device, i.index) === vrf).map((i) => ({
    network: networkOf(i.ip, i.prefix),
    prefix: i.prefix,
    iface: i.index,
    via: null,
    kind: 'connected',
  }));
  const routes = [...connected];
  const unusable: number[] = [];

  if (DEVICE_SPECS[device.type].role === 'endpoint' || device.type === 'switch') {
    // Layer-2-Switch: «ip default-gateway» steht als Route 0.0.0.0/0 in den Routen.
    const configured = device.type === 'switch' ? device.routes?.find((r) => parseMask(r.mask) === 0)?.gateway : device.gateway;
    const gateway = configured ? parseIp(configured) : null;
    const towards = gateway !== null ? lookupRoute(connected, gateway) : undefined;
    if (gateway !== null && towards) {
      routes.push({ network: 0, prefix: 0, iface: towards.iface, via: gateway, kind: 'default' });
    }
    return { routes, unusable };
  }

  // Layer-3-Switch mit «no ip routing»: nur die eigenen Netze, keine Routen.
  if (device.type === 'l3switch' && device.ipRouting === false) return { routes, unusable };
  // Automatisches Routing: Die Simulation berechnet die Routen selbst, eigene statische ruhen (nur global).
  if (!vrf && routingModeOf(device) === 'auto') return { routes, unusable };

  const statics = vrf ? (device.vrfs?.find((v) => v.name === vrf)?.routes ?? []) : (device.routes ?? []);
  statics.forEach((r, n) => {
    const network = parseIp(r.network);
    const prefix = parseMask(r.mask);
    const gateway = r.gateway ? parseIp(r.gateway) : null;
    if (network === null || prefix === null) return void unusable.push(n);
    // Ohne Gateway: Ziel ist über den Anschluss direkt erreichbar.
    const iface = gateway !== null ? (r.iface ?? lookupRoute(connected, gateway)?.iface) : r.iface;
    const ifaceOk = iface !== undefined && connected.some((c) => c.iface === iface);
    if (!ifaceOk) return void unusable.push(n);
    routes.push({ network: networkOf(network, prefix), prefix, iface, via: gateway, kind: 'static', distance: ADMIN_DISTANCE.static });
  });
  return { routes, unusable };
}

export interface RouteIssue {
  code: string;
  field: 'network' | 'mask' | 'gateway' | 'iface';
  params?: Record<string, string | number>;
}

/** Prüft eine statische Route vor dem Eintragen. */
export function checkStaticRoute(device: Device, route: StaticRoute, vrf?: string): RouteIssue | null {
  const network = parseIp(route.network);
  if (network === null) return { code: 'invalidIp', field: 'network', params: { value: route.network } };
  const prefix = parseMask(route.mask);
  if (prefix === null) return { code: 'invalidMask', field: 'mask', params: { value: route.mask } };
  if (networkOf(network, prefix) !== network) {
    return {
      code: 'networkHasHostBits',
      field: 'network',
      params: { value: route.network, suggestion: `${formatIp(networkOf(network, prefix))}/${prefix}` },
    };
  }
  if (route.gateway && parseIp(route.gateway) === null) {
    return { code: 'invalidIp', field: 'gateway', params: { value: route.gateway } };
  }
  if (route.iface !== undefined && !logicalInterfaces(device).includes(route.iface)) return { code: 'unknownInterface', field: 'iface' };
  if (!route.gateway && route.iface === undefined) return { code: 'routeNeedsTarget', field: 'gateway' };
  const existing = vrf ? (device.vrfs?.find((v) => v.name === vrf)?.routes ?? []) : (device.routes ?? []);
  const duplicate = existing.some((r) => r.network === route.network && parseMask(r.mask) === prefix);
  if (duplicate) return { code: 'duplicateRoute', field: 'network', params: { net: `${route.network}/${prefix}` } };
  return null;
}

/** Vereinheitlicht die Schreibweise einer geprüften Route. */
export function normalizeRoute(route: StaticRoute): StaticRoute {
  const prefix = parseMask(route.mask) ?? 0;
  const result: StaticRoute = { network: route.network.trim(), mask: maskToText(prefix) };
  if (route.gateway?.trim()) result.gateway = route.gateway.trim();
  if (route.iface !== undefined) result.iface = route.iface;
  return result;
}
