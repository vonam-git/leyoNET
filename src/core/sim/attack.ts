import { formatIp, networkOf, parseIp, parseMask, sameSubnet } from '../net/ipv4';
import type { Device, Topology } from '../model/types';
import { ATTACK_KINDS, type AttackKind } from '../model/types';
import type { ArpPacket, EthernetFrame, TcpSegment } from './frames';
import type { IfaceAddress } from '../net/routing';
import type { SendError, SendOptions } from './ip';
import type { NetScan } from './scan';
import type { NodeContext } from './simulation';

/**
 * Angriffe für den Unterricht. Alles läuft nur in der Simulation: Es entsteht nie ein echtes Paket.
 * Jeder Angriff gehört zu einer Kategorie von STRIDE und lässt sich in leyoNET abwehren.
 *
 *   arpSpoof  Spoofing (und Tampering): gefälschte ARP-Angaben, Verkehr ans Gateway landet beim Angreifer
 *   synFlood  Denial of Service: halb offene TCP-Verbindungen füllen die Warteschlange (RFC 4987)
 *   portScan  Information Disclosure: offene Ports suchen
 *   sshGuess  Elevation of Privilege: einfache Passwörter am SSH-Zugang probieren
 */
export { ATTACK_KINDS, type AttackKind };
export const STRIDE: Record<AttackKind, 'S' | 'D' | 'I' | 'E'> = { arpSpoof: 'S', synFlood: 'D', portScan: 'I', sshGuess: 'E' };

/** Häufige schwache Passwörter (nur diese probiert der Angreifer). */
export const WEAK_PASSWORDS: readonly string[] = ['admin', 'cisco', 'password', 'passwort', '1234', '12345678', 'geheim', 'schule', 'test'];
const WEAK_USERS: readonly string[] = ['admin', 'root', 'cisco'];
const TICK = { arpSpoof: 500, synFlood: 25, portScan: 20_000, sshGuess: 1500 } as const;

export interface AttackState {
  kind: AttackKind;
  running: boolean;
  target: string;
  /** Gesendete Angriffspakete bzw. Versuche. */
  sent: number;
  /** Abgefangene fremde Pakete (arpSpoof). */
  captured: number;
  /** SSH-Zugang erraten: «benutzer». */
  compromised?: string;
}

/** Was der Angreifer vom Endgerät braucht. */
export interface AttackNode {
  readonly ctx: NodeContext;
  readonly scanner: NetScan;
  interfaces(): IfaceAddress[];
  sendIp(dst: string, payload: TcpSegment, options?: SendOptions, onError?: (e: SendError) => void): void;
  sendRaw(index: number, frame: EthernetFrame): void;
}

export class AttackRun {
  #state: AttackState | null = null;
  /** Angriff als Text, damit eine gleichwertige Kopie des Netzes ihn nicht neu beginnt. */
  #config = '';

  constructor(
    private readonly node: AttackNode,
    private readonly trySsh: (target: string, user: string, password: string, done: (ok: boolean) => void) => void,
  ) {}

  state(): AttackState | undefined {
    return this.#state ? { ...this.#state } : undefined;
  }

