import { ACCESS_PROFILES, nextSteps, stepIndex } from './access';
import { DhcpServer, type DhcpHost } from './dhcp';
import { BROADCAST_MAC, DHCP_SERVER_PORT, type EthernetFrame, type Ipv4Packet, type LinkControl, type UdpDatagram } from './frames';
import { RouterNode } from './ip';
import type { NodeContext } from './simulation';
import { CPE_LAN, CPE_WAN } from '../model/links';
import type { ModemKind } from '../model/types';
import { formatIp } from '../net/ipv4';

/** So lange bleibt eine gelernte MAC-Adresse im internen Switch (wie beim Switch: 5 Minuten). */
const MAC_TTL = 300_000;

type Phase = 'idle' | 'connecting' | 'online';

/**
 * CPE (Customer Premises Equipment, «Internet-Box»): Modem, Router mit NAT,
 * DHCP-Server und kleiner Switch in einem Gerät, wie es Provider an Kunden
 * abgeben.
 *
 *  - Anschluss 0 (WAN): Zugangsleitung zum Provider. Mit Zugangstechnik
 *    (Kabel, Glasfaser, DSL, Mobilfunk) baut die CPE zuerst die Leitung auf
 *    wie ein Modem (siehe access.ts), ohne Technik ist es eine Ethernet-Buchse.
 *  - Anschlüsse 1–4 (LAN): interner Switch. Alle Buchsen bilden ein Netz; die
 *    Gateway-Adresse der CPE liegt auf Anschluss 1.
 *  - Router: leitet zwischen LAN und WAN weiter, übersetzt am WAN (NAT/PAT)
 *    und vergibt im LAN Adressen per DHCP.
 */
export class CpeNode extends RouterNode {
  readonly dhcpServer: DhcpServer;
  #macs = new Map<string, { port: number; expires: number }>();
  #phase: Phase = 'idle';
  #progress = 0;
  #run = 0;

  constructor(ctx: NodeContext) {
    super(ctx);
    // Der DHCP-Server arbeitet nur im LAN: eigene Adresse und Broadcasts dort.
    const self = this;
    const lan = () => self.interfaces().filter((i) => i.index === CPE_LAN);
    const host: DhcpHost = {
      get ctx() {
        return ctx;
      },
      interfaces: lan,
      sendIp(dst: string, payload: UdpDatagram) {
        const own = lan()[0];
        if (dst === '255.255.255.255') self.sendUnconfiguredBroadcast(CPE_LAN, payload, own ? formatIp(own.ip) : '0.0.0.0');
        else self.sendIp(dst, payload);
      },
      sendUnconfiguredBroadcast(_index: number, payload: UdpDatagram) {
        self.sendUnconfiguredBroadcast(CPE_LAN, payload);
      },
    };
    this.dhcpServer = new DhcpServer(host);
  }

