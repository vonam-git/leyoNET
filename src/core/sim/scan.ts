import { formatIp, networkOf, parseIp } from '../net/ipv4';
import { formatIp6, networkOf6, parseIp6 } from '../net/ipv6';
import { DNS_PORT, type IcmpMessage, type Ipv4Packet, type TcpSegment, type UdpDatagram } from './frames';
import type { IcmpHost } from './apps';
import type { ArpEntry, SendError, SendOptions } from './ip';

/**
 * Netzscanner: Geräte finden (ARP im eigenen Netz, sonst ICMP- bzw. ICMPv6-Echo) und Ports prüfen.
 * TCP: SYN-Scan nach RFC 9293 (SYN/ACK = offen, RST = geschlossen, keine Antwort = gefiltert).
 * UDP (RFC 768): Antwort = offen, ICMP «Port unreachable» (RFC 792 Code 3, ICMPv6 Code 4 nach
 * RFC 4443) = geschlossen, anderes ICMP-Unerreichbar = gefiltert, keine Antwort = offen oder gefiltert
 * (UDP antwortet ohne Anwendungsdaten oft nicht). IPv4 und IPv6. Eigene Implementierung; Grenzen
 * halten Simulation und Paketliste klein.
 */
export const SCAN_MAX_HOSTS = 256;
export const SCAN_MAX_PORTS = 1024;
export const SCAN_MAX_PROBES = 4096;
/** Dienste, die es in leyoNET gibt oder die man kennen sollte. */
export const SCAN_DEFAULT_PORTS: readonly number[] = [21, 22, 23, 25, 53, 80, 110, 143, 179, 443, 587, 993, 3389, 8080];
/** UDP-Dienste, die es in leyoNET gibt oder die man kennen sollte. */
export const SCAN_DEFAULT_UDP_PORTS: readonly number[] = [53, 67, 69, 123, 161, 500, 514, 520, 5060, 5201];
const DISCOVERY_TIMEOUT = 2500;
const PORT_TIMEOUT = 1500;
const STEP = 20;
const FIRST_PORT = 40000;

/** Namen nach dem IANA-Register (RFC 6335). */
const UDP_SERVICES: Record<number, string> = { 53: 'domain', 67: 'dhcps', 68: 'dhcpc', 69: 'tftp', 123: 'ntp', 161: 'snmp', 500: 'isakmp', 514: 'syslog', 520: 'router', 5060: 'sip', 5201: 'iperf' };
const SERVICES: Record<number, string> = { 20: 'ftp-data', 21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'domain', 80: 'http', 110: 'pop3', 143: 'imap', 179: 'bgp', 443: 'https', 587: 'submission', 993: 'imaps', 995: 'pop3s', 3389: 'ms-wbt-server', 8080: 'http-alt' };
export const serviceName = (port: number, protocol: 'tcp' | 'udp' = 'tcp'): string => (protocol === 'udp' ? UDP_SERVICES[port] : SERVICES[port]) ?? '';

/** «openFiltered»: UDP ohne Antwort (offen oder gefiltert, wie «open|filtered» bei nmap). */
export type PortState = 'open' | 'closed' | 'filtered' | 'openFiltered';
export interface ScanPort {
  port: number;
  /** Fehlt bei älteren Zuständen: TCP. */
  protocol?: 'tcp' | 'udp';
  state: PortState;
  service: string;
}
export interface ScanHost {
  ip: string;
  /** Wie das Gerät gefunden wurde; «assumed»: Suche übersprungen. */
  via: 'icmp' | 'arp' | 'assumed' | 'self';
  mac?: string;
  /** TTL der Echo-Antwort und daraus geschätzte Anzahl Router. */
  ttl?: number;
  hops?: number;
  ports: ScanPort[];
}
export interface ScanState {
  target: string;
  status: 'running' | 'done' | 'stopped';
  phase: 'discovery' | 'ports';
  /** Erledigte und geplante Proben. */
  done: number;
  total: number;
  /** Alle abgefragten Adressen (für die Adresskarte). */
  addresses: string[];
  hosts: ScanHost[];
  startedAt: number;
  finishedAt?: number;
}
export interface ScanRequest {
  target: string;
  /** Nur Geräte suchen (wie «-sn»). */
  discoverOnly?: boolean;
  /** Suche überspringen und jede Adresse prüfen (wie «-Pn»). */
  skipDiscovery?: boolean;
  /** UDP-Ports statt TCP prüfen (wie «-sU»). */
  udp?: boolean;
  ports?: readonly number[];
}
export type ScanError = 'badTarget' | 'tooManyHosts' | 'badPorts' | 'tooManyPorts' | 'tooManyProbes' | 'noAddress';

