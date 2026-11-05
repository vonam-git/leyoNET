import type { RedistributeSource } from '../model/types';
import type { Prefix } from './ospf-engine';
import type { NodeContext } from './simulation';

// Verkürzte Zeiten (Standard: Update 30 s, Timeout 180 s).
export const RIP_UPDATE = 5000;
export const RIP_TIMEOUT = 30_000;
export const RIP_INFINITY = 16;

export interface RipEntry extends Prefix {
  metric: number;
}

/** Anschluss, der an RIP teilnimmt, mit seinen Netzen. */
export interface RipLink {
  index: number;
  prefixes: Prefix[];
}

/** Was RIPv2 und RIPng unterscheidet: Adressen, Versand und die Form der Routen. */
export interface RipFamily<R> {
  readonly ctx: NodeContext;
  config(): { passive?: number[]; defaultOriginate?: boolean; redistribute?: RedistributeSource[] } | undefined;
  links(): RipLink[];
  up(index: number): boolean;
  ownPrefixes(): Set<string>;
  /** Netze aus Redistribution, mit dem Anschluss der Route (für Split Horizon). */
  externals(): (Prefix & { iface: number })[];
  defaultPrefix(): Prefix;
  sendMulticast(index: number, command: 'request' | 'response', entries: RipEntry[]): void;
  sendTo(src: string, index: number, entries: RipEntry[]): void;
  route(p: Prefix, iface: number, via: string, metric: number): R | null;
  routesChanged(): void;
}

interface Learned extends Prefix {
  via: string;
  iface: number;
  metric: number;
  expires: number;
}

/**
 * Distanzvektor-Routing, gemeinsam für RIPv2 (RFC 2453) und RIPng (RFC 2080):
 * Jeder Router schickt regelmässig seine Tabelle an die RIP-Gruppe; Nachbarn
 * übernehmen bessere Wege. Split Horizon: Routen nicht dorthin zurückmelden,
 * woher sie kamen. Unerreichbar ist ab 16 Hops.
 */
export class RipEngine<R> {
  #learned = new Map<string, Learned>();
  #running = false;
  #triggered = false;

  constructor(private readonly family: RipFamily<R>) {}

  get #ctx() {
    return this.family.ctx;
  }

  routes(): R[] {
    if (!this.family.config()) return [];
    const now = this.#ctx.now;
    return [...this.#learned.values()].filter((r) => r.expires > now && r.metric < RIP_INFINITY).flatMap((r) => this.family.route(r, r.iface, r.via, r.metric) ?? []);
  }

  boot() {
    if (!this.family.config()) {
      if (this.#learned.size) {
        this.#learned.clear();
        this.family.routesChanged();
      }
      this.#running = false;
      return;
    }
    if (this.#running) return;
    this.#running = true;
    // Beim Start nach den Tabellen der Nachbarn fragen.
    for (const link of this.#sending()) this.family.sendMulticast(link.index, 'request', []);
    const tick = () => {
      if (!this.family.config()) {
        this.#running = false;
        this.boot();
        return;
      }
      this.#expire();
      this.#sendUpdates();
      this.#ctx.schedule(RIP_UPDATE, tick);
    };
    this.#ctx.schedule(1, tick);
  }

  #sending() {
    const passive = new Set(this.family.config()?.passive ?? []);
    return this.family.links().filter((l) => !passive.has(l.index) && this.family.up(l.index));
  }

  #expire() {
    const now = this.#ctx.now;
    let changed = false;
    for (const [key, r] of this.#learned) {
      if (r.expires <= now) {
        this.#learned.delete(key);
        changed = true;
      }
    }
    if (changed) this.family.routesChanged();
  }

  /** Was dieser Router auf einem Anschluss ankündigt (mit Split Horizon). */
  #entries(outIface: number): RipEntry[] {
    const config = this.family.config();
    if (!config) return [];
    const result = new Map<string, RipEntry>();
    const add = (p: Prefix, metric: number) => {
      const key = `${p.network}/${p.prefix}`;
      const existing = result.get(key);
      if (existing && existing.metric <= metric) return;
      result.set(key, { network: p.network, prefix: p.prefix, metric: Math.min(RIP_INFINITY, metric) });
    };
    for (const link of this.family.links()) for (const p of link.prefixes) add(p, 1);
    const now = this.#ctx.now;
    for (const r of this.#learned.values()) {
      if (r.iface === outIface || r.expires <= now) continue;
      add(r, r.metric + 1);
    }
    if (config.defaultOriginate) add(this.family.defaultPrefix(), 1);
    for (const e of this.family.externals()) if (e.iface !== outIface) add(e, 1);
    return [...result.values()];
  }

  #sendUpdates() {
    for (const link of this.#sending()) {
      const entries = this.#entries(link.index);
      if (entries.length) this.family.sendMulticast(link.index, 'response', entries);
    }
  }

  #triggerUpdate() {
    if (this.#triggered) return;
    this.#triggered = true;
    this.#ctx.schedule(1, () => {
      this.#triggered = false;
      this.#sendUpdates();
    });
  }

  receive(src: string, command: 'request' | 'response', entries: RipEntry[], index: number) {
    if (!this.family.links().some((l) => l.index === index)) return;
    if (command === 'request') {
      const answer = this.#entries(index);
      if (answer.length) this.family.sendTo(src, index, answer);
      return;
    }
    const own = this.family.ownPrefixes();
    const now = this.#ctx.now;
    let changed = false;
    for (const entry of entries) {
      const key = `${entry.network}/${entry.prefix}`;
      if (own.has(key)) continue;
      const metric = Math.min(RIP_INFINITY, entry.metric);
      const current = this.#learned.get(key);
      const fromSame = current && current.via === src;
      if (metric >= RIP_INFINITY) {
        if (fromSame) {
          this.#learned.delete(key);
          changed = true;
        }
        continue;
      }
      if (!current || current.expires <= now || metric < current.metric || fromSame) {
        if (!current || current.metric !== metric || current.via !== src) changed = true;
        this.#learned.set(key, { network: entry.network, prefix: entry.prefix, via: src, iface: index, metric, expires: now + RIP_TIMEOUT });
      }
    }
    if (changed) {
      this.family.routesChanged();
      this.#triggerUpdate();
    }
  }

  state() {
    return { routes: this.routes().length };
  }
}
