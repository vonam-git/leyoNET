import { BROADCAST_MAC, TCP_APPS, asIpv4View, type TcpSegment, type UdpDatagram, decodeBgp, getDevice, normalizeIp6, protocolOf, type EthernetFrame, type Ipv4Packet, type Ipv6Packet, type PacketLogEntry, type Topology } from '../core';
import { t } from '../i18n';
import { interfaceLabel } from './labels';

/**
 * Paketliste wie in einem Analysator: Zeilen, Kurzbeschreibung und ein
 * kleiner Anzeigefilter (ähnlich Wireshark, aber einfacher).
 */
export interface PacketRow {
  id: number;
  time: string;
  route: string;
  protocol: string;
  source: string;
  destination: string;
  info: string;
  lost: boolean;
}

export { protocolOf };

/** CSS-Klasse für die Protokollfarbe, z.B. «PPP LCP» → «ppp-lcp», «802.11» → «802-11». */
export const protocolClass = (protocol: string) => protocol.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function portLabel(port: number): string {
  const names: Record<number, string> = { 53: 'DNS', 67: 'DHCP-Server', 68: 'DHCP-Client', 520: 'RIP', 521: 'RIPng', ...TCP_APPS };
  return names[port] ? `${port} (${names[port]})` : String(port);
}

function endpointLabel(topology: Topology, device: string, iface: number): string {
  const d = getDevice(topology, device);
  return d ? `${d.name} (${interfaceLabel(d, iface)})` : '?';
}

const hex = (n: number) => `0x${n.toString(16).padStart(8, '0')}`;

/** IPv4-Paket eines Rahmens, auch getunnelt in IPv6 (DS-Lite). */
export function ipv4Of(frame: EthernetFrame): Ipv4Packet | null {
  const p = frame.payload;
  if (p.kind === 'ipv4') return p;
  if (p.kind === 'ipv6' && p.payload.kind === 'ipv4') return p.payload;
  return null;
}

/** ICMPv6 und DHCPv6 in der Spalte «Info». */
function infoOf6(frame: EthernetFrame, p: Ipv6Packet): string {
  const inner = p.payload;
  if (inner.kind === 'ipv4') return `${t('packets.dslite', { src: p.src, dst: p.dst })} ${infoOf({ ...frame, payload: inner })}`;
  if (inner.kind === 'udp' && inner.payload.kind === 'dhcpv6') {
    const m = inner.payload;
    return t(`packets.dhcp6.${m.type}`, { address: m.address ?? '', xid: `0x${m.xid.toString(16).padStart(6, '0')}` });
  }
  // TCP und DNS über IPv6: dieselbe Beschreibung wie über IPv4.
  if (inner.kind === 'udp' || inner.kind === 'tcp' || inner.kind === 'ospf') return infoOf({ ...frame, payload: asIpv4View(p, inner) });
  switch (inner.type) {
    case 'neighborSolicitation':
      return p.src === '::' ? t('packets.icmp6.dad', { target: inner.target ?? '' }) : t('packets.icmp6.neighborSolicitation', { target: inner.target ?? '' });
    case 'neighborAdvertisement':
      return t('packets.icmp6.neighborAdvertisement', { target: inner.target ?? '', mac: inner.linkAddr ?? '', router: inner.flags?.router ? ' (Router)' : '' });
    case 'routerSolicitation':
      return t('packets.icmp6.routerSolicitation');
    case 'routerAdvertisement':
      return t(inner.flags?.managed ? 'packets.icmp6.routerAdvertisementManaged' : 'packets.icmp6.routerAdvertisement', { prefix: inner.prefix ? `${inner.prefix.network}/${inner.prefix.length}` : '–' });
    default:
      return t(`packets.icmp.${inner.type}`, { seq: inner.seq, ttl: p.hopLimit, target: inner.original?.dst ?? '', what: t(`packets.unreachable.${inner.code ?? 'net'}`) });
  }
}

