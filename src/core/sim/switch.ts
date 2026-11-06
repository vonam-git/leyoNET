import { MODEM_WAN } from '../model/links';
import { cableAt, channelMembers, getDevice, otherEnd, trunkAllows, vlanExists } from '../model/topology';
import type { NetInterface } from '../model/types';
import type { ModemKind } from '../model/types';
import { ACCESS_PROFILES, nextSteps, stepIndex } from './access';
import { toLink, wlanRun, wlanStepIndex, wlanSteps } from './wlan';
import { BROADCAST_MAC, LACP_MAC, STP_MAC, type EthernetFrame, type LacpPdu, type LinkControl, type StpBpdu } from './frames';
import type { NodeContext, SimNode } from './simulation';
import { aclVerdict } from './firewall';

/** Zähler einer Zugriffsliste: Treffer je Regel, implizites deny. */
export interface AclState {
  name: string;
  hits: number[];
  implicitDeny: number;
}

/** Lebensdauer eines gelernten Eintrags (5 Minuten virtuelle Zeit). */
export const MAC_TTL = 300_000;

// Spanning Tree, vereinfacht und mit verkürzten Zeiten (Standard: 2 s, 20 s, 15 s).
export const STP_HELLO = 2000;
export const STP_MAX_AGE = 6000;
export const STP_FORWARD_DELAY = 2000;
export const STP_DEFAULT_PRIORITY = 32768;
/** Pfadkosten pro Verbindung (klassischer Wert für 100 Mbit/s). */
export const STP_PATH_COST = 19;
export const DEFAULT_VLAN = 1;

/**
 * Broadcast-Sturm: Kreist ein Rahmen in einer Schleife, leitet der Switch im
 * Sturm nur noch so viele Rahmen pro Zeitfenster weiter, damit die Simulation
 * bedienbar bleibt – echte Switches würden ihre Leitungen ganz füllen.
 */
export const STORM_WINDOW = 100;
export const STORM_THRESHOLD = 60;
/** So lange ohne kreisende Rahmen, dann gilt der Sturm als vorbei. */
export const STORM_QUIET = 1000;

/** LACP mit kurzen Zeiten (fast rate): LACPDU jede Sekunde, Partner gilt 3 s. */
export const LACP_INTERVAL = 1000;
export const LACP_TIMEOUT = 3000;

/** Zustand eines Ports in einem Port-Channel. */
export type ChannelPortStatus = 'bundled' | 'suspended' | 'down';
export type ChannelSuspendReason = 'noPartner' | 'otherPartner' | 'config';

export interface ChannelState {
  channel: number;
  ports: { port: number; status: ChannelPortStatus; reason?: ChannelSuspendReason; partner?: string }[];
}

export interface MacEntry {
  mac: string;
  /** Port; OVERLAY_PORT = hinter einem anderen VTEP (VXLAN). */
  port: number;
  vlan: number;
  expires: number;
  /** VXLAN: Adresse des VTEPs, hinter dem die MAC liegt. */
  vtep?: string;
}

/** «Port» für Adressen, die über VXLAN hinter einem anderen VTEP liegen. */
export const OVERLAY_PORT = -1;

/** VXLAN-Verlängerung eines VLANs über das geroutete Netz (vom Layer-3-Switch bereitgestellt). */
export interface Overlay {
  /** Wird dieses VLAN über VXLAN verlängert? */
  carries(vlan: number): boolean;
  /** An alle anderen VTEPs der VNI (Broadcast, unbekannte Ziele). */
  flood(vlan: number, frame: EthernetFrame): void;
  /** An einen bekannten VTEP. */
  unicast(vtep: string, vlan: number, frame: EthernetFrame): void;
}

/** Rolle eines Ports im Spanning Tree; "edge" = Endgerät angeschlossen (wie PortFast). */
export type PortRole = 'root' | 'designated' | 'alternate' | 'edge';
export type PortState = 'forwarding' | 'learning' | 'blocking';

export interface StpPortInfo {
  port: number;
  role: PortRole;
  state: PortState;
}

export interface StormState {
  /** Seit wann der Switch im Sturm ist (virtuelle Zeit). */
  since: number;
  /** Weitergeleitete Rahmen im letzten Zeitfenster. */
  rate: number;
}

export interface StpState {
  bridgeId: string;
  rootId: string;
  rootPort: number | null;
  rootCost: number;
  ports: StpPortInfo[];
}

interface Received {
  rootId: string;
  cost: number;
  bridgeId: string;
  portId: number;
  expires: number;
}