  /** Beim Start und nach jeder Änderung des Netzes: beginnt, wenn das Gerät ein Angreifer ist. */
  boot() {
    const config = this.node.ctx.device()?.attack;
    const key = config ? JSON.stringify([config.kind, config.target, config.delay]) : '';
    if (key === this.#config) return;
    this.#config = key;
    this.#state = null;
    if (!config) return;
    this.#state = { kind: config.kind, running: true, target: '', sent: 0, captured: 0 };
    const state = this.#state;
    this.node.ctx.schedule((config.delay ?? 2) * 1000, () => this.#tick(state));
  }

  /** Fremdes Paket ist beim Angreifer gelandet. */
  onForeign() {
    if (this.#state?.kind === 'arpSpoof') this.#state.captured++;
  }

  #tick(state: AttackState) {
    // Angriff geändert oder entfernt?
    this.boot();
    if (this.#state !== state || !state.running) return;
    const iface = this.node.interfaces()[0];
    const target = iface ? resolveTarget(this.node.ctx.topology(), this.node.ctx.device()!, state.kind) : null;
    if (iface && target) {
      state.target = target;
      this.#fire(state, iface, target);
    }
    if (this.#state === state && state.running) this.node.ctx.schedule(TICK[state.kind], () => this.#tick(state));
  }

  #fire(state: AttackState, iface: IfaceAddress, target: string) {
    const { node } = this;
    switch (state.kind) {
      case 'arpSpoof': {
        // Jedem Gerät im Netz einreden, das Gateway habe die MAC-Adresse des Angreifers.
        for (const ip of neighbours(node.ctx.topology(), iface, target)) {
          const arp: ArpPacket = { kind: 'arp', op: 'request', senderMac: iface.mac, senderIp: target, targetMac: '00:00:00:00:00:00', targetIp: ip };
          node.sendRaw(iface.index, { src: iface.mac, dst: 'FF:FF:FF:FF:FF:FF', payload: arp });
          state.sent++;
        }
        return;
      }
      case 'synFlood': {
        // Gefälschte Absender: im eigenen Netz unbenutzte Adressen, sonst aus dem Netz für Lasttests (RFC 2544).
        const ip = parseIp(target)!;
        const local = sameSubnet(ip, iface.ip, iface.prefix);
        const src = local ? formatIp(networkOf(iface.ip, iface.prefix) + 2 ** (32 - iface.prefix) - 3 - (state.sent % 8)) : `198.18.${(state.sent >> 8) % 256}.${(state.sent % 254) + 1}`;
        node.sendIp(target, { kind: 'tcp', srcPort: 1024 + (state.sent % 60000), dstPort: 80, seq: 1000 + state.sent, ack: 0, flags: ['SYN'], data: '' }, { src });
        state.sent++;
        return;
      }
      case 'portScan':
        if (!node.scanner.running) {
          node.scanner.start({ target, skipDiscovery: true });
          state.sent++;
        }
        return;
      case 'sshGuess': {
        const n = state.sent;
        const user = WEAK_USERS[Math.floor(n / WEAK_PASSWORDS.length)];
        if (user === undefined) {
          state.running = false;
          return;
        }
        state.sent++;
        this.trySsh(target, user, WEAK_PASSWORDS[n % WEAK_PASSWORDS.length]!, (ok) => {
          if (!ok || this.#state !== state) return;
          state.compromised = user;
          state.running = false;
        });
      }
    }
  }
}

/**
 * Geräte, die als Ziel in Frage kommen: im Klassen-Verbund nur der eigene Standort. Dessen Kennungen
 * sind klein, Infrastruktur und andere Standorte beginnen bei 100 000 (siehe model/federation.ts).
 */
const FOREIGN_ID = 100_000;
export function ownDevices(t: Topology): Device[] {
  const num = (d: Device) => Number(d.id.slice(1)) || 0;
  const own = t.devices.filter((d) => num(d) < FOREIGN_ID);
  return (own.length ? own : t.devices).filter((d) => d.variant !== 'attacker');
}

const staticIp = (d: Device): string | undefined => d.interfaces.find((i) => i.ip)?.ip;
const isPrivate = (ip: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);

/** Öffentliche Adresse des Geräts mit NAT, falls es den Port zu `inside` weiterleitet. */
function forwardedAs(t: Topology, inside: string, port: number): string | undefined {
  for (const d of t.devices) if (d.portForwards?.some((f) => f.to === inside && f.toPort === port)) return d.interfaces.find((i) => i.nat && i.ip)?.ip;
  return undefined;
}

/** Ziel des Angriffs: eingetragen oder aus dem Netz gewählt. */
export function resolveTarget(t: Topology, attacker: Device, kind: AttackKind): string | null {
  const own = attacker.interfaces[0];
  const wanted = attacker.attack?.target?.trim();
  if (wanted) {
    if (parseIp(wanted) !== null) return wanted;
    const named = t.devices.find((d) => d.name.toLowerCase() === wanted.toLowerCase());
    return (named && staticIp(named)) ?? null;
  }
  const outside = !!own?.ip && !isPrivate(own.ip);
  const reach = (ip: string | undefined, port: number) => (!ip ? undefined : outside && isPrivate(ip) ? forwardedAs(t, ip, port) : ip);
  if (kind === 'arpSpoof') return attacker.gateway ?? null;
  if (kind === 'sshGuess') {
    for (const d of ownDevices(t)) {
      if (!d.cli?.ssh || !['router', 'firewall', 'l3switch'].includes(d.type)) continue;
      const ip = outside ? d.interfaces.find((i) => i.ip && !isPrivate(i.ip))?.ip : staticIp(d);
      if (ip) return ip;
    }
    return null;
  }
  for (const d of ownDevices(t)) {
    if (!d.webServer) continue;
    const ip = reach(staticIp(d), 80);
    if (ip && ip !== own?.ip) return ip;
  }
  if (kind === 'portScan') return (outside ? ownDevices(t).find((d) => d.type === 'router' || d.type === 'firewall' || d.type === 'cpe')?.interfaces.find((i) => i.ip && !isPrivate(i.ip))?.ip : ownDevices(t).find((d) => d.type === 'server' && staticIp(d))?.interfaces[0]?.ip) ?? null;
  return null;
}

/** Feste Adressen im eigenen Netz ohne Angreifer und Gateway. */
function neighbours(t: Topology, own: IfaceAddress, gateway: string): string[] {
  const out: string[] = [];
  for (const d of t.devices) for (const i of d.interfaces) if (i.ip && i.ip !== gateway && i.mac !== own.mac && parseMask(i.mask ?? '') !== null && sameSubnet(parseIp(i.ip)!, own.ip, own.prefix)) out.push(i.ip);
  return out.slice(0, 30);
}
