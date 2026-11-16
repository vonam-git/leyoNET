/**
 * Quality of Service nach Differentiated Services (RFC 2474, Architektur RFC 2475) und
 * IEEE 802.1Q (Priority Code Point im VLAN-Tag).
 *
 * - DSCP: 6 Bit im früheren TOS-Byte des IPv4-Kopfs (RFC 2474). Klassen nach RFC 4594:
 *   Telefonie EF (46, RFC 3246), Signalisierung CS5 (40), Netzsteuerung CS6/CS7,
 *   Assured Forwarding AFxy (RFC 2597), Best Effort 0.
 * - PCP: 3 Bit im 802.1Q-Tag. Abbildung DSCP → PCP: die drei oberen Bits (Klassenauswahl,
 *   RFC 2474 Abschnitt 4.2.2), also EF → 5, CS6 → 6.
 * - Warteschlangen: vier Klassen mit strikter Priorität (Priority Queuing): Sprache (EF) vor
 *   Signalisierung und Netzsteuerung (CS5–CS7) vor bevorzugten Daten (AF, CS2–CS4) vor Best Effort. Ohne QoS: eine Warteschlange (FIFO).
 */

export const DSCP = { BE: 0, CS1: 8, AF11: 10, AF21: 18, CS3: 24, AF31: 26, CS4: 32, AF41: 34, CS5: 40, EF: 46, CS6: 48, CS7: 56 } as const;

/** Name eines DSCP-Werts (EF, CS5, AF41 …), sonst die Zahl. */
export function dscpName(dscp: number): string {
  if (dscp === 0) return 'Best Effort';
  if (dscp === 46) return 'EF';
  if (dscp === 44) return 'VOICE-ADMIT';
  if (dscp % 8 === 0) return `CS${dscp / 8}`;
  const cls = dscp >> 3;
  const drop = (dscp & 7) >> 1;
  if ((dscp & 1) === 0 && cls >= 1 && cls <= 4 && drop >= 1 && drop <= 3) return `AF${cls}${drop}`;
  return String(dscp);
}

/** DSCP aus Name oder Zahl lesen («EF», «af41», «46»); null bei Unbekanntem. */
export function parseDscp(text: string): number | null {
  const s = text.trim().toUpperCase();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n >= 0 && n <= 63 ? n : null;
  }
  if (s === 'BE' || s === 'DEFAULT') return 0;
  if (s === 'EF') return 46;
  const cs = /^CS([0-7])$/.exec(s);
  if (cs) return Number(cs[1]) * 8;
  const af = /^AF([1-4])([1-3])$/.exec(s);
  if (af) return Number(af[1]) * 8 + Number(af[2]) * 2;
  return null;
}

/** PCP (802.1Q) aus DSCP: Klassenauswahl = drei oberste Bits. */
export const pcpOfDscp = (dscp: number) => (dscp >> 3) & 7;

/** Warteschlange 0 (höchste Priorität) bis 3 (Best Effort). */
export type QueueClass = 0 | 1 | 2 | 3;
export const QUEUE_COUNT = 4;

export function queueOf(dscp: number | undefined, pcp?: number): QueueClass {
  if (dscp === undefined && pcp === 5) return 0;
  const d = dscp ?? (pcp !== undefined ? pcp << 3 : 0);
  if (d === 46 || d === 44) return 0;
  if (d >= 40) return 1;
  if (d > 0 && d !== 8) return 2;
  return 3;
}

/** Höchstens so viele Rahmen warten je Warteschlange (Tail Drop). */
export const QUEUE_LIMIT = 40;
/** Grenzen der Bandbreite eines Ports in kbit/s. */
export const MIN_RATE = 64;
export const MAX_RATE = 10_000_000;
