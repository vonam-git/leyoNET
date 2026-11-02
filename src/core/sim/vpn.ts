import { fnv1a, matchesAddress, type VpnTunnel } from '../model/security';
import type { Device } from '../model/types';
import { IKE_PORT, type EspPacket, type IkeMessage, type Ipv4Packet, type UdpDatagram } from './frames';
import type { SendError } from './ip';
import type { NodeContext } from './simulation';

/**
 * Site-to-Site-VPN mit IPsec (RFC 4301): Zwei Router verbinden ihre Netze
 * über das Internet. Der erste Verkehr ins entfernte Netz startet die
 * Aushandlung mit IKEv2 (RFC 7296, UDP 500):
 *   1. IKE_SA_INIT: Verfahren und Schlüsselmaterial (hier angedeutet)
 *   2. IKE_AUTH: Beide beweisen, dass sie den gemeinsamen Schlüssel kennen,
 *      und einigen sich auf die Netze (Traffic Selectors).
 * Danach wandern die Pakete verschlüsselt in ESP (RFC 4303, IP-Protokoll 50):
 * aussen die öffentlichen Router-Adressen, innen das ganze Originalpaket.
 *
 * Vereinfacht: keine echte Kryptografie (der Schlüsselbeweis ist ein
 * Prüfwert, die ESP-Nutzlast nur verwürfelt), kein Rekeying, kein NAT-T.
 */

export type VpnStatus = 'down' | 'connecting' | 'up' | 'failed';

export interface VpnState {
  name: string;
  peer: string;
  status: VpnStatus;
  /** Grund, falls die Aushandlung scheiterte. */
  error?: 'noAnswer' | 'authFailed' | 'tsMismatch';
  sent: number;
  received: number;
  localSpi: number;
  remoteSpi?: number;
}

export const IKE_TIMEOUT = 2000;
export const IKE_ATTEMPTS = 3;
const QUEUE_LIMIT = 8;

/** Was das VPN vom Router braucht. */
export interface VpnHost {
  readonly ctx: NodeContext;
  device(): Device | undefined;
  sendIp(dst: string, payload: Ipv4Packet['payload'], options?: { src?: string }, onError?: (e: SendError) => void): void;
  /** Ausgepacktes Paket weiterleiten, als käme es aus dem Tunnel; `local`: eigenes Netz des Tunnels. */
  inject(packet: Ipv4Packet, local: string): void;
}

interface Sa {
  config: string;
  status: VpnStatus;
  error?: VpnState['error'];
  localSpi: number;
  remoteSpi?: number;
  seq: number;
  sent: number;
  received: number;
  attempts: number;
  queue: Ipv4Packet[];
  run: number;
}

/** Beweis für den Schlüssel: Prüfwert über Schlüssel, beide SPIs und die Rolle. */
export function keyProof(key: string, ispi: number, rspi: number, role: 'i' | 'r'): string {
  return fnv1a(`${key}|${ispi}|${rspi}|${role}`).toString(16).padStart(8, '0');
}

export class Vpn {
  #sas = new Map<number, Sa>();
  #msgId = 0;

  constructor(
    private readonly host: VpnHost,
    private readonly seq: number,
  ) {}