/**
 * Adressen aus «192.168.1.0/24», «192.168.1.10-20», «10.0.0.1, 10.0.0.2» oder einer einzelnen Adresse;
 * IPv6 als einzelne Adresse, «2001:db8::1-20» (letzte Gruppe, hexadezimal) oder ab /120.
 */
export function parseTargets(text: string): { ips: string[] } | { error: 'badTarget' | 'tooManyHosts' } {
  const ips = new Set<string>();
  for (const part of text.split(/[\s,]+/).filter(Boolean)) {
    if (part.includes(':')) {
      const six = targets6(part);
      if ('error' in six) return six;
      for (const ip of six.ips) ips.add(ip);
      if (ips.size > SCAN_MAX_HOSTS) return { error: 'tooManyHosts' };
      continue;
    }
    const cidr = /^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/.exec(part);
    const range = /^(\d+\.\d+\.\d+\.)(\d{1,3})-(\d{1,3})$/.exec(part);
    if (cidr) {
      const ip = parseIp(cidr[1]!);
      const prefix = Number(cidr[2]);
      if (ip === null || prefix > 32) return { error: 'badTarget' };
      if (prefix < 24) return { error: 'tooManyHosts' };
      const size = 2 ** (32 - prefix);
      const base = networkOf(ip, prefix);
      // Netz- und Broadcastadresse gehören keinem Gerät (ausser bei /31 und /32).
      const [from, to] = prefix >= 31 ? [0, size - 1] : [1, size - 2];
      for (let i = from; i <= to; i++) ips.add(formatIp((base + i) >>> 0));
    } else if (range) {
      const [a, b] = [Number(range[2]), Number(range[3])];
      if (a > b || b > 255 || parseIp(range[1]! + a) === null) return { error: 'badTarget' };
      for (let i = a; i <= b; i++) ips.add(range[1]! + i);
    } else {
      const ip = parseIp(part);
      if (ip === null) return { error: 'badTarget' };
      ips.add(formatIp(ip));
    }
    if (ips.size > SCAN_MAX_HOSTS) return { error: 'tooManyHosts' };
  }
  return ips.size ? { ips: [...ips] } : { error: 'badTarget' };
}

/** IPv6-Ziele: Adresse, Bereich in der letzten Gruppe oder kleines Netz (ein /64 hat 2^64 Adressen: viel zu viele). */
function targets6(part: string): { ips: string[] } | { error: 'badTarget' | 'tooManyHosts' } {
  const cidr = /^([0-9a-f:.]+)\/(\d{1,3})$/i.exec(part);
  if (cidr) {
    const ip = parseIp6(cidr[1]!);
    const prefix = Number(cidr[2]);
    if (ip === null || prefix > 128) return { error: 'badTarget' };
    if (prefix < 120) return { error: 'tooManyHosts' };
    const base = networkOf6(ip, prefix);
    const size = 1n << BigInt(128 - prefix);
    // Die Adresse «…::» (alles null) ist die Subnet-Router-Anycast-Adresse (RFC 4291): mitprüfen.
    return { ips: Array.from({ length: Number(size) }, (_, i) => formatIp6(base + BigInt(i))) };
  }
  const range = /^([0-9a-f:]*:)([0-9a-f]{1,4})-([0-9a-f]{1,4})$/i.exec(part);
  if (range) {
    const [a, b] = [parseInt(range[2]!, 16), parseInt(range[3]!, 16)];
    if (a > b || parseIp6(range[1]! + range[2]!) === null) return { error: 'badTarget' };
    if (b - a >= SCAN_MAX_HOSTS) return { error: 'tooManyHosts' };
    return { ips: Array.from({ length: b - a + 1 }, (_, i) => formatIp6(parseIp6(range[1]! + (a + i).toString(16))!)) };
  }
  const ip = parseIp6(part);
  return ip === null ? { error: 'badTarget' } : { ips: [formatIp6(ip)] };
}

