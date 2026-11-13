/**
 * Aufbau der Rahmen und Pakete nach Norm: welche Felder in welcher Reihenfolge, wie viele Bit.
 * Dieselben Beschreibungen zeigen die Paketdetails der App (mit den echten Werten des Rahmens)
 * und das Wiki (src/wiki). Ein Test prüft sie gegen die Kodierung in encode.ts, damit Bild und
 * Bytes nie auseinanderlaufen.
 *
 * Zwei Darstellungen: «bits» als Raster mit 32 Bit je Zeile (so zeichnen die RFCs ihre Köpfe),
 * «bytes» als Band von links nach rechts (so zeigt IEEE 802.3 den Rahmen).
 */
import type { OsiLayer, WireLayer } from './part';

export type FormatId = 'ethernet2' | 'ethernet2q' | 'dot1q' | 'ieee8023' | 'wlan' | 'ppp' | 'arp' | 'ipv4' | 'ipv6' | 'icmp' | 'tcp' | 'udp';

/** hexLe: Wert niederwertigstes Byte zuerst (so steht die CRC im Rahmen, Wireshark zeigt sie so). */
export type FieldDisplay = 'dec' | 'decLe' | 'hex' | 'hexLe' | 'bin' | 'mac' | 'ipv4' | 'ipv6' | 'flags';

export interface FormatField {
  /** Kennung für Texte: fmt.f.<id> (Name) und fmt.<format>.<id> (Bedeutung). */
  id: string;
  /** Länge in Bit; 0 = variabel (Optionen, Nutzdaten). */
  bits: number;
  /** Angezeigte Länge, wenn variabel oder eine Spanne, z.B. «46–1500 Byte». */
  size?: string;
  display?: FieldDisplay;
  /** Namen der Flag-Bits vom höchstwertigen zum niederwertigsten. */
  flags?: string[];
  /** Fester Wert nach Norm (z.B. 0x8100, 0x7E). */
  fixed?: string;
  /** Gehört zur Bitübertragung (Schicht 1), steht nicht im Mitschnitt. */
  phy?: boolean;
  /** Rahmung der Leitung (z.B. HDLC-Flag 0x7E), Schicht 2, steht aber nicht im Mitschnitt. */
  framing?: boolean;
  /** Kommt nicht in jedem Rahmen vor (z.B. SNAP, Optionen). */
  optional?: boolean;
  /** Nutzdaten: hier steckt die nächste Schicht. */
  payload?: boolean;
  /** Steht hinter den Nutzdaten (FCS). */
  trailer?: boolean;
}

export interface FrameFormat {
  id: FormatId;
  osi: OsiLayer;
  /** Name wie in der Paketliste (für Farbe und Tag), z.B. «IPv4». */
  protocol: string;
  /** Normen in der Reihenfolge ihrer Bedeutung; alle stehen in docs/normen.json. */
  norms: string[];
  layout: 'bits' | 'bytes';
  /** Name der Dateneinheit (Rahmen, Paket, Segment …), Text fmt.pdu.<pdu>. */
  pdu: 'frame' | 'tag' | 'packet' | 'segment' | 'datagram' | 'message';
  fields: FormatField[];
}

const mac = (id: string): FormatField => ({ id, bits: 48, display: 'mac' });

const ETHERNET_HEAD: FormatField[] = [
  { id: 'preamble', bits: 56, phy: true, fixed: '10101010 × 7' },
  { id: 'sfd', bits: 8, phy: true, fixed: '10101011' },
  mac('dstMac'),
  mac('srcMac'),
];
const ETHERNET_TAIL: FormatField[] = [
  { id: 'fcs', bits: 32, display: 'hexLe', trailer: true },
  { id: 'ifg', bits: 96, phy: true, trailer: true },
];

