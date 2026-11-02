// IPv6-Adressen (RFC 4291) werden intern als 128-Bit-Ganzzahl (bigint)
// gerechnet und als Text nach RFC 5952 geschrieben: Kleinbuchstaben, ohne
// führende Nullen, die längste Folge von Null-Blöcken (mindestens zwei) als «::».

const MAX = (1n << 128n) - 1n;

export function parseIp6(text: string): bigint | null {
  let s = text.trim().toLowerCase();
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  // Zonen-Angabe (fe80::1%eth0) gehört nicht zur Adresse.
  s = s.split('%')[0]!;
  if (!/^[0-9a-f:.]+$/.test(s) || !s.includes(':')) return null;
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const blocks = (part: string): number[] | null => {
    if (part === '') return [];
    const out: number[] = [];
    const items = part.split(':');
    for (const [i, item] of items.entries()) {
      // Eingebettete IPv4-Adresse am Schluss (z.B. ::ffff:192.0.2.1).
      if (i === items.length - 1 && item.includes('.')) {
        const v4 = item.split('.').map(Number);
        if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
        out.push((v4[0]! << 8) | v4[1]!, (v4[2]! << 8) | v4[3]!);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(item)) return null;
      out.push(parseInt(item, 16));
    }
    return out;
  };
  const head = blocks(halves[0]!);
  const tail = halves.length === 2 ? blocks(halves[1]!) : [];
  if (!head || !tail) return null;
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const all = [...head, ...Array<number>(Math.max(0, missing)).fill(0), ...tail];
  return all.reduce((value, block) => (value << 16n) | BigInt(block), 0n);
}

export function formatIp6(value: bigint): string {
  const blocks = Array.from({ length: 8 }, (_, i) => Number((value >> BigInt(112 - i * 16)) & 0xffffn));
  // Längste Folge von Nullen (mindestens zwei Blöcke) durch «::» ersetzen, bei Gleichstand die erste.
  let bestStart = -1;
  let bestLength = 1;
  for (let i = 0; i < 8; ) {
    if (blocks[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && blocks[j] === 0) j++;
    if (j - i > bestLength) {
      bestStart = i;
      bestLength = j - i;
    }
    i = j;
  }
  const hex = blocks.map((b) => b.toString(16));
  if (bestStart < 0) return hex.join(':');
  const left = hex.slice(0, bestStart).join(':');
  const right = hex.slice(bestStart + bestLength).join(':');
  return `${left}::${right}`;
}

/** Normalisiert eine Adresse in die Schreibweise nach RFC 5952 (oder null). */
export function normalizeIp6(text: string): string | null {
  const value = parseIp6(text);
  return value === null ? null : formatIp6(value);
}

export function prefixMask6(prefix: number): bigint {
  return prefix === 0 ? 0n : (MAX << BigInt(128 - prefix)) & MAX;
}

export function networkOf6(address: bigint, prefix: number): bigint {
  return address & prefixMask6(prefix);
}

/** «2001:db8::1/64» → Adresse und Präfix; ohne Präfix gilt /64 (Standard für Subnetze). */
export function parseCidr6(text: string): { address: bigint; prefix: number } | null {
  const [addr, len, ...rest] = text.trim().split('/');
  if (rest.length || !addr) return null;
  const address = parseIp6(addr);
  if (address === null) return null;
  const prefix = len === undefined ? 64 : /^\d{1,3}$/.test(len) ? Number(len) : NaN;
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) return null;
  return { address, prefix };
}

export function formatCidr6(address: bigint, prefix: number): string {
  return `${formatIp6(address)}/${prefix}`;
}

/** Schnittstellen-Kennung nach modifiziertem EUI-64 aus der MAC-Adresse (RFC 4291, Anhang A). */
export function eui64(mac: string): bigint {
  const bytes = mac.split(':').map((h) => parseInt(h, 16));
  if (bytes.length !== 6 || bytes.some((b) => Number.isNaN(b))) return 0n;
  const id = [bytes[0]! ^ 0x02, bytes[1]!, bytes[2]!, 0xff, 0xfe, bytes[3]!, bytes[4]!, bytes[5]!];
  return id.reduce((value, b) => (value << 8n) | BigInt(b), 0n);
}

export const LINK_LOCAL_PREFIX = 0xfe80n << 112n;

/** Link-Local-Adresse fe80::/64 + EUI-64 aus der MAC. */
export function linkLocal(mac: string): bigint {
  return LINK_LOCAL_PREFIX | eui64(mac);
}

export function isLinkLocal6(address: bigint): boolean {
  return networkOf6(address, 10) === LINK_LOCAL_PREFIX;
}

export function isMulticast6(address: bigint): boolean {
  return address >> 120n === 0xffn;
}

export function isUnspecified6(address: bigint): boolean {
  return address === 0n;
}

export function isLoopback6(address: bigint): boolean {
  return address === 1n;
}

/** Dokumentationsbereich 2001:db8::/32 (RFC 3849) – für Beispiele und Übungen. */
export function isDocumentation6(address: bigint): boolean {
  return networkOf6(address, 32) === 0x20010db8n << 96n;
}

/** Unique Local Addresses fd00::/8 (RFC 4193): private IPv6-Adressen. */
export function isUniqueLocal6(address: bigint): boolean {
  return address >> 121n === 0x7en;
}

export const ALL_NODES = 'ff02::1';
export const ALL_ROUTERS = 'ff02::2';
/** Alle DHCPv6-Server und -Relays auf der Leitung (RFC 9915). */
export const ALL_DHCP6 = 'ff02::1:2';

/** Solicited-Node-Multicast ff02::1:ffXX:XXXX für die Adressauflösung (RFC 4291). */
export function solicitedNode(address: bigint): bigint {
  return (0xff02n << 112n) | (1n << 32n) | (0xffn << 24n) | (address & 0xffffffn);
}

/** Ethernet-Multicast zu einer IPv6-Multicast-Adresse: 33:33 + untere 32 Bit (RFC 2464). */
export function multicastMac6(address: bigint): string {
  const low = Number(address & 0xffffffffn);
  const bytes = [0x33, 0x33, (low >>> 24) & 0xff, (low >>> 16) & 0xff, (low >>> 8) & 0xff, low & 0xff];
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(':');
}

/** 16 Bytes einer Adresse (für die Kodierung). */
export function ip6Bytes(text: string): number[] {
  const value = parseIp6(text) ?? 0n;
  return Array.from({ length: 16 }, (_, i) => Number((value >> BigInt(120 - i * 8)) & 0xffn));
}