/** Bridge-IDs vergleichen: zuerst die Priorität, dann die MAC-Adresse (kleiner gewinnt). */
function compareId(a: string, b: string): number {
  const [pa = '0', ma = ''] = a.split('.');
  const [pb = '0', mb = ''] = b.split('.');
  return Number(pa) - Number(pb) || ma.localeCompare(mb);
}

/** Prioritätsvektor (Root, Kosten, Absender, Port): kleiner ist besser. */
type Vector = [rootId: string, cost: number, bridgeId: string, portId: number];

function compareVector(a: Vector, b: Vector): number {
  return compareId(a[0], b[0]) || a[1] - b[1] || compareId(a[2], b[2]) || a[3] - b[3];
}

/**
 * Lernender Switch mit VLANs und optionalem Spanning Tree.
 * VLANs: Access-Ports gehören zu einem VLAN, Trunks übertragen alle mit
 * 802.1Q-Tag (VLAN 1 ohne Tag). Die MAC-Tabelle gilt je VLAN.
 */
/** Lokaler Empfänger im Switch (VLAN-Interfaces eines Layer-3-Switches). */
export interface LocalPort {
  mac: string;
  has(vlan: number): boolean;
  deliver(vlan: number, frame: EthernetFrame): void;
}

export class SwitchNode implements SimNode {
  protected local: LocalPort | null = null;
  protected overlay: Overlay | null = null;
  #table = new Map<string, MacEntry>();
  /** Letzte Meldung «MAC springt» je Adresse (höchstens alle 5 s, sonst flutet eine Schleife die Konsole). */
  #flapNoted = new Map<string, number>();
  #received = new Map<number, Received>();
  #roles = new Map<number, PortRole>();
  #since = new Map<number, number>();
  #rootId = '';
  #rootPort: number | null = null;
  #rootCost = 0;
  #helloRunning = false;
  #windowStart = 0;
  #windowCount = 0;
  #lastRate = 0;
  #stormSince: number | null = null;
  #lastLoop = 0;
  #seen = new WeakMap<object, number>();
  #aclHits = new Map<string, { rules: object; hits: number[]; implicitDeny: number }>();
  /** LACP: zuletzt gehörter Partner je Port. */
  #lacpPartner = new Map<number, { system: string; key: number; port: number; state: number; expires: number }>();
  /** Zuletzt gemeldeter Zustand je Channel-Port (für Konsolenmeldungen bei Änderungen). */
  #channelNoted = new Map<number, string>();
  #lacpRunning = false;

  constructor(protected readonly ctx: NodeContext) {}

  /**
   * Schleifenerkennung: Kommt derselbe Rahmen (gleiche Nutzlast) ein zweites
   * Mal an, kreist er in einer Schleife. Der Switch leitet weiter wie ein echter
   * (der Sturm ist sichtbar), aber gedrosselt, damit die Simulation bedienbar bleibt.
   */
  #admit(frame: EthernetFrame): boolean {
    const now = this.ctx.now;
    const seen = (this.#seen.get(frame.payload) ?? 0) + 1;
    this.#seen.set(frame.payload, seen);
    if (seen >= 2) {
      this.#lastLoop = now;
      if (this.#stormSince === null) {
        this.#stormSince = now;
        this.ctx.print('storm.detected');
      }
    } else if (this.#stormSince !== null && now - this.#lastLoop > STORM_QUIET) {
      this.#stormSince = null;
      this.ctx.print('storm.ended');
    }
    if (now - this.#windowStart >= STORM_WINDOW) {
      this.#lastRate = this.#windowCount;
      this.#windowStart = now;
      this.#windowCount = 0;
    }
    this.#windowCount++;
    return this.#stormSince === null || this.#windowCount <= STORM_THRESHOLD;
  }

  get storm(): StormState | null {
    return this.#stormSince === null ? null : { since: this.#stormSince, rate: Math.max(this.#lastRate, this.#windowCount) };
  }

