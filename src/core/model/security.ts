import { formatIp, networkOf, parseIp, parseMask } from '../net/ipv4';
import { formatCidr6, formatIp6, networkOf6, parseIp6 } from '../net/ipv6';
import type { TopologyError } from './topology';

/**
 * Firewall und VPN im Modell. Die Firewall ist ein Paketfilter mit Regeln,
 * die der Reihe nach geprüft werden (die erste passende gilt), und einer
 * Standardregel. Zustandsbehaftet: Antworten auf erlaubte Verbindungen
 * kommen automatisch zurück. Das VPN verbindet zwei Standorte über einen
 * IPsec-Tunnel (IKEv2 und ESP) mit gemeinsamem Schlüssel.
 */

export type FirewallAction = 'allow' | 'deny';
export type FirewallProtocol = 'any' | 'tcp' | 'udp' | 'icmp';
export const FIREWALL_PROTOCOLS: readonly FirewallProtocol[] = ['any', 'tcp', 'udp', 'icmp'];

export interface FirewallRule {
  action: FirewallAction;
  protocol: FirewallProtocol;
  /** Quelle: «any» oder Adresse/Netz, z.B. «192.168.1.0/24» (eine Adresse ohne Präfix gilt als /32). */
  src: string;
  dst: string;
  /** Zielport bei TCP/UDP; fehlt = alle Ports. */
  port?: number;
  /** Nur Pakete, die an diesem Anschluss hereinkommen (Router); fehlt = alle. */
  iface?: number;
}

export interface FirewallConfig {
  rules: FirewallRule[];
  /** Gilt, wenn keine Regel passt. */
  defaultAction: FirewallAction;
  /** false = zustandslos: Auch Antworten brauchen eine eigene Regel. Fehlt = zustandsbehaftet. */
  stateful?: boolean;
}

export interface VpnTunnel {
  /** Name, z.B. «Zürich – Bern». */
  name: string;
  /** Öffentliche Adresse des Routers am anderen Standort. */
  peer: string;
  /** Eigenes Netz, das durch den Tunnel darf (CIDR). */
  local: string;
  /** Netz am anderen Standort (CIDR). */
  remote: string;
  /** Gemeinsamer Schlüssel (Pre-Shared Key); nur für die Simulation, im Klartext gespeichert. */
  key: string;
}

export const MAX_FIREWALL_RULES = 50;
export const MAX_VPN_TUNNELS = 8;

type Check<T> = { ok: true; value: T } | { ok: false; error: TopologyError };
const bad = <T>(code: string, field: string, params?: Record<string, string | number>): Check<T> => ({ ok: false, error: { code: code as TopologyError['code'], field, ...(params ? { params } : {}) } });

/** «any», eine Adresse (→ /32) oder ein Netz; liefert die Normalform oder null. */
export function normalizeMatch(text: string): string | null {
  const value = text.trim().toLowerCase();
  if (value === '' || value === 'any' || value === '*') return 'any';
  const [ipText = '', prefixText] = value.split('/');
  // IPv6-Adresse oder -Netz, z.B. «2001:db8:1::/64».
  const ip6 = parseIp6(ipText);
  if (ip6 !== null) {
    const prefix6 = prefixText === undefined ? 128 : /^\d{1,3}$/.test(prefixText) ? Number(prefixText) : NaN;
    if (!(prefix6 >= 0 && prefix6 <= 128)) return null;
    return prefix6 === 128 ? formatIp6(ip6) : formatCidr6(networkOf6(ip6, prefix6), prefix6);
  }
  const ip = parseIp(ipText);
  const prefix = prefixText === undefined ? 32 : parseMask(prefixText);
  if (ip === null || prefix === null) return null;
  return prefix === 32 ? formatIp(ip) : `${formatIp(networkOf(ip, prefix))}/${prefix}`;
}

/** Liegt `ip` im Bereich (`any`, Adresse oder Netz)? */
export function matchesAddress(range: string, ip: string): boolean {
  if (range === 'any') return true;
  const value6 = parseIp6(ip);
  if (value6 !== null) {
    const [net6 = '', p6] = range.split('/');
    const n6 = parseIp6(net6);
    const prefix6 = p6 === undefined ? 128 : Number(p6);
    return n6 !== null && networkOf6(value6, prefix6) === networkOf6(n6, prefix6);
  }
  const value = parseIp(ip);
  if (value === null) return false;
  const [net = '', prefixText] = range.split('/');
  const prefix = prefixText === undefined ? 32 : Number(prefixText);
  const n = parseIp(net);
  return n !== null && networkOf(value, prefix) === networkOf(n, prefix);
}

