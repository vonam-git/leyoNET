import type { Device, DhcpPool, DhcpReservation, DhcpScope, DhcpServerConfig } from '../model/types';
import { canHostServices } from '../model/devices';
import { normalizeMac } from '../model/mac';
import { broadcastOf, formatIp, maskToText, networkOf, parseIp, parseMask } from './ipv4';

export const DEFAULT_LEASE_TIME = 3600;
export const MIN_LEASE_TIME = 30;
export const MAX_LEASE_TIME = 7 * 24 * 3600;
export const MAX_DHCP_RESERVATIONS = 50;

export interface DhcpIssue {
  code: string;
  field: 'start' | 'end' | 'gateway' | 'dns' | 'leaseTime' | 'server' | 'mac' | 'ip';
  params?: Record<string, string | number>;
}

/** Anschluss, dessen Netz der DHCP-Server bedient: bei der CPE das LAN (Anschluss 1), sonst Anschluss 0. */
export function dhcpServerIface(device: Device): number {
  return device.type === 'cpe' ? 1 : 0;
}

/** Ein DHCP-Server vergibt Adressen aus seinem eigenen Netz; dafür braucht er selbst eine feste Adresse. */
export function checkDhcpServer(device: Device, config: DhcpServerConfig): DhcpIssue | null {
  if (!canHostServices(device.type) && device.type !== 'cpe') return { code: 'notAServer', field: 'server' };
  const own = device.interfaces[dhcpServerIface(device)];
  const ownIp = own?.ip ? parseIp(own.ip) : null;
  const prefix = own?.mask ? parseMask(own.mask) : null;
  if (device.dhcp || ownIp === null || prefix === null) return { code: 'dhcpServerNeedsAddress', field: 'server' };

  const start = parseIp(config.start);
  if (start === null) return { code: 'invalidIp', field: 'start', params: { value: config.start } };
  const end = parseIp(config.end);
  if (end === null) return { code: 'invalidIp', field: 'end', params: { value: config.end } };
  const net = `${formatIp(networkOf(ownIp, prefix))}/${prefix}`;
  for (const [field, ip, text] of [['start', start, config.start], ['end', end, config.end]] as const) {
    if (networkOf(ip, prefix) !== networkOf(ownIp, prefix)) {
      return { code: 'dhcpRangeOutsideSubnet', field, params: { ip: text, net } };
    }
  }
  if (start > end) return { code: 'dhcpRangeOrder', field: 'end' };
  if (prefix <= 30 && (start === networkOf(ownIp, prefix) || end === broadcastOf(ownIp, prefix))) {
    return { code: 'dhcpRangeReserved', field: start === networkOf(ownIp, prefix) ? 'start' : 'end', params: { net } };
  }
  if (config.gateway && parseIp(config.gateway) === null) {
    return { code: 'invalidIp', field: 'gateway', params: { value: config.gateway } };
  }
  if (config.dns && parseIp(config.dns) === null) return { code: 'invalidIp', field: 'dns', params: { value: config.dns } };
  if (!Number.isInteger(config.leaseTime) || config.leaseTime < MIN_LEASE_TIME || config.leaseTime > MAX_LEASE_TIME) {
    return { code: 'dhcpLeaseTime', field: 'leaseTime', params: { min: MIN_LEASE_TIME, max: MAX_LEASE_TIME } };
  }
  const reservations = config.reservations ?? [];
  if (reservations.length > MAX_DHCP_RESERVATIONS) return { code: 'tooMany', field: 'mac', params: { max: MAX_DHCP_RESERVATIONS } };
  for (let i = 0; i < reservations.length; i++) {
    const issue = checkReservation(reservations[i]!, ownIp, prefix, reservations.slice(0, i));
    if (issue) return issue;
  }
  return null;
}

/** Reservierung: gültige MAC, Adresse im Netz des Servers (nicht Netz-/Broadcastadresse, nicht der Server selbst), keine Doppelten. */
function checkReservation(r: DhcpReservation, ownIp: number, prefix: number, before: readonly DhcpReservation[]): DhcpIssue | null {
  const mac = normalizeMac(r.mac);
  if (mac === null) return { code: 'invalidMac', field: 'mac', params: { value: r.mac.trim() } };
  const ip = parseIp(r.ip);
  if (ip === null) return { code: 'invalidIp', field: 'ip', params: { value: r.ip.trim() } };
  const net = `${formatIp(networkOf(ownIp, prefix))}/${prefix}`;
  if (networkOf(ip, prefix) !== networkOf(ownIp, prefix)) return { code: 'dhcpRangeOutsideSubnet', field: 'ip', params: { ip: r.ip.trim(), net } };
  if (prefix <= 30 && (ip === networkOf(ownIp, prefix) || ip === broadcastOf(ownIp, prefix))) return { code: 'dhcpRangeReserved', field: 'ip', params: { net } };
  if (ip === ownIp) return { code: 'dhcpReservationIsServer', field: 'ip', params: { ip: r.ip.trim() } };
  if (before.some((o) => normalizeMac(o.mac) === mac)) return { code: 'dhcpReservationDuplicateMac', field: 'mac', params: { mac } };
  if (before.some((o) => parseIp(o.ip) === ip)) return { code: 'dhcpReservationDuplicateIp', field: 'ip', params: { ip: formatIp(ip) } };
  return null;
}

