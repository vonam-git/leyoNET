import type { DnsRecord, DnsType } from '../model/types';
import { answerFromZone, isValidName, normalizeName } from '../net/dns';
import { DNS_PORT, type DnsMessage, type UdpDatagram } from './frames';
import type { SendError, SendOptions } from './ip';
import type { NodeContext } from './simulation';

export const DNS_TIMEOUT = 2000;
export const DNS_ATTEMPTS = 2;
/** Der Server gibt bei der Weiterleitung früher auf als der Client (sonst käme sein SERVFAIL zu spät). */
export const FORWARD_TIMEOUT = 800;
const MAX_FORWARDS = 50;
const CLIENT_PORT_BASE = 53_000;

export interface DnsCacheEntry {
  name: string;
  type: DnsType;
  records: DnsRecord[];
  expires: number;
}

export type ResolveError = 'invalidName' | 'noDnsServer' | 'nxdomain' | 'nodata' | 'servfail' | 'timeout' | SendError;

export type ResolveResult =
  | { ok: true; records: DnsRecord[]; cached: boolean; server: string; authoritative: boolean }
  | { ok: false; error: ResolveError; server: string };

export interface DnsHost {
  readonly ctx: NodeContext;
  /** Wirksamer DNS-Server (statisch oder per DHCP). */
  dnsServer(): string | undefined;
  /** Zusätzlich: DNS-Server über IPv6 (falls konfiguriert). */
  dnsServer6?(): string | undefined;
  sendIp(dst: string, payload: UdpDatagram, options?: SendOptions, onError?: (e: SendError) => void): void;
  /** Welche Adresstypen ein Name in welcher Reihenfolge erhält (Standard: nur A). */
  addressTypes?(): DnsType[];
}

export type AddressResult =
  | { ok: true; ip: string; type: 'A' | 'AAAA'; cached: boolean; server: string; aliases: string[] }
  | { ok: false; error: ResolveError; server: string };

/** Absender und Empfänger eines Pakets (IPv4 oder IPv6). */
export interface Addresses {
  src: string;
  dst: string;
}

interface Pending {
  name: string;
  type: DnsType;
  server: string;
  attempts: number;
  done: (result: ResolveResult) => void;
}

export interface ResolveOptions {
  /** false fragt den Server direkt (wie nslookup). */
  useCache?: boolean;
  /** Bestimmten Server fragen statt des eingestellten. */
  server?: string;
}

/** Namensauflösung auf dem Client, mit Cache gemäss TTL der Antwort. */
export class DnsResolver {
  #cache = new Map<string, DnsCacheEntry>();
  #pending = new Map<number, Pending>();
  #nextId = 0;

  constructor(private readonly host: DnsHost) {}