  get #ctx() {
    return this.host.ctx;
  }

  #tunnels(): VpnTunnel[] {
    return this.host.device()?.vpn ?? [];
  }

  /** Zustand eines Tunnels; nach einer Änderung der Einstellungen beginnt er neu. */
  #sa(index: number): Sa | undefined {
    const tunnel = this.#tunnels()[index];
    if (!tunnel) return undefined;
    const config = JSON.stringify(tunnel);
    let sa = this.#sas.get(index);
    if (!sa || sa.config !== config) {
      sa = { config, status: 'down', localSpi: (0x10000000 + this.seq * 0x100 + index * 7 + 1) >>> 0, seq: 0, sent: 0, received: 0, attempts: 0, queue: [], run: (sa?.run ?? 0) + 1 };
      this.#sas.set(index, sa);
    }
    return sa;
  }

  /**
   * Gehört das Paket in einen Tunnel (Quelle im eigenen, Ziel im entfernten
   * Netz)? Dann verschlüsselt senden oder bis zum Aufbau zurückstellen; true = erledigt.
   */
  route(packet: Ipv4Packet): boolean {
    const index = this.#tunnels().findIndex((t) => matchesAddress(t.remote, packet.dst) && matchesAddress(t.local, packet.src));
    if (index < 0) return false;
    const sa = this.#sa(index)!;
    if (sa.status === 'up') {
      this.#sendEsp(index, sa, packet);
      return true;
    }
    if (sa.queue.length < QUEUE_LIMIT) sa.queue.push(packet);
    if (sa.status === 'down' || sa.status === 'failed') this.#start(index, sa);
    return true;
  }

  #start(index: number, sa: Sa) {
    const tunnel = this.#tunnels()[index]!;
    sa.status = 'connecting';
    delete sa.error;
    sa.attempts = 1;
    this.#ctx.print('vpn.connecting', { name: tunnel.name, peer: tunnel.peer });
    this.#sendInit(index, sa);
  }

  #sendInit(index: number, sa: Sa) {
    const tunnel = this.#tunnels()[index];
    if (!tunnel) return;
    const run = sa.run;
    this.#sendIke(tunnel.peer, { kind: 'ike', exchange: 'IKE_SA_INIT', response: false, ispi: sa.localSpi, rspi: 0, msgId: 0 });
    this.#ctx.schedule(IKE_TIMEOUT, () => {
      if (sa.run !== run || sa.status !== 'connecting' || sa.remoteSpi !== undefined) return;
      if (sa.attempts >= IKE_ATTEMPTS) return this.#fail(index, sa, 'noAnswer');
      sa.attempts++;
      this.#sendInit(index, sa);
    });
  }

  #sendIke(dst: string, message: IkeMessage) {
    const datagram: UdpDatagram = { kind: 'udp', srcPort: IKE_PORT, dstPort: IKE_PORT, payload: message };
    this.host.sendIp(dst, datagram);
  }

  #fail(index: number, sa: Sa, error: NonNullable<VpnState['error']>) {
    const tunnel = this.#tunnels()[index];
    sa.status = 'failed';
    sa.error = error;
    sa.queue = [];
    this.#ctx.print(`vpn.${error}`, { name: tunnel?.name ?? '', peer: tunnel?.peer ?? '' });
  }

  #up(index: number, sa: Sa) {
    const tunnel = this.#tunnels()[index]!;
    sa.status = 'up';
    this.#ctx.print('vpn.up', { name: tunnel.name, peer: tunnel.peer, remote: tunnel.remote });
    const queued = sa.queue;
    sa.queue = [];
    for (const packet of queued) this.#sendEsp(index, sa, packet);
  }

  #sendEsp(index: number, sa: Sa, inner: Ipv4Packet) {
    const tunnel = this.#tunnels()[index]!;
    sa.seq++;
    sa.sent++;
    const esp: EspPacket = { kind: 'esp', spi: sa.remoteSpi ?? 0, seq: sa.seq, inner, keyHash: fnv1a(tunnel.key) };
    this.host.sendIp(tunnel.peer, esp);
  }

  /** IKE-Nachricht an den Router (UDP 500). */
  onIke(packet: Ipv4Packet, m: IkeMessage) {
    const tunnels = this.#tunnels();
    const index = tunnels.findIndex((t) => t.peer === packet.src);
    if (index < 0) {
      if (!m.response) this.#ctx.print('vpn.unknownPeer', { peer: packet.src });
      return;
    }
    const tunnel = tunnels[index]!;
    const sa = this.#sa(index)!;
    if (!m.response && m.exchange === 'IKE_SA_INIT') {
      // Responder: Aushandlung beginnt (auch ein laufender Tunnel startet neu).
      sa.remoteSpi = m.ispi;
      sa.status = 'connecting';
      delete sa.error;
      this.#sendIke(packet.src, { kind: 'ike', exchange: 'IKE_SA_INIT', response: true, ispi: m.ispi, rspi: sa.localSpi, msgId: m.msgId });
      return;
    }
    if (m.response && m.exchange === 'IKE_SA_INIT') {
      if (sa.status !== 'connecting' || m.ispi !== sa.localSpi) return;
      sa.remoteSpi = m.rspi;
      this.#sendIke(packet.src, {
        kind: 'ike',
        exchange: 'IKE_AUTH',
        response: false,
        ispi: sa.localSpi,
        rspi: m.rspi,
        msgId: ++this.#msgId,
        proof: keyProof(tunnel.key, sa.localSpi, m.rspi, 'i'),
        tsi: tunnel.local,
        tsr: tunnel.remote,
      });
      return;
    }
    if (!m.response && m.exchange === 'IKE_AUTH') {
      if (m.ispi !== sa.remoteSpi) return;
      const base = { kind: 'ike' as const, exchange: 'IKE_AUTH' as const, response: true, ispi: m.ispi, rspi: sa.localSpi, msgId: m.msgId };
      if (m.proof !== keyProof(tunnel.key, m.ispi, sa.localSpi, 'i')) {
        this.#sendIke(packet.src, { ...base, notify: 'AUTHENTICATION_FAILED' });
        return this.#fail(index, sa, 'authFailed');
      }
      // Die Netze müssen gespiegelt passen: das eigene Netz der Gegenseite ist hier das entfernte.
      if (m.tsi !== tunnel.remote || m.tsr !== tunnel.local) {
        this.#sendIke(packet.src, { ...base, notify: 'TS_UNACCEPTABLE' });
        return this.#fail(index, sa, 'tsMismatch');
      }
      this.#sendIke(packet.src, { ...base, proof: keyProof(tunnel.key, m.ispi, sa.localSpi, 'r'), tsi: m.tsi, tsr: m.tsr });
      this.#up(index, sa);
      return;
    }
    if (m.response && m.exchange === 'IKE_AUTH') {
      if (sa.status !== 'connecting' || m.ispi !== sa.localSpi) return;
      if (m.notify) return this.#fail(index, sa, m.notify === 'AUTHENTICATION_FAILED' ? 'authFailed' : 'tsMismatch');
      if (m.proof !== keyProof(tunnel.key, sa.localSpi, m.rspi, 'r')) return this.#fail(index, sa, 'authFailed');
      this.#up(index, sa);
    }
  }

  /** ESP an den Router: passenden Tunnel finden, entschlüsseln, weiterleiten. */
  onEsp(packet: Ipv4Packet, esp: EspPacket) {
    const tunnels = this.#tunnels();
    for (let index = 0; index < tunnels.length; index++) {
      const sa = this.#sa(index)!;
      if (sa.localSpi !== esp.spi || sa.status !== 'up' || tunnels[index]!.peer !== packet.src) continue;
      // Falscher Schlüssel: Die Prüfsumme (ICV) stimmt nicht, das Paket wird verworfen.
      if (esp.keyHash !== fnv1a(tunnels[index]!.key)) return this.#ctx.print('vpn.badIcv', { peer: packet.src });
      sa.received++;
      this.host.inject(esp.inner, tunnels[index]!.local);
      return;
    }
    this.#ctx.print('vpn.unknownSpi', { spi: `0x${esp.spi.toString(16)}`, peer: packet.src });
  }

  state(): VpnState[] {
    return this.#tunnels().map((t, index) => {
      const sa = this.#sa(index)!;
      return {
        name: t.name,
        peer: t.peer,
        status: sa.status,
        ...(sa.error ? { error: sa.error } : {}),
        sent: sa.sent,
        received: sa.received,
        localSpi: sa.localSpi,
        ...(sa.remoteSpi !== undefined ? { remoteSpi: sa.remoteSpi } : {}),
      };
    });
  }
}
