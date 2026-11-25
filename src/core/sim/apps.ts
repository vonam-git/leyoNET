import type { IcmpMessage, Ipv4Packet, Ipv6Packet } from './frames';
import type { SendError } from './ip';
import type { NodeContext } from './simulation';

export const PING_COUNT = 4;
export const PING_INTERVAL = 1000;
export const PING_TIMEOUT = 3000;
export const PING_SIZE = 32;
export const TRACE_MAX_HOPS = 30;
export const TRACE_TIMEOUT = 2000;

/** Was eine ICMP-Anwendung vom Endgerät braucht. */
export interface IcmpHost {
  readonly ctx: NodeContext;
  sendIp(dst: string, payload: Ipv4Packet['payload'], options?: { ttl?: number }, onError?: (e: SendError) => void): void;
}

/**
 * ICMPv6-Echo und -Fehler in der Form, die Ping und Traceroute kennen
 * (Typ-Namen sind gleich; Hop Limit erscheint als TTL). null = nicht relevant.
 */
export function icmpView(packet: Ipv6Packet): Ipv4Packet | null {
  const m = packet.payload;
  if (m.kind !== 'icmpv6') return null;
  if (m.type !== 'echoReply' && m.type !== 'destUnreachable' && m.type !== 'timeExceeded') return null;
  const { target: _t, linkAddr: _l, flags: _f, prefix: _p, routerLifetime: _r, mtu: _m, ...rest } = m;
  return { kind: 'ipv4', src: packet.src, dst: packet.dst, ttl: packet.hopLimit, id: 0, payload: { ...rest, kind: 'icmp', type: m.type } };
}

export interface IcmpApp {
  onIcmp(packet: Ipv4Packet): void;
  cancel(): void;
}

/** Optionen von «ping»: Anzahl (null = bis Strg+C) und TTL der Anfragen. */
export interface PingOptions {
  count?: number | null;
  ttl?: number;
}
export const PING_MAX_COUNT = 1000;

/**
 * Liest «ping [-t] [-n Anzahl | -c Anzahl] [-i TTL] Ziel» (Windows: -t, -n, -i; Linux: -c).
 * «-t» ist wie unter Windows der Dauerping, nie die TTL.
 */
export function parsePing(args: readonly string[]): { target: string; options: PingOptions } | { error: 'usage' | 'badCount' | 'badTtl'; value?: string } {
  const options: PingOptions = {};
  let target: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const flag = arg.toLowerCase();
    if (flag === '-t' || flag === '/t') options.count = null;
    else if (['-n', '/n', '-c'].includes(flag)) {
      const value = args[++i];
      if (value === undefined) return { error: 'usage' };
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > PING_MAX_COUNT) return { error: 'badCount', value };
      if (options.count !== null) options.count = Number(value);
    } else if (['-i', '/i', '--ttl', '-ttl'].includes(flag)) {
      const value = args[++i];
      if (value === undefined) return { error: 'usage' };
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 255) return { error: 'badTtl', value };
      options.ttl = Number(value);
    } else if (/^[-/]/.test(arg) || target !== undefined) return { error: 'usage' };
    else target = arg;
  }
  return target === undefined ? { error: 'usage' } : { target, options };
}

/** Ablauf von "ping": vier (oder gewählt viele) Echo-Anfragen, jeweils eine Sekunde nach Antwort oder Zeitüberschreitung. */
export class PingRun implements IcmpApp {
  #seq = 0;
  #received = 0;
  #outstanding = new Map<number, number>();
  #cancelled = false;

  constructor(
    private readonly host: IcmpHost,
    private readonly target: string,
    private readonly id: number,
    private readonly gateway: string,
    private readonly name?: string,
    private readonly options: PingOptions = {},
  ) {}