  get #ctx() {
    return this.host.ctx;
  }

  cacheEntries(): DnsCacheEntry[] {
    const now = this.#ctx.now;
    return [...this.#cache.values()].filter((e) => e.expires > now).sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type));
  }

  flush() {
    this.#cache.clear();
  }

  /** Eingestellter Server: zuerst IPv4, sonst IPv6. */
  defaultServer(): string {
    return this.host.dnsServer() ?? this.host.dnsServer6?.() ?? '';
  }

  resolve(name: string, type: DnsType, done: (result: ResolveResult) => void, { useCache = true, server: chosen }: ResolveOptions = {}) {
    const wanted = normalizeName(name);
    const server = chosen ?? this.defaultServer();
    if (!isValidName(wanted)) return done({ ok: false, error: 'invalidName', server });
    const cached = this.#cache.get(`${type} ${wanted}`);
    if (useCache && !chosen && cached && cached.expires > this.#ctx.now) {
      return done({ ok: true, records: cached.records, cached: true, server, authoritative: false });
    }
    if (!server) return done({ ok: false, error: 'noDnsServer', server });
    const id = ++this.#nextId;
    this.#pending.set(id, { name: wanted, type, server, attempts: 0, done });
    this.#query(id);
  }

  /**
   * Name in eine Adresse auflösen: nacheinander die Typen aus `addressTypes()`
   * (z.B. zuerst AAAA, dann A); hat ein Name keinen Eintrag des ersten Typs, folgt der nächste.
   */
  resolveAddress(name: string, done: (result: AddressResult) => void, options: ResolveOptions = {}) {
    const types = (this.host.addressTypes?.() ?? ['A']).filter((t): t is 'A' | 'AAAA' => t === 'A' || t === 'AAAA');
    const attempt = (i: number, last?: ResolveResult) => {
      const type = types[i];
      if (!type) return done(last && !last.ok ? last : { ok: false, error: 'nodata', server: this.defaultServer() });
      this.resolve(
        name,
        type,
        (result) => {
          if (result.ok) {
            const record = result.records.find((r) => r.type === type);
            const aliases = result.records.filter((r) => r.type === 'CNAME').map((r) => r.value);
            if (record) return done({ ok: true, ip: record.value, type, cached: result.cached, server: result.server, aliases });
          }
          // Kein Eintrag dieses Typs: den nächsten versuchen; andere Fehler gelten sofort.
          if (!result.ok && result.error !== 'nodata' && result.error !== 'nxdomain') return done(result);
          attempt(i + 1, result);
        },
        options,
      );
    };
    attempt(0);
  }

  #query(id: number) {
    const pending = this.#pending.get(id);
    if (!pending) return;
    const attempt = ++pending.attempts;
    const message: DnsMessage = {
      kind: 'dns',
      id,
      response: false,
      question: { name: pending.name, type: pending.type },
      answers: [],
      rcode: 'ok',
    };
    this.host.sendIp(
      pending.server,
      { kind: 'udp', srcPort: CLIENT_PORT_BASE + (id % 1000), dstPort: DNS_PORT, payload: message },
      {},
      (error) => this.#finish(id, { ok: false, error, server: pending.server }),
    );
    this.#ctx.schedule(DNS_TIMEOUT, () => {
      const current = this.#pending.get(id);
      if (!current || current.attempts !== attempt) return;
      if (current.attempts < DNS_ATTEMPTS) this.#query(id);
      else this.#finish(id, { ok: false, error: 'timeout', server: current.server });
    });
  }

  #finish(id: number, result: ResolveResult) {
    const pending = this.#pending.get(id);
    if (!pending) return;
    this.#pending.delete(id);
    pending.done(result);
  }

  onResponse(message: DnsMessage) {
    const pending = this.#pending.get(message.id);
    if (!pending || !message.response) return;
    if (message.rcode === 'nxdomain') return this.#finish(message.id, { ok: false, error: 'nxdomain', server: pending.server });
    if (message.rcode === 'servfail') return this.#finish(message.id, { ok: false, error: 'servfail', server: pending.server });
    // Nur Aliase, aber kein Eintrag des gefragten Typs: NODATA.
    if (!message.answers.some((a) => a.type === pending.type)) return this.#finish(message.id, { ok: false, error: 'nodata', server: pending.server });
    const ttl = Math.min(...message.answers.map((a) => a.ttl));
    if (ttl > 0) {
      this.#cache.set(`${pending.type} ${pending.name}`, {
        name: pending.name,
        type: pending.type,
        records: message.answers,
        expires: this.#ctx.now + ttl * 1000,
      });
    }
    this.#finish(message.id, { ok: true, records: message.answers, cached: false, server: pending.server, authoritative: !!message.authoritative });
  }
}

/** Eine weitergeleitete Anfrage: wem die Antwort gehört. */
interface Forwarded {
  client: string;
  clientPort: number;
  clientId: number;
  local: string;
  question: DnsMessage['question'];
  /** Aliase aus der eigenen Zone, die der Antwort vorangestellt werden. */
  prefix: DnsRecord[];
  attempts: number;
}

/**
 * DNS-Server-Dienst: beantwortet Anfragen aus seiner Zone (autorisierend) und
 * leitet unbekannte Namen an einen Weiterleitungsserver weiter (rekursiv,
 * «nicht autorisierend»). Antworten des Weiterleiters werden zwischengespeichert.
 */
export class DnsServer {
  #forwarded = new Map<number, Forwarded>();
  #nextId = 0;
  #cache = new Map<string, { message: DnsMessage; expires: number }>();

  constructor(private readonly host: DnsHost) {}