  get #device() {
    return this.ctx.device();
  }

  get #stp(): boolean {
    return !!this.#device?.stp;
  }

  #bridgeId(): string {
    const device = this.#device;
    return `${device?.stpPriority ?? STP_DEFAULT_PRIORITY}.${device?.interfaces[0]?.mac ?? ''}`;
  }

  #isTrunk(port: number) {
    return !!this.#device?.interfaces[port]?.trunk;
  }

  #vlanOf(port: number) {
    return this.#device?.interfaces[port]?.vlan ?? DEFAULT_VLAN;
  }

  #native(port: number) {
    return this.#device?.interfaces[port]?.nativeVlan ?? DEFAULT_VLAN;
  }

  /** Kennt der Switch das VLAN? (VLAN-Datenbank; ältere Dateien ohne Datenbank: jedes) */
  #exists(vlan: number) {
    const device = this.#device;
    return !device || vlanExists(device, vlan);
  }

  #member(port: number, vlan: number) {
    if (!this.#exists(vlan)) return false;
    const iface = this.#device?.interfaces[port];
    return iface?.trunk ? trunkAllows(iface, vlan) : this.#vlanOf(port) === vlan;
  }

  /** Am Port hängt ein Endgerät oder Router: keine Schleifengefahr, darum sofort weiterleiten. */
  #isEdge(port: number): boolean {
    const device = this.#device;
    if (!device) return true;
    const cable = cableAt(this.#topology(), { device: device.id, iface: port });
    if (!cable) return true;
    const peer = getDevice(this.#topology(), otherEnd(cable, device.id).device);
    return !peer || (peer.type !== 'switch' && peer.type !== 'l3switch' && peer.type !== 'modem' && peer.type !== 'accesspoint');
  }

  #topology() {
    return this.ctx.topology();
  }

  // --- Spanning Tree -----------------------------------------------------------

  boot() {
    this.start();
    this.#startLacp();
  }

  /** Startet die regelmässigen BPDUs (beim Start der Simulation). */
  start() {
    if (!this.#stp || this.#helloRunning) return;
    this.#helloRunning = true;
    const hello = () => {
      if (!this.#stp) {
        this.#helloRunning = false;
        return;
      }
      this.#recompute();
      this.#sendBpdus();
      this.ctx.schedule(STP_HELLO, hello);
    };
    this.ctx.schedule(0, hello);
  }

  #sendBpdus() {
    const device = this.#device;
    if (!device) return;
    const bridgeId = this.#bridgeId();
    for (const port of device.interfaces) {
      if (this.#roles.get(port.index) !== 'designated' || !this.#isLogical(port.index)) continue;
      const bpdu: StpBpdu = { kind: 'stp', rootId: this.#rootId, cost: this.#rootCost, bridgeId, portId: port.index };
      this.ctx.transmit(port.index, { src: port.mac, dst: STP_MAC, payload: bpdu });
    }
  }

  #recompute() {
    const device = this.#device;
    if (!device) return;
    const now = this.ctx.now;
    for (const [port, info] of this.#received) {
      if (info.expires <= now || !this.ctx.isConnected(port)) this.#received.delete(port);
    }
    const me = this.#bridgeId();
    let best: Vector = [me, 0, me, -1];
    let rootPort: number | null = null;
    for (const [port, r] of this.#received) {
      const candidate: Vector = [r.rootId, r.cost + STP_PATH_COST, r.bridgeId, r.portId];
      if (compareId(r.rootId, me) < 0 && (rootPort === null || compareVector(candidate, best) < 0)) {
        best = candidate;
        rootPort = port;
      }
    }
    this.#rootId = best[0];
    this.#rootCost = rootPort === null ? 0 : best[1];
    this.#rootPort = rootPort;

    let changed = false;
    for (const port of device.interfaces) {
      // Ein Port-Channel zählt als ein Port (sein erster gebündelter Port vertritt ihn).
      if (!this.ctx.isConnected(port.index) || !this.#isLogical(port.index)) continue;
      let role: PortRole;
      if (this.#isEdge(port.index)) role = 'edge';
      else if (port.index === rootPort) role = 'root';
      else {
        const r = this.#received.get(port.index);
        const offer: Vector = [this.#rootId, this.#rootCost, me, port.index];
        role = !r || compareVector(offer, [r.rootId, r.cost, r.bridgeId, r.portId]) < 0 ? 'designated' : 'alternate';
      }
      if (this.#roles.get(port.index) !== role) {
        changed = true;
        this.#roles.set(port.index, role);
        this.#since.set(port.index, now);
      }
    }
    if (changed) {
      // Vereinfachte Topologieänderung: gelernte Adressen könnten auf blockierte Ports zeigen.
      this.#table.clear();
      this.ctx.print('stp.changed', { root: this.#rootId, rootPort: this.#rootPort === null ? '–' : this.#rootPort + 1 });
    }
  }

  #state(member: number): PortState {
    if (this.#suspendedPort(member)) return 'blocking';
    const port = this.#rep(member);
    if (!this.#stp) return 'forwarding';
    const role = this.#roles.get(port) ?? (this.#isEdge(port) ? 'edge' : undefined);
    if (role === 'edge') return 'forwarding';
    if (role === undefined || role === 'alternate') return 'blocking';
    // Neue Root- und Designated-Ports warten die Weiterleitungsverzögerung ab, bevor sie weiterleiten.
    return this.ctx.now - (this.#since.get(port) ?? 0) >= STP_FORWARD_DELAY ? 'forwarding' : 'learning';
  }

  #onBpdu(member: number, bpdu: StpBpdu) {
    if (this.#suspendedPort(member)) return;
    const port = this.#rep(member);
    this.#received.set(port, { ...bpdu, expires: this.ctx.now + STP_MAX_AGE });
    this.#recompute();
  }

  // --- Weiterleiten -------------------------------------------------------------

  #send(port: number, frame: EthernetFrame, vlan: number) {
    // Auf Trunks mit Tag (ausser dem Native VLAN), auf Access-Ports immer ohne.
    const { vlan: _v, ...untagged } = frame;
    // Port-Channel: ein gebündelter Port nach Hash der MAC-Adressen (gleiche Verbindung, gleicher Weg).
    this.ctx.transmit(this.#egress(port, frame), this.#isTrunk(port) && vlan !== this.#native(port) ? { ...untagged, vlan } : untagged);
  }

  receive(member: number, frame: EthernetFrame) {
    const device = this.#device;
    if (!device) return;
    if (frame.payload.kind === 'lacp') return this.#onLacp(member, frame.payload);
    if (frame.payload.kind === 'stp' && this.#stp) return this.#onBpdu(member, frame.payload);
    // Ausgestellter Port im Channel: nimmt nichts an (verhindert Schleifen bei falscher Verkabelung).
    if (this.#suspendedPort(member)) return;
    const inPort = this.#rep(member);
    // Steuermeldungen der Leitung (802.11-Anmeldung) gehen nie weiter.
    if (frame.payload.kind === 'link') return this.#onLinkControl(inPort, frame);
    if (frame.payload.kind === 'ppp') return;
    if (!this.#admit(frame)) return;

    const inState = this.#state(inPort);
    if (inState === 'blocking') return;
    // Getaggte Rahmen gehören nur auf Trunks.
    if (!this.#isTrunk(inPort) && frame.vlan !== undefined) return;
    const vlan = this.#isTrunk(inPort) ? (frame.vlan ?? this.#native(inPort)) : this.#vlanOf(inPort);
    // Unbekanntes VLAN (nicht angelegt) oder auf diesem Trunk nicht erlaubt: verwerfen.
    if (!this.#member(inPort, vlan)) return this.#noteVlan(inPort, vlan);
    const now = this.ctx.now;
    // Dieselbe Absender-MAC an einem anderen Port: doppelte MAC oder Schleife («MAC flapping»).
    const before = this.#table.get(`${vlan}|${frame.src}`);
    if (before && before.port !== inPort && before.expires > now && this.ctx.isConnected(before.port)) {
      const last = this.#flapNoted.get(frame.src) ?? -Infinity;
      if (now - last >= 5000) {
        this.#flapNoted.set(frame.src, now);
        this.ctx.print('switch.macFlap', { mac: frame.src, vlan, from: before.port + 1, to: inPort + 1 });
      }
    }
    this.#table.set(`${vlan}|${frame.src}`, { mac: frame.src, port: inPort, vlan, expires: now + MAC_TTL });
    if (inState === 'learning') return;
    if (!this.#aclAllows(inPort, frame)) return;

    // Layer-3-Switch: Rahmen an die eigene SVI gehen nach oben, Broadcasts und
    // Multicasts (z.B. IPv6 Neighbor Discovery, DHCPv6) zusätzlich; die SVI prüft selbst, ob sie die Gruppe hört.
    if (this.local?.has(vlan)) {
      if (frame.dst === this.local.mac) return this.local.deliver(vlan, frame);
      if (frame.dst === BROADCAST_MAC || (isGroupMac(frame.dst) && frame.dst !== STP_MAC)) this.local.deliver(vlan, frame);
    }

    this.#forwardLocal(inPort, vlan, frame, true);
  }

  /** Weiterleiten im VLAN: bekannter Port, bekannter VTEP oder an alle (ohne den Eingang). */
  #forwardLocal(inPort: number, vlan: number, frame: EthernetFrame, toOverlay: boolean) {
    const device = this.#device;
    if (!device) return;
    const now = this.ctx.now;
    const flood = frame.dst === BROADCAST_MAC || frame.dst === STP_MAC;
    const known = flood ? undefined : this.#table.get(`${vlan}|${frame.dst}`);
    if (known && known.expires > now && known.port === OVERLAY_PORT && known.vtep) {
      if (toOverlay && this.overlay?.carries(vlan)) this.overlay.unicast(known.vtep, vlan, frame);
      return;
    }
    if (known && known.expires > now && this.ctx.isConnected(known.port) && this.#state(known.port) === 'forwarding' && this.#member(known.port, vlan)) {
      // Ziel hängt am selben Port wie der Absender: Der Rahmen hat sein Ziel schon erreicht.
      if (known.port !== inPort) this.#send(known.port, frame, vlan);
      return;
    }
    for (const port of device.interfaces) {
      if (port.index === inPort || !this.#isLogical(port.index) || !this.#member(port.index, vlan) || this.#state(port.index) !== 'forwarding') continue;
      this.#send(port.index, frame, vlan);
    }
    // VXLAN: unbekannte Ziele und Broadcasts auch an die anderen VTEPs (nie zurück ins Overlay).
    if (toOverlay && frame.dst !== STP_MAC && this.overlay?.carries(vlan)) this.overlay.flood(vlan, frame);
  }

  /** Rahmen aus dem VXLAN-Tunnel: Absender hinter dem VTEP lernen, lokal zustellen. */
  receiveOverlay(vlan: number, frame: EthernetFrame, vtep: string) {
    if (!this.#exists(vlan)) return this.#noteVlan(OVERLAY_PORT, vlan);
    this.#table.set(`${vlan}|${frame.src}`, { mac: frame.src, port: OVERLAY_PORT, vlan, expires: this.ctx.now + MAC_TTL, vtep });
    if (this.local?.has(vlan)) {
      if (frame.dst === this.local.mac) return this.local.deliver(vlan, frame);
      if (frame.dst === BROADCAST_MAC || (isGroupMac(frame.dst) && frame.dst !== STP_MAC)) this.local.deliver(vlan, frame);
    }
    this.#forwardLocal(OVERLAY_PORT, vlan, frame, false);
  }

  // --- Link Aggregation (Port-Channel, LACP nach IEEE 802.1AX) ----------------------

  /** Stellen zwei Ports dasselbe ein (Pflicht im selben Channel)? */
  static #sameSwitchport(a: NetInterface | undefined, b: NetInterface | undefined): boolean {
    if (!a || !b) return false;
    if (!!a.trunk !== !!b.trunk) return false;
    if (!a.trunk) return (a.vlan ?? 1) === (b.vlan ?? 1);
    return (a.nativeVlan ?? 1) === (b.nativeVlan ?? 1) && JSON.stringify(a.allowedVlans ?? null) === JSON.stringify(b.allowedVlans ?? null);
  }

  #partnerOf(port: number) {
    const p = this.#lacpPartner.get(port);
    return p && p.expires > this.ctx.now && p.key !== 0 ? p : undefined;
  }

  /** Zustand eines Ports im Channel; null = gehört keinem Channel an. */
  #channelStatus(port: number): { status: ChannelPortStatus; reason?: ChannelSuspendReason } | null {
    const device = this.#device;
    const iface = device?.interfaces[port];
    if (!device || !iface?.channel) return null;
    if (!this.ctx.isConnected(port) || iface.shutdown) return { status: 'down' };
    const members = channelMembers(device, iface.channel);
    if (!SwitchNode.#sameSwitchport(device.interfaces[members[0]!], iface)) return { status: 'suspended', reason: 'config' };
    if ((iface.channelMode ?? 'active') === 'on') return { status: 'bundled' };
    const partner = this.#partnerOf(port);
    if (!partner) return { status: 'suspended', reason: 'noPartner' };
    // Alle gebündelten Ports müssen zum selben Partner führen; der erste mit Partner gibt ihn vor.
    for (const m of members) {
      if ((device.interfaces[m]?.channelMode ?? 'active') === 'on') continue;
      const reference = this.#partnerOf(m);
      if (!reference) continue;
      if (reference.system !== partner.system || reference.key !== partner.key) return { status: 'suspended', reason: 'otherPartner' };
      break;
    }
    return { status: 'bundled' };
  }

  #suspendedPort(port: number): boolean {
    return this.#channelStatus(port)?.status === 'suspended';
  }

  /** Vertreter eines gebündelten Ports: der erste gebündelte Port seines Channels; sonst der Port selbst. */
  #rep(port: number): number {
    const device = this.#device;
    const channel = device?.interfaces[port]?.channel;
    if (!device || !channel || this.#channelStatus(port)?.status !== 'bundled') return port;
    return channelMembers(device, channel).find((m) => this.#channelStatus(m)?.status === 'bundled') ?? port;
  }

  /** Zählt der Port als eigener (logischer) Port? Nicht für weitere gebündelte und ausgestellte Ports. */
  #isLogical(port: number): boolean {
    return !this.#suspendedPort(port) && this.#rep(port) === port;
  }

  /** Ausgehender Port für einen Rahmen an einen (logischen) Port. */
  #egress(port: number, frame: EthernetFrame): number {
    const device = this.#device;
    const channel = device?.interfaces[port]?.channel;
    if (!device || !channel || this.#channelStatus(port)?.status !== 'bundled') return port;
    const bundled = channelMembers(device, channel).filter((m) => this.#channelStatus(m)?.status === 'bundled');
    if (bundled.length < 2) return port;
    let hash = 0;
    for (const ch of frame.src + frame.dst) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return bundled[hash % bundled.length]!;
  }

  #startLacp() {
    if (this.#lacpRunning || !this.#usesLacp()) return;
    this.#lacpRunning = true;
    const tick = () => {
      if (!this.#usesLacp()) {
        this.#lacpRunning = false;
        this.#noteChannels();
        return;
      }
      const device = this.#device;
      for (const iface of device?.interfaces ?? []) {
        const mode = iface.channelMode ?? 'active';
        if (!iface.channel || mode === 'on' || !this.ctx.isConnected(iface.index) || iface.shutdown) continue;
        // Passiv: antwortet erst, wenn der Partner LACPDUs schickt.
        if (mode === 'passive' && !this.#partnerOf(iface.index)) continue;
        this.#sendLacp(iface.index);
      }
      this.#noteChannels();
      this.ctx.schedule(LACP_INTERVAL, tick);
    };
    this.ctx.schedule(0, tick);
  }

  #usesLacp(): boolean {
    return !!this.#device?.interfaces.some((i) => i.channel && (i.channelMode ?? 'active') !== 'on');
  }

  #sendLacp(port: number) {
    const device = this.#device;
    const iface = device?.interfaces[port];
    if (!device || !iface?.channel) return;
    const partner = this.#partnerOf(port);
    const status = this.#channelStatus(port)?.status;
    // Activity (aktiv), Timeout (kurz), Aggregation, dazu Sync/Collecting/Distributing, wenn gebündelt.
    const actorState = ((iface.channelMode ?? 'active') === 'active' ? 1 : 0) | 2 | 4 | (status === 'bundled' ? 8 | 16 | 32 : 0) | (partner ? 0 : 64);
    const pdu: LacpPdu = {
      kind: 'lacp',
      actorSystem: device.interfaces[0]?.mac ?? '00:00:00:00:00:00',
      actorKey: iface.channel,
      actorPort: port + 1,
      actorState,
      partnerSystem: partner?.system ?? '00:00:00:00:00:00',
      partnerKey: partner?.key ?? 0,
      partnerPort: partner?.port ?? 0,
      partnerState: partner?.state ?? 0,
    };
    this.ctx.transmit(port, { src: iface.mac, dst: LACP_MAC, payload: pdu });
  }

  #onLacp(port: number, pdu: LacpPdu) {
    const iface = this.#device?.interfaces[port];
    // Ohne Channel ignoriert der Port LACPDUs (der Partner bleibt dann ausgestellt).
    if (!iface?.channel || (iface.channelMode ?? 'active') === 'on') return;
    const known = this.#partnerOf(port);
    this.#lacpPartner.set(port, { system: pdu.actorSystem, key: pdu.actorKey, port: pdu.actorPort, state: pdu.actorState, expires: this.ctx.now + LACP_TIMEOUT });
    // Passiver Port oder neuer Partner: sofort antworten, damit der Channel ohne Wartezeit steht.
    if (!known) this.#sendLacp(port);
    this.#startLacp();
    this.#noteChannels();
  }

  /** Änderungen im Channel melden; gelernte Adressen verwerfen, weil sich Wege geändert haben. */
  #noteChannels() {
    const device = this.#device;
    if (!device) return;
    let changed = false;
    for (const iface of device.interfaces) {
      const s = this.#channelStatus(iface.index);
      const key = s ? `${s.status}|${s.reason ?? ''}` : '';
      if ((this.#channelNoted.get(iface.index) ?? '') === key) continue;
      this.#channelNoted.set(iface.index, key);
      changed = true;
      if (!s || s.status === 'down') continue;
      this.ctx.print(s.status === 'bundled' ? 'lacp.bundled' : `lacp.suspended.${s.reason}`, { channel: iface.channel!, port: iface.index + 1 });
    }
    if (changed) this.#table.clear();
  }

  #channelState(): ChannelState[] {
    const device = this.#device;
    if (!device) return [];
    const channels = [...new Set(device.interfaces.flatMap((i) => (i.channel ? [i.channel] : [])))].sort((a, b) => a - b);
    return channels.map((channel) => ({
      channel,
      ports: channelMembers(device, channel).map((port) => {
        const s = this.#channelStatus(port)!;
        const partner = this.#partnerOf(port);
        return { port, ...s, ...(partner ? { partner: partner.system } : {}) };
      }),
    }));
  }

  #vlanNoted = new Map<string, number>();

  /** Verworfenen Rahmen wegen eines fehlenden oder nicht erlaubten VLANs melden (höchstens alle 5 s je Port und VLAN). */
  #noteVlan(port: number, vlan: number) {
    const key = `${port}|${vlan}`;
    const now = this.ctx.now;
    if (now - (this.#vlanNoted.get(key) ?? -Infinity) < 5000) return;
    this.#vlanNoted.set(key, now);
    this.ctx.print(!this.#exists(vlan) ? 'switch.vlanMissing' : 'switch.vlanNotAllowed', { vlan, port: port === OVERLAY_PORT ? 'VXLAN' : port + 1 });
  }

  /** Zugriffsliste am Eingangsport prüfen («ip access-group NAME in»). Fehlt die Liste, geht alles durch. */
  #aclAllows(inPort: number, frame: EthernetFrame): boolean {
    const device = this.#device;
    const name = device?.interfaces[inPort]?.aclIn;
    if (!name) return true;
    const acl = device?.acls?.find((a) => a.name === name);
    if (!acl) return true;
    const verdict = aclVerdict(acl, frame);
    if (!verdict) return true;
    let counter = this.#aclHits.get(name);
    if (!counter || counter.rules !== acl.rules) {
      counter = { rules: acl.rules, hits: acl.rules.map(() => 0), implicitDeny: 0 };
      this.#aclHits.set(name, counter);
    }
    if (verdict.rule >= 0) counter.hits[verdict.rule] = (counter.hits[verdict.rule] ?? 0) + 1;
    else counter.implicitDeny++;
    if (!verdict.allowed) this.ctx.print('acl.denied', { acl: name, port: inPort + 1, what: verdict.what, src: verdict.src, rule: verdict.rule >= 0 ? String(verdict.rule + 1) : 'deny' });
    return verdict.allowed;
  }

  #aclState(): AclState[] {
    const device = this.#device;
    return (device?.acls ?? []).map((acl) => {
      const c = this.#aclHits.get(acl.name);
      const fresh = c && c.rules === acl.rules;
      return { name: acl.name, hits: fresh ? [...c.hits] : acl.rules.map(() => 0), implicitDeny: fresh ? c.implicitDeny : 0 };
    });
  }

  /** Access Point: Anmeldung eines Clients beantworten (Probe, Authentication, Association, 4-Way-Handshake). */
  #onLinkControl(port: number, frame: EthernetFrame) {
    const device = this.#device;
    const control = frame.payload;
    if (!device || device.type !== 'accesspoint' || !device.wlan || port === 0 || control.kind !== 'link' || control.tech !== 'wlan') return;
    const reassociation = control.message.startsWith('Reassociation');
    const steps = wlanSteps(!!device.wlan.password, reassociation, device.wlan.ssid);
    const index = wlanStepIndex(steps, control, 'sta');
    if (index < 0) return;
    if (control.message.endsWith('Request') && control.message.includes('ssociation')) this.ctx.print('wlan.associated', { client: frame.src, port });
    const mac = device.interfaces[port]?.mac ?? '';
    let delay = 0;
    for (const step of wlanRun(steps, index + 1, 'ap')) {
      delay += 1;
      this.ctx.schedule(delay, () => this.ctx.transmit(port, { src: mac, dst: frame.src, payload: toLink(step) }));
    }
  }

  /** Rahmen vom Switch selbst (SVI) ins VLAN schicken: bekannter Port oder an alle. */
  injectLocal(vlan: number, frame: EthernetFrame) {
    // Wie ein Rahmen von einem Port, den es nicht gibt: an alle Ports und ins Overlay.
    this.#forwardLocal(-2, vlan, frame, true);
  }

  state(): object {
    const now = this.ctx.now;
    const macTable = [...this.#table.values()]
      .filter((e) => e.expires > now && (e.port === OVERLAY_PORT || this.ctx.isConnected(e.port)))
      .sort((a, b) => a.vlan - b.vlan || a.port - b.port || a.mac.localeCompare(b.mac));
    const storm = this.storm;
    const acls = this.#aclState();
    const channels = this.#channelState();
    const extra = { ...(storm ? { storm } : {}), ...(acls.length ? { acls } : {}), ...(channels.length ? { channels } : {}) };
    if (!this.#stp) return { macTable, ...extra };
    const device = this.#device;
    const ports = (device?.interfaces ?? [])
      .filter((p) => this.ctx.isConnected(p.index))
      .filter((p) => this.ctx.isConnected(p.index))
      .map((p) => ({ port: p.index, role: this.#roles.get(this.#rep(p.index)) ?? 'designated', state: this.#state(p.index) }));
    const stp: StpState = { bridgeId: this.#bridgeId(), rootId: this.#rootId || this.#bridgeId(), rootPort: this.#rootPort, rootCost: this.#rootCost, ports };
    return { macTable, stp, ...extra };
  }
}

export interface ModemState {
  kind: ModemKind;
  standard: string;
  phase: 'idle' | 'connecting' | 'online';
  /** Erledigte Schritte des Verbindungsaufbaus. */
  progress: number;
  total: number;
  downstream: number;
  upstream: number;
}

/**
 * Modem: Brücke zwischen LAN-Buchse (Anschluss 0) und Zugangsleitung
 * (Anschluss 1). Mit Zugangstechnik baut es zuerst die Leitung zum Provider
 * auf (siehe access.ts) und überträgt erst danach Nutzdaten. Ohne Technik
 * (ältere Projekte) ist es eine reine Transportstrecke.
 */
export class ModemNode implements SimNode {
  #phase: ModemState['phase'] = 'idle';
  #progress = 0;
  #run = 0;

  constructor(protected readonly ctx: NodeContext) {}

  #kind(): ModemKind | undefined {
    return this.ctx.device()?.modem?.kind;
  }

  boot() {
    const kind = this.#kind();
    if (!kind) return;
    if (!this.ctx.isConnected(MODEM_WAN)) {
      if (this.#phase !== 'idle') this.ctx.print('modem.down');
      this.#phase = 'idle';
      this.#progress = 0;
      this.#run++;
      return;
    }
    if (this.#phase !== 'idle') return;
    this.#phase = 'connecting';
    this.ctx.print('modem.connecting', { standard: ACCESS_PROFILES[kind].standard });
    if (ACCESS_PROFILES[kind].steps[0]?.from === 'cpe') this.#sendFrom(kind, 0);
  }

  /** Eigene Schritte ab `index` senden, jeweils nach ihrer Wartezeit. */
  #sendFrom(kind: ModemKind, index: number) {
    const steps = nextSteps(kind, index, 'cpe');
    const run = this.#run;
    let delay = 0;
    steps.forEach((step, i) => {
      delay += step.delay ?? 1;
      this.ctx.schedule(delay, () => {
        if (run !== this.#run) return;
        const mac = this.ctx.device()?.interfaces[MODEM_WAN]?.mac ?? '';
        const payload: LinkControl = { kind: 'link', tech: step.tech, message: step.message, ...(step.fields ? { fields: step.fields } : {}) };
        this.ctx.transmit(MODEM_WAN, { src: mac, dst: '', payload });
        this.#progress = index + i + 1;
        this.#checkDone(kind);
      });
    });
  }

  #checkDone(kind: ModemKind) {
    const total = ACCESS_PROFILES[kind].steps.length;
    if (this.#phase === 'connecting' && this.#progress >= total) {
      this.#phase = 'online';
      const p = ACCESS_PROFILES[kind];
      this.ctx.print('modem.online', { standard: p.standard, down: p.downstream, up: p.upstream });
    }
  }

  receive(inPort: number, frame: EthernetFrame) {
    const device = this.ctx.device();
    const kind = this.#kind();
    if (!kind) {
      for (const port of device?.interfaces ?? []) {
        if (port.index !== inPort) this.ctx.transmit(port.index, frame);
      }
      return;
    }
    if (frame.payload.kind === 'link') {
      if (inPort !== MODEM_WAN) return;
      const index = stepIndex(kind, frame.payload, 'provider');
      if (index < 0) return;
      if (this.#phase === 'idle') this.#phase = 'connecting';
      this.#progress = Math.max(this.#progress, index + 1);
      this.#checkDone(kind);
      if (ACCESS_PROFILES[kind].steps[index + 1]?.from === 'cpe') this.#sendFrom(kind, index + 1);
      return;
    }
    // Nutzdaten erst, wenn die Leitung steht.
    if (this.#phase !== 'online') return;
    const { access: _a, ...plain } = frame;
    this.ctx.transmit(inPort === MODEM_WAN ? 0 : MODEM_WAN, inPort === MODEM_WAN ? plain : frame);
  }

  state() {
    const kind = this.#kind();
    if (!kind) return {};
    const p = ACCESS_PROFILES[kind];
    const modem: ModemState = { kind, standard: p.standard, phase: this.#phase, progress: this.#progress, total: p.steps.length, downstream: p.downstream, upstream: p.upstream };
    return { modem };
  }
}

/** Gruppenadresse (Multicast/Broadcast): niedrigstes Bit des ersten Bytes gesetzt. */
function isGroupMac(mac: string): boolean {
  return (parseInt(mac.slice(0, 2), 16) & 1) === 1;
}
