/**
 * Telefonie über IP: SIP (RFC 3261) für den Verbindungsaufbau, SDP (RFC 8866) für Adresse und
 * Port der Sprache, RTP (RFC 3550) mit G.711 µ-law (RFC 3551) für die Sprache selbst.
 *
 * Vereinfachungen für den Unterricht:
 * - Die Telefonanlage ist Registrar und Proxy in einem; alle Anfragen eines Gesprächs laufen
 *   über sie (wie mit Record-Route). Ohne Anlage ruft ein Telefon direkt eine IP-Adresse an.
 * - Das angerufene Telefon nimmt nach einer Sekunde von selbst ab.
 * - Gesprochen wird nicht: RTP trägt Stille, gemessen werden Verlust, Laufzeit und Jitter
 *   (zwischenzeitliche Laufzeitschwankung nach RFC 3550, Abschnitt 6.4.1).
 * - Bewertung der Qualität angelehnt an ITU-T G.114 (Laufzeit in eine Richtung) und übliche
 *   Grenzen für Verlust und Jitter.
 */
import { DSCP } from '../net/qos';
import { parseIp } from '../net/ipv4';
import { IPERF_PORT, SIP_PORT, type Ipv4Packet, type RtpPacket, type SipMessage, type SipMethod, type UdpDatagram } from './frames';
import type { SendOptions } from './ip';
import type { NodeContext } from './simulation';

export interface VoipHost {
  ctx: NodeContext;
  sendIp(dst: string, payload: UdpDatagram, options?: SendOptions, onError?: (e: string) => void): void;
  /** Eigene IPv4-Adresse (fest oder per DHCP), sonst undefined. */
  ownIp(): string | undefined;
}

export const RTP_PORT = 4000;
export const RTP_INTERVAL = 20;
export const DEFAULT_CALL_SECONDS = 10;
const ANSWER_DELAY = 1000;

export type CallPhase = 'calling' | 'ringing' | 'active' | 'ended' | 'failed';
export type CallQuality = 'good' | 'fair' | 'poor';

export interface CallStats {
  sent: number;
  received: number;
  lost: number;
  /** Verlust in Prozent. */
  loss: number;
  /** Mittlere Laufzeit in eine Richtung (ms). */
  delay: number;
  /** Jitter nach RFC 3550 (ms). */
  jitter: number;
  quality: CallQuality;
}

export interface CallState {
  phase: CallPhase;
  peer: string;
  /** Grund bei «failed»: Statuscode (404, 486 …) oder «timeout», «noServer», «noAddress». */
  reason?: string;
  incoming: boolean;
  stats: CallStats;
}

export interface VoipState {
  number?: string;
  server?: string;
  registered: boolean;
  call?: CallState;
}

/** Bewertung: gut bis 150 ms Laufzeit (ITU-T G.114), 1 % Verlust und 30 ms Jitter; schlecht ab 400 ms, 5 %, 60 ms. */
export function rateCall(s: { loss: number; delay: number; jitter: number }): CallQuality {
  if (s.loss > 5 || s.delay > 400 || s.jitter > 60) return 'poor';
  if (s.loss > 1 || s.delay > 150 || s.jitter > 30) return 'fair';
  return 'good';
}

interface Call {
  callId: string;
  peer: string;
  /** Wohin SIP-Anfragen gehen (Anlage oder Gegenstelle). */
  next: string;
  uri: string;
  from: string;
  to: string;
  incoming: boolean;
  phase: CallPhase;
  reason?: string;
  media?: { ip: string; port: number };
  cseq: number;
  seconds: number;
  sent: number;
  received: number;
  firstSeq?: number;
  maxSeq: number;
  delaySum: number;
  jitter: number;
  lastTransit?: number;
  seq: number;
  ssrc: number;
  timer?: boolean;
}

/** SIP-Telefon (User Agent) auf einem IP-Telefon. */
export class SipPhone {
  #registered = false;
  #call: Call | null = null;
  #tries = 0;
  #calls = 0;

  constructor(
    private readonly host: VoipHost,
    private readonly seq: number,
  ) {}