export function normalizeDhcpServer(config: DhcpServerConfig): DhcpServerConfig {
  const result: DhcpServerConfig = { start: config.start.trim(), end: config.end.trim(), leaseTime: config.leaseTime };
  if (config.gateway?.trim()) result.gateway = config.gateway.trim();
  if (config.dns?.trim()) result.dns = config.dns.trim();
  if (config.scopes?.length) result.scopes = config.scopes.map(normalizeScope);
  if (config.reservations?.length) result.reservations = config.reservations.map((r) => ({ mac: normalizeMac(r.mac) ?? r.mac, ip: r.ip.trim() }));
  return result;
}

export interface ScopeIssue {
  code: string;
  field: 'start' | 'end' | 'mask' | 'gateway' | 'dns';
  params?: Record<string, string | number>;
}

/** Zusätzlicher Bereich für ein entferntes Netz: alle Adressen im selben Netz, ohne Netz- und Broadcastadresse. */
export function checkDhcpScope(scope: DhcpScope): ScopeIssue | null {
  const start = parseIp(scope.start);
  if (start === null) return { code: 'invalidIp', field: 'start', params: { value: scope.start } };
  const end = parseIp(scope.end);
  if (end === null) return { code: 'invalidIp', field: 'end', params: { value: scope.end } };
  const prefix = parseMask(scope.mask);
  if (prefix === null) return { code: 'invalidMask', field: 'mask', params: { value: scope.mask } };
  const net = `${formatIp(networkOf(start, prefix))}/${prefix}`;
  if (networkOf(end, prefix) !== networkOf(start, prefix)) {
    return { code: 'dhcpRangeOutsideSubnet', field: 'end', params: { ip: scope.end, net } };
  }
  if (start > end) return { code: 'dhcpRangeOrder', field: 'end' };
  if (prefix <= 30 && (start === networkOf(start, prefix) || end === broadcastOf(start, prefix))) {
    return { code: 'dhcpRangeReserved', field: 'start', params: { net } };
  }
  if (scope.gateway && parseIp(scope.gateway) === null) return { code: 'invalidIp', field: 'gateway', params: { value: scope.gateway } };
  if (scope.dns && parseIp(scope.dns) === null) return { code: 'invalidIp', field: 'dns', params: { value: scope.dns } };
  return null;
}

export function normalizeScope(scope: DhcpScope): DhcpScope {
  const result: DhcpScope = { start: scope.start.trim(), end: scope.end.trim(), mask: maskToText(parseMask(scope.mask) ?? 24) };
  if (scope.gateway?.trim()) result.gateway = scope.gateway.trim();
  if (scope.dns?.trim()) result.dns = scope.dns.trim();
  return result;
}

export interface ResolvedScope {
  start: number;
  end: number;
  prefix: number;
  /** Feste Zuweisungen in diesem Netz: MAC → Adresse. */
  reserved: Map<string, number>;
  /** Nicht zu vergebende Adressen (von–bis), z.B. «ip dhcp excluded-address». */
  excluded?: [number, number][];
  gateway?: string;
  dns?: string;
}

/**
 * Bereich, aus dem der Server vergibt: ohne Relay der eigene, mit Relay
 * derjenige, in dessen Netz die Relay-Adresse (giaddr) liegt.
 */
export function scopeFor(device: Device, giaddr?: string): ResolvedScope | null {
  const config = device.dhcpServer;
  const own = device.interfaces[dhcpServerIface(device)];
  const ownIp = own?.ip ? parseIp(own.ip) : null;
  const ownPrefix = own?.mask ? parseMask(own.mask) : null;
  if (!config || ownIp === null || ownPrefix === null) return null;
  const relay = giaddr ? parseIp(giaddr) : null;
  if (relay === null || networkOf(relay, ownPrefix) === networkOf(ownIp, ownPrefix)) {
    const start = parseIp(config.start);
    const end = parseIp(config.end);
    if (start === null || end === null || networkOf(start, ownPrefix) !== networkOf(ownIp, ownPrefix)) return null;
    const reserved = new Map<string, number>();
    for (const r of config.reservations ?? []) {
      const ip = parseIp(r.ip);
      if (ip !== null && networkOf(ip, ownPrefix) === networkOf(ownIp, ownPrefix)) reserved.set(r.mac.toUpperCase(), ip);
    }
    return { start, end, prefix: ownPrefix, reserved, ...(config.gateway ? { gateway: config.gateway } : {}), ...(config.dns ? { dns: config.dns } : {}) };
  }
  for (const scope of config.scopes ?? []) {
    const start = parseIp(scope.start);
    const end = parseIp(scope.end);
    const prefix = parseMask(scope.mask);
    if (start === null || end === null || prefix === null) continue;
    if (networkOf(relay, prefix) !== networkOf(start, prefix)) continue;
    return { start, end, prefix, reserved: new Map(), ...(scope.gateway ? { gateway: scope.gateway } : {}), ...(scope.dns ? { dns: scope.dns } : {}) };
  }
  return null;
}

