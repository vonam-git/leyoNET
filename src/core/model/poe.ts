/**
 * Power over Ethernet nach IEEE 802.3-2022, Klausel 33 (Typ 1 und 2, früher 802.3af/at) und
 * Klausel 145 (Typ 3 und 4 über alle vier Adernpaare, früher 802.3bt).
 *
 * Vereinfachung für den Unterricht: Die Speisequelle (PSE, ein Switch) erkennt das gespeiste
 * Gerät (PD) und teilt ihm die Leistung seiner Klasse zu. Reicht der Typ des Ports nicht für
 * die Klasse oder ist das Budget des Switches aufgebraucht, bleibt das Gerät ohne Strom (in
 * Wirklichkeit kann ein PD mit weniger Leistung eingeschränkt laufen). Zugeteilt wird in der
 * Reihenfolge der Ports, wie bei einer statischen Priorität nach Portnummer.
 */
import type { Device, Endpoint, PoeStandard, Topology } from './types';

/** Leistung je Klasse an der Quelle (PSE) in Watt, Klasse 0–8. */
export const POE_CLASS_PSE_WATTS = [15.4, 4, 7, 15.4, 30, 45, 60, 75, 90] as const;
/** Leistung je Klasse am Gerät (PD) in Watt, nach Abzug der Verluste im Kabel (100 m). */
export const POE_CLASS_PD_WATTS = [13, 3.84, 6.49, 13, 25.5, 40, 51, 62, 71.3] as const;

export const POE_STANDARDS: Record<PoeStandard, { type: number; maxClass: number; pairs: 2 | 4; legacy: string }> = {
  af: { type: 1, maxClass: 3, pairs: 2, legacy: '802.3af' },
  at: { type: 2, maxClass: 4, pairs: 2, legacy: '802.3at' },
  bt3: { type: 3, maxClass: 6, pairs: 4, legacy: '802.3bt' },
  bt4: { type: 4, maxClass: 8, pairs: 4, legacy: '802.3bt' },
};
export const POE_STANDARD_IDS = Object.keys(POE_STANDARDS) as PoeStandard[];
/** Höchstes Budget, das ein Switch haben kann (Watt). */
export const MAX_POE_BUDGET = 6000;

/** Geräte, die per PoE gespeist werden können. */
export const canBePowered = (type: Device['type']) => type === 'ipphone' || type === 'camera' || type === 'accesspoint';
/** Geräte, die PoE liefern können. */
export const canSupplyPoe = (type: Device['type']) => type === 'switch' || type === 'l3switch';

/** Standardklasse eines gespeisten Geräts: Telefon 2, Kamera 3 (mit Schwenkkopf 4), Access Point 4. */
export function defaultPoeClass(device: Pick<Device, 'type' | 'variant'>): number {
  if (device.type === 'ipphone') return 2;
  if (device.type === 'camera') return device.variant === 'ptz' ? 4 : 3;
  return 4;
}

export const poeClassOf = (device: Device) => device.poeClass ?? defaultPoeClass(device);

/** Braucht das Gerät PoE (statt eines Netzteils)? Access Points ohne Angabe haben ein Netzteil (ältere Projekte). */
export function needsPoe(device: Device): boolean {
  if (!canBePowered(device.type)) return false;
  return (device.power ?? (device.type === 'accesspoint' ? 'local' : 'poe')) === 'poe';
}

/** Port des gespeisten Geräts, über den der Strom kommt (der LAN-Port 0). */
const PD_PORT = 0;

export type PoeReason = 'noCable' | 'noSource' | 'portOff' | 'classTooHigh' | 'budget';

export interface PoePort {
  iface: number;
  /** Gespeistes Gerät an diesem Port. */
  device: string;
  poeClass: number;
  /** Zugeteilte Leistung an der Quelle in Watt (0 ohne Strom). */
  watts: number;
  reason?: PoeReason;
}

export interface PoeSupply {
  budget: number;
  used: number;
  standard: PoeStandard;
  ports: PoePort[];
}

export interface PoeDeviceState {
  powered: boolean;
  reason?: PoeReason;
  /** Speisender Port. */
  source?: Endpoint;
  watts?: number;
}

export interface PoeReport {
  supplies: Map<string, PoeSupply>;
  devices: Map<string, PoeDeviceState>;
}

// Topologien sind unveränderlich: einmal je Topologie rechnen (linkStatus fragt bei jedem Rahmen).
const cache = new WeakMap<Topology, PoeReport>();

export function poeReport(t: Topology): PoeReport {
  const cached = cache.get(t);
  if (cached) return cached;
  const byId = new Map(t.devices.map((d) => [d.id, d]));
  const supplies = new Map<string, PoeSupply>();
  const devices = new Map<string, PoeDeviceState>();
  for (const d of t.devices) if (needsPoe(d)) devices.set(d.id, { powered: false, reason: 'noCable' });

  // Kabel je Anschluss nachschlagen.
  const peers = new Map<string, Endpoint>();
  for (const c of t.cables) {
    if ((c.medium ?? 'tp') !== 'tp') continue;
    peers.set(`${c.a.device}:${c.a.iface}`, c.b);
    peers.set(`${c.b.device}:${c.b.iface}`, c.a);
  }
  for (const [id, state] of devices) {
    const peer = peers.get(`${id}:${PD_PORT}`);
    if (peer) Object.assign(state, { reason: 'noSource' as const, source: peer });
  }

  for (const pse of t.devices) {
    if (!pse.poe || !canSupplyPoe(pse.type)) continue;
    const spec = POE_STANDARDS[pse.poe.standard];
    const supply: PoeSupply = { budget: pse.poe.budget, used: 0, standard: pse.poe.standard, ports: [] };
    supplies.set(pse.id, supply);
    for (const iface of pse.interfaces) {
      if (iface.serial || iface.sfpSlot) continue;
      const peer = peers.get(`${pse.id}:${iface.index}`);
      if (!peer || peer.iface !== PD_PORT) continue;
      const pd = byId.get(peer.device);
      const state = pd && devices.get(pd.id);
      if (!pd || !state) continue;
      const poeClass = poeClassOf(pd);
      const watts = POE_CLASS_PSE_WATTS[poeClass] ?? 90;
      let reason: PoeReason | undefined;
      if (iface.poeOff || iface.shutdown) reason = 'portOff';
      else if (poeClass > spec.maxClass) reason = 'classTooHigh';
      else if (supply.used + watts > supply.budget + 1e-9) reason = 'budget';
      if (reason) {
        supply.ports.push({ iface: iface.index, device: pd.id, poeClass, watts: 0, reason });
        Object.assign(state, { powered: false, reason });
      } else {
        supply.used = Math.round((supply.used + watts) * 10) / 10;
        supply.ports.push({ iface: iface.index, device: pd.id, poeClass, watts });
        devices.set(pd.id, { powered: true, source: { device: pse.id, iface: iface.index }, watts });
      }
    }
  }
  const report = { supplies, devices };
  cache.set(t, report);
  return report;
}

/** Hat das Gerät Strom? Geräte mit Netzteil und alle übrigen Geräte immer. */
export function isPowered(t: Topology, device: Device): boolean {
  if (!needsPoe(device)) return true;
  return poeReport(t).devices.get(device.id)?.powered ?? false;
}