/** Kurzbeschreibung eines Rahmens für die Spalte «Info». */
export function infoOf(frame: EthernetFrame): string {
  const p = frame.payload;
  const tag = frame.vlan !== undefined ? `[VLAN ${frame.vlan}] ` : '';
  if (p.kind === 'arp') {
    const gratuitous = p.op === 'request' && p.senderIp === p.targetIp;
    return tag + (gratuitous ? t('packets.arp.gratuitous', { ...p }) : t(`packets.arp.${p.op}`, { ...p }));
  }
  if (p.kind === 'stp') return t('packets.stp', { root: p.rootId, cost: p.cost, bridge: p.bridgeId });
  if (p.kind === 'lacp') return t('packets.lacp', { system: p.actorSystem.toLowerCase(), key: p.actorKey, port: p.actorPort, partner: p.partnerSystem === '00:00:00:00:00:00' ? '–' : p.partnerSystem.toLowerCase() });
  if (p.kind === 'ppp') return `${p.protocol.toUpperCase()} ${p.code}${p.ip ? ` ${p.ip}` : ''}${p.magic !== undefined ? ` magic=${hex(p.magic)}` : ''}`;
  if (p.kind === 'link') {
    const fields = Object.entries(p.fields ?? {})
      .slice(0, 2)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    return `${p.message}${fields ? ` – ${fields}` : ''}`;
  }
  if (p.kind === 'ipv6') return (frame.access ? `[${frame.access.toUpperCase()}] ` : '') + infoOf6(frame, p);
  const inner = p.payload;
  const access = frame.access ? `[${frame.access.toUpperCase()}] ` : '';
  if (inner.kind === 'ospf') {
    const detail =
      inner.type === 'hello'
        ? t('packets.ospf.hello', { neighbors: inner.hello?.neighbors.join(', ') || '–' })
        : inner.type === 'lsu'
          ? t('packets.ospf.lsu', { n: inner.lsas?.length ?? 0 })
          : inner.type === 'dbd'
            ? t('packets.ospf.dbd', { n: inner.headers?.length ?? 0 })
            : inner.type.toUpperCase();
    return `${access}OSPF ${inner.routerId} · ${detail}`;
  }
  if (inner.kind === 'icmp') {
    return (
      access +
      t(`packets.icmp.${inner.type}`, {
        seq: inner.seq,
        ttl: p.ttl,
        target: inner.original?.dst ?? '',
        what: t(`packets.unreachable.${inner.code ?? 'net'}`),
      })
    );
  }
  if (inner.kind === 'tcp') {
    const flags = `[${inner.flags.join(', ')}]`;
    const numbers = t('packets.tcp.numbers', { seq: inner.seq, ack: inner.ack, len: inner.data.length });
    const app = protocolOf(frame);
    if (app === 'BGP') {
      const messages = decodeBgp(inner.data);
      return `${access}${messages.map((m) => (m.type === 'UPDATE' ? `UPDATE ${m.nlri.join(', ')}${m.withdrawn.length ? ` −${m.withdrawn.join(', ')}` : ''}` : m.type === 'OPEN' ? `OPEN AS ${m.asn}` : m.type === 'NOTIFICATION' ? `NOTIFICATION ${m.code}` : m.type)).join(' + ') || t('packets.tcp.continuation')} ${numbers}`;
    }
    if (app === 'TCP') return `${access}${portLabel(inner.srcPort)} → ${portLabel(inner.dstPort)} ${flags} ${numbers}`;
    if (app === 'SSH' && !inner.data.startsWith('SSH-')) return `${access}${t('packets.ssh.encrypted', { len: inner.data.length })} ${numbers}`;
    const first = (inner.data.split('\r\n')[0] ?? '').slice(0, 80);
    const continuation = app === 'HTTP' && !/^(GET|POST|HEAD|HTTP\/)/.test(first);
    return `${access}${continuation ? t('packets.tcp.continuation') : first} ${numbers}`;
  }
  if (inner.kind === 'esp') return access + t('packets.esp', { spi: `0x${inner.spi.toString(16).padStart(8, '0')}`, seq: inner.seq });
  const msg = inner.payload;
  if (msg.kind === 'ike') {
    const what = msg.notify ? t(`packets.ike.${msg.notify}`) : t(`packets.ike.${msg.exchange}.${msg.response ? 'response' : 'request'}`);
    return `${access}IKEv2 ${msg.exchange} · ${what}`;
  }
  if (msg.kind === 'dns') {
    if (!msg.response) return access + t('packets.dns.query', { type: msg.question.type, name: msg.question.name });
    if (msg.rcode === 'nxdomain') return access + t('packets.dns.nxdomain', { name: msg.question.name });
    if (msg.rcode === 'servfail') return access + t('packets.dns.servfail', { name: msg.question.name });
    if (!msg.answers.some((a) => a.type === msg.question.type)) return access + t('packets.dns.nodata', { type: msg.question.type, name: msg.question.name });
    const value = msg.answers.map((a) => (a.type === 'CNAME' && msg.question.type !== 'CNAME' ? `${a.value} (CNAME)` : a.type === 'MX' ? `${a.priority ?? 10} ${a.value}` : a.value)).join(', ');
    return access + t('packets.dns.answer', { type: msg.question.type, name: msg.question.name, value });
  }
  if (msg.kind === 'rip') {
    return access + t(msg.command === 'request' ? 'packets.rip.request' : 'packets.rip.response', { routes: msg.entries.map((e) => `${e.network}/${e.metric}`).join(', ') });
  }
  if (msg.kind === 'ripng') {
    return access + t(msg.command === 'request' ? 'packets.rip.request' : 'packets.rip.response', { routes: msg.entries.map((e) => `${e.prefix}/${e.length} (${e.metric})`).join(', ') });
  }
  if (msg.kind === 'dhcpv6') return access + t(`packets.dhcp6.${msg.type}`, { address: msg.address ?? '', xid: hex(msg.xid) });
  return access + t(`packets.dhcp.${msg.op}`, { ip: msg.yourIp ?? msg.requestedIp ?? '', xid: hex(msg.xid) });
}

