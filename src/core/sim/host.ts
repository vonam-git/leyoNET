import { cableAt, deviceSeq, getDevice, otherEnd } from '../model/topology';
import { toLink, wlanRun, wlanStepIndex, wlanSteps, type WlanStep } from './wlan';
import type { EthernetFrame } from './frames';
import type { Device } from '../model/types';
import { formatIp, parseIp } from '../net/ipv4';
import { lookupRoute } from '../net/routing';
import { PingRun, TracerouteRun, icmpView, type IcmpApp, type IcmpHost, type PingOptions } from './apps';
import { formatIp6, parseIp6 } from '../net/ipv6';
import type { Ip6State } from './ip6';
import type { FirewallState } from './firewall';
import { DhcpClient, DhcpServer, type LeaseRecord } from './dhcp';
import { DnsResolver, DnsServer, type DnsCacheEntry } from './dns';
import { DHCP_CLIENT_PORT, DHCP_SERVER_PORT, DNS_PORT, type Ipv4Packet, type Ipv6Packet, type TcpSegment, type UdpDatagram } from './frames';
import { HttpClient, HttpServer, type BrowserState } from './http';
import { IpNode, asIpv4View, type ArpEntry } from './ip';
import { MailClient, MailServer, type MailClientState } from './mail';
import { AttackRun, type AttackState } from './attack';
import { NetScan, type ScanState } from './scan';
import type { NodeContext } from './simulation';
import { SSH_PORT, SshClient, seal, unseal } from './ssh';
import { TcpStack, type TcpState } from './tcp';
import { Iperf, SipPhone, SipServer, type VoipHost, type VoipState } from './voip';

/** Wirksame Adresskonfiguration, wie sie "ipconfig" zeigt. */
export interface AddressState {
  mode: 'static' | 'dhcp';
  ip?: string;
  mask?: string;
  gateway?: string;
  dns?: string;
  /** Nur bei DHCP. */
  server?: string;
  expires?: number;
  dhcpState?: string;
}

export interface ConnectionInfo {
  local: string;
  remote: string;
  state: TcpState;
}

export interface HostState {
  arp: ArpEntry[];
  firewall?: FirewallState;
  ipv6?: Ip6State;
  address: AddressState;
  dhcpLeases?: LeaseRecord[];
  dnsCache: DnsCacheEntry[];
  connections: ConnectionInfo[];
  /** Dauerping oder Ping läuft noch (Stopp mit Strg+C). */
  pinging?: boolean;
  /** Angreifer: laufender Angriff. */
  attack?: AttackState;
  /** Wächter: auffällige Ereignisse, neueste zuletzt. */
  alerts?: Alert[];
  /** Netzscanner: laufende oder letzte Suche. */
  scan?: ScanState;
  browser?: BrowserState;
  mail: MailClientState;
  mailboxes?: { user: string; count: number }[];
  /** IP-Telefon: Anmeldung und Gespräch. */
  voip?: VoipState;
  /** Telefonanlage: angemeldete Rufnummern. */
  sipRegistrations?: { number: string; address: string; nat?: boolean }[];
}

/** Auffälliges Ereignis, das der Wächter eines Endgeräts meldet. */
export interface Alert {
  time: number;
  kind: 'arpChange' | 'arpBlocked' | 'synFlood' | 'portScan';
  params: Record<string, string | number>;
  /** So oft in Folge. */
  count: number;
}
const MAX_ALERTS = 30;
/** Ab so vielen verschiedenen Ports eines Absenders in 10 s meldet der Wächter einen Portscan. */
const SCAN_ALERT_PORTS = 5;

type Command = 'ping' | 'tracert';

interface WlanSession {
  steps: WlanStep[];
  done: boolean;
  onDone: () => void;
}