export const FORMATS: Record<FormatId, FrameFormat> = {
  ethernet2: {
    id: 'ethernet2',
    osi: 2,
    protocol: 'Ethernet II',
    norms: ['IEEE 802.3'],
    layout: 'bytes',
    pdu: 'frame',
    fields: [...ETHERNET_HEAD, { id: 'etherType', bits: 16, display: 'hex' }, { id: 'payload', bits: 0, size: '46–1500', payload: true }, ...ETHERNET_TAIL],
  },
  ethernet2q: {
    id: 'ethernet2q',
    osi: 2,
    protocol: 'Ethernet II + 802.1Q',
    norms: ['IEEE 802.3', 'IEEE 802.1Q'],
    layout: 'bytes',
    pdu: 'frame',
    fields: [
      ...ETHERNET_HEAD,
      { id: 'tpid', bits: 16, display: 'hex', fixed: '0x8100' },
      { id: 'tci', bits: 16, display: 'hex' },
      { id: 'etherType', bits: 16, display: 'hex' },
      { id: 'payload', bits: 0, size: '42–1500', payload: true },
      ...ETHERNET_TAIL,
    ],
  },
  dot1q: {
    id: 'dot1q',
    osi: 2,
    protocol: '802.1Q',
    norms: ['IEEE 802.1Q'],
    layout: 'bits',
    pdu: 'tag',
    fields: [
      { id: 'tpid', bits: 16, display: 'hex', fixed: '0x8100' },
      { id: 'pcp', bits: 3 },
      { id: 'dei', bits: 1 },
      { id: 'vid', bits: 12 },
    ],
  },
  ieee8023: {
    id: 'ieee8023',
    osi: 2,
    protocol: 'IEEE 802.3',
    norms: ['IEEE 802.3', 'IEEE 802.2', 'RFC 1042'],
    layout: 'bytes',
    pdu: 'frame',
    fields: [
      ...ETHERNET_HEAD,
      { id: 'length', bits: 16, size: '≤ 1500' },
      { id: 'dsap', bits: 8, display: 'hex' },
      { id: 'ssap', bits: 8, display: 'hex' },
      { id: 'control', bits: 8, display: 'hex' },
      { id: 'oui', bits: 24, display: 'hex', optional: true },
      { id: 'snapType', bits: 16, display: 'hex', optional: true },
      { id: 'payload', bits: 0, size: '38–1497', payload: true },
      ...ETHERNET_TAIL,
    ],
  },
  wlan: {
    id: 'wlan',
    osi: 2,
    protocol: 'IEEE 802.11',
    norms: ['IEEE 802.11'],
    layout: 'bytes',
    pdu: 'frame',
    fields: [
      { id: 'frameControl', bits: 16, display: 'hex' },
      // IEEE 802.11 überträgt Zahlen mit dem niederwertigsten Byte zuerst; Frame Control als Bytefolge.
      { id: 'duration', bits: 16, display: 'decLe' },
      mac('addr1'),
      mac('addr2'),
      mac('addr3'),
      { id: 'seqControl', bits: 16, display: 'hexLe' },
      { ...mac('addr4'), optional: true },
      { id: 'qosControl', bits: 16, display: 'hexLe', optional: true },
      { id: 'body', bits: 0, size: '0–2304', payload: true },
      { id: 'fcs', bits: 32, display: 'hexLe', trailer: true },
    ],
  },
  ppp: {
    id: 'ppp',
    osi: 2,
    protocol: 'PPP (RFC 1662)',
    norms: ['RFC 1662', 'RFC 1661'],
    layout: 'bytes',
    pdu: 'frame',
    fields: [
      { id: 'flag', bits: 8, framing: true, fixed: '0x7E' },
      { id: 'address', bits: 8, display: 'hex', fixed: '0xFF' },
      { id: 'pppControl', bits: 8, display: 'hex', fixed: '0x03' },
      { id: 'pppProtocol', bits: 16, display: 'hex' },
      { id: 'information', bits: 0, size: '≤ 1500', payload: true },
      { id: 'fcs16', bits: 16, display: 'hexLe', trailer: true },
      { id: 'flagEnd', bits: 8, framing: true, fixed: '0x7E', trailer: true },
    ],
  },
  arp: {
    id: 'arp',
    // Wie in der Paketliste auf Schicht 2: ARP verbindet die Schichten 2 und 3 und wird nicht geroutet.
    osi: 2,
    protocol: 'ARP',
    norms: ['RFC 826'],
    layout: 'bits',
    pdu: 'message',
    fields: [
      { id: 'htype', bits: 16 },
      { id: 'ptype', bits: 16, display: 'hex' },
      { id: 'hlen', bits: 8 },
      { id: 'plen', bits: 8 },
      { id: 'oper', bits: 16 },
      mac('sha'),
      { id: 'spa', bits: 32, display: 'ipv4' },
      mac('tha'),
      { id: 'tpa', bits: 32, display: 'ipv4' },
    ],
  },
  ipv4: {
    id: 'ipv4',
    osi: 3,
    protocol: 'IPv4',
    norms: ['RFC 791', 'RFC 2474', 'RFC 3168'],
    layout: 'bits',
    pdu: 'packet',
    fields: [
      { id: 'version', bits: 4 },
      { id: 'ihl', bits: 4 },
      { id: 'dscp', bits: 6 },
      { id: 'ecn', bits: 2 },
      { id: 'totalLength', bits: 16 },
      { id: 'identification', bits: 16, display: 'hex' },
      { id: 'ipFlags', bits: 3, display: 'flags', flags: ['0', 'DF', 'MF'] },
      { id: 'fragmentOffset', bits: 13 },
      { id: 'ttl', bits: 8 },
      { id: 'protocol', bits: 8 },
      { id: 'headerChecksum', bits: 16, display: 'hex' },
      { id: 'srcIp', bits: 32, display: 'ipv4' },
      { id: 'dstIp', bits: 32, display: 'ipv4' },
      { id: 'options', bits: 0, size: '0–40', optional: true },
      { id: 'payload', bits: 0, size: '≤ 65515', payload: true },
    ],
  },
  ipv6: {
    id: 'ipv6',
    osi: 3,
    protocol: 'IPv6',
    norms: ['RFC 8200', 'RFC 2474', 'RFC 3168'],
    layout: 'bits',
    pdu: 'packet',
    fields: [
      { id: 'version', bits: 4 },
      { id: 'trafficClass', bits: 8, display: 'hex' },
      { id: 'flowLabel', bits: 20, display: 'hex' },
      { id: 'payloadLength', bits: 16 },
      { id: 'nextHeader', bits: 8 },
      { id: 'hopLimit', bits: 8 },
      { id: 'srcIp6', bits: 128, display: 'ipv6' },
      { id: 'dstIp6', bits: 128, display: 'ipv6' },
      { id: 'payload6', bits: 0, size: '≤ 65535', payload: true },
    ],
  },
  icmp: {
    id: 'icmp',
    osi: 3,
    protocol: 'ICMP',
    norms: ['RFC 792'],
    layout: 'bits',
    pdu: 'message',
    fields: [
      { id: 'icmpType', bits: 8 },
      { id: 'icmpCode', bits: 8 },
      { id: 'checksum', bits: 16, display: 'hex' },
      { id: 'identifier', bits: 16, display: 'hex' },
      { id: 'sequence', bits: 16 },
      { id: 'data', bits: 0, size: '', payload: true },
    ],
  },
  tcp: {
    id: 'tcp',
    osi: 4,
    protocol: 'TCP',
    norms: ['RFC 9293'],
    layout: 'bits',
    pdu: 'segment',
    fields: [
      { id: 'srcPort', bits: 16 },
      { id: 'dstPort', bits: 16 },
      { id: 'seq', bits: 32 },
      { id: 'ack', bits: 32 },
      { id: 'dataOffset', bits: 4 },
      { id: 'reserved', bits: 4 },
      { id: 'tcpFlags', bits: 8, display: 'flags', flags: ['CWR', 'ECE', 'URG', 'ACK', 'PSH', 'RST', 'SYN', 'FIN'] },
      { id: 'window', bits: 16 },
      { id: 'checksum', bits: 16, display: 'hex' },
      { id: 'urgent', bits: 16 },
      { id: 'tcpOptions', bits: 0, size: '0–40', optional: true },
      { id: 'data', bits: 0, size: '', payload: true },
    ],
  },
  udp: {
    id: 'udp',
    osi: 4,
    protocol: 'UDP',
    norms: ['RFC 768'],
    layout: 'bits',
    pdu: 'datagram',
    fields: [
      { id: 'srcPort', bits: 16 },
      { id: 'dstPort', bits: 16 },
      { id: 'udpLength', bits: 16 },
      { id: 'checksum', bits: 16, display: 'hex' },
      { id: 'data', bits: 0, size: '', payload: true },
    ],
  },
};