/** Absender und Empfänger: bei IP die Adressen, sonst MAC-Adressen bzw. Gerätenamen. */
function addresses(topology: Topology, entry: PacketLogEntry): [string, string] {
  const frame = entry.frame;
  const p = frame.payload;
  if (p.kind === 'ipv4') return [p.src, p.dst];
  if (p.kind === 'ipv6') return [p.src, p.dst];
  if (frame.l2 || p.kind === 'link' || !frame.src) {
    const name = (id: string) => getDevice(topology, id)?.name ?? id;
    return [name(entry.from.device), name(entry.to.device)];
  }
  return [frame.src, frame.dst === BROADCAST_MAC ? t('packets.broadcast') : frame.dst];
}

/** Übersetzt einen Logeintrag in eine Tabellenzeile wie in einem Paketanalysator. */
export function toRow(topology: Topology, entry: PacketLogEntry): PacketRow {
  const frame = entry.frame;
  const [source, destination] = addresses(topology, entry);
  const text = frame.payload.kind === 'ipv4' && frame.vlan !== undefined ? `[VLAN ${frame.vlan}] ${infoOf(frame)}` : infoOf(frame);
  return {
    id: entry.id,
    time: (entry.sent / 1000).toFixed(3),
    route: `${endpointLabel(topology, entry.from.device, entry.from.iface)} → ${endpointLabel(topology, entry.to.device, entry.to.iface)}`,
    protocol: protocolOf(frame),
    source,
    destination,
    info: entry.status === 'lost' ? `${text} – ${t(`packets.lost.${entry.lostBecause ?? 'removed'}`)}` : text,
    lost: entry.status === 'lost',
  };
}

// --- Anzeigefilter ---------------------------------------------------------------

type Predicate = (entry: PacketLogEntry, topology: Topology) => boolean;

export interface FilterResult {
  ok: boolean;
  test?: Predicate;
  error?: string;
}

