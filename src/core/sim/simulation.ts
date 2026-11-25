import { DEVICE_SPECS } from '../model/devices';
import { linkStatus } from '../model/links';
import { cableAt, getCable, getDevice, otherEnd } from '../model/topology';
import type { Device, Endpoint, Medium, Topology } from '../model/types';
import { runCommand } from './commands';
import type { AttackState } from './attack';
import type { Alert } from './host';
import type { ScanError, ScanRequest, ScanState } from './scan';
import type { LeaseRecord } from './dhcp';
import type { AccessTech, EthernetFrame } from './frames';
import { ACCESS_PROFILES } from './access';
import { isModemWan } from '../model/links';
import type { DnsCacheEntry } from './dns';
import { HostNode, type AddressState, type ConnectionInfo } from './host';
import { ClientGroupNode, type GroupMemberState } from './group';
import type { BrowserState } from './http';
import type { MailClientState } from './mail';
import { InternetNode, IpNode, RouterNode, type ArpEntry, type NatEntry } from './ip';
import type { Route } from '../net/routing';
import type { OspfState } from './ospf';
import type { BgpPeerInfo } from './bgp';
import type { PppStatus } from './ppp';
import type { Ip6State } from './ip6';
import type { FirewallState } from './firewall';
import type { VpnState } from './vpn';
import { EventQueue } from './queue';
import { QUEUE_COUNT, QUEUE_LIMIT, pcpOfDscp, queueOf } from '../net/qos';
import { frameBytes } from './size';
import type { VoipState } from './voip';
import { L3SwitchNode } from './l3switch';
import { ModemNode, SwitchNode, type AclState, type ChannelState, type MacEntry, type ModemState, type StormState, type StpState } from './switch';
import { CpeNode } from './cpe';

/** Übertragungszeit pro Kabel in Millisekunden (virtuelle Zeit). */
export const LINK_DELAY = 1;
/**
 * Verzögerung je Medium: Zugangsleitungen sind langsamer als das LAN
 * (Interleaving bei DSL, Funkstrecke bei LTE, Zeitschlitze bei DOCSIS).
 * Die Werte sind gerundete typische Laufzeiten, damit Traceroute sie zeigt.
 */
export const MEDIUM_DELAY: Record<Medium, number> = { tp: 1, fiber: 1, wireless: 1, serial: 5, coax: 4, dsl: 8, cellular: 15 };
const LOG_LIMIT = 5000;
const CONSOLE_LIMIT = 500;

export interface PacketLogEntry {
  id: number;
  sent: number;
  arrives: number;
  from: Endpoint;
  to: Endpoint;
  cable: string;
  frame: EthernetFrame;
  /** "lost": Rahmen kam nicht an, siehe `lostBecause`. */
  status: 'inTransit' | 'delivered' | 'lost';
  /** "removed": Kabel während der Übertragung entfernt; "damaged": beschädigtes Kabel. */
  lostBecause?: 'removed' | 'damaged' | 'queueFull';
  /** Wartezeit in der Warteschlange eines Ports mit begrenzter Bandbreite (ms). */
  queued?: number;
}

/** Kleiner, schneller Zufallsgenerator mit festem Startwert (Mulberry32): gleiche Abläufe, gleiche Verluste. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ausgabe einer Anwendung; Text entsteht erst in der Oberfläche aus Code und Parametern. */
export interface ConsoleLine {
  time: number;
  code: string;
  params?: Record<string, string | number>;
}