/** Ports aus «22,80,100-110». */
export function parsePorts(text: string): { ports: number[] } | { error: 'badPorts' | 'tooManyPorts' } {
  const ports = new Set<number>();
  for (const part of text.split(/[\s,]+/).filter(Boolean)) {
    const m = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(part);
    if (!m) return { error: 'badPorts' };
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (a < 1 || b > 65535 || a > b) return { error: 'badPorts' };
    if (b - a >= SCAN_MAX_PORTS) return { error: 'tooManyPorts' };
    for (let p = a; p <= b; p++) ports.add(p);
    if (ports.size > SCAN_MAX_PORTS) return { error: 'tooManyPorts' };
  }
  return ports.size ? { ports: [...ports].sort((x, y) => x - y) } : { error: 'badPorts' };
}

/** Router auf dem Weg: Startwerte 64 (leyoNET, Linux), 128 (Windows), 255 (Netzwerkgeräte). */
export const hopsFromTtl = (ttl: number): number => [64, 128, 255].find((s) => s >= ttl)! - ttl;

/** Was der Scanner vom Endgerät braucht. */
export interface ScanNode extends IcmpHost {
  sendIp(dst: string, payload: Ipv4Packet['payload'], options?: SendOptions, onError?: (e: SendError) => void): void;
  /** ICMPv6-Echo (Gerätesuche im IPv6-Netz). */
  sendEcho6(dst: string, echo: IcmpMessage, onError: () => void): void;
  arpEntries(): ArpEntry[];
  localIpFor(remote: string): string | null;
}

interface Probe {
  ip: string;
  port: number;
  udp: boolean;
}

const sameIp = (a: string, b: string) => a === b || (a.includes(':') && parseIp6(a) !== null && parseIp6(a) === parseIp6(b));

export class NetScan {
  #run: { id: number; state: ScanState; pending: Map<number, string>; probes: Map<number, Probe>; toConsole: boolean } | null = null;
  #runs = 0;

  constructor(private readonly node: ScanNode) {}

  get running(): boolean {
    return this.#run?.state.status === 'running';
  }

  state(): ScanState | undefined {
    const s = this.#run?.state;
    // Kopie, damit die Oberfläche eine unveränderliche Momentaufnahme erhält.
    return s && { ...s, hosts: s.hosts.map((h) => ({ ...h, ports: h.ports.map((p) => ({ ...p })) })) };
  }