// --- DHCP-Pools auf Routern und Layer-3-Switches («ip dhcp pool») -------------------------

export const MAX_DHCP_POOLS = 16;
export const MAX_DHCP_EXCLUDED = 32;
/** Cisco-Standard: 1 Tag. */
export const POOL_LEASE_TIME = 24 * 3600;
export const DHCP_POOL_NAME = /^[A-Za-z0-9_.-]{1,32}$/;

export function canDhcpPool(type: Device['type']): boolean {
  return type === 'router' || type === 'firewall' || type === 'l3switch';
}

/** Pool prüfen: Name, Netz mit Maske, Gateway und DNS als Adressen, Gültigkeit im erlaubten Bereich. */
export function checkDhcpPool(pool: DhcpPool): { code: string; field: string; params?: Record<string, string | number> } | null {
  if (!DHCP_POOL_NAME.test(pool.name)) return { code: 'invalidPoolName', field: 'name', params: { value: pool.name.slice(0, 40) } };
  if (pool.network !== undefined) {
    const net = parseIp(pool.network);
    if (net === null) return { code: 'invalidIp', field: 'network', params: { value: pool.network } };
    const prefix = pool.mask !== undefined ? parseMask(pool.mask) : null;
    if (prefix === null || prefix > 30 || prefix < 8) return { code: 'invalidMask', field: 'mask', params: { value: pool.mask ?? '' } };
  }
  for (const field of ['gateway', 'dns'] as const) {
    const v = pool[field];
    if (v !== undefined && parseIp(v) === null) return { code: 'invalidIp', field, params: { value: v } };
  }
  if (pool.leaseTime !== undefined && (!Number.isInteger(pool.leaseTime) || pool.leaseTime < MIN_LEASE_TIME || pool.leaseTime > MAX_LEASE_TIME * 52)) {
    return { code: 'dhcpLeaseTime', field: 'leaseTime', params: { min: MIN_LEASE_TIME, max: MAX_LEASE_TIME * 52 } };
  }
  return null;
}

/** Normalform: Netzadresse statt Hostadresse, Maske in Punktschreibweise. */
export function normalizePool(pool: DhcpPool): DhcpPool {
  const result: DhcpPool = { name: pool.name };
  if (pool.network !== undefined && pool.mask !== undefined) {
    const prefix = parseMask(pool.mask)!;
    result.network = formatIp(networkOf(parseIp(pool.network)!, prefix));
    result.mask = maskToText(prefix);
  }
  if (pool.gateway) result.gateway = pool.gateway.trim();
  if (pool.dns) result.dns = pool.dns.trim();
  if (pool.leaseTime !== undefined) result.leaseTime = pool.leaseTime;
  return result;
}

/** Bereich eines Pools für eine Adresse im Client-Netz (Interface-Adresse oder giaddr); null, wenn kein Pool passt. */
export function poolScopeFor(device: Device, clientNet: number, ownIps: readonly number[]): { scope: ResolvedScope; leaseTime: number; pool: DhcpPool } | null {
  for (const pool of device.dhcpPools ?? []) {
    const net = pool.network !== undefined ? parseIp(pool.network) : null;
    const prefix = pool.mask !== undefined ? parseMask(pool.mask) : null;
    if (net === null || prefix === null || networkOf(clientNet, prefix) !== networkOf(net, prefix)) continue;
    const excluded: [number, number][] = ownIps.map((ip) => [ip, ip]);
    for (const e of device.dhcpExcluded ?? []) {
      const a = parseIp(e.start);
      const b = e.end !== undefined ? parseIp(e.end) : a;
      if (a !== null && b !== null) excluded.push([Math.min(a, b), Math.max(a, b)]);
    }
    const scope: ResolvedScope = {
      start: networkOf(net, prefix) + 1,
      end: broadcastOf(net, prefix) - 1,
      prefix,
      reserved: new Map(),
      excluded,
      ...(pool.gateway ? { gateway: pool.gateway } : {}),
      ...(pool.dns ? { dns: pool.dns } : {}),
    };
    return { scope, leaseTime: pool.leaseTime ?? POOL_LEASE_TIME, pool };
  }
  return null;
}