/** Endgerät: IP-Stack plus Anwendungen und Dienste. */
export class HostNode extends IpNode {
  readonly dhcpClient: DhcpClient;
  readonly dhcpServer: DhcpServer;
  readonly resolver: DnsResolver;
  readonly dnsService: DnsServer;
  readonly tcp: TcpStack;
  readonly browser: HttpClient;
  readonly mailServer: MailServer;
  readonly mail: MailClient;
  readonly ssh: SshClient;
  readonly phone: SipPhone;
  readonly pbx: SipServer;
  readonly iperf: Iperf;
  readonly scanner = new NetScan(this);
  readonly attacker = new AttackRun(this, (target, user, password, done) => this.#trySsh(target, user, password, done));
  #alerts: Alert[] = [];
  #synPorts = new Map<string, { since: number; ports: Set<number> }>();
  #ping: PingRun | null = null;
  #trace: IcmpApp | null = null;
  #icmpId = 0;

  constructor(ctx: NodeContext) {
    super(ctx);
    const seq = deviceSeq(ctx.device()?.id ?? 'd0');
    this.dhcpClient = new DhcpClient(this, seq);
    this.dhcpServer = new DhcpServer(this);
    this.resolver = new DnsResolver(this);
    this.dnsService = new DnsServer(this);
    this.tcp = new TcpStack(this, seq);
    this.browser = new HttpClient(this);
    new HttpServer(this);
    this.tcp.onBacklog = (halfOpen, port) => this.#alert('synFlood', { port, halfOpen });
    this.mailServer = new MailServer(this);
    this.mail = new MailClient(this);
    const voipHost: VoipHost = {
      ctx,
      sendIp: (dst, payload, options, onError) => this.sendIp(dst, payload, options, onError ? (e) => onError(String(e)) : undefined),
      ownIp: () => this.effectiveDevice()?.interfaces[0]?.ip,
    };
    this.phone = new SipPhone(voipHost, seq);
    this.pbx = new SipServer(voipHost);
    this.iperf = new Iperf(voipHost);
    this.ssh = new SshClient(this.tcp, ctx, (name, done) => this.resolver.resolveAddress(name, (r) => done(r.ok ? r.ip : null)));
  }

  /** Im DHCP-Modus gelten Adresse, Gateway und DNS aus der Lease (oder gar keine). */
  protected override effectiveDevice(): Device | undefined {
    const device = this.ctx.device();
    if (!device?.dhcp) return device;
    const { gateway: _g, dns: _d, ...rest } = device;
    const [first, ...others] = device.interfaces;
    if (!first) return device;
    const lease = this.dhcpClient.lease;
    const base = { index: first.index, mac: first.mac };
    if (!lease) return { ...rest, interfaces: [base, ...others] };
    return {
      ...rest,
      interfaces: [{ ...base, ip: lease.ip, mask: lease.mask }, ...others],
      ...(lease.gateway ? { gateway: lease.gateway } : {}),
      ...(lease.dns ? { dns: lease.dns } : {}),
    };
  }

  /** DNS-Server über IPv4; im Modus «nur IPv6» gibt es keinen. */
  dnsServer(): string | undefined {
    return this.ipv4On() ? this.effectiveDevice()?.dns : undefined;
  }

  /** DNS-Server über IPv6: fest eingetragen oder aus dem Router Advertisement (RDNSS) bzw. DHCPv6. */
  dnsServer6(): string | undefined {
    const device = this.ctx.device();
    if (!device || !this.v6.enabled()) return undefined;
    return device.ipv6Auto ? this.v6.state()?.dns : device.dns6;
  }

  /**
   * Welche Adressen ein Name liefern soll: nur IPv4 → A; nur IPv6 → AAAA;
   * Dual Stack mit globaler IPv6-Adresse → zuerst AAAA, dann A (RFC 6724, IPv6 bevorzugt).
   */
  addressTypes(): ('A' | 'AAAA')[] {
    if (!this.v6.enabled()) return ['A'];
    if (!this.ipv4On()) return ['AAAA'];
    const global = this.v6.state()?.addresses.some((a) => a.origin !== 'link-local');
    return global ? ['AAAA', 'A'] : ['A'];
  }

  protected override onIcmp(packet: Ipv4Packet) {
    this.#ping?.onIcmp(packet);
    this.#trace?.onIcmp(packet);
    this.scanner.onIcmp(packet);
  }

  /** ICMPv6 für Ping und Traceroute: dieselben Anwendungen, Hop Limit statt TTL. */
  protected override onIcmp6(packet: Ipv6Packet) {
    const view = icmpView(packet);
    if (!view) return;
    this.#ping?.onIcmp(view);
    this.#trace?.onIcmp(view);
  }

  /** Anwendungs-Sicht auf den IPv6-Stack: Ping/Traceroute senden ICMPv6-Echos. */
  readonly #icmp6: IcmpHost = {
    ctx: this.ctx,
    sendIp: (dst, payload, options, onError) => {
      if (payload.kind !== 'icmp') return;
      this.v6.send(dst, { ...payload, kind: 'icmpv6' }, options?.ttl !== undefined ? { hopLimit: options.ttl } : {}, onError);
    },
  };

