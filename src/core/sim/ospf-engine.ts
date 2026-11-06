import type { RedistributeSource } from '../model/types';
import type { OspfLsa, OspfPacket } from './frames';
import type { NodeContext } from './simulation';

// Verkürzte Zeiten (Standard: Hello 10 s, Dead 40 s), damit man im Unterricht nicht warten muss.
export const OSPF_HELLO = 2000;
export const OSPF_DEAD = 8000;
export const OSPF_DEFAULT_COST = 10;
const EXTERNAL_COST = 20;

export type OspfNeighborState = 'init' | '2way' | 'exchange' | 'full';

export interface OspfNeighbor {
  routerId: string;
  ip: string;
  iface: number;
  state: OspfNeighborState;
  /** Zeitpunkt des letzten Hellos. */
  lastHello: number;
  /** Seit wann der Datenbankabgleich läuft (für Wiederholungen bei verlorenen Paketen). */
  since?: number;
}

export interface OspfState {
  routerId: string;
  neighbors: OspfNeighbor[];
  lsdb: { type: OspfLsa['type']; advertisingRouter: string; seq: number; links: number }[];
}

/** Ein Anschluss, der an OSPF teilnimmt. */
export interface OspfLink {
  index: number;
  area: number;
  passive: boolean;
  cost: number;
  /** Kennung des Anschlusses im Router-LSA: OSPFv2 die eigene Adresse, OSPFv3 die Interface-ID. */
  address: string;
  /** Netze an diesem Anschluss. */
  prefixes: Prefix[];
}

export interface Prefix {
  network: string;
  prefix: number;
}

/**
 * Was OSPFv2 und OSPFv3 unterscheidet: Adressen, Hello-Inhalt, Versand und
 * die Form der Routen. Der Ablauf (Nachbarn, Datenbankabgleich, Fluten, SPF) ist gleich.
 */
export interface OspfFamily<R> {
  readonly version: 2 | 3;
  readonly ctx: NodeContext;
  /** Präfix der Konsolenmeldungen: «ospf» oder «ospf6». */
  readonly log: string;
  config(): { defaultOriginate?: boolean; redistribute?: RedistributeSource[] } | undefined;
  routerId(): string;
  links(): OspfLink[];
  up(index: number): boolean;
  /** Eigene Netze als «Netz/Präfix» (werden nicht gelernt). */
  ownPrefixes(): Set<string>;
  hello(link: OspfLink, neighbors: string[]): NonNullable<OspfPacket['hello']>;
  helloMatches(hello: NonNullable<OspfPacket['hello']>, link: OspfLink): boolean;
  sendMulticast(link: OspfLink, packet: OspfPacket): void;
  sendTo(neighbor: OspfNeighbor, link: OspfLink, packet: OspfPacket): void;
  /** Netze aus Redistribution (ohne die eigenen OSPF-Netze). */
  externals(): Prefix[];
  /** Liegt die Absenderadresse eines Hellos im Netz des Anschlusses? (OSPFv2; OSPFv3 nutzt Link-Local) */
  sameSubnet?(src: string, link: OspfLink): boolean;
  /** Präfix im LSA: OSPFv2 Netz und Maske, OSPFv3 Netz und Präfixlänge. */
  encode(p: Prefix): { id: string; data: string };
  decode(link: OspfLsa['links'][number]): Prefix | null;
  route(p: Prefix, iface: number, via: string, metric: number): R | null;
  routesChanged(): void;
}

const lsaKey = (type: OspfLsa['type'], router: string) => `${type}:${router}`;
const sameLinks = (a: OspfLsa['links'], b: OspfLsa['links']) => JSON.stringify(a) === JSON.stringify(b);

/**
 * OSPF für den Unterricht, gemeinsam für OSPFv2 (RFC 2328) und OSPFv3 (RFC 5340):
 * - Hellos an die Gruppe aller OSPF-Router finden Nachbarn (Init → 2-Way); Intervalle und Area müssen passen.
 * - Datenbankabgleich: DBD (Kopfzeilen) → LSR (Anfrage) → LSU (LSAs) → LSAck; danach «Full».
 * - Jeder Router beschreibt sich in einem Router-LSA (Nachbarn mit Kosten); die Netze stehen bei
 *   OSPFv2 im selben LSA, bei OSPFv3 in einem eigenen Intra-Area-Prefix-LSA. Änderungen werden geflutet.
 * - Dijkstra (SPF) berechnet daraus die kürzesten Wege.
 * Weggelassen: DR/BDR-Wahl, Netz-LSAs, mehrere Areas mit ABR-Zusammenfassung, LSA-Alterung.
 * Auf einem LAN bildet jeder Router mit jedem eine Nachbarschaft.
 */