/** Passendes Format zu einer Schicht der Kodierung, oder null. */
export function formatOf(layer: Pick<WireLayer, 'protocol'>): FrameFormat | null {
  const p = layer.protocol;
  if (p === 'Ethernet II') return FORMATS.ethernet2;
  if (p === 'Ethernet II + 802.1Q') return FORMATS.ethernet2q;
  if (p === 'IEEE 802.3') return FORMATS.ieee8023;
  if (p === 'IEEE 802.11' || p === 'IEEE 802.11 + EAPOL') return FORMATS.wlan;
  if (p === 'PPP (RFC 1662)') return FORMATS.ppp;
  for (const id of ['arp', 'ipv4', 'ipv6', 'icmp', 'tcp', 'udp'] as const) if (p === FORMATS[id].protocol) return FORMATS[id];
  return null;
}

export interface FieldValue {
  field: FormatField;
  /** Lage im Rahmen in Bit (ab Beginn der Bytes), wenn im Mitschnitt vorhanden. */
  bitStart?: number;
  bits?: number;
  /** Lesbarer Wert, z.B. «0x0800» oder «SYN, ACK»; fehlt bei variablen Feldern ohne Inhalt. */
  value?: string;
}

const bitsAt = (bytes: ArrayLike<number>, start: number, count: number): number => {
  let v = 0;
  for (let i = 0; i < count; i++) {
    const bit = start + i;
    v = v * 2 + (((bytes[bit >> 3] ?? 0) >> (7 - (bit & 7))) & 1);
  }
  return v;
};