const PROTOCOL_WORDS: Record<string, (proto: string, frame: EthernetFrame) => boolean> = {
  arp: (p) => p === 'ARP',
  icmp: (p) => p === 'ICMP',
  ip: (_p, f) => !!ipv4Of(f),
  ipv6: (_p, f) => f.payload.kind === 'ipv6',
  icmpv6: (p) => p === 'ICMPv6',
  ndp: (_p, f) => f.payload.kind === 'ipv6' && f.payload.payload.kind === 'icmpv6' && /^(router|neighbor)/.test(f.payload.payload.type),
  dhcpv6: (p) => p === 'DHCPv6',
  dslite: (_p, f) => f.payload.kind === 'ipv6' && f.payload.payload.kind === 'ipv4',
  esp: (p) => p === 'ESP',
  ike: (p) => p === 'IKEv2',
  isakmp: (p) => p === 'IKEv2',
  vpn: (p) => p === 'ESP' || p === 'IKEv2',
  tcp: (_p, f) => transportOf(f)?.kind === 'tcp',
  udp: (_p, f) => transportOf(f)?.kind === 'udp',
  dhcp: (p) => p === 'DHCP',
  dns: (p) => p === 'DNS',
  http: (p) => p === 'HTTP',
  smtp: (p) => p === 'SMTP',
  pop: (p) => p === 'POP3',
  pop3: (p) => p === 'POP3',
  imap: (p) => p === 'IMAP',
  mail: (p) => p === 'SMTP' || p === 'POP3' || p === 'IMAP',
  ssh: (p) => p === 'SSH',
  bgp: (p) => p === 'BGP',
  ospf: (p) => p === 'OSPF' || p === 'OSPFv3',
  ospfv3: (p) => p === 'OSPFv3',
  ospf6: (p) => p === 'OSPFv3',
  rip: (p) => p === 'RIP' || p === 'RIPng',
  ripng: (p) => p === 'RIPng',
  stp: (p) => p === 'STP',
  ppp: (p) => p.startsWith('PPP'),
  wlan: (p) => p === '802.11',
  wifi: (p) => p === '802.11',
  docsis: (p, f) => p === 'DOCSIS' || f.access === 'docsis',
  gpon: (p, f) => p === 'GPON' || f.access === 'gpon',
  dsl: (p, f) => p === 'DSL' || p === 'PPPoE' || f.access === 'adsl' || f.access === 'vdsl',
  pppoe: (p, f) => p === 'PPPoE' || f.access === 'adsl' || f.access === 'vdsl',
  lte: (p, f) => p === 'LTE' || f.access === 'lte',
  vlan: (_p, f) => f.vlan !== undefined,
  broadcast: (_p, f) => f.dst === BROADCAST_MAC || (f.payload.kind === 'ipv4' && f.payload.dst === '255.255.255.255'),
};

/** TCP- oder UDP-Teil eines Rahmens, über IPv4, IPv6 oder getunnelt. */
function transportOf(frame: EthernetFrame): TcpSegment | UdpDatagram | null {
  const p = frame.payload;
  const inner = ipv4Of(frame)?.payload ?? (p.kind === 'ipv6' ? p.payload : null);
  return inner && (inner.kind === 'tcp' || inner.kind === 'udp') ? inner : null;
}

function ports(frame: EthernetFrame): number[] {
  const inner = transportOf(frame);
  return inner ? [inner.srcPort, inner.dstPort] : [];
}

/**
 * Filter lesen: Protokollnamen (arp, dhcp, http …), Vergleiche
 * (ip.addr == 10.0.0.1, ip.src, ip.dst, eth.addr, port == 80, tcp.port, udp.port,
 * vlan == 10), «host PC1» (Gerätename), «lost», verknüpft mit and/or/not
 * (auch &&, ||, !) und Klammern.
 */