  #config() {
    return this.host.ctx.device()?.voip;
  }

  #dscp(kind: 'voice' | 'signaling') {
    return this.#config()?.marking === false ? 0 : kind === 'voice' ? DSCP.EF : DSCP.CS5;
  }

  #self(): string {
    const c = this.#config();
    const ip = this.host.ownIp() ?? '0.0.0.0';
    return c?.number && c.server ? `sip:${c.number}@${c.server}` : `sip:${ip}`;
  }

  #sendSip(dst: string, msg: SipMessage) {
    this.host.sendIp(dst, { kind: 'udp', srcPort: SIP_PORT, dstPort: SIP_PORT, payload: msg }, { dscp: this.#dscp('signaling') });
  }

  /** Nach dem Start bei der Anlage anmelden (wartet, bis eine Adresse da ist). */
  boot() {
    this.#tries = 0;
    this.host.ctx.schedule(1500, () => this.#register());
  }

  #register() {
    const c = this.#config();
    if (!c?.server || this.#registered) return;
    const ip = this.host.ownIp();
    if (!ip) {
      if (++this.#tries < 15) this.host.ctx.schedule(1000, () => this.#register());
      return;
    }
    const aor = `sip:${c.number}@${c.server}`;
    this.#sendSip(c.server, { kind: 'sip', method: 'REGISTER', uri: `sip:${c.server}`, from: aor, to: aor, callId: `reg-${this.seq}`, cseq: 1, cseqMethod: 'REGISTER', contact: `${c.number}@${ip}`, via: [ip] });
    // Ohne Antwort später nochmals versuchen.
    if (++this.#tries < 15) this.host.ctx.schedule(3000, () => this.#register());
  }

  /** Anruf an eine Rufnummer (über die Anlage) oder an eine IP-Adresse (direkt). */
  call(target: string, seconds = DEFAULT_CALL_SECONDS) {
    const ctx = this.host.ctx;
    const ip = this.host.ownIp();
    if (this.#call && (this.#call.phase === 'calling' || this.#call.phase === 'ringing' || this.#call.phase === 'active')) return ctx.print('voip.busy');
    if (!ip) return ctx.print('voip.noAddress');
    const direct = parseIp(target) !== null;
    const server = this.#config()?.server;
    if (!direct && !server) return ctx.print('voip.noServer', { target });
    const next = direct ? target : server!;
    const uri = direct ? `sip:${target}` : `sip:${target}@${server}`;
    this.#call = this.#newCall(`call-${this.seq}-${++this.#calls}`, target, next, uri, this.#self(), uri, false, seconds);
    ctx.print('voip.calling', { target });
    this.#request('INVITE', true);
    // Keine Antwort innert 8 s: aufgeben (Timer B von RFC 3261 ist länger, 32 s).
    const call = this.#call;
    ctx.schedule(8000, () => {
      if (this.#call === call && (call.phase === 'calling' || call.phase === 'ringing')) this.#fail(call, 'timeout');
    });
  }

  hangup() {
    const call = this.#call;
    if (!call || call.phase === 'ended' || call.phase === 'failed') return this.host.ctx.print('voip.noCall');
    if (call.phase === 'active') this.#request('BYE', false);
    this.#end(call);
  }

  #newCall(callId: string, peer: string, next: string, uri: string, from: string, to: string, incoming: boolean, seconds: number): Call {
    return { callId, peer, next, uri, from, to, incoming, phase: incoming ? 'ringing' : 'calling', cseq: 1, seconds, sent: 0, received: 0, maxSeq: -1, delaySum: 0, jitter: 0, seq: 0, ssrc: (this.seq * 2654435761 + this.#calls * 40503) >>> 0 };
  }

  #request(method: SipMethod, withSdp: boolean) {
    const call = this.#call!;
    const ip = this.host.ownIp() ?? '0.0.0.0';
    if (method !== 'INVITE') call.cseq++;
    // Bei Anfragen des Angerufenen sind From und To vertauscht.
    const [from, to] = call.incoming ? [call.to, call.from] : [call.from, call.to];
    this.#sendSip(call.next, { kind: 'sip', method, uri: call.uri, from, to, callId: call.callId, cseq: call.cseq, cseqMethod: method === 'ACK' ? 'INVITE' : method, contact: ip, ...(withSdp ? { sdp: { ip, port: RTP_PORT } } : {}), via: [ip] });
  }

  #respond(req: SipMessage, status: number, src: string, withSdp = false) {
    const ip = this.host.ownIp() ?? '0.0.0.0';
    const { method: _m, ...rest } = req;
    this.#sendSip(req.via[0] ?? src, { ...rest, status, contact: ip, ...(withSdp ? { sdp: { ip, port: RTP_PORT } } : { sdp: undefined }) });
  }

  onSip(packet: Ipv4Packet, msg: SipMessage) {
    const ctx = this.host.ctx;
    if (msg.status !== undefined) return this.#onResponse(msg);
    const call = this.#call;
    if (msg.method === 'INVITE') {
      if (call && (call.phase === 'calling' || call.phase === 'ringing' || call.phase === 'active') && call.callId !== msg.callId) return this.#respond(msg, 486, packet.src);
      const viaServer = msg.via.length > 1;
      const caller = msg.from.replace(/^sip:/, '').replace(/@.*$/, '');
      // Anfragen des Angerufenen gehen den gleichen Weg zurück: über die Anlage oder direkt.
      const next = viaServer ? msg.via[0]! : packet.src;
      const c = this.#newCall(msg.callId, caller, next, viaServer ? msg.from : `sip:${packet.src}`, msg.from, msg.to, true, DEFAULT_CALL_SECONDS);
      c.media = msg.sdp;
      this.#call = c;
      this.#respond(msg, 180, packet.src);
      ctx.print('voip.ringing', { from: caller });
      ctx.schedule(ANSWER_DELAY, () => {
        if (this.#call !== c || c.phase !== 'ringing') return;
        this.#respond(msg, 200, packet.src, true);
        c.phase = 'active';
        ctx.print('voip.answered', { from: caller });
      });
      return;
    }
    if (!call || call.callId !== msg.callId) return;
    if (msg.method === 'ACK' && call.incoming) this.#startMedia(call);
    if (msg.method === 'BYE') {
      this.#respond(msg, 200, packet.src);
      ctx.print('voip.remoteHangup', { peer: call.peer });
      this.#end(call);
    }
  }

  #onResponse(msg: SipMessage) {
    const ctx = this.host.ctx;
    if (msg.cseqMethod === 'REGISTER') {
      if (msg.status === 200) {
        this.#registered = true;
        ctx.print('voip.registered', { number: this.#config()?.number ?? '', server: this.#config()?.server ?? '' });
      }
      return;
    }
    const call = this.#call;
    if (!call || call.callId !== msg.callId || call.incoming || msg.cseqMethod !== 'INVITE') return;
    if (msg.status === 180 && call.phase === 'calling') {
      call.phase = 'ringing';
      ctx.print('voip.remoteRinging', { target: call.peer });
    } else if (msg.status === 200 && call.phase !== 'active' && call.phase !== 'ended') {
      call.phase = 'active';
      call.media = msg.sdp;
      this.#request('ACK', false);
      ctx.print('voip.connected', { target: call.peer });
      this.#startMedia(call);
      ctx.schedule(call.seconds * 1000, () => {
        if (this.#call === call && call.phase === 'active') {
          this.#request('BYE', false);
          this.#end(call);
        }
      });
    } else if ((msg.status ?? 0) >= 400) this.#fail(call, String(msg.status));
  }

  #startMedia(call: Call) {
    if (call.timer || !call.media) return;
    call.timer = true;
    const tick = () => {
      if (this.#call !== call || call.phase !== 'active' || !call.media) return;
      const now = this.host.ctx.now;
      const rtp: RtpPacket = { kind: 'rtp', ssrc: call.ssrc, seq: call.seq++, timestamp: call.seq * 160, sentAt: now };
      this.host.sendIp(call.media.ip, { kind: 'udp', srcPort: RTP_PORT, dstPort: call.media.port, payload: rtp }, { dscp: this.#dscp('voice') });
      call.sent++;
      this.host.ctx.schedule(RTP_INTERVAL, tick);
    };
    tick();
  }

  onRtp(rtp: RtpPacket) {
    const call = this.#call;
    if (!call || call.phase !== 'active') return;
    const now = this.host.ctx.now;
    call.received++;
    call.firstSeq ??= rtp.seq;
    call.maxSeq = Math.max(call.maxSeq, rtp.seq);
    const transit = now - rtp.sentAt;
    call.delaySum += transit;
    // RFC 3550, 6.4.1: J = J + (|D| − J) / 16
    if (call.lastTransit !== undefined) call.jitter += (Math.abs(transit - call.lastTransit) - call.jitter) / 16;
    call.lastTransit = transit;
  }

  #fail(call: Call, reason: string) {
    call.phase = 'failed';
    call.reason = reason;
    this.host.ctx.print('voip.failed', { target: call.peer, reason });
  }

  #end(call: Call) {
    if (call.phase === 'ended') return;
    call.phase = 'ended';
    const s = statsOf(call);
    this.host.ctx.print(`voip.ended.${s.quality}`, { peer: call.peer, received: s.received, loss: s.loss, delay: s.delay, jitter: s.jitter });
  }

  state(): VoipState {
    const c = this.#config();
    const call = this.#call;
    return {
      ...(c?.number ? { number: c.number } : {}),
      ...(c?.server ? { server: c.server } : {}),
      registered: this.#registered,
      ...(call ? { call: { phase: call.phase, peer: call.peer, incoming: call.incoming, ...(call.reason ? { reason: call.reason } : {}), stats: statsOf(call) } } : {}),
    };
  }
}

function statsOf(call: Call): CallStats {
  const expected = call.firstSeq === undefined ? 0 : call.maxSeq - call.firstSeq + 1;
  const lost = Math.max(0, expected - call.received);
  const round = (n: number) => Math.round(n * 10) / 10;
  const s = { sent: call.sent, received: call.received, lost, loss: expected ? round((lost / expected) * 100) : 0, delay: call.received ? round(call.delaySum / call.received) : 0, jitter: round(call.jitter) };
  return { ...s, quality: call.received ? rateCall(s) : 'poor' };
}

/** Telefonanlage: Registrar (Rufnummer → Adresse) und Proxy für alle Anfragen eines Gesprächs. */
export class SipServer {
  readonly registrations = new Map<string, string>();

  constructor(private readonly host: VoipHost) {}

  #send(dst: string, msg: SipMessage) {
    this.host.sendIp(dst, { kind: 'udp', srcPort: SIP_PORT, dstPort: SIP_PORT, payload: msg }, { dscp: DSCP.CS5 });
  }

  onSip(packet: Ipv4Packet, msg: SipMessage) {
    const own = packet.dst;
    if (msg.status !== undefined) {
      // Antwort: eigenen Via-Eintrag entfernen und an den nächsten weitergeben.
      const via = msg.via[0] === own ? msg.via.slice(1) : msg.via;
      if (via[0]) this.#send(via[0], { ...msg, via });
      return;
    }
    if (msg.method === 'REGISTER') {
      const number = /^sip:([0-9]+)@/.exec(msg.from)?.[1];
      if (number) this.registrations.set(number, packet.src);
      this.#send(packet.src, { ...withoutMethod(msg), status: number ? 200 : 404 });
      return;
    }
    const number = /^sip:([0-9]+)@/.exec(msg.uri)?.[1];
    const target = number ? this.registrations.get(number) : undefined;
    if (!target) {
      if (msg.method === 'INVITE') this.#send(packet.src, { ...withoutMethod(msg), status: 404 });
      return;
    }
    this.#send(target, { ...msg, via: [own, ...msg.via] });
  }

  state(): { number: string; address: string }[] {
    return [...this.registrations].map(([number, address]) => ({ number, address })).sort((a, b) => a.number.localeCompare(b.number));
  }
}

const withoutMethod = (msg: SipMessage): SipMessage => {
  const { method: _m, sdp: _s, ...rest } = msg;
  return rest;
};

/** Lastgenerator wie «iperf -u»: UDP-Daten mit fester Rate an ein Ziel. */
export class Iperf {
  #run = 0;

  constructor(private readonly host: VoipHost) {}

  start(target: string, kbps: number, seconds: number, dscp = 0) {
    const ctx = this.host.ctx;
    const run = ++this.#run;
    const bytes = 1400;
    // Abstand zwischen zwei Paketen: (Nutzlast + 46 Bytes Köpfe) × 8 Bit / Rate.
    const interval = ((bytes + 46) * 8) / kbps;
    const end = ctx.now + seconds * 1000;
    let seq = 0;
    ctx.print('iperf.start', { target, rate: kbps, seconds });
    const tick = () => {
      if (run !== this.#run) return;
      if (ctx.now >= end) return ctx.print('iperf.done', { target, sent: seq, kbytes: Math.round((seq * bytes) / 1000) });
      this.host.sendIp(target, { kind: 'udp', srcPort: 40000 + (run % 1000), dstPort: IPERF_PORT, payload: { kind: 'data', seq: seq++, bytes } }, dscp ? { dscp } : {});
      ctx.schedule(interval, tick);
    };
    tick();
  }
}