export function checkFirewallRule(rule: FirewallRule, ports: number): Check<FirewallRule> {
  if (rule.action !== 'allow' && rule.action !== 'deny') return bad('invalidFirewallRule', 'action');
  if (!FIREWALL_PROTOCOLS.includes(rule.protocol)) return bad('invalidFirewallRule', 'protocol');
  const src = normalizeMatch(rule.src);
  if (src === null) return bad('invalidIp', 'src', { value: rule.src.trim() });
  const dst = normalizeMatch(rule.dst);
  if (dst === null) return bad('invalidIp', 'dst', { value: rule.dst.trim() });
  if (rule.port !== undefined) {
    if (rule.protocol !== 'tcp' && rule.protocol !== 'udp') return bad('firewallPortNeedsProtocol', 'port');
    if (!Number.isInteger(rule.port) || rule.port < 1 || rule.port > 65535) return bad('invalidPort', 'port');
  }
  if (rule.iface !== undefined && (!Number.isInteger(rule.iface) || rule.iface < 0 || rule.iface >= ports)) return bad('unknownInterface', 'iface');
  return {
    ok: true,
    value: { action: rule.action, protocol: rule.protocol, src, dst, ...(rule.port !== undefined ? { port: rule.port } : {}), ...(rule.iface !== undefined ? { iface: rule.iface } : {}) },
  };
}

export function checkFirewall(config: FirewallConfig, ports: number): Check<FirewallConfig> {
  if (config.defaultAction !== 'allow' && config.defaultAction !== 'deny') return bad('invalidFirewallRule', 'defaultAction');
  if (config.rules.length > MAX_FIREWALL_RULES) return bad('tooMany', 'rules', { max: MAX_FIREWALL_RULES });
  const rules: FirewallRule[] = [];
  for (const rule of config.rules) {
    const checked = checkFirewallRule(rule, ports);
    if (!checked.ok) return checked;
    rules.push(checked.value);
  }
  return { ok: true, value: { rules, defaultAction: config.defaultAction, ...(config.stateful === false ? { stateful: false } : {}) } };
}

/** Netz in CIDR mit Netzadresse, z.B. «192.168.1.0/24». */
function network(text: string, field: string): Check<string> {
  const [ipText = '', prefixText] = text.trim().split('/');
  const ip = parseIp(ipText);
  const prefix = prefixText === undefined ? null : parseMask(prefixText);
  if (ip === null || prefix === null) return bad('invalidNetwork', field, { value: text.trim() });
  if (networkOf(ip, prefix) !== ip) return bad('networkHasHostBits', field, { value: text.trim(), suggestion: `${formatIp(networkOf(ip, prefix))}/${prefix}` });
  return { ok: true, value: `${formatIp(ip)}/${prefix}` };
}

export function checkVpnTunnel(tunnel: VpnTunnel, others: readonly VpnTunnel[]): Check<VpnTunnel> {
  const name = tunnel.name.trim();
  if (!name || name.length > 40) return bad('textTooLong', 'name', { max: 40 });
  const peer = parseIp(tunnel.peer);
  if (peer === null) return bad('invalidIp', 'peer', { value: tunnel.peer.trim() });
  const local = network(tunnel.local, 'local');
  if (!local.ok) return local;
  const remote = network(tunnel.remote, 'remote');
  if (!remote.ok) return remote;
  if (tunnel.key.length < 4 || tunnel.key.length > 64) return bad('vpnKeyLength', 'key', { min: 4, max: 64 });
  if (others.some((o) => o.remote === remote.value)) return bad('duplicateRoute', 'remote', { net: remote.value });
  return { ok: true, value: { name, peer: formatIp(peer), local: local.value, remote: remote.value, key: tunnel.key } };
}

/** Einfacher, nicht kryptografischer Hash (FNV-1a, 32 Bit) für Schlüsselbeweise und Verwürfelung in der Simulation. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
