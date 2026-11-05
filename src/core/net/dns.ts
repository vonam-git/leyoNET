import type { DnsRecord, DnsServerConfig, DnsType } from '../model/types';
import { formatIp, parseIp } from './ipv4';
import { normalizeIp6, parseIp6 } from './ipv6';

export const DEFAULT_DNS_TTL = 300;
export const MAX_DNS_TTL = 86_400;
export const DEFAULT_MX_PRIORITY = 10;
export const MAX_TXT_LENGTH = 255;
/** Höchstens so viele CNAME nacheinander (gegen Schleifen). */
export const MAX_CNAME_CHAIN = 8;

/** Kleinbuchstaben, ohne abschliessenden Punkt: "WWW.Schule.EXAMPLE." → "www.schule.example". */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\.$/, '');
}

/** Hostnamen nach RFC 1123: Labels aus Buchstaben, Ziffern und Bindestrich, getrennt durch Punkte. */
export function isValidName(name: string): boolean {
  const n = normalizeName(name);
  if (!n || n.length > 253) return false;
  return n.split('.').every((label) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

/**
 * Name für die Rückwärtsauflösung (PTR): 192.168.1.10 → 10.1.168.192.in-addr.arpa,
 * IPv6 nibbleweise rückwärts unter ip6.arpa (RFC 3596). null bei ungültiger Adresse.
 */
export function reverseName(address: string): string | null {
  const v4 = parseIp(address.trim());
  if (v4 !== null) return `${formatIp(v4).split('.').reverse().join('.')}.in-addr.arpa`;
  const v6 = parseIp6(address.trim());
  if (v6 === null) return null;
  const hex = v6.toString(16).padStart(32, '0');
  return `${[...hex].reverse().join('.')}.ip6.arpa`;
}

export interface DnsIssue {
  code: string;
  field: 'name' | 'type' | 'value' | 'ttl' | 'priority';
  params?: Record<string, string | number>;
}

/** Prüft einen Eintrag samt Regeln der Zone (keine Doppelten, CNAME allein am Namen). */
export function checkDnsRecord(config: DnsServerConfig | undefined, record: DnsRecord): DnsIssue | null {
  if (!isValidName(record.name)) return { code: 'invalidDnsName', field: 'name', params: { value: record.name } };
  const value = record.value.trim();
  switch (record.type) {
    case 'A':
      if (parseIp(value) === null) return { code: 'invalidIp', field: 'value', params: { value } };
      break;
    case 'AAAA':
      if (parseIp6(value) === null) return { code: 'invalidAaaa', field: 'value', params: { value } };
      break;
    case 'CNAME':
    case 'NS':
    case 'PTR':
    case 'MX':
      if (!isValidName(value)) return { code: 'invalidDnsName', field: 'value', params: { value } };
      break;
    case 'TXT':
      if (!value || value.length > MAX_TXT_LENGTH || /[\u0000-\u001f]/.test(value)) return { code: 'dnsTxt', field: 'value', params: { max: MAX_TXT_LENGTH } };
      break;
    default:
      return { code: 'dnsType', field: 'type' };
  }
  if (record.type === 'MX' && record.priority !== undefined && (!Number.isInteger(record.priority) || record.priority < 0 || record.priority > 65_535)) {
    return { code: 'dnsPriority', field: 'priority' };
  }
  if (!Number.isInteger(record.ttl) || record.ttl < 0 || record.ttl > MAX_DNS_TTL) {
    return { code: 'dnsTtl', field: 'ttl', params: { max: MAX_DNS_TTL } };
  }
  const normalized = normalizeRecord(record);
  const records = config?.records ?? [];
  if (records.some((r) => r.name === normalized.name && r.type === normalized.type && r.value === normalized.value)) {
    return { code: 'duplicateRecord', field: 'name', params: { name: normalized.name } };
  }
  // RFC 1034, 3.6.2: Ein Name mit CNAME hat keine weiteren Einträge (und nur einen CNAME).
  if (normalized.type === 'CNAME' && records.some((r) => r.name === normalized.name)) {
    return { code: 'cnameConflict', field: 'name', params: { name: normalized.name } };
  }
  if (normalized.type !== 'CNAME' && records.some((r) => r.name === normalized.name && r.type === 'CNAME')) {
    return { code: 'cnameConflict', field: 'name', params: { name: normalized.name } };
  }
  if (normalized.type === 'CNAME' && normalized.value === normalized.name) return { code: 'cnameLoop', field: 'value', params: { name: normalized.name } };
  return null;
}

export function normalizeRecord(record: DnsRecord): DnsRecord {
  const raw = record.value.trim();
  const value =
    record.type === 'A'
      ? raw
      : record.type === 'AAAA'
        ? (normalizeIp6(raw) ?? raw)
        : record.type === 'TXT'
          ? raw
          : normalizeName(raw);
  return {
    name: normalizeName(record.name),
    type: record.type,
    value,
    ...(record.type === 'MX' ? { priority: record.priority ?? DEFAULT_MX_PRIORITY } : {}),
    ttl: record.ttl,
  };
}

export type ZoneAnswer =
  /** Treffer; bei CNAME zuerst die Aliase, dann die Einträge des Ziels. */
  | { kind: 'answer'; records: DnsRecord[] }
  /** Name existiert, aber ohne Eintrag dieses Typs (NODATA). */
  | { kind: 'nodata'; records: DnsRecord[] }
  /** Name gibt es in dieser Zone nicht (NXDOMAIN), oder ein Alias zeigt hinaus: `follow` weiter auflösen. */
  | { kind: 'unknown'; records: DnsRecord[]; follow?: string };

/**
 * Antwort aus der eigenen Zone (RFC 1034, 4.3.2): exakte Treffer, sonst einem
 * CNAME folgen (auch in Ketten), MX nach Vorrang sortiert.
 */
export function answerFromZone(config: DnsServerConfig, name: string, type: DnsType): ZoneAnswer {
  const chain: DnsRecord[] = [];
  let current = normalizeName(name);
  for (let hop = 0; hop <= MAX_CNAME_CHAIN; hop++) {
    const atName = config.records.filter((r) => r.name === current);
    const exact = atName.filter((r) => r.type === type);
    if (exact.length) return { kind: 'answer', records: [...chain, ...sortRecords(exact)] };
    const alias = type === 'CNAME' ? undefined : atName.find((r) => r.type === 'CNAME');
    if (!alias) {
      if (atName.length) return { kind: 'nodata', records: chain };
      return chain.length ? { kind: 'unknown', records: chain, follow: current } : { kind: 'unknown', records: [] };
    }
    chain.push(alias);
    current = alias.value;
  }
  return { kind: 'nodata', records: chain };
}

/** Kompatibilität: nur exakte Treffer eines Typs. */
export function lookupRecords(config: DnsServerConfig, name: string, type: DnsType): DnsRecord[] {
  const wanted = normalizeName(name);
  return config.records.filter((r) => r.name === wanted && r.type === type);
}

/** MX nach Vorrang (kleiner zuerst), sonst Reihenfolge der Zone. */
export function sortRecords(records: readonly DnsRecord[]): DnsRecord[] {
  return [...records].sort((a, b) => (a.type === 'MX' && b.type === 'MX' ? (a.priority ?? DEFAULT_MX_PRIORITY) - (b.priority ?? DEFAULT_MX_PRIORITY) : 0));
}

/** Aus einer Antwort mit Aliasen die eigentlichen Einträge des gefragten Typs. */
export function finalRecords(records: readonly DnsRecord[], type: DnsType): DnsRecord[] {
  return records.filter((r) => r.type === type);
}