export interface DeviceState {
  console: ConsoleLine[];
  arp?: ArpEntry[];
  macTable?: MacEntry[];
  address?: AddressState;
  dhcpLeases?: LeaseRecord[];
  dnsCache?: DnsCacheEntry[];
  connections?: ConnectionInfo[];
  pinging?: boolean;
  attack?: AttackState;
  alerts?: Alert[];
  scan?: ScanState;
  browser?: BrowserState;
  mail?: MailClientState;
  mailboxes?: { user: string; count: number }[];
  voip?: VoipState;
  sipRegistrations?: { number: string; address: string; nat?: boolean }[];
  nat?: NatEntry[];
  stp?: StpState;
  /** Switch im Broadcast-Sturm (Schleife ohne Spanning Tree). */
  storm?: StormState;
  /** Switch: Treffer der Zugriffslisten (ACL). */
  acls?: AclState[];
  /** Switch: Port-Channels mit Zustand der Ports. */
  channels?: ChannelState[];
  /** Client-Gruppe: Adressen der einzelnen Rechner. */
  group?: GroupMemberState[];
  /** Modem: Zustand der Zugangsleitung. */
  modem?: ModemState;
  ospf?: OspfState;
  ospf6?: OspfState;
  bgp?: BgpPeerInfo[];
  /** Wirksame Routingtabelle (Router, Layer-3-Switches), inklusive gelernter Routen. */
  routes?: Route[];
  ppp?: PppStatus[];
  /** IPv6: Adressen, Nachbarn (Neighbor Discovery), Routen. */
  ipv6?: Ip6State;
  /** Firewall: Treffer je Regel, gesperrte Pakete. */
  firewall?: FirewallState;
  /** VPN-Tunnel des Routers. */
  vpn?: VpnState[];
}

/** Was ein Gerät von der Simulation sehen und auslösen darf. */
export interface NodeContext {
  readonly now: number;
  device(): Device | undefined;
  /** Gesamte Topologie, z.B. damit ein Switch weiss, was an seinen Ports hängt. */
  topology(): Topology;
  schedule(delay: number, run: () => void): void;
  transmit(iface: number, frame: EthernetFrame): boolean;
  isConnected(iface: number): boolean;
  print(code: string, params?: ConsoleLine['params']): void;
  clearConsole(): void;
}

export interface SimNode {
  receive(iface: number, frame: EthernetFrame): void;
  state(): Omit<DeviceState, 'console'>;
  /** Start bzw. Neustart nach Änderungen an der Topologie (wiederholbar). */
  boot?(): void;
}

/**
 * Diskrete Ereignis-Simulation. Die Oberfläche treibt die Zeit mit `runUntil`
 * oder `step` voran und liest Zustände ab; der Kern kennt die Oberfläche nicht.
 */
export class Simulation {
  #topology: Topology;
  #queue = new EventQueue();
  #now = 0;
  #log: PacketLogEntry[] = [];
  #inFlight = new Set<PacketLogEntry>();
  #nextLogId = 1;
  #nodes = new Map<string, SimNode>();
  #consoles = new Map<string, ConsoleLine[]>();
  #random = seededRandom(20_260_001);
  /** Ports mit begrenzter Bandbreite: Warteschlangen und ob gerade gesendet wird. */
  #ports = new Map<string, { queues: { frame: EthernetFrame; at: number }[][]; busy: boolean }>();

  constructor(topology: Topology) {
    this.#topology = topology;
    this.#bootDhcpClients();
  }

  get now(): number {
    return this.#now;
  }

  get topology(): Topology {
    return this.#topology;
  }

