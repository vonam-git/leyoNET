import { cableAt, deviceSeq, getDevice, otherEnd } from '../model/topology';
import { toLink, wlanRun, wlanStepIndex, wlanSteps, type WlanStep } from './wlan';
import type { EthernetFrame } from './frames';
import type { Device } from '../model/types';
import { formatIp, parseIp } from '../net/ipv4';
import { lookupRoute } from '../net/routing';
import { PingRun, TracerouteRun, icmpView, type IcmpApp, type IcmpHost } from './apps';
import { formatIp6, parseIp6 } from '../net/ipv6';
import type { Ip6State } from './ip6';
import type { FirewallState } from './firewall';
import { DhcpClient, DhcpServer, type LeaseRecord } from './dhcp';
import { DnsResolver, DnsServer, type DnsCacheEntry } from './dns';
import { DHCP_CLIENT_PORT, DHCP_SERVER_PORT, DNS_PORT, type Ipv4Packet, type Ipv6Packet, type TcpSegment, type UdpDatagram } from './frames';
import { HttpClient, HttpServer, type BrowserState } from './http';
import { IpNode, asIpv4View, type ArpEntry } from './ip';
import { MailClient, MailServer, type MailClientState } from './mail';
import type { NodeContext } from './simulation';
import { SshClient } from './ssh';
import { TcpStack, type TcpState } from './tcp';

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
  browser?: BrowserState;
  mail: MailClientState;
  mailboxes?: { user: string; count: number }[];
}

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
  #ping: IcmpApp | null = null;
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
    this.mailServer = new MailServer(this);
    this.mail = new MailClient(this);
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

  #start() {
    this.ensureDhcp();
    this.v6.boot();
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

  ping(target: string) {
    this.#withTarget(target, 'ping', (ip, name) => {
      this.#ping?.cancel();
      const v6 = parseIp(ip) === null;
      const run = v6
        ? new PingRun(this.#icmp6, ip, ++this.#icmpId, this.v6.state()?.gateway ?? '', name)
        : new PingRun(this, ip, ++this.#icmpId, this.effectiveDevice()?.gateway ?? '', name);
      this.#ping = run;
      run.start();
    });
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
      address: this.address(),
      dnsCache: this.resolver.cacheEntries(),
      connections: this.connections(),
      ...(device?.dhcpServer ? { dhcpLeases: this.dhcpServer.leases() } : {}),
      // Kopien, damit die Oberfläche eine unveränderliche Momentaufnahme erhält.
      ...(browser ? { browser: { ...browser, steps: [...browser.steps] } } : {}),
      mail: { ...mail, steps: [...mail.steps], inbox: [...mail.inbox], sent: [...mail.sent] },
      ...(device?.mailServer ? { mailboxes: this.mailServer.mailboxes() } : {}),
    };
  }
}