export function parseFilter(text: string): FilterResult {
  const tokens = text.match(/\(|\)|==|!=|&&|\|\||!|[^\s()=!&|]+/g) ?? [];
  if (tokens.length === 0) return { ok: true };
  let i = 0;
  const peek = () => tokens[i]?.toLowerCase();
  const next = () => tokens[i++];

  const fail = (message: string): never => {
    throw new Error(message);
  };

  function primary(): Predicate {
    const token = next();
    if (token === undefined) return fail(t('filter.error.end'));
    const lower = token.toLowerCase();
    if (lower === '(') {
      const inner = or();
      if (next() !== ')') fail(t('filter.error.paren'));
      return inner;
    }
    if (lower === '!' || lower === 'not') {
      const inner = primary();
      return (e, topo) => !inner(e, topo);
    }
    if (lower === 'lost') return (e) => e.status === 'lost';
    if (lower === 'host') {
      const name = next();
      if (!name) return fail(t('filter.error.value', { field: 'host' }));
      const wanted = name.toLowerCase();
      return (e, topo) => [e.from.device, e.to.device].some((id) => getDevice(topo, id)?.name.toLowerCase().replace(/\s+/g, '') === wanted.replace(/\s+/g, ''));
    }
    const field = lower;
    if (peek() === '==' || peek() === '!=') {
      const negate = next() === '!=';
      const value = next();
      if (value === undefined) return fail(t('filter.error.value', { field }));
      const v = value.toLowerCase();
      const compare = (test: Predicate): Predicate => (negate ? (e, topo) => !test(e, topo) : test);
      const ip = (e: PacketLogEntry) => ipv4Of(e.frame);
      const ip6 = (e: PacketLogEntry) => (e.frame.payload.kind === 'ipv6' ? e.frame.payload : null);
      const same6 = (a: string | undefined) => !!a && normalizeIp6(a) === normalizeIp6(value);
      switch (field) {
        case 'ip.addr':
          return compare((e) => !!ip(e) && (ip(e)!.src === value || ip(e)!.dst === value));
        case 'ip.src':
          return compare((e) => ip(e)?.src === value);
        case 'ip.dst':
          return compare((e) => ip(e)?.dst === value);
        case 'ipv6.addr':
          return compare((e) => same6(ip6(e)?.src) || same6(ip6(e)?.dst));
        case 'ipv6.src':
          return compare((e) => same6(ip6(e)?.src));
        case 'ipv6.dst':
          return compare((e) => same6(ip6(e)?.dst));
        case 'eth.addr':
          return compare((e) => e.frame.src.toLowerCase() === v || e.frame.dst.toLowerCase() === v);
        case 'eth.src':
          return compare((e) => e.frame.src.toLowerCase() === v);
        case 'eth.dst':
          return compare((e) => e.frame.dst.toLowerCase() === v);
        case 'port':
        case 'tcp.port':
        case 'udp.port': {
          const n = Number(value);
          const kind = field.split('.')[0];
          return compare((e) => {
            const p = transportOf(e.frame);
            if (!p) return false;
            if (kind !== 'port' && p.kind !== kind) return false;
            return ports(e.frame).includes(n);
          });
        }
        case 'vlan':
          return compare((e) => e.frame.vlan === Number(value));
        case 'proto':
        case 'protocol':
          return compare((e) => protocolOf(e.frame).toLowerCase() === v);
        default:
          return fail(t('filter.error.field', { field }));
      }
    }
    const word = PROTOCOL_WORDS[lower] ?? (lower === '802.11' ? PROTOCOL_WORDS.wlan : undefined);
    if (!word) return fail(t('filter.error.unknown', { word: token }));
    return (e) => word(protocolOf(e.frame), e.frame);
  }

  function and(): Predicate {
    let left = primary();
    while (peek() === 'and' || peek() === '&&') {
      next();
      const right = primary();
      const l = left;
      left = (e, topo) => l(e, topo) && right(e, topo);
    }
    return left;
  }

  function or(): Predicate {
    let left = and();
    while (peek() === 'or' || peek() === '||') {
      next();
      const right = and();
      const l = left;
      left = (e, topo) => l(e, topo) || right(e, topo);
    }
    return left;
  }

  try {
    const test = or();
    if (i < tokens.length) fail(t('filter.error.extra', { word: tokens[i] ?? '' }));
    return { ok: true, test };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
