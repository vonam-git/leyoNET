import type { Device, VrrpGroup } from '../model/types';
import { formatIp, parseIp } from '../net/ipv4';
import type { IfaceAddress } from '../net/routing';
import { BROADCAST_MAC, VRRP_MULTICAST, vrrpMac, type EthernetFrame, type Ipv4Packet, type VrrpPacket } from './frames';
import type { NodeContext } from './simulation';
import { SYSLOG_SEVERITY } from './syslog';

/**
 * VRRP Version 3 für IPv4 (RFC 9568): redundantes Standardgateway. Mehrere Router (oder
 * Layer-3-Switches) bilden eine Gruppe mit einer virtuellen IP- und MAC-Adresse. Der Master
 * beantwortet ARP für die virtuelle Adresse und leitet Pakete an die virtuelle MAC weiter; er
 * meldet sich jede Sekunde (Advertisement). Bleibt das Advertisement aus, übernimmt das Backup
 * mit der höchsten Priorität nach dem Master_Down_Interval.
 */

/** Advertisement-Intervall: 1 s (RFC 9568: 100 Hundertstelsekunden). */
export const VRRP_INTERVAL = 1000;
export const VRRP_DEFAULT_PRIORITY = 100;
export const VRRP_OWNER_PRIORITY = 255;
/** Höchstzahl Gruppen je Gerät. */
export const MAX_VRRP_GROUPS = 16;
export const VRRP_TTL = 255;

export type VrrpStateName = 'init' | 'backup' | 'master';

export interface VrrpGroupState {
  iface: number;
  vrid: number;
  ip: string;
  state: VrrpStateName;
  /** Wirksame Priorität (mit Tracking; Besitzer 255). */
  priority: number;
  /** Adresse des aktuellen Masters (bei sich selbst die eigene). */
  master?: string;
  /** Seit wann der Zustand gilt (virtuelle Zeit). */
  since: number;
}

export interface VrrpHost {
  readonly ctx: NodeContext;
  device(): Device | undefined;
  interfaces(): IfaceAddress[];
  ifaceUp(index: number): boolean;
  sendFrame(index: number, frame: EthernetFrame): boolean;
  syslog(severity: number, msgid: string, text: string, params?: Record<string, string>): void;
}

interface Running {
  state: VrrpStateName;
  since: number;
  master?: string;
  /** Max Advertise Interval des Masters (ms), für das Master_Down_Interval. */
  masterInterval: number;
  /** Laufnummer des gültigen Timers; ältere geplante Timer verfallen. */
  timer: number;
}

const keyOf = (iface: number, vrid: number) => `${iface}|${vrid}`;

/** Master_Down_Interval = 3 × Advertisement-Intervall + Skew_Time, Skew = (256 − Priorität) × Intervall / 256. */
export function masterDownInterval(priority: number, interval = VRRP_INTERVAL): number {
  return 3 * interval + skewTime(priority, interval);
}

export function skewTime(priority: number, interval = VRRP_INTERVAL): number {
  return Math.floor(((256 - priority) * interval) / 256);
}

export class Vrrp {
  #groups = new Map<string, Running>();
  #nextTimer = 0;
  #ipId = 0;

  constructor(private readonly host: VrrpHost) {}