export class OspfEngine<R> {
  #neighbors = new Map<string, OspfNeighbor>();
  #lsdb = new Map<string, OspfLsa>();
  #routes: R[] = [];
  #running = false;
  #seq = 0x80000001;

  constructor(private readonly family: OspfFamily<R>) {}

  get #ctx() {
    return this.family.ctx;
  }

  routerId(): string {
    return this.family.routerId();
  }

  routes(): R[] {
    return this.family.config() ? this.#routes : [];
  }

  #say(event: string, params: Record<string, string | number>) {
    this.#ctx.print(`${this.family.log}.${event}`, params);
  }

  boot() {
    if (!this.family.config()) {
      if (this.#running || this.#routes.length) {
        this.#neighbors.clear();
        this.#lsdb.clear();
        this.#routes = [];
        this.family.routesChanged();
      }
      this.#running = false;
      return;
    }
    if (this.#running) return;
    this.#running = true;
    const tick = () => {
      if (!this.family.config()) {
        this.#running = false;
        this.boot();
        return;
      }
      this.#checkDead();
      this.#retransmit();
      this.#sendHellos();
      this.#originate();
      this.#ctx.schedule(OSPF_HELLO, tick);
    };
    this.#ctx.schedule(0, tick);
  }

  #packet(type: OspfPacket['type'], area: number, rest: Partial<OspfPacket> = {}): OspfPacket {
    return { kind: 'ospf', type, routerId: this.routerId(), area, ...(this.family.version === 3 ? { version: 3 as const } : {}), ...rest };
  }

  #sendHellos() {
    for (const link of this.family.links()) {
      if (link.passive || !this.family.up(link.index)) continue;
      const seen = [...this.#neighbors.values()].filter((n) => n.iface === link.index).map((n) => n.routerId);
      this.family.sendMulticast(link, this.#packet('hello', link.area, { hello: this.family.hello(link, seen) }));
    }
  }

  #checkDead() {
    const now = this.#ctx.now;
    const links = this.family.links();
    let changed = false;
    for (const [key, n] of this.#neighbors) {
      if (now - n.lastHello > OSPF_DEAD || !links.some((l) => l.index === n.iface)) {
        this.#neighbors.delete(key);
        this.#say('down', { neighbor: n.routerId, ip: n.ip });
        changed = true;
      }
    }
    if (changed) this.#originate();
  }

  /** Hängt ein Abgleich (DBD, LSR oder LSU verloren), wird er nach zwei Hello-Intervallen wiederholt. */
  #retransmit() {
    const now = this.#ctx.now;
    for (const n of this.#neighbors.values()) {
      if (n.state !== 'exchange' || now - (n.since ?? now) < 2 * OSPF_HELLO) continue;
      n.since = now;
      this.#sendDbd(n);
    }
  }

  receive(src: string, ospf: OspfPacket, index: number) {
    if ((ospf.version ?? 2) !== this.family.version) return;
    const link = this.family.links().find((l) => l.index === index);
    if (!link || link.passive) return;
    if (ospf.routerId === this.routerId()) return;
    if (ospf.area !== link.area) {
      if (ospf.type === 'hello') this.#say('areaMismatch', { neighbor: ospf.routerId, area: ospf.area, own: link.area });
      return;
    }
    const key = `${index}|${ospf.routerId}`;
    if (ospf.type === 'hello') return this.#onHello(src, ospf, link, key);
    const neighbor = this.#neighbors.get(key);
    if (!neighbor) return;
    if (ospf.type === 'dbd') this.#onDbd(neighbor, ospf);
    else if (ospf.type === 'lsr') this.#onLsr(neighbor, ospf);
    else if (ospf.type === 'lsu') this.#onLsu(neighbor, ospf);
  }

  #onHello(src: string, ospf: OspfPacket, link: OspfLink, key: string) {
    const hello = ospf.hello;
    if (!hello) return;
    if (this.family.sameSubnet && !this.family.sameSubnet(src, link)) {
      this.#say('subnetMismatch', { neighbor: ospf.routerId, ip: src });
      return;
    }
    if (!this.family.helloMatches(hello, link)) {
      this.#say('helloMismatch', { neighbor: ospf.routerId, mask: hello.mask });
      return;
    }
    let neighbor = this.#neighbors.get(key);
    if (!neighbor) {
      neighbor = { routerId: ospf.routerId, ip: src, iface: link.index, state: 'init', lastHello: this.#ctx.now };
      this.#neighbors.set(key, neighbor);
      this.#say('init', { neighbor: ospf.routerId, ip: src });
    }
    neighbor.lastHello = this.#ctx.now;
    neighbor.ip = src;
    if (!hello.neighbors.includes(this.routerId())) {
      if (neighbor.state !== 'init') neighbor.state = 'init';
      return;
    }
    if (neighbor.state === 'init') {
      neighbor.state = 'exchange';
      neighbor.since = this.#ctx.now;
      this.#sendDbd(neighbor);
    }
  }

  #headers() {
    return [...this.#lsdb.values()].map((l) => ({ advertisingRouter: l.advertisingRouter, seq: l.seq, type: l.type }));
  }

  #send(neighbor: OspfNeighbor, type: OspfPacket['type'], rest: Partial<OspfPacket>) {
    const link = this.family.links().find((l) => l.index === neighbor.iface);
    if (!link) return;
    this.family.sendTo(neighbor, link, this.#packet(type, link.area, rest));
  }

  #sendDbd(neighbor: OspfNeighbor) {
    this.#send(neighbor, 'dbd', { headers: this.#headers() });
  }

  #onDbd(neighbor: OspfNeighbor, ospf: OspfPacket) {
    if (neighbor.state === 'init') {
      neighbor.state = 'exchange';
      neighbor.since = this.#ctx.now;
      this.#sendDbd(neighbor);
    }
    const wanted = (ospf.headers ?? []).filter((h) => {
      const mine = this.#lsdb.get(lsaKey(h.type, h.advertisingRouter));
      return !mine || mine.seq < h.seq;
    });
    if (wanted.length) this.#send(neighbor, 'lsr', { headers: wanted });
    else this.#full(neighbor);
  }

  #onLsr(neighbor: OspfNeighbor, ospf: OspfPacket) {
    const lsas = (ospf.headers ?? []).flatMap((h) => this.#lsdb.get(lsaKey(h.type, h.advertisingRouter)) ?? []);
    if (lsas.length) this.#send(neighbor, 'lsu', { lsas });
  }

  #onLsu(neighbor: OspfNeighbor, ospf: OspfPacket) {
    const fresh: OspfLsa[] = [];
    for (const lsa of ospf.lsas ?? []) {
      const key = lsaKey(lsa.type, lsa.advertisingRouter);
      const mine = this.#lsdb.get(key);
      if (lsa.advertisingRouter === this.routerId()) {
        // Eigenes LSA mit höherer Nummer (nach einem Neustart): mit noch höherer Nummer neu ausgeben.
        // Kommt das aktuelle LSA nur über einen zweiten Weg zurück (gleiche Nummer), ist nichts zu tun;
        // sonst gäbe es mit mehreren Wegen einen endlosen LSU-Sturm.
        if (!mine || lsa.seq > mine.seq) {
          this.#seq = lsa.seq + 1;
          this.#lsdb.delete(key);
          this.#originate();
        }
        continue;
      }
      if (!mine || mine.seq < lsa.seq) {
        this.#lsdb.set(key, lsa);
        fresh.push(lsa);
      }
    }
    this.#send(neighbor, 'lsack', { headers: (ospf.lsas ?? []).map((l) => ({ advertisingRouter: l.advertisingRouter, seq: l.seq, type: l.type })) });
    if (fresh.length) {
      this.#flood(fresh, neighbor);
      this.#spf();
    }
    if (neighbor.state === 'exchange') this.#full(neighbor);
  }

  #full(neighbor: OspfNeighbor) {
    if (neighbor.state === 'full') return;
    neighbor.state = 'full';
    this.#say('full', { neighbor: neighbor.routerId, ip: neighbor.ip });
    this.#originate();
    // Neue Nachbarn erhalten die ganze Datenbank.
    const all = [...this.#lsdb.values()];
    if (all.length) this.#send(neighbor, 'lsu', { lsas: all });
  }

  #flood(lsas: OspfLsa[], except?: OspfNeighbor) {
    for (const n of this.#neighbors.values()) {
      if (n === except || n.state !== 'full') continue;
      this.#send(n, 'lsu', { lsas });
    }
  }

  /** Eigene LSAs neu erzeugen und bei Änderungen fluten. */
  #originate() {
    if (!this.family.config()) return;
    const me = this.routerId();
    const v3 = this.family.version === 3;
    const links: OspfLsa['links'] = [];
    const prefixes: OspfLsa['links'] = [];
    for (const link of this.family.links()) {
      for (const p of link.prefixes) (v3 ? prefixes : links).push({ kind: 'stub', ...this.family.encode(p), cost: link.cost });
      for (const n of this.#neighbors.values()) {
        if (n.iface === link.index && n.state === 'full') links.push({ kind: 'p2p', id: n.routerId, data: link.address, cost: link.cost });
      }
    }
    const changed: OspfLsa[] = [];
    const install = (type: OspfLsa['type'], next: OspfLsa['links']) => {
      const key = lsaKey(type, me);
      const current = this.#lsdb.get(key);
      if (current && sameLinks(current.links, next)) return;
      if (!current && type !== 'router' && next.length === 0) return;
      const lsa: OspfLsa = { type, advertisingRouter: me, seq: this.#seq++, links: next };
      this.#lsdb.set(key, lsa);
      changed.push(lsa);
    };
    install('router', links);
    if (v3) install('intraAreaPrefix', prefixes);
    install('external', this.#externalLinks());
    if (changed.length) {
      this.#flood(changed);
      this.#spf();
    }
  }

  /** Redistribution und Standardroute als External-LSA (Metrik-Typ 2). */
  #externalLinks(): OspfLsa['links'] {
    const config = this.family.config();
    if (!config) return [];
    const result: OspfLsa['links'] = [];
    if (config.defaultOriginate) result.push({ kind: 'stub', ...this.family.encode({ network: this.family.version === 3 ? '::' : '0.0.0.0', prefix: 0 }), cost: 1 });
    for (const p of this.family.externals()) result.push({ kind: 'stub', ...this.family.encode(p), cost: EXTERNAL_COST });
    return result;
  }

  /** Dijkstra über die Router-LSAs: kürzeste Wege und erster Nachbar auf dem Weg. */
  #spf() {
    const me = this.routerId();
    const routerLsa = (id: string) => this.#lsdb.get(lsaKey('router', id));
    const dist = new Map<string, number>([[me, 0]]);
    const firstHop = new Map<string, OspfNeighbor | null>([[me, null]]);
    const done = new Set<string>();
    const ownLinks = this.family.links();
    for (;;) {
      let current: string | undefined;
      for (const [id, d] of dist) if (!done.has(id) && (current === undefined || d < dist.get(current)!)) current = id;
      if (current === undefined) break;
      done.add(current);
      for (const link of routerLsa(current)?.links ?? []) {
        if (link.kind !== 'p2p') continue;
        // Nur Verbindungen, die beide Seiten melden (Zwei-Wege-Prüfung).
        if (!routerLsa(link.id)?.links.some((l) => l.kind === 'p2p' && l.id === current)) continue;
        const d = dist.get(current)! + link.cost;
        if (dist.has(link.id) && dist.get(link.id)! <= d) continue;
        dist.set(link.id, d);
        const hop =
          current === me
            ? ([...this.#neighbors.values()].find((n) => n.routerId === link.id && n.state === 'full' && ownLinks.find((l) => l.index === n.iface)?.address === link.data) ?? null)
            : firstHop.get(current)!;
        firstHop.set(link.id, hop);
      }
    }
    const best = new Map<string, { route: R; metric: number }>();
    const own = this.family.ownPrefixes();
    const offer = (p: Prefix | null, metric: number, hop: OspfNeighbor | null | undefined) => {
      if (!p || !hop) return;
      const key = `${p.network}/${p.prefix}`;
      if (own.has(key)) return;
      const existing = best.get(key);
      if (existing && existing.metric <= metric) return;
      const route = this.family.route(p, hop.iface, hop.ip, Math.round(metric));
      if (route) best.set(key, { route, metric });
    };
    for (const [id, d] of dist) {
      if (id === me) continue;
      const prefixLinks = [...(routerLsa(id)?.links ?? []), ...(this.#lsdb.get(lsaKey('intraAreaPrefix', id))?.links ?? [])];
      for (const link of prefixLinks) if (link.kind === 'stub') offer(this.family.decode(link), d + link.cost, firstHop.get(id));
      for (const link of this.#lsdb.get(lsaKey('external', id))?.links ?? []) offer(this.family.decode(link), link.cost + d / 1000, firstHop.get(id));
    }
    const routes = [...best.values()].map((b) => b.route);
    if (JSON.stringify(routes, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)) !== JSON.stringify(this.#routes, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) {
      this.#routes = routes;
      this.family.routesChanged();
    }
  }

  state(): OspfState {
    return {
      routerId: this.routerId(),
      neighbors: [...this.#neighbors.values()].map(({ since: _since, ...n }) => ({ ...n })),
      lsdb: [...this.#lsdb.values()].map((l) => ({ type: l.type, advertisingRouter: l.advertisingRouter, seq: l.seq, links: l.links.length })),
    };
  }
}
