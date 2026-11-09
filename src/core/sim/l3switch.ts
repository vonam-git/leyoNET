import { decodeIface, interfaceAddresses, sviId, sviMac } from '../net/routing';
import { formatIp } from '../net/ipv4';
import { VXLAN_PORT, type EthernetFrame, type Ipv4Packet, type UdpDatagram } from './frames';
import { RouterNode } from './ip';
import type { IfaceAddress } from '../net/routing';
import type { NodeContext } from './simulation';
import { SwitchNode } from './switch';

/** IP-Teil eines Layer-3-Switches: seine «Anschlüsse» sind die VLAN-Interfaces (SVIs). */
class SviRouter extends RouterNode {
  constructor(
    ctx: NodeContext,
    private readonly owner: L3SwitchNode,
  ) {
    super(ctx);
  }

  protected override sendFrame(index: number, frame: EthernetFrame): boolean {
    const ref = decodeIface(index);
    if (ref.kind !== 'svi') return false;
    this.owner.injectLocal(ref.vlan, frame);
    return true;
  }

  /** «no ip routing» und Layer-2-Switch: nur über die SVIs erreichbar, leitet aber nicht weiter. */
  protected override outbound(inIface: IfaceAddress, outIface: IfaceAddress, packet: Ipv4Packet): Ipv4Packet | null {
    const device = this.ctx.device();
    if (device?.ipRouting === false || device?.type === 'switch') return null;
    if (!this.#svisAllow(inIface.index, 'in', packet) || !this.#svisAllow(outIface.index, 'out', packet)) return null;
    return super.outbound(inIface, outIface, packet);
  }

  /** Pakete aus dem VLAN an den Switch selbst (Ping an die SVI, DHCP an das Relay) prüft die eingehende Liste. */
  protected override localAllowed(index: number, packet: Ipv4Packet): boolean {
    return this.#svisAllow(index, 'in', packet);
  }

  /** Zugriffsliste am VLAN-Interface (in/out); ohne Zuweisung geht alles durch. */
  #svisAllow(index: number, direction: 'in' | 'out', packet: Ipv4Packet): boolean {
    const ref = decodeIface(index);
    if (ref.kind !== 'svi') return true;
    const svi = this.ctx.device()?.svis?.find((s) => s.vlan === ref.vlan);
    const name = direction === 'in' ? svi?.aclIn : svi?.aclOut;
    return !name || this.owner.aclCheck(name, { dst: '', src: '', payload: packet } as unknown as EthernetFrame, `Vlan${ref.vlan} ${direction}`);
  }

  /** VXLAN: Pakete an UDP 4789 der eigenen Adresse auspacken und ins VLAN geben. */
  protected override onUdp(packet: Ipv4Packet, datagram: UdpDatagram, index: number, srcMac: string) {
    if (datagram.dstPort === VXLAN_PORT && datagram.payload.kind === 'vxlan') return this.owner.fromTunnel(packet.src, datagram.payload.vni, datagram.payload.frame);
    super.onUdp(packet, datagram, index, srcMac);
  }
}

/**
 * Layer-3-Switch (und Layer-2-Switch mit Verwaltungs-Interface): ein lernender Switch
 * mit VLANs und Spanning Tree, der zusätzlich über VLAN-Interfaces (SVIs) zwischen
 * den VLANs routet. Als VTEP verlängert er VLANs per VXLAN (RFC 7348) über das
 * geroutete Netz zu anderen VTEPs (statische Liste, «Flood and Learn»).
 */
export class L3SwitchNode extends SwitchNode {
  readonly router: SviRouter;

  constructor(ctx: NodeContext) {
    super(ctx);
    const router = new SviRouter(ctx, this);
    this.router = router;
    this.local = {
      get mac() {
        const device = ctx.device();
        return device ? sviMac(device) : '';
      },
      has: (vlan) => !!ctx.device()?.svis?.some((s) => s.vlan === vlan),
      deliver: (vlan, frame) => router.receiveOn(sviId(vlan), frame),
    };
    this.overlay = {
      carries: (vlan) => !!this.#vni(vlan),
      flood: (vlan, frame) => {
        const vni = this.#vni(vlan);
        for (const peer of vni?.peers ?? []) this.#tunnel(peer, vni!.vni, frame);
      },
      unicast: (vtep, vlan, frame) => {
        const vni = this.#vni(vlan);
        if (vni) this.#tunnel(vtep, vni.vni, frame);
      },
    };
  }

  #vni(vlan: number) {
    const device = this.ctx.device();
    return device?.type === 'l3switch' ? device.vxlan?.vnis.find((v) => v.vlan === vlan) : undefined;
  }

  /** Absenderadresse der Tunnel: das Quell-Interface (meist ein Loopback). */
  #source(): string | null {
    const device = this.ctx.device();
    const source = device?.vxlan?.source;
    if (!device || source === undefined) return null;
    const iface = interfaceAddresses(device).find((i) => i.index === source);
    return iface ? formatIp(iface.ip) : null;
  }

  /** Rahmen in VXLAN verpacken und per IP zum anderen VTEP schicken. */
  #tunnel(peer: string, vni: number, frame: EthernetFrame) {
    const src = this.#source();
    if (!src) return;
    const { vlan: _v, ...inner } = frame;
    // Quellport aus einem Hash des inneren Rahmens (für die Lastverteilung im Netz, RFC 7348 Abschnitt 5).
    let hash = 0;
    for (const ch of frame.src + frame.dst) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    this.router.sendIp(peer, { kind: 'udp', srcPort: 49152 + (hash % 16384), dstPort: VXLAN_PORT, payload: { kind: 'vxlan', vni, frame: inner } }, { src });
  }

  /** Ausgepackter Rahmen eines anderen VTEPs: nur von eingetragenen VTEPs und für bekannte VNIs. */
  fromTunnel(vtep: string, vni: number, frame: EthernetFrame) {
    const entry = this.ctx.device()?.vxlan?.vnis.find((v) => v.vni === vni);
    if (!entry || entry.vlan === undefined || !entry.peers.includes(vtep)) {
      this.ctx.print('vxlan.dropped', { vni, vtep });
      return;
    }
    this.receiveOverlay(entry.vlan, frame, vtep);
  }

  override boot() {
    super.boot();
    this.router.boot();
  }

  override state(): object {
    return { ...super.state(), ...this.router.state() };
  }
}