  get #ctx() {
    return this.host.ctx;
  }

  #config(): VrrpGroup[] {
    return this.host.device()?.vrrp ?? [];
  }

  #own(iface: number): IfaceAddress | undefined {
    return this.host.interfaces().find((i) => i.index === iface);
  }

  /** Besitzer: Die virtuelle Adresse ist die eigene Interface-Adresse (Priorität 255, RFC 9568 Abschnitt 6.1). */
  #isOwner(group: VrrpGroup): boolean {
    const own = this.#own(group.iface);
    return !!own && parseIp(group.ip) === own.ip;
  }

  /** Wirksame Priorität: Besitzer 255, sonst die eingestellte, abzüglich Tracking bei ausgefallenem Anschluss. */
  priorityOf(group: VrrpGroup): number {
    if (this.#isOwner(group)) return VRRP_OWNER_PRIORITY;
    const base = group.priority ?? VRRP_DEFAULT_PRIORITY;
    const down = group.track && !this.host.ifaceUp(group.track.iface);
    return Math.max(1, down ? base - group.track!.decrement : base);
  }

  /** Läuft auf dem Gerät mindestens eine Gruppe (Multicast 224.0.0.18 hören)? */
  active(): boolean {
    return this.#config().length > 0;
  }

  /** Start und Neustart nach Änderungen: neue Gruppen starten, entfernte und ausgefallene stoppen, Prioritäten melden. */
  boot() {
    const config = this.#config();
    const keys = new Set(config.map((g) => keyOf(g.iface, g.vrid)));
    for (const [key, run] of this.#groups) {
      if (keys.has(key)) continue;
      const [iface, vrid] = key.split('|').map(Number) as [number, number];
      // Gruppe gelöscht: Als Master mit Priorität 0 zurücktreten, damit ein Backup sofort übernimmt.
      if (run.state === 'master') this.#advertise({ iface, vrid, ip: run.master ?? '' }, 0);
      this.#groups.delete(key);
    }
    for (const group of config) {
      const key = keyOf(group.iface, group.vrid);
      const run = this.#groups.get(key);
      const usable = this.host.ifaceUp(group.iface) && !!this.#own(group.iface);
      if (!usable) {
        if (run && run.state !== 'init') this.#enter(group, run, 'init');
        else if (!run) this.#groups.set(key, { state: 'init', since: this.#ctx.now, masterInterval: VRRP_INTERVAL, timer: 0 });
        continue;
      }
      if (!run || run.state === 'init') {
        const fresh = run ?? { state: 'init' as const, since: this.#ctx.now, masterInterval: VRRP_INTERVAL, timer: 0 };
        this.#groups.set(key, fresh);
        // RFC 9568, 6.4.1: Der Besitzer wird sofort Master, alle anderen beginnen als Backup.
        this.#enter(group, fresh, this.priorityOf(group) === VRRP_OWNER_PRIORITY ? 'master' : 'backup');
        continue;
      }
      // Geänderte Priorität (Tracking, Einstellung): Der Master meldet sie sofort.
      if (run.state === 'master') this.#advertise(group, this.priorityOf(group));
    }
  }

  #enter(group: VrrpGroup, run: Running, state: VrrpStateName) {
    const before = run.state;
    run.state = state;
    run.since = this.#ctx.now;
    run.timer = ++this.#nextTimer;
    const own = this.#own(group.iface);
    if (state === 'master') {
      run.master = own ? formatIp(own.ip) : undefined;
      this.#advertise(group, this.priorityOf(group));
      this.#gratuitousArp(group);
      this.#scheduleAdvert(group, run.timer);
    } else if (state === 'backup') {
      run.masterInterval = VRRP_INTERVAL;
      this.#scheduleMasterDown(group, run.timer, masterDownInterval(this.priorityOf(group)));
    } else run.master = undefined;
    if (before === state) return;
    const params = { vrid: group.vrid, ip: group.ip, priority: this.priorityOf(group) };
    this.#ctx.print(`vrrp.${state}`, params);
    if (state !== 'init' || before === 'master') {
      this.host.syslog(SYSLOG_SEVERITY.notice, 'VRRP', `vrrp group ${group.vrid} ${before} -> ${state}`, { vrid: String(group.vrid), ip: group.ip, state });
    }
  }

  #scheduleAdvert(group: VrrpGroup, timer: number) {
    this.#ctx.schedule(VRRP_INTERVAL, () => {
      const run = this.#groups.get(keyOf(group.iface, group.vrid));
      if (!run || run.timer !== timer || run.state !== 'master') return;
      const current = this.#current(group);
      if (!current) return;
      this.#advertise(current, this.priorityOf(current));
      this.#scheduleAdvert(current, timer);
    });
  }

  #scheduleMasterDown(group: VrrpGroup, timer: number, delay: number) {
    this.#ctx.schedule(delay, () => {
      const run = this.#groups.get(keyOf(group.iface, group.vrid));
      if (!run || run.timer !== timer || run.state !== 'backup') return;
      const current = this.#current(group);
      if (current) this.#enter(current, run, 'master');
    });
  }

  /** Aktuelle Einstellung der Gruppe (sie kann sich seit dem Planen eines Timers geändert haben). */
  #current(group: VrrpGroup): VrrpGroup | undefined {
    return this.#config().find((g) => g.iface === group.iface && g.vrid === group.vrid);
  }

  /** Advertisement an 224.0.0.18, TTL 255, mit der virtuellen MAC als Absender (RFC 9568, 7.3). */
  #advertise(group: Pick<VrrpGroup, 'iface' | 'vrid' | 'ip'>, priority: number) {
    const own = this.#own(group.iface);
    if (!own || !this.host.ifaceUp(group.iface)) return;
    const vrrp: VrrpPacket = { kind: 'vrrp', vrid: group.vrid, priority, interval: VRRP_INTERVAL / 10, addresses: [group.ip] };
    const packet: Ipv4Packet = { kind: 'ipv4', src: formatIp(own.ip), dst: VRRP_MULTICAST, ttl: VRRP_TTL, id: ++this.#ipId, payload: vrrp };
    this.host.sendFrame(group.iface, { src: vrrpMac(group.vrid), dst: '01:00:5E:00:00:12', payload: packet });
  }

  /** Neuer Master: Gratuitous ARP mit der virtuellen MAC, damit Switches den neuen Weg lernen. */
  #gratuitousArp(group: VrrpGroup) {
    const mac = vrrpMac(group.vrid);
    this.host.sendFrame(group.iface, { src: mac, dst: BROADCAST_MAC, payload: { kind: 'arp', op: 'request', senderMac: mac, senderIp: group.ip, targetMac: '00:00:00:00:00:00', targetIp: group.ip } });
  }

  /** Empfangenes Advertisement (RFC 9568, 6.4.2 und 6.4.3). */
  receive(packet: Ipv4Packet, adv: VrrpPacket, index: number) {
    // TTL muss 255 sein: Advertisements kommen nur aus dem eigenen Netz (RFC 9568, 7.1).
    if (packet.ttl !== VRRP_TTL) return this.#ctx.print('vrrp.badTtl', { from: packet.src, ttl: packet.ttl });
    const group = this.#config().find((g) => g.iface === index && g.vrid === adv.vrid);
    const run = group && this.#groups.get(keyOf(group.iface, group.vrid));
    if (!group || !run || run.state === 'init') return;
    if (!adv.addresses.includes(group.ip)) this.#ctx.print('vrrp.addressMismatch', { vrid: adv.vrid, from: packet.src, ip: adv.addresses.join(', ') });
    const mine = this.priorityOf(group);
    const own = this.#own(group.iface);
    if (run.state === 'backup') {
      if (adv.priority === 0) {
        // Der Master tritt zurück: nach der Skew_Time übernehmen.
        run.timer = ++this.#nextTimer;
        this.#scheduleMasterDown(group, run.timer, skewTime(mine));
        return;
      }
      // Preempt: Ein schwächerer Master wird ignoriert, sein Timer läuft ab und dieses Backup übernimmt.
      if (group.preempt !== false && adv.priority < mine) return;
      run.master = packet.src;
      run.masterInterval = adv.interval * 10;
      run.timer = ++this.#nextTimer;
      this.#scheduleMasterDown(group, run.timer, masterDownInterval(mine, run.masterInterval));
      return;
    }
    // Master: Bei Priorität 0 sofort melden; ein stärkerer Master (bei Gleichstand die grössere Adresse) gewinnt.
    if (adv.priority === 0) return this.#advertise(group, mine);
    const src = parseIp(packet.src) ?? 0;
    if (adv.priority > mine || (adv.priority === mine && own && src >>> 0 > own.ip >>> 0)) {
      this.#enter(group, run, 'backup');
      run.master = packet.src;
    }
  }

  /** Ist das Gerät Master einer Gruppe mit dieser virtuellen MAC auf dem Interface? */
  ownsMac(index: number, mac: string): boolean {
    return this.#config().some((g) => g.iface === index && vrrpMac(g.vrid) === mac.toUpperCase() && this.#groups.get(keyOf(g.iface, g.vrid))?.state === 'master');
  }

  /** Virtuelle MAC für eine ARP-Anfrage nach `ip`, wenn das Gerät dafür Master ist. */
  arpMac(index: number, ip: string): string | undefined {
    const group = this.#config().find((g) => g.iface === index && g.ip === ip && this.#groups.get(keyOf(g.iface, g.vrid))?.state === 'master');
    return group ? vrrpMac(group.vrid) : undefined;
  }

  /** Nimmt das Gerät Pakete an die virtuelle Adresse selbst an (Besitzer oder Master mit Accept Mode)? */
  accepts(ip: number): boolean {
    return this.#config().some((g) => parseIp(g.ip) === ip && (g.accept || this.#isOwner(g)) && this.#groups.get(keyOf(g.iface, g.vrid))?.state === 'master');
  }

  /** Paket an eine virtuelle Adresse, die das Gerät nicht annimmt: verwerfen (RFC 9568, 6.4.3, Accept_Mode). */
  discards(dst: string): boolean {
    const ip = parseIp(dst);
    return ip !== null && this.#config().some((g) => parseIp(g.ip) === ip) && !this.accepts(ip) && !this.host.interfaces().some((i) => i.ip === ip);
  }

  state(): VrrpGroupState[] {
    return this.#config().map((g) => {
      const run = this.#groups.get(keyOf(g.iface, g.vrid));
      return { iface: g.iface, vrid: g.vrid, ip: g.ip, state: run?.state ?? 'init', priority: this.priorityOf(g), ...(run?.master ? { master: run.master } : {}), since: run?.since ?? 0 };
    });
  }
}