function show(field: FormatField, bytes: ArrayLike<number>, start: number, bits: number): string {
  const byte = (i: number) => bytes[(start >> 3) + i] ?? 0;
  switch (field.display) {
    case 'mac':
      return Array.from({ length: 6 }, (_, i) => byte(i).toString(16).padStart(2, '0')).join(':');
    case 'ipv4':
      return Array.from({ length: 4 }, (_, i) => byte(i)).join('.');
    case 'ipv6': {
      const words = Array.from({ length: 8 }, (_, i) => ((byte(2 * i) << 8) | byte(2 * i + 1)).toString(16));
      // Längste Folge von Nullen kürzen (RFC 5952).
      let best = -1;
      let len = 0;
      for (let i = 0; i < 8; i++) {
        let j = i;
        while (j < 8 && words[j] === '0') j++;
        if (j - i > len && j - i > 1) [best, len] = [i, j - i];
      }
      return best < 0 ? words.join(':') : `${words.slice(0, best).join(':')}::${words.slice(best + len).join(':')}`;
    }
    case 'flags': {
      const v = bitsAt(bytes, start, bits);
      const on = field.flags!.filter((name, i) => name !== '0' && (v >> (bits - 1 - i)) & 1);
      return on.length ? on.join(', ') : '–';
    }
    case 'hex': {
      if (bits > 32) return Array.from({ length: bits / 8 }, (_, i) => byte(i).toString(16).padStart(2, '0')).join(' ');
      return `0x${bitsAt(bytes, start, bits).toString(16).padStart(Math.ceil(bits / 4), '0')}`;
    }
    case 'decLe': {
      let v = 0;
      for (let i = bits / 8 - 1; i >= 0; i--) v = v * 256 + byte(i);
      return String(v);
    }
    case 'hexLe': {
      let v = 0;
      for (let i = bits / 8 - 1; i >= 0; i--) v = v * 256 + byte(i);
      return `0x${v.toString(16).padStart(bits / 4, '0')}`;
    }
    case 'bin':
      return bitsAt(bytes, start, bits).toString(2).padStart(bits, '0');
    default:
      return String(bitsAt(bytes, start, bits));
  }
}

/**
 * Werte eines Formats aus den echten Bytes einer Schicht lesen. Felder der Schicht 1 (Präambel,
 * Flags, Pause) stehen nicht in den Bytes und bekommen ihren festen Wert. Kopf von vorne,
 * Prüfsumme (FCS) von hinten, dazwischen Optionen und Nutzdaten.
 */
export function readFormat(format: FrameFormat, bytes: ArrayLike<number>, layer: Pick<WireLayer, 'start' | 'length'>, innerStart?: number): FieldValue[] {
  const begin = layer.start * 8;
  const end = (layer.start + layer.length) * 8;
  const inBytes = (f: FormatField) => !f.phy && !f.framing;
  const tailBits = format.fields.filter((f) => f.trailer && inBytes(f)).reduce((n, f) => n + f.bits, 0);
  let pos = begin;
  const out: FieldValue[] = [];
  const valueOf = (id: string) => out.find((v) => v.field.id === id)?.value;
  for (const field of format.fields) {
    if (!inBytes(field)) {
      out.push({ field, ...(field.fixed ? { value: field.fixed } : {}) });
      continue;
    }
    if (field.trailer) {
      const at = end - tailBits + format.fields.filter((f) => f.trailer && inBytes(f) && format.fields.indexOf(f) < format.fields.indexOf(field)).reduce((n, f) => n + f.bits, 0);
      out.push({ field, bitStart: at, bits: field.bits, value: show(field, bytes, at, field.bits) });
      continue;
    }
    if (field.optional) {
      // Optional: SNAP nur nach DSAP 0xAA, Optionen nur bei längerem Kopf, WLAN-Adresse 4 und QoS
      // nur bei passenden Bits in Frame Control.
      let bits = field.bits;
      if (field.id === 'oui' || field.id === 'snapType') bits = valueOf('dsap') === '0xaa' ? field.bits : 0;
      if (field.id === 'options') bits = (Number(valueOf('ihl')) - 5) * 32;
      if (field.id === 'tcpOptions') bits = (Number(valueOf('dataOffset')) - 5) * 32;
      if (field.id === 'addr4') bits = (bitsAt(bytes, begin + 8, 8) & 0x03) === 0x03 ? 48 : 0;
      if (field.id === 'qosControl') bits = (bitsAt(bytes, begin, 8) & 0x8c) === 0x88 ? 16 : 0;
      if (bits > 0) out.push({ field, bitStart: pos, bits, value: bits === field.bits || field.bits === 0 ? (field.bits ? show(field, bytes, pos, bits) : `${bits / 8} Byte`) : undefined });
      else out.push({ field });
      pos += Math.max(0, bits);
      continue;
    }
    if (field.payload) {
      const stop = end - tailBits;
      const from = innerStart !== undefined ? Math.max(pos, innerStart * 8) : pos;
      out.push({ field, bitStart: from, bits: Math.max(0, stop - from), value: `${Math.max(0, stop - from) / 8} Byte` });
      pos = stop;
      continue;
    }
    out.push({ field, bitStart: pos, bits: field.bits, value: show(field, bytes, pos, field.bits) });
    pos += field.bits;
  }
  return out;
}

