import { matchesAddress, type FirewallConfig, type FirewallRule } from '../model/security';
import type { Ipv4Packet } from './frames';
import type { NodeContext } from './simulation';

/**
 * Paketfilter eines Geräts. Regeln werden von oben nach unten geprüft, die
 * erste passende entscheidet; passt keine, gilt die Standardregel.
 *
 * Zustandsbehaftet (Stateful Inspection): Jede erlaubte Verbindung wird
 * gemerkt (Protokoll, Adressen, Ports bzw. ICMP-Kennung). Antworten darauf
 * und zugehörige ICMP-Fehlermeldungen kommen ohne eigene Regel zurück. Ohne
 * diese Einstellung braucht auch die Rückrichtung eine Regel – so sieht man,
 * warum es zustandsbehaftete Firewalls gibt.
 *
 * Router filtern weitergeleitete Pakete (nach einer Adressübersetzung DNAT,
 * vor SNAT, wie die FORWARD-Kette unter Linux), Endgeräte eingehende Pakete
 * an sich selbst. Gesendet wird immer; erlaubt wird beim Empfang bzw. Weiterleiten.
 */

export const CONNECTION_TIMEOUT = 300_000;

export interface FirewallState {
  /** Treffer je Regel (gleiche Reihenfolge wie die Regeln). */
  hits: number[];
  defaultHits: number;
  blocked: number;
  /** Gemerkte Verbindungen (zustandsbehaftet). */
  connections: number;
}

interface Flow {
  protocol: 'tcp' | 'udp' | 'icmp' | 'other';
  src: string;
  dst: string;
  srcPort: number;
  dstPort: number;
}

function flowOf(packet: Ipv4Packet): Flow {
  const p = packet.payload;
  if (p.kind === 'tcp' || p.kind === 'udp') return { protocol: p.kind, src: packet.src, dst: packet.dst, srcPort: p.srcPort, dstPort: p.dstPort };
  if (p.kind === 'icmp') return { protocol: 'icmp', src: packet.src, dst: packet.dst, srcPort: p.id, dstPort: p.id };
  return { protocol: 'other', src: packet.src, dst: packet.dst, srcPort: 0, dstPort: 0 };
}

const key = (f: Flow) => `${f.protocol}|${f.src}|${f.srcPort}|${f.dst}|${f.dstPort}`;
const reverseKey = (f: Flow) => `${f.protocol}|${f.dst}|${f.dstPort}|${f.src}|${f.srcPort}`;

function ruleMatches(rule: FirewallRule, flow: Flow, inIface: number): boolean {
  if (rule.protocol !== 'any' && rule.protocol !== flow.protocol) return false;
  if (rule.iface !== undefined && rule.iface !== inIface) return false;
  if (rule.port !== undefined && flow.dstPort !== rule.port) return false;
  return matchesAddress(rule.src, flow.src) && matchesAddress(rule.dst, flow.dst);
}

export class Firewall {
  #connections = new Map<string, number>();
  #hits: number[] = [];
  #defaultHits = 0;
  #blocked = 0;
  #configured: FirewallConfig | undefined;

  constructor(
    private readonly ctx: NodeContext,
    private readonly config: () => FirewallConfig | undefined,
  ) {}

  #current(): FirewallConfig | undefined {
    const config = this.config();
    // Neue Regeln: Zähler zurücksetzen.
    if (config !== this.#configured) {
      this.#configured = config;
      this.#hits = config ? config.rules.map(() => 0) : [];
      this.#defaultHits = 0;
    }
    return config;
  }

  /** Ausgehende Verbindung des Geräts selbst merken, damit die Antworten herein dürfen. */
  track(packet: Ipv4Packet) {
    const config = this.#current();
    if (!config || config.stateful === false) return;
    this.#connections.set(key(flowOf(packet)), this.ctx.now + CONNECTION_TIMEOUT);
  }

  /** Darf das Paket passieren? `inIface`: Anschluss, an dem es hereinkam (-1 = aus einem Tunnel). */
  allows(packet: Ipv4Packet, inIface: number): boolean {
    const config = this.#current();
    if (!config) return true;
    const flow = flowOf(packet);
    const now = this.ctx.now;
    if (config.stateful !== false) {
      const reply = this.#connections.get(reverseKey(flow));
      if (reply !== undefined && reply > now) {
        this.#connections.set(reverseKey(flow), now + CONNECTION_TIMEOUT);
        return true;
      }
      const known = this.#connections.get(key(flow));
      if (known !== undefined && known > now) {
        this.#connections.set(key(flow), now + CONNECTION_TIMEOUT);
        return true;
      }
      // ICMP-Fehler zu einer bekannten Verbindung (z.B. «TTL abgelaufen» für Traceroute).
      const p = packet.payload;
      if (p.kind === 'icmp' && p.original && (p.type === 'timeExceeded' || p.type === 'destUnreachable')) {
        const original = `icmp|${p.original.src}|${p.original.id}|${p.original.dst}|${p.original.id}`;
        const entry = this.#connections.get(original);
        if (entry !== undefined && entry > now) return true;
      }
    }
    const index = config.rules.findIndex((rule) => ruleMatches(rule, flow, inIface));
    const action = index >= 0 ? config.rules[index]!.action : config.defaultAction;
    if (index >= 0) this.#hits[index] = (this.#hits[index] ?? 0) + 1;
    else this.#defaultHits++;
    if (action === 'allow') {
      if (config.stateful !== false) this.#connections.set(key(flow), now + CONNECTION_TIMEOUT);
      return true;
    }
    this.#blocked++;
    const what = flow.protocol === 'tcp' || flow.protocol === 'udp' ? `${flow.protocol.toUpperCase()} ${flow.dst}:${flow.dstPort}` : `${flow.protocol.toUpperCase()} ${flow.dst}`;
    this.ctx.print('firewall.blocked', { what, src: flow.src, rule: index >= 0 ? String(index + 1) : '–' });
    return false;
  }

  state(): FirewallState | undefined {
    const config = this.#current();
    if (!config) return undefined;
    const now = this.ctx.now;
    return { hits: [...this.#hits], defaultHits: this.#defaultHits, blocked: this.#blocked, connections: [...this.#connections.values()].filter((e) => e > now).length };
  }
}