  /** Übernimmt eine geänderte Topologie; Zustände (z.B. ARP-Caches) bestehender Geräte bleiben erhalten. */
  updateTopology(topology: Topology) {
    this.#topology = topology;
    for (const id of [...this.#nodes.keys()]) {
      if (!getDevice(topology, id)) {
        this.#nodes.delete(id);
        this.#consoles.delete(id);
      }
    }
    this.#bootDhcpClients();
  }

  /**
   * Wie beim Einschalten: Switches mit STP senden BPDUs, Router handeln PPP
   * aus und starten Routingprotokolle, Modems bauen ihre Zugangsleitung auf,
   * DHCP-Clients fragen nach einer Adresse. `boot` ist wiederholbar und
   * startet nur, was noch nicht läuft.
   */
  #bootDhcpClients() {
    const order = (d: Device) => (DEVICE_SPECS[d.type].role === 'endpoint' ? 1 : 0);
    for (const device of [...this.#topology.devices].sort((a, b) => order(a) - order(b))) {
      if (DEVICE_SPECS[device.type].role === 'endpoint' && !device.dhcp && !device.wifi && !device.voip && !device.attack) continue;
      this.#node(device.id)?.boot?.();
    }
  }

  get idle(): boolean {
    return this.#queue.size === 0;
  }

  nextEventTime(): number | undefined {
    return this.#queue.peekTime();
  }

  /** Verarbeitet genau ein Ereignis. */
  step(): boolean {
    const event = this.#queue.pop();
    if (!event) return false;
    this.#now = event.time;
    event.run();
    return true;
  }

  /**
   * Lässt die Zeit bis `time` laufen; liefert die Anzahl verarbeiteter Ereignisse.
   * Höchstens `maxEvents` pro Aufruf, damit die Oberfläche auch bei sehr viel Verkehr bedienbar bleibt;
   * die Uhr bleibt dann beim letzten Ereignis stehen und holt beim nächsten Aufruf auf.
   */
  runUntil(time: number, maxEvents = 20_000): number {
    let count = 0;
    for (let next = this.#queue.peekTime(); next !== undefined && next <= time; next = this.#queue.peekTime()) {
      if (count >= maxEvents) return count;
      this.step();
      count++;
    }
    this.#now = Math.max(this.#now, time);
    return count;
  }

  /** Uhr vorstellen, ohne Ereignisse zu verarbeiten (zum exakten Wiederholen eines Ablaufs). */
  advanceClock(time: number) {
    this.#now = Math.max(this.#now, time);
  }

  /** Für Tests: alles abarbeiten, mit Obergrenze gegen Endlosschleifen. */
  runUntilIdle(maxEvents = 100_000) {
    for (let i = 0; i < maxEvents && this.step(); i++);
  }

  getPacketLog(): readonly PacketLogEntry[] {
    return this.#log;
  }

  /** Rahmen, die gerade über ein Kabel unterwegs sind (für die Animation). */
  getInFlight(): PacketLogEntry[] {
    return [...this.#inFlight];
  }

  /** Wirksame Routingtabelle eines Routers, Layer-3-Switches oder Endgeräts (inkl. dynamisch gelernter Routen). */
  getRoutes(id: string): Route[] {
    const node = getDevice(this.#topology, id) ? this.#node(id) : undefined;
    if (node instanceof L3SwitchNode) return node.router.routes();
    if (node instanceof IpNode) return node.routes();
    if (node instanceof ClientGroupNode) return node.member(1)?.routes() ?? [];
    return [];
  }

  /** Switches, die gerade einen Broadcast-Sturm erleben (für die Warnung in der Oberfläche). */
  stormingDevices(): string[] {
    return [...this.#nodes.entries()].filter(([, node]) => node instanceof SwitchNode && node.storm).map(([id]) => id);
  }

  clearPacketLog() {
    this.#log = [];
  }

  /** Momentaufnahme; spätere Änderungen der Simulation verändern sie nicht. */
  getDeviceState(id: string): DeviceState {
    const node = getDevice(this.#topology, id) ? this.#node(id) : undefined;
    return { console: [...(this.#consoles.get(id) ?? [])], ...node?.state() };
  }

  clearConsole(id: string) {
    this.#consoles.delete(id);
  }

  /** Startet "ping <ziel>" auf einem Endgerät oder (aus der Befehlszeile) auf einem Router/Layer-3-Switch. */
  ping(deviceId: string, target: string, member = 1, vrf?: string) {
    const node = this.#node(deviceId);
    if (node instanceof HostNode) node.ping(target);
    else if (node instanceof ClientGroupNode) node.member(member)?.ping(target);
    else if (node instanceof RouterNode) node.ping(target, vrf);
    else if (node instanceof L3SwitchNode) node.router.ping(target, vrf);
  }

  /** Strg+C in der Befehlszeile des Geräts. */
  interrupt(deviceId: string, member = 1) {
    this.#host(deviceId, member)?.interrupt();
  }

  /** Netzscanner starten (Programm auf PC, Notebook oder Server); liefert bei falschen Angaben einen Fehlercode. */
  scan(deviceId: string, request: ScanRequest): ScanError | null {
    return this.#host(deviceId)?.scanner.start(request) ?? null;
  }

  scanStop(deviceId: string) {
    this.#host(deviceId)?.scanner.stop();
  }

  traceroute(deviceId: string, target: string, member = 1) {
    this.#host(deviceId, member)?.traceroute(target);
  }

  /** Ruft im Webbrowser des Geräts eine URL auf, z.B. "http://webserver1/index.html". */
  browse(deviceId: string, url: string) {
    this.#host(deviceId)?.browse(url);
  }

  /** IP-Telefon: Rufnummer oder IP-Adresse anrufen; das Gespräch dauert `seconds` Sekunden. */
  call(deviceId: string, target: string, seconds?: number) {
    const host = this.#host(deviceId);
    if (host && this.#topology.devices.find((d) => d.id === deviceId)?.type === 'ipphone') host.phone.call(target, seconds);
  }

  hangup(deviceId: string) {
    this.#host(deviceId)?.phone.hangup();
  }

  /** Lastgenerator (wie iperf -u): `kbps` kbit/s UDP an `target` während `seconds` Sekunden. */
  iperf(deviceId: string, target: string, kbps: number, seconds: number, dscp = 0) {
    this.#host(deviceId)?.iperf.start(target, kbps, seconds, dscp);
  }

  /** E-Mail-Programm: Nachricht über den SMTP-Server des Kontos senden. */
  sendMail(deviceId: string, message: { to: string[]; subject: string; body: string }) {
    this.#host(deviceId)?.mail.send(message);
  }

  /** E-Mail-Programm: Posteingang per POP3 oder IMAP abholen. */
  fetchMail(deviceId: string) {
    this.#host(deviceId)?.mail.fetch();
  }

  /** SSH-Sitzung vom Endgerät zu einem Router oder Layer-3-Switch öffnen. */
  ssh(deviceId: string, target: string, user: string, password: string) {
    this.#host(deviceId)?.ssh.connect(target, user, password);
  }

  /** Eine Befehlszeile über die offene SSH-Sitzung übertragen. */
  sshSend(deviceId: string, line: string) {
    this.#host(deviceId)?.ssh.send(line);
  }

  sshClose(deviceId: string) {
    this.#host(deviceId)?.ssh.close();
  }

  /** WLAN-Client hat den Access Point gewechselt: neu anmelden (Reassociation) und Gratuitous ARP. */
  reassociate(deviceId: string) {
    this.#host(deviceId)?.wlanConnect(true);
  }

  /** Führt eine Zeile der simulierten Befehlszeile aus, z.B. "ipconfig /renew". */
  runCommand(deviceId: string, line: string, member = 1) {
    const host = this.#host(deviceId, member);
    if (host) runCommand(host, line);
  }

  /** Endgerät; bei einer Client-Gruppe deren erstes (oder gewähltes) Mitglied. */
  #accessOn(a: Endpoint, b: Endpoint): AccessTech | undefined {
    for (const end of [a, b]) {
      const device = getDevice(this.#topology, end.device);
      if (device?.modem && isModemWan(device, end.iface)) return ACCESS_PROFILES[device.modem.kind].data;
    }
    return undefined;
  }

  #host(id: string, member = 1): HostNode | undefined {
    const node = this.#node(id);
    if (node instanceof ClientGroupNode) return node.member(member);
    return node instanceof HostNode ? node : undefined;
  }

  #node(id: string): SimNode | undefined {
    const existing = this.#nodes.get(id);
    if (existing) return existing;
    const device = getDevice(this.#topology, id);
    if (!device) return undefined;
    const ctx = this.#context(id);
    const node: SimNode =
      device.type === 'accesspoint'
        ? new SwitchNode(ctx)
        : device.type === 'l3switch' || device.type === 'switch'
          ? new L3SwitchNode(ctx)
        : device.type === 'modem'
          ? new ModemNode(ctx)
          : device.type === 'cpe'
            ? new CpeNode(ctx)
          : device.type === 'router' || device.type === 'firewall'
            ? new RouterNode(ctx)
            : device.type === 'internet'
              ? new InternetNode(ctx)
              : device.type === 'clientgroup'
                ? new ClientGroupNode(ctx)
                : new HostNode(ctx);
    this.#nodes.set(id, node);
    return node;
  }

  #context(id: string): NodeContext {
    const sim = this;
    return {
      get now() {
        return sim.#now;
      },
      device: () => getDevice(sim.#topology, id),
      topology: () => sim.#topology,
      schedule: (delay, run) => sim.#queue.push(sim.#now + delay, run),
      transmit: (iface, frame) => sim.#transmit({ device: id, iface }, frame),
      isConnected: (iface) => {
        const cable = cableAt(sim.#topology, { device: id, iface });
        return !!cable && linkStatus(sim.#topology, cable).up;
      },
      print: (code, params) => {
        const lines = sim.#consoles.get(id) ?? [];
        lines.push({ time: sim.#now, code, params });
        sim.#consoles.set(id, lines.slice(-CONSOLE_LIMIT));
      },
      clearConsole: () => sim.#consoles.delete(id),
    };
  }

  /** QoS ohne Vertrauen («no trust»): DSCP und PCP ankommender Pakete auf 0 zurücksetzen. */
  #ingress(deviceId: string, frame: EthernetFrame): EthernetFrame {
    const qos = getDevice(this.#topology, deviceId)?.qos;
    if (qos?.trust !== false || frame.payload.kind !== 'ipv4' || !frame.payload.dscp) return frame;
    const { pcp: _p, ...rest } = frame;
    return { ...rest, payload: { ...frame.payload, dscp: 0 } };
  }

  #transmit(from: Endpoint, original: EthernetFrame): boolean {
    const cable = cableAt(this.#topology, from);
    // Abgeschaltete Anschlüsse und Funkverbindungen ohne Anmeldung übertragen nichts.
    if (!cable || !linkStatus(this.#topology, cable).up) return false;
    const device = getDevice(this.#topology, from.device);
    let frame = original;
    // QoS: Auf Trunks trägt der 802.1Q-Tag die Priorität aus dem DSCP (Klassenauswahl, RFC 2474).
    if (device?.qos && frame.vlan !== undefined && frame.payload.kind === 'ipv4' && frame.payload.dscp) frame = { ...frame, pcp: pcpOfDscp(frame.payload.dscp) };
    const rate = device?.interfaces[from.iface]?.rate;
    if (rate) return this.#enqueue(from, frame, rate, !!device?.qos);
    return this.#send(from, frame, 0);
  }

  /** Port mit begrenzter Bandbreite: einreihen (mit QoS nach Klasse, sonst eine Warteschlange). */
  #enqueue(from: Endpoint, frame: EthernetFrame, rate: number, qos: boolean): boolean {
    const key = `${from.device}:${from.iface}`;
    let port = this.#ports.get(key);
    if (!port) this.#ports.set(key, (port = { queues: Array.from({ length: QUEUE_COUNT }, () => []), busy: false }));
    const dscp = frame.payload.kind === 'ipv4' ? frame.payload.dscp : undefined;
    const queue = port.queues[qos ? queueOf(dscp, frame.pcp) : QUEUE_COUNT - 1]!;
    if (queue.length >= QUEUE_LIMIT) {
      // Tail Drop: Die Warteschlange ist voll, der Rahmen geht verloren.
      const cable = cableAt(this.#topology, from);
      if (cable) this.#record(from, otherEnd(cable, from.device), cable.id, frame, this.#now, 'lost', 'queueFull');
      return true;
    }
    queue.push({ frame, at: this.#now });
    if (!port.busy) this.#serve(from, rate);
    return true;
  }

  /** Nächsten Rahmen senden: strikte Priorität, Warteschlange 0 zuerst. */
  #serve(from: Endpoint, rate: number) {
    const port = this.#ports.get(`${from.device}:${from.iface}`)!;
    const next = port.queues.find((q) => q.length > 0)?.shift();
    if (!next) {
      port.busy = false;
      return;
    }
    port.busy = true;
    // Sendezeit: Bits / (kbit/s) = Millisekunden.
    const ms = (frameBytes(next.frame) * 8) / rate;
    const current = getDevice(this.#topology, from.device)?.interfaces[from.iface]?.rate ?? rate;
    this.#send(from, next.frame, ms, this.#now - next.at);
    this.#queue.push(this.#now + ms, () => this.#serve(from, current));
  }

  #record(from: Endpoint, to: Endpoint, cable: string, frame: EthernetFrame, arrives: number, status: PacketLogEntry['status'], lostBecause?: PacketLogEntry['lostBecause']): PacketLogEntry {
    const entry: PacketLogEntry = { id: this.#nextLogId++, sent: this.#now, arrives, from, to, cable, frame, status, ...(lostBecause ? { lostBecause } : {}) };
    this.#log.push(entry);
    if (this.#log.length > LOG_LIMIT) this.#log.splice(0, this.#log.length - LOG_LIMIT);
    return entry;
  }

  #send(from: Endpoint, original: EthernetFrame, txMs: number, waited = 0): boolean {
    const cable = cableAt(this.#topology, from);
    if (!cable || !linkStatus(this.#topology, cable).up) return false;
    const to = otherEnd(cable, from.device);
    // Auf der Zugangsleitung eines Modems reisen Nutzdaten in dessen Technik (DOCSIS, GPON, PPPoE, LTE).
    const access = original.payload.kind === 'link' ? undefined : this.#accessOn(from, to);
    const frame = access ? { ...original, access } : original;
    const entry: PacketLogEntry = {
      id: this.#nextLogId++,
      sent: this.#now,
      ...(waited > 0 ? { queued: Math.round(waited * 10) / 10 } : {}),
      arrives: this.#now + txMs + MEDIUM_DELAY[cable.medium ?? 'tp'],
      from,
      to,
      cable: cable.id,
      frame,
      status: 'inTransit',
    };
    this.#log.push(entry);
    if (this.#log.length > LOG_LIMIT) this.#log.splice(0, this.#log.length - LOG_LIMIT);
    this.#inFlight.add(entry);
    // Beschädigtes Kabel: Die Entscheidung fällt beim Senden, damit die Reihenfolge der Zufallszahlen feststeht.
    const damaged = (cable.loss ?? 0) > 0 && this.#random() * 100 < cable.loss!;

    this.#queue.push(entry.arrives, () => {
      this.#inFlight.delete(entry);
      // Wurde das Kabel inzwischen entfernt oder umgesteckt, geht der Rahmen verloren.
      const current = getCable(this.#topology, cable.id);
      const intact = current && linkStatus(this.#topology, current).up && cableAt(this.#topology, from)?.id === cable.id && cableAt(this.#topology, to)?.id === cable.id;
      if (!intact || damaged) {
        entry.status = 'lost';
        entry.lostBecause = intact ? 'damaged' : 'removed';
        return;
      }
      entry.status = 'delivered';
      this.#node(to.device)?.receive(to.iface, this.#ingress(to.device, frame));
    });
    return true;
  }
}