  /** Ping/Traceroute zu einer IPv6-Adresse: Was lässt sich ohne Netzverkehr feststellen? */
  #reachable6(target: bigint): boolean {
    if (this.v6.isOwn(target)) return true;
    if (!this.v6.enabled()) {
      this.ctx.print('ping.noIpv6');
      return false;
    }
    const iface = this.v6.interfaces()[0];
    if (!iface || !this.ctx.isConnected(iface.index)) {
      this.ctx.print('ping.noLink');
      return false;
    }
    if (!this.v6.hasRoute(target)) {
      this.ctx.print(iface.addresses.length < 2 ? 'ping.noAddress6' : 'ping.noRoute', { target: formatIp6(target) });
      return false;
    }
    return true;
  }

  protected override onUdp(packet: Ipv4Packet, datagram: UdpDatagram, index: number, srcMac: string) {
    const msg = datagram.payload;
    if (msg.kind === 'dns') {
      if (datagram.dstPort === DNS_PORT) {
        // Antwort eines Weiterleiters an diesen DNS-Server, sonst eine Anfrage.
        if (msg.response) this.dnsService.onForwardResponse(msg);
        else this.dnsService.onQuery(packet, datagram);
      } else if (datagram.srcPort === DNS_PORT) this.resolver.onResponse(msg);
      return;
    }
    if (msg.kind === 'sip') {
      const device = this.ctx.device();
      // Anfragen an die Anlage (REGISTER, Rufnummer bei dieser Adresse) und Nachrichten laufender Gespräche.
      if (device?.sipServer && this.pbx.handles(packet, msg)) return this.pbx.onSip(packet, datagram, msg);
      if (device?.type === 'ipphone') this.phone.onSip(packet, msg);
      return;
    }
    if (msg.kind === 'rtp') {
      if (this.ctx.device()?.sipServer && datagram.dstPort >= 20000) return this.pbx.onRtp(packet, datagram, msg);
      if (this.ctx.device()?.type === 'ipphone') this.phone.onRtp(msg);
      return;
    }
    if (msg.kind !== 'dhcp') return;
    if (datagram.dstPort === DHCP_CLIENT_PORT) {
      this.dhcpClient.onMessage(msg);
      // Den Server kennen wir aus seinem Ack; Erneuern und Freigeben brauchen so kein ARP.
      // Kam die Antwort über ein Relay, steht der Server in einem anderen Netz: dann nichts lernen.
      if (msg.op === 'ack' && msg.serverIp && !msg.giaddr && this.dhcpClient.lease) this.learnNeighbor(msg.serverIp, srcMac, index);
    } else if (datagram.dstPort === DHCP_SERVER_PORT) {
      this.dhcpServer.onMessage(packet, msg);
    }
  }

  protected override onTcp(packet: Ipv4Packet, segment: TcpSegment) {
    this.#watchSyn(packet, segment);
    this.scanner.onTcp(packet, segment);
    this.tcp.receive(packet.src, packet.dst, segment);
  }

  /** DNS über IPv6 (Anfragen an den eigenen Server und Antworten an den Resolver). */
  protected override onUdp6(packet: Ipv6Packet, datagram: UdpDatagram, index: number) {
    if (datagram.payload.kind === 'dns') this.onUdp(asIpv4View(packet, datagram), datagram, index, '');
  }

  #wlan: WlanSession | null = null;

  boot() {
    if (this.#wirelessPeer() && !this.#wlan) this.wlanConnect(false, () => this.#start());
    else this.#start();
  }

  // --- Wächter und Angreifer ------------------------------------------------------------

  #alert(kind: Alert['kind'], params: Alert['params']) {
    const last = this.#alerts.at(-1);
    const { halfOpen: _a, ports: _b, ...id } = params;
    const { halfOpen: _c, ports: _d, ...lastId } = last?.params ?? {};
    if (last?.kind === kind && JSON.stringify(lastId) === JSON.stringify(id)) this.#alerts[this.#alerts.length - 1] = { ...last, params, count: last.count + 1 };
    else this.#alerts = [...this.#alerts, { time: this.ctx.now, kind, params, count: 1 }].slice(-MAX_ALERTS);
  }

  protected override onArpChange(ip: string, from: string, to: string, blocked: boolean) {
    this.#alert(blocked ? 'arpBlocked' : 'arpChange', { ip, from, to });
  }

  /** Viele verschiedene Ports vom selben Absender: Portscan. */
  #watchSyn(packet: Ipv4Packet, segment: TcpSegment) {
    if (!segment.flags.includes('SYN') || segment.flags.includes('ACK')) return;
    let seen = this.#synPorts.get(packet.src);
    if (!seen || this.ctx.now - seen.since > 10_000) {
      if (this.#synPorts.size > 64) this.#synPorts.clear();
      seen = { since: this.ctx.now, ports: new Set() };
      this.#synPorts.set(packet.src, seen);
    }
    seen.ports.add(segment.dstPort);
    if (seen.ports.size >= SCAN_ALERT_PORTS) this.#alert('portScan', { ip: packet.src, ports: seen.ports.size });
  }

  sendRaw(index: number, frame: EthernetFrame) {
    this.sendFrame(index, frame);
  }

  override receiveOn(index: number, frame: EthernetFrame) {
    // Fremder Verkehr an die eigene MAC-Adresse: Folge von ARP-Spoofing.
    if (frame.payload.kind === 'ipv4' && frame.dst === this.macOf(index) && this.attacker.state() && !this.isOwn(parseIp(frame.payload.dst) ?? 0)) this.attacker.onForeign();
    super.receiveOn(index, frame);
  }

  /** Ein Anmeldeversuch am SSH-Zugang. */
  #trySsh(target: string, user: string, password: string, done: (ok: boolean) => void) {
    let buffer = '';
    let finished = false;
    const finish = (ok: boolean) => {
      if (finished) return;
      finished = true;
      done(ok);
    };
    const conn = this.tcp.connect(target, SSH_PORT, {
      onOpen: (c) => c.write(`SSH-2.0-Attacker\r\n${seal(`AUTH ${user} ${password}`)}\r\n`),
      onData: (c, data) => {
        buffer += data;
        for (const line of buffer.split('\r\n')) {
          const message = line.startsWith('SSH-') ? null : unseal(line);
          if (message?.startsWith('OK ')) finish(true);
          else if (message === 'DENIED') finish(false);
          else continue;
          c.close();
        }
      },
      onEnd: (c) => c.close(),
      onError: () => finish(false),
    });
    if (!conn) finish(false);
  }

  #start() {
    this.attacker.boot();
    this.ensureDhcp();
    this.v6.boot();
    if (this.ctx.device()?.type === 'ipphone') this.phone.boot();
  }

  /** Access Point und dessen Funkplatz, falls das Gerät per WLAN verbunden ist. */
  #wirelessPeer(): { mac: string } | null {
    const device = this.ctx.device();
    if (!device?.wifi) return null;
    const topology = this.ctx.topology();
    const cable = cableAt(topology, { device: device.id, iface: 0 });
    if (!cable || cable.medium !== 'wireless' || !this.ctx.isConnected(0)) return null;
    const end = otherEnd(cable, device.id);
    const mac = getDevice(topology, end.device)?.interfaces[end.iface]?.mac;
    return mac ? { mac } : null;
  }

  /**
   * Beim Access Point anmelden (802.11 + WPA2-Handshake). `reassociation` beim
   * Roaming; danach meldet sich der Client mit einem Gratuitous ARP, damit die
   * Switches seinen neuen Weg lernen.
   */
  wlanConnect(reassociation: boolean, onDone: () => void = () => this.announce()) {
    const device = this.ctx.device();
    if (!device?.wifi || !this.#wirelessPeer()) return;
    const steps = wlanSteps(!!device.wifi.password, reassociation, device.wifi.ssid);
    this.#wlan = { steps, done: false, onDone };
    this.#wlanSend(0);
  }

  #wlanSend(index: number) {
    const wlan = this.#wlan;
    const peer = this.#wirelessPeer();
    if (!wlan || !peer) return;
    const run = wlanRun(wlan.steps, index, 'sta');
    let delay = 0;
    run.forEach((step, i) => {
      delay += 1;
      this.ctx.schedule(delay, () => {
        if (this.#wlan !== wlan) return;
        this.ctx.transmit(0, { src: this.macOf(0) ?? '', dst: peer.mac, payload: toLink(step) });
        if (index + i === wlan.steps.length - 1) this.#wlanDone(wlan);
      });
    });
  }

  #wlanDone(wlan: WlanSession) {
    if (wlan.done) return;
    wlan.done = true;
    this.ctx.print('wlan.connected', { ssid: this.ctx.device()?.wifi?.ssid ?? '' });
    wlan.onDone();
  }

  override receive(port: number, frame: EthernetFrame) {
    const control = frame.payload;
    if (control.kind === 'link') {
      const wlan = this.#wlan;
      if (!wlan || control.tech !== 'wlan') return;
      const index = wlanStepIndex(wlan.steps, control, 'ap');
      if (index < 0) return;
      if (index === wlan.steps.length - 1) this.#wlanDone(wlan);
      else this.#wlanSend(index + 1);
      return;
    }
    super.receive(port, frame);
  }

  /** Beim Start der Simulation: DHCP-Clients beziehen ihre Adresse. */
  ensureDhcp() {
    if (!this.ipv4On()) return;
    if (this.ctx.device()?.dhcp && this.dhcpClient.state === 'idle' && !this.dhcpClient.lease) this.dhcpClient.start();
  }

  renewDhcp() {
    if (!this.ctx.device()?.dhcp) return this.ctx.print('dhcp.static');
    this.dhcpClient.renew();
  }

  releaseDhcp() {
    if (!this.ctx.device()?.dhcp) return this.ctx.print('dhcp.static');
    this.dhcpClient.release();
  }

  /** Prüft vor Ping/Traceroute, was ohne Netzverkehr feststellbar ist; meldet das Problem und liefert false. */
  #reachable(target: number): boolean {
    if (this.isOwn(target)) return true;
    const iface = this.interfaces()[0];
    if (!iface) {
      this.ctx.print(this.ctx.device()?.dhcp ? 'ping.noLease' : 'ping.noAddress');
      return false;
    }
    if (!this.ctx.isConnected(iface.index)) {
      this.ctx.print('ping.noLink');
      return false;
    }
    if (!lookupRoute(this.routes(), target)) {
      this.ctx.print('ping.noRoute', { target: formatIp(target) });
      return false;
    }
    return true;
  }

  /** Ziel als IP oder Name; Namen werden zuerst per DNS aufgelöst. */
  #withTarget(text: string, command: Command, start: (ip: string, name?: string) => void) {
    const target = text.trim();
    const ip = parseIp(target);
    if (ip !== null) {
      if (this.#reachable(ip)) start(formatIp(ip));
      return;
    }
    const ip6 = parseIp6(target);
    if (ip6 !== null) {
      if (this.#reachable6(ip6)) start(formatIp6(ip6));
      return;
    }
    if (/^[\d.]+$/.test(target) || target.includes(':')) return this.ctx.print('ping.invalidTarget', { target });
    this.resolver.resolveAddress(target, (result) => {
      if (!result.ok) {
        const code = result.error === 'nxdomain' || result.error === 'nodata' || result.error === 'invalidName' ? 'unknownHost' : `dns.${result.error}`;
        return this.ctx.print(`${command}.${code}`, { name: target, server: result.server });
      }
      if (result.type === 'AAAA') {
        const resolved6 = parseIp6(result.ip);
        if (resolved6 !== null && this.#reachable6(resolved6)) start(formatIp6(resolved6), target);
        return;
      }
      const resolved = parseIp(result.ip);
      if (resolved !== null && this.#reachable(resolved)) start(formatIp(resolved), target);
    });
  }

  ping(target: string, options: PingOptions = {}) {
    if (this.#ping?.endless) this.interrupt();
    this.#withTarget(target, 'ping', (ip, name) => {
      this.#ping?.cancel();
      const v6 = parseIp(ip) === null;
      const run = v6
        ? new PingRun(this.#icmp6, ip, ++this.#icmpId, this.v6.state()?.gateway ?? '', name, options)
        : new PingRun(this, ip, ++this.#icmpId, this.effectiveDevice()?.gateway ?? '', name, options);
      this.#ping = run;
      run.start();
    });
  }

  /** Strg+C in der Befehlszeile: laufenden Ping und eine mit «nmap» gestartete Suche beenden. */
  interrupt() {
    this.#ping?.stop();
    this.scanner.stop();
  }

  traceroute(target: string) {
    this.#withTarget(target, 'tracert', (ip, name) => {
      this.#trace?.cancel();
      const run = new TracerouteRun(parseIp(ip) === null ? this.#icmp6 : this, ip, ++this.#icmpId, name);
      this.#trace = run;
      run.start();
    });
  }

  browse(url: string) {
    this.browser.get(url);
  }

  address(): AddressState {
    const device = this.effectiveDevice();
    const iface = device?.interfaces[0];
    const lease = this.dhcpClient.lease;
    return {
      mode: this.ctx.device()?.dhcp ? 'dhcp' : 'static',
      ...(iface?.ip ? { ip: iface.ip } : {}),
      ...(iface?.mask ? { mask: iface.mask } : {}),
      ...(device?.gateway ? { gateway: device.gateway } : {}),
      ...(device?.dns ? { dns: device.dns } : {}),
      ...(this.ctx.device()?.dhcp
        ? { dhcpState: this.dhcpClient.state, ...(lease ? { server: lease.server, expires: lease.expires } : {}) }
        : {}),
    };
  }

  connections(): ConnectionInfo[] {
    // IPv6 mit Port in eckigen Klammern (RFC 3986): [2001:db8::1]:80.
    const at = (ip: string, port: number) => (ip.includes(':') ? `[${ip}]:${port}` : `${ip}:${port}`);
    return this.tcp.connections().map((c) => ({
      local: at(c.local.ip, c.local.port),
      remote: at(c.remote.ip, c.remote.port),
      state: c.state,
    }));
  }

  override state(): HostState {
    const browser = this.browser.state;
    const mail = this.mail.state;
    const device = this.ctx.device();
    const ipv6 = this.v6.state();
    const firewall = this.firewall.state();
    return {
      arp: this.arpEntries(),
      ...(ipv6 ? { ipv6 } : {}),
      ...(firewall ? { firewall } : {}),
      ...(this.#ping?.running ? { pinging: true } : {}),
      ...(this.attacker.state() ? { attack: this.attacker.state()! } : {}),
      ...(this.#alerts.length ? { alerts: this.#alerts } : {}),
      ...(this.scanner.state() ? { scan: this.scanner.state()! } : {}),
      address: this.address(),
      dnsCache: this.resolver.cacheEntries(),
      connections: this.connections(),
      ...(device?.dhcpServer ? { dhcpLeases: this.dhcpServer.leases() } : {}),
      // Kopien, damit die Oberfläche eine unveränderliche Momentaufnahme erhält.
      ...(browser ? { browser: { ...browser, steps: [...browser.steps] } } : {}),
      mail: { ...mail, steps: [...mail.steps], inbox: [...mail.inbox], sent: [...mail.sent] },
      ...(device?.mailServer ? { mailboxes: this.mailServer.mailboxes() } : {}),
      ...(device?.type === 'ipphone' ? { voip: this.phone.state() } : {}),
      ...(device?.sipServer ? { sipRegistrations: this.pbx.state() } : {}),
    };
  }
}