  get #ctx() {
    return this.host.ctx;
  }

  onQuery(packet: Addresses, datagram: UdpDatagram) {
    const message = datagram.payload;
    const config = this.#ctx.device()?.dnsServer;
    if (!config || message.kind !== 'dns' || message.response) return;
    const { name, type } = message.question;
    const zone = answerFromZone(config, name, type);
    const reply = (answers: DnsRecord[], rcode: DnsMessage['rcode'], authoritative: boolean) => {
      const response: DnsMessage = { kind: 'dns', id: message.id, response: true, question: message.question, answers, rcode, authoritative };
      this.host.sendIp(packet.src, { kind: 'udp', srcPort: DNS_PORT, dstPort: datagram.srcPort, payload: response }, { src: packet.dst });
    };
    if (zone.kind === 'answer' || zone.kind === 'nodata') {
      this.#ctx.print(zone.kind === 'answer' ? 'dnsServer.answer' : 'dnsServer.nodata', { name, type, client: packet.src, value: zone.records.filter((r) => r.type === type).map(show).join(', ') });
      return reply(zone.records, 'ok', true);
    }
    // Nicht in der eigenen Zone (oder ein Alias zeigt hinaus): weiterleiten, falls eingestellt.
    const forwarder = config.forwarder;
    if (!forwarder) {
      this.#ctx.print('dnsServer.unknown', { name, type, client: packet.src });
      return reply(zone.records, zone.records.length ? 'ok' : 'nxdomain', true);
    }
    // Schutz vor Schleifen (A leitet an B, B an A) und Fluten: keine Anfrage des eigenen
    // Weiterleiters erneut weiterleiten, höchstens 50 offene Weiterleitungen.
    if (packet.src === forwarder || this.#forwarded.size >= MAX_FORWARDS) {
      this.#ctx.print('dnsServer.loop', { name, forwarder });
      return reply(zone.records, 'servfail', false);
    }
    const follow = zone.follow ?? normalizeName(name);
    const cached = this.#cache.get(`${type} ${follow}`);
    if (cached && cached.expires > this.#ctx.now) {
      this.#ctx.print('dnsServer.cached', { name: follow, type, client: packet.src });
      return reply([...zone.records, ...cached.message.answers], cached.message.rcode, false);
    }
    const id = ++this.#nextId;
    this.#forwarded.set(id, { client: packet.src, clientPort: datagram.srcPort, clientId: message.id, local: packet.dst, question: message.question, prefix: zone.records, attempts: 0 });
    this.#ctx.print('dnsServer.forward', { name: follow, type, forwarder });
    this.#forward(id, follow, type, forwarder);
  }

  #forward(id: number, name: string, type: DnsType, forwarder: string) {
    const entry = this.#forwarded.get(id);
    if (!entry) return;
    const attempt = ++entry.attempts;
    const query: DnsMessage = { kind: 'dns', id, response: false, question: { name, type }, answers: [], rcode: 'ok' };
    this.host.sendIp(forwarder, { kind: 'udp', srcPort: DNS_PORT, dstPort: DNS_PORT, payload: query }, {}, () => this.#fail(id));
    this.#ctx.schedule(FORWARD_TIMEOUT, () => {
      const current = this.#forwarded.get(id);
      if (!current || current.attempts !== attempt) return;
      if (current.attempts < DNS_ATTEMPTS) this.#forward(id, name, type, forwarder);
      else this.#fail(id);
    });
  }

  #fail(id: number) {
    const entry = this.#forwarded.get(id);
    if (!entry) return;
    this.#forwarded.delete(id);
    this.#ctx.print('dnsServer.forwardFailed', { name: entry.question.name });
    this.#send(entry, entry.prefix, 'servfail');
  }

  #send(entry: Forwarded, answers: DnsRecord[], rcode: DnsMessage['rcode']) {
    const response: DnsMessage = { kind: 'dns', id: entry.clientId, response: true, question: entry.question, answers, rcode, authoritative: false };
    this.host.sendIp(entry.client, { kind: 'udp', srcPort: DNS_PORT, dstPort: entry.clientPort, payload: response }, { src: entry.local });
  }

  /** Antwort des Weiterleiters (an Port 53 dieses Servers). */
  onForwardResponse(message: DnsMessage) {
    const entry = this.#forwarded.get(message.id);
    if (!entry || !message.response) return;
    this.#forwarded.delete(message.id);
    const ttl = message.answers.length ? Math.min(...message.answers.map((a) => a.ttl)) : 0;
    if (ttl > 0) this.#cache.set(`${message.question.type} ${message.question.name}`, { message, expires: this.#ctx.now + ttl * 1000 });
    this.#send(entry, [...entry.prefix, ...message.answers], message.rcode);
  }
}

/** Kurzform eines Eintrags für Meldungen, z.B. «10 mail.schule.example». */
export function show(record: DnsRecord): string {
  return record.type === 'MX' ? `${record.priority ?? 10} ${record.value}` : record.type === 'TXT' ? `"${record.value}"` : record.value;
}