  get #count(): number {
    return this.options.count === null ? Number.POSITIVE_INFINITY : (this.options.count ?? PING_COUNT);
  }

  /** Dauerping, der noch läuft. */
  get endless(): boolean {
    return this.options.count === null && !this.#cancelled;
  }

  /** Noch nicht fertig (für den Stopp-Knopf). */
  get running(): boolean {
    return !this.#cancelled;
  }

  get #ctx() {
    return this.host.ctx;
  }

  start() {
    if (this.name) this.#ctx.print('ping.startNamed', { name: this.name, target: this.target, size: PING_SIZE });
    else this.#ctx.print('ping.start', { target: this.target, size: PING_SIZE });
    this.#send();
  }

  cancel() {
    this.#cancelled = true;
  }

  /** Strg+C: abbrechen und die Statistik zeigen; noch offene Anfragen zählen nicht. */
  stop() {
    if (this.#cancelled) return;
    this.#ctx.print('cmd.interrupt');
    this.#finish(this.#seq - this.#outstanding.size);
  }

  #send() {
    if (this.#cancelled) return;
    const seq = ++this.#seq;
    this.#outstanding.set(seq, this.#ctx.now);
    this.#ctx.schedule(PING_TIMEOUT, () => {
      if (this.#settle(seq)) this.#ctx.print('ping.timeout');
    });
    const request: IcmpMessage = { kind: 'icmp', type: 'echoRequest', id: this.id, seq, size: PING_SIZE };
    this.host.sendIp(this.target, request, this.options.ttl === undefined ? {} : { ttl: this.options.ttl }, (error) => {
      if (this.#settle(seq)) this.#ctx.print(`ping.${error}`, { target: this.target, gateway: this.gateway });
    });
  }

  onIcmp(packet: Ipv4Packet) {
    const icmp = packet.payload;
    if (icmp.kind !== 'icmp') return;
    if (icmp.type === 'echoReply') {
      if (icmp.id !== this.id) return;
      const sentAt = this.#outstanding.get(icmp.seq);
      if (sentAt === undefined || !this.#settle(icmp.seq)) return;
      this.#received++;
      this.#ctx.print('ping.reply', { from: packet.src, size: icmp.size, time: this.#ctx.now - sentAt, ttl: packet.ttl });
      return;
    }
    // Ein Router meldet, dass unsere Anfrage nicht zugestellt werden konnte.
    const original = icmp.original;
    if (!original || original.id !== this.id || !this.#settle(original.seq)) return;
    if (icmp.type === 'timeExceeded') this.#ctx.print(this.options.ttl === undefined ? 'ping.ttlExpired' : 'ping.ttlExpiredSet', { from: packet.src, ttl: this.options.ttl ?? 0 });
    else this.#ctx.print(icmp.code === 'host' ? 'ping.hostUnreachableFrom' : 'ping.netUnreachableFrom', { from: packet.src });
  }

  /** Schliesst eine Anfrage ab (genau einmal) und plant die nächste. */
  #settle(seq: number): boolean {
    if (this.#cancelled || !this.#outstanding.delete(seq)) return false;
    if (this.#seq < this.#count) this.#ctx.schedule(PING_INTERVAL, () => this.#send());
    else this.#ctx.schedule(0, () => this.#finish());
    return true;
  }

  #finish(sent = this.#seq) {
    if (this.#cancelled) return;
    this.#cancelled = true;
    this.#outstanding.clear();
    const lost = sent - this.#received;
    this.#ctx.print('ping.summary', {
      target: this.target,
      sent,
      received: this.#received,
      lost,
      percent: sent ? Math.round((lost / sent) * 100) : 0,
    });
  }
}

/**
 * "tracert": Echo-Anfragen mit TTL 1, 2, 3 …; jeder Router auf dem Weg
 * verwirft das Paket bei TTL 0 und verrät sich mit "TTL abgelaufen".
 */
export class TracerouteRun implements IcmpApp {
  #hop = 0;
  #sentAt = 0;
  #done = false;

  constructor(
    private readonly host: IcmpHost,
    private readonly target: string,
    private readonly id: number,
    private readonly name?: string,
  ) {}

  get #ctx() {
    return this.host.ctx;
  }

  start() {
    if (this.name) this.#ctx.print('tracert.startNamed', { name: this.name, target: this.target, max: TRACE_MAX_HOPS });
    else this.#ctx.print('tracert.start', { target: this.target, max: TRACE_MAX_HOPS });
    this.#next();
  }

  cancel() {
    this.#done = true;
  }

  #next() {
    if (this.#done) return;
    if (this.#hop >= TRACE_MAX_HOPS) return this.#finish();
    const hop = ++this.#hop;
    this.#sentAt = this.#ctx.now;
    this.#ctx.schedule(TRACE_TIMEOUT, () => {
      if (this.#done || this.#hop !== hop) return;
      this.#ctx.print('tracert.timeout', { hop });
      this.#next();
    });
    const probe: IcmpMessage = { kind: 'icmp', type: 'echoRequest', id: this.id, seq: hop, size: PING_SIZE };
    this.host.sendIp(this.target, probe, { ttl: hop }, (error) => {
      if (this.#done || this.#hop !== hop) return;
      this.#ctx.print(`ping.${error}`, { target: this.target });
      this.#finish();
    });
  }

  onIcmp(packet: Ipv4Packet) {
    const icmp = packet.payload;
    if (this.#done || icmp.kind !== 'icmp') return;
    const matches =
      icmp.type === 'echoReply' ? icmp.id === this.id && icmp.seq === this.#hop : icmp.original?.id === this.id && icmp.original.seq === this.#hop;
    if (!matches) return;
    const line = { hop: this.#hop, time: this.#ctx.now - this.#sentAt, from: packet.src };
    if (icmp.type === 'timeExceeded') {
      this.#ctx.print('tracert.hop', line);
      this.#next();
    } else if (icmp.type === 'echoReply') {
      this.#ctx.print('tracert.hop', line);
      this.#finish();
    } else {
      this.#ctx.print(icmp.code === 'host' ? 'tracert.hostUnreachable' : 'tracert.netUnreachable', line);
      this.#finish();
    }
  }

  #finish() {
    if (this.#done) return;
    this.#done = true;
    this.#ctx.print('tracert.done');
  }
}