/** Feste Kopflänge in Byte (ohne Optionen, Nutzdaten und Schicht 1). */
export const headerBytes = (format: FrameFormat) => format.fields.filter((f) => !f.phy && !f.framing && !f.payload && !f.trailer && !f.optional).reduce((n, f) => n + f.bits, 0) / 8;

// --- Verschachtelung (Kapselung) -----------------------------------------------------

export interface EncapsulationRow {
  osi: OsiLayer;
  protocol: string;
  /** Bytes des Kopfs, der Nutzdaten (= nächste Schicht) und des Anhangs (FCS). */
  header: number;
  payload: number;
  trailer: number;
  /** Nur Schicht 1: Präambel + SFD davor und Pause danach (nicht im Rahmen). */
  phyBefore?: number;
  phyAfter?: number;
  /** Letzte Schicht: die Bytes sind Anwendungsdaten. */
  data?: boolean;
}

/**
 * Von aussen nach innen: Jede Schicht trägt die nächste als Nutzdaten. Schicht 1 kommt zuerst
 * (bei Ethernet mit Präambel, SFD und Pause), dann die Schichten der Kodierung.
 */
export function encapsulation(dissection: { bytes: ArrayLike<number>; layers: readonly WireLayer[] }): EncapsulationRow[] {
  const layers = dissection.layers.filter((l) => l.length > 0).sort((a, b) => a.start - b.start || b.length - a.length);
  const rows: EncapsulationRow[] = [];
  const phy = dissection.layers.find((l) => l.osi === 1);
  if (phy) {
    const ethernet = phy.fields.some((f) => f.key === 'phy.wireBytes');
    rows.push({ osi: 1, protocol: phy.protocol, header: 0, payload: dissection.bytes.length, trailer: 0, ...(ethernet ? { phyBefore: 8, phyAfter: 12 } : {}) });
  }
  layers.forEach((layer, i) => {
    const inner = layers[i + 1];
    const contains = inner && inner.start >= layer.start && inner.start + inner.length <= layer.start + layer.length;
    if (inner && !contains && inner.start >= layer.start + layer.length) {
      // Kopf ohne eigene Länge (z.B. PDCP im Mobilfunk): Die folgenden Schichten sind die Nutzdaten.
      rows.push({ osi: layer.osi, protocol: layer.protocol, header: layer.length, payload: dissection.bytes.length - inner.start, trailer: 0 });
    } else if (contains) {
      rows.push({ osi: layer.osi, protocol: layer.protocol, header: inner.start - layer.start, payload: inner.length, trailer: layer.start + layer.length - inner.start - inner.length });
    } else {
      // Innerste Schicht: Anwendungsdaten, oder eine Steuermeldung (ARP, ICMP, STP), die nur aus Kopf besteht.
      const data = layer.osi >= 5 || layer.text !== undefined;
      const payloadField = layer.fields.find((f) => /\.(data|original)$/.test(f.key));
      const payload = data ? layer.length : payloadField ? layer.start + layer.length - payloadField.start : 0;
      rows.push({ osi: layer.osi, protocol: layer.protocol, header: layer.length - payload, payload, trailer: 0, ...(data ? { data: true } : {}) });
    }
  });
  return rows;
}