  start(request: ScanRequest, toConsole = false): ScanError | null {
    const targets = parseTargets(request.target);
    if ('error' in targets) return targets.error;
    const ports = request.discoverOnly ? [] : [...(request.ports ?? (request.udp ? SCAN_DEFAULT_UDP_PORTS : SCAN_DEFAULT_PORTS))];
    this.#udp = !!request.udp;
    if (ports.length > SCAN_MAX_PORTS) return 'tooManyPorts';
    // Bei übersprungener Suche steht die Zahl der Proben fest; sonst prüft #ports() sie.
    if (request.skipDiscovery && targets.ips.length * ports.length > SCAN_MAX_PROBES) return 'tooManyProbes';
    if (targets.ips.every((ip) => this.node.localIpFor(ip) === null)) return 'noAddress';
    this.stop();
    const { ctx } = this.node;
    const run = {
      id: ++this.#runs,
      toConsole,
      pending: new Map<number, string>(),
      probes: new Map<number, Probe>(),
      state: { target: request.target.trim(), status: 'running', phase: 'discovery', done: 0, total: targets.ips.length, addresses: targets.ips, hosts: [], startedAt: ctx.now } as ScanState,
    };
    this.#run = run;
    if (toConsole) ctx.print('scan.start', { target: run.state.target, n: targets.ips.length });
    if (request.skipDiscovery) {
      for (const ip of targets.ips) run.state.hosts.push({ ip, via: 'assumed', ports: [] });
      this.#ports(ports);
      return null;
    }
    targets.ips.forEach((ip, i) =>
      ctx.schedule(i * STEP, () => {
        if (!this.#active(run.id)) return;
        run.pending.set(i, ip);
        const echo: IcmpMessage = { kind: 'icmp', type: 'echoRequest', id: this.#icmpId(run.id), seq: i, size: 0 };
        const settle = () => {
          if (this.#active(run.id) && run.pending.delete(i)) run.state.done++;
        };
        if (ip.includes(':')) this.node.sendEcho6(ip, echo, settle);
        else this.node.sendIp(ip, echo, {}, settle);
        ctx.schedule(DISCOVERY_TIMEOUT, () => {
          if (!this.#active(run.id) || !run.pending.has(i)) return;
          // Kein Echo, aber eine ARP-Antwort: Das Gerät ist da und beantwortet nur keinen Ping.
          const mac = this.#mac(ip);
          if (mac) this.#found({ ip, via: 'arp', mac, ports: [] });
          settle();
        });
      }),
    );
    ctx.schedule(targets.ips.length * STEP + DISCOVERY_TIMEOUT + 1, () => {
      if (this.#active(run.id)) this.#ports(ports);
    });
    return null;
  }

  stop() {
    const run = this.#run;
    if (!run || run.state.status !== 'running') return;
    run.state = { ...run.state, status: 'stopped', finishedAt: this.node.ctx.now };
    if (run.toConsole) this.node.ctx.print('scan.stopped');
  }

  onIcmp(packet: Ipv4Packet) {
    const run = this.#run;
    const icmp = packet.payload;
    if (!run || !this.running || icmp.kind !== 'icmp') return;
    // Antwort auf eine UDP-Probe: Port zu (Code «port») oder auf dem Weg gefiltert.
    if (icmp.type === 'destUnreachable' && icmp.original) {
      const probe = run.probes.get(icmp.original.id);
      if (probe?.udp && sameIp(probe.ip, icmp.original.dst) && probe.port === icmp.original.seq) this.#result(icmp.original.id, icmp.code === 'port' && sameIp(packet.src, probe.ip) ? 'closed' : 'filtered');
      return;
    }
    if (icmp.type !== 'echoReply' || icmp.id !== this.#icmpId(run.id)) return;
    const ip = run.pending.get(icmp.seq);
    if (ip === undefined || !sameIp(ip, packet.src)) return;
    run.pending.delete(icmp.seq);
    run.state.done++;
    const mac = this.#mac(ip);
    const self = this.node.localIpFor(ip) === ip;
    this.#found({ ip, via: self ? 'self' : 'icmp', ...(mac ? { mac } : {}), ...(self ? {} : { ttl: packet.ttl, hops: hopsFromTtl(packet.ttl) }), ports: [] });
  }

  /** Antwort auf ein eigenes SYN? Den Abbau (RST auf SYN/ACK) macht der TCP-Stack von selbst, weil er die Verbindung nicht kennt. */
  onTcp(packet: Ipv4Packet, segment: TcpSegment) {
    const run = this.#run;
    if (!run || !this.running) return;
    const probe = run.probes.get(segment.dstPort);
    if (!probe || probe.udp || !sameIp(probe.ip, packet.src) || probe.port !== segment.srcPort) return;
    if (segment.flags.includes('SYN') && segment.flags.includes('ACK')) this.#result(segment.dstPort, 'open');
    else if (segment.flags.includes('RST')) this.#result(segment.dstPort, 'closed');
  }

  /** Antwort auf eine UDP-Probe (z.B. DNS): Port offen. true = gehört zum Scan. */
  onUdp(packet: Ipv4Packet, datagram: UdpDatagram): boolean {
    const run = this.#run;
    if (!run || !this.running) return false;
    const probe = run.probes.get(datagram.dstPort);
    if (!probe?.udp || !sameIp(probe.ip, packet.src) || probe.port !== datagram.srcPort) return false;
    this.#result(datagram.dstPort, 'open');
    return true;
  }

  #udp = false;

  #active(id: number) {
    return this.#run?.id === id && this.#run.state.status === 'running';
  }

  #icmpId(run: number) {
    return 0x7000 + (run % 0x0f00);
  }

  #mac(ip: string) {
    return this.node.arpEntries().find((e) => e.ip === ip)?.mac;
  }

  #found(host: ScanHost) {
    const run = this.#run!;
    if (run.state.hosts.some((h) => h.ip === host.ip)) return;
    const key = (ip: string) => (ip.includes(':') ? Number(parseIp6(ip)! & 0xffffffffn) + 2 ** 33 : parseIp(ip)!);
    run.state.hosts = [...run.state.hosts, host].sort((a, b) => key(a.ip) - key(b.ip));
  }

  #ports(ports: readonly number[]) {
    const run = this.#run!;
    const { ctx } = this.node;
    const hosts = run.state.hosts;
    if (ports.length === 0 || hosts.length === 0) return this.#finish();
    const udp = this.#udp;
    const all = hosts.flatMap((h) => ports.map((port) => ({ ip: h.ip, port, udp })));
    const probes = all.slice(0, SCAN_MAX_PROBES);
    run.state = { ...run.state, phase: 'ports', done: 0, total: probes.length };
    probes.forEach((probe, i) => {
      const srcPort = FIRST_PORT + i;
      ctx.schedule(i * (STEP / 2), () => {
        if (!this.#active(run.id)) return;
        run.probes.set(srcPort, probe);
        // UDP: DNS bekommt eine echte Anfrage (sonst antwortet der Server nicht), sonst ein leeres Datagramm.
        const payload: Ipv4Packet['payload'] = probe.udp
          ? { kind: 'udp', srcPort, dstPort: probe.port, payload: probe.port === DNS_PORT ? { kind: 'dns', id: srcPort & 0xffff, response: false, question: { name: 'leyonet.example', type: 'A' }, answers: [], rcode: 'ok' } : { kind: 'data', seq: 0, bytes: 0 } }
          : { kind: 'tcp', srcPort, dstPort: probe.port, seq: run.id * 100_000 + i, ack: 0, flags: ['SYN'], data: '' };
        const send = () => this.node.sendIp(probe.ip, payload, {}, () => this.#active(run.id) && run.probes.has(srcPort) && this.#result(srcPort, 'filtered'));
        send();
        // Einmal wiederholen (verlorenes Paket), danach gilt der Port als gefiltert (UDP: offen oder gefiltert).
        ctx.schedule(PORT_TIMEOUT, () => {
          if (!this.#active(run.id) || !run.probes.has(srcPort)) return;
          send();
          ctx.schedule(PORT_TIMEOUT, () => this.#active(run.id) && run.probes.has(srcPort) && this.#result(srcPort, probe.udp ? 'openFiltered' : 'filtered'));
        });
      });
    });
  }

  #result(srcPort: number, state: PortState) {
    const run = this.#run!;
    const probe = run.probes.get(srcPort);
    if (!probe) return;
    run.probes.delete(srcPort);
    run.state.done++;
    const host = run.state.hosts.find((h) => h.ip === probe.ip);
    host?.ports.push({ port: probe.port, ...(probe.udp ? { protocol: 'udp' as const } : {}), state, service: serviceName(probe.port, probe.udp ? 'udp' : 'tcp') });
    host?.ports.sort((a, b) => a.port - b.port);
    if (run.state.done >= run.state.total) this.#finish();
  }

  #finish() {
    const run = this.#run!;
    const { ctx } = this.node;
    run.state = { ...run.state, status: 'done', done: run.state.total, finishedAt: ctx.now };
    if (!run.toConsole) return;
    for (const h of run.state.hosts) {
      ctx.print('scan.host', { ip: h.ip });
      if (h.mac) ctx.print('scan.mac', { mac: h.mac });
      if (h.ttl !== undefined) ctx.print('scan.ttl', { ttl: h.ttl, hops: h.hops ?? 0 });
      const open = h.ports.filter((p) => p.state === 'open' || p.state === 'openFiltered');
      for (const p of open) ctx.print(p.state === 'open' ? 'scan.port' : 'scan.portMaybe', { port: `${p.port}/${p.protocol ?? 'tcp'}`.padEnd(9), service: p.service });
      for (const state of ['closed', 'filtered'] as const) {
        const n = h.ports.filter((p) => p.state === state).length;
        if (n) ctx.print(`scan.${state}`, { n });
      }
    }
    ctx.print('scan.done', { hosts: run.state.hosts.length, total: run.state.addresses.length, seconds: ((ctx.now - run.state.startedAt) / 1000).toFixed(1) });
  }
}