  #kind(): ModemKind | undefined {
    return this.ctx.device()?.modem?.kind;
  }

  /** WAN bereit: ohne Zugangstechnik sofort, sonst erst, wenn die Leitung steht. */
  #wanReady(): boolean {
    return !this.#kind() || this.#phase === 'online';
  }

  override boot() {
    super.boot();
    const kind = this.#kind();
    if (!kind) return;
    if (!this.ctx.isConnected(CPE_WAN)) {
      if (this.#phase !== 'idle') this.ctx.print('modem.down');
      this.#phase = 'idle';
      this.#progress = 0;
      this.#run++;
      return;
    }
    if (this.#phase !== 'idle') return;
    this.#phase = 'connecting';
    this.ctx.print('modem.connecting', { standard: ACCESS_PROFILES[kind].standard });
    if (ACCESS_PROFILES[kind].steps[0]?.from === 'cpe') this.#sendAccess(kind, 0);
  }

  #sendAccess(kind: ModemKind, index: number) {
    const run = this.#run;
    let delay = 0;
    nextSteps(kind, index, 'cpe').forEach((step, i) => {
      delay += step.delay ?? 1;
      this.ctx.schedule(delay, () => {
        if (run !== this.#run) return;
        const mac = this.ctx.device()?.interfaces[CPE_WAN]?.mac ?? '';
        const payload: LinkControl = { kind: 'link', tech: step.tech, message: step.message, ...(step.fields ? { fields: step.fields } : {}) };
        this.ctx.transmit(CPE_WAN, { src: mac, dst: '', payload });
        this.#progress = index + i + 1;
        this.#checkOnline(kind);
      });
    });
  }

  #checkOnline(kind: ModemKind) {
    if (this.#phase === 'connecting' && this.#progress >= ACCESS_PROFILES[kind].steps.length) {
      this.#phase = 'online';
      const p = ACCESS_PROFILES[kind];
      this.ctx.print('modem.online', { standard: p.standard, down: p.downstream, up: p.upstream });
      // Jetzt erst kann der Router über das WAN sprechen (z.B. Gateway per ARP suchen).
      this.announce();
    }
  }

  override receive(port: number, frame: EthernetFrame) {
    if (port === CPE_WAN) return this.#receiveWan(frame);
    this.#receiveLan(port, frame);
  }

  #receiveWan(frame: EthernetFrame) {
    const kind = this.#kind();
    if (frame.payload.kind === 'link') {
      if (!kind) return;
      const index = stepIndex(kind, frame.payload, 'provider');
      if (index < 0) return;
      if (this.#phase === 'idle') this.#phase = 'connecting';
      this.#progress = Math.max(this.#progress, index + 1);
      this.#checkOnline(kind);
      if (ACCESS_PROFILES[kind].steps[index + 1]?.from === 'cpe') this.#sendAccess(kind, index + 1);
      return;
    }
    if (!this.#wanReady()) return;
    const { access: _a, ...plain } = frame;
    super.receive(CPE_WAN, plain);
  }

  /** Interner Switch: lernen, an den Router geben oder an eine andere LAN-Buchse weiterleiten. */
  #receiveLan(port: number, frame: EthernetFrame) {
    const device = this.ctx.device();
    if (!device || frame.l2) return;
    const now = this.ctx.now;
    if (frame.src && frame.src !== BROADCAST_MAC) this.#macs.set(frame.src, { port, expires: now + MAC_TTL });
    const own = device.interfaces[CPE_LAN]?.mac;
    if (frame.dst === own) return void this.receiveOn(CPE_LAN, frame);
    const group = frame.dst === BROADCAST_MAC || isMulticast(frame.dst);
    if (group) {
      this.#flood(frame, port);
      this.receiveOn(CPE_LAN, frame);
      return;
    }
    const known = this.#lookup(frame.dst);
    if (known === undefined) this.#flood(frame, port);
    else if (known !== port) this.ctx.transmit(known, frame);
  }

  #lookup(mac: string): number | undefined {
    const entry = this.#macs.get(mac);
    return entry && entry.expires > this.ctx.now ? entry.port : undefined;
  }

  #lanPorts(): number[] {
    return (this.ctx.device()?.interfaces ?? []).filter((i) => i.index !== CPE_WAN).map((i) => i.index);
  }

  #flood(frame: EthernetFrame, except?: number) {
    for (const port of this.#lanPorts()) if (port !== except && this.ctx.isConnected(port)) this.ctx.transmit(port, frame);
  }

  /** Rahmen des Routers: ins LAN über den internen Switch, ins WAN erst, wenn die Leitung steht. */
  protected override sendFrame(index: number, frame: EthernetFrame): boolean {
    if (index === CPE_WAN) return this.#wanReady() && this.ctx.transmit(CPE_WAN, frame);
    if (index !== CPE_LAN) return false;
    const known = frame.dst === BROADCAST_MAC || isMulticast(frame.dst) ? undefined : this.#lookup(frame.dst);
    if (known !== undefined) return this.ctx.transmit(known, frame);
    this.#flood(frame);
    return true;
  }

  /** DHCP-Server im LAN; alles andere wie beim Router (Relay, RIP). */
  protected override onUdp(packet: Ipv4Packet, datagram: UdpDatagram, index: number, srcMac: string) {
    const msg = datagram.payload;
    if (msg.kind === 'dhcp' && datagram.dstPort === DHCP_SERVER_PORT && index === CPE_LAN && this.ctx.device()?.dhcpServer) {
      this.dhcpServer.onMessage(packet, msg);
      return;
    }
    super.onUdp(packet, datagram, index, srcMac);
  }

  override state(): object {
    const device = this.ctx.device();
    const kind = this.#kind();
    const now = this.ctx.now;
    return {
      ...super.state(),
      macTable: [...this.#macs.entries()].filter(([, e]) => e.expires > now).map(([mac, e]) => ({ mac, port: e.port, vlan: 1, expires: e.expires })),
      ...(device?.dhcpServer ? { dhcpLeases: this.dhcpServer.leases() } : {}),
      ...(kind
        ? {
            modem: {
              kind,
              standard: ACCESS_PROFILES[kind].standard,
              phase: this.#phase,
              progress: this.#progress,
              total: ACCESS_PROFILES[kind].steps.length,
              downstream: ACCESS_PROFILES[kind].downstream,
              upstream: ACCESS_PROFILES[kind].upstream,
            },
          }
        : {}),
    };
  }
}

function isMulticast(mac: string): boolean {
  return /^01:00:5E:/i.test(mac);
}
