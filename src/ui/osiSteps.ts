import { BROADCAST_MAC, DEVICE_SPECS, dissect, interfaceAddresses, isBridge, mediumOf, formatIp, type Device, type OsiLayer, type PacketLogEntry, type Topology } from '../core';

/**
 * Einzelschritt mit OSI-Modell: Kommt ein Rahmen an, packt das Gerät ihn
 * Schicht für Schicht aus, aber nur so weit, wie es ihn verarbeitet:
 *   - Switch, Access Point, Modem: bis Schicht 2 (MAC-Adresse) und leiten weiter
 *   - Router: bis Schicht 3 (IP-Adresse) und leiten weiter, oder ganz,
 *     wenn das Paket für den Router selbst ist (z.B. OSPF, SSH)
 *   - Endgerät: ganz, wenn der Rahmen für es ist; sonst verwirft es ihn
 *     auf Schicht 2 (fremde Ziel-MAC)
 */
export type UnpackOutcome = 'forward' | 'route' | 'deliver' | 'ignore';

export interface UnpackPlan {
  /** Schichten von aussen nach innen, die beim Auspacken gezeigt werden. */
  layers: OsiLayer[];
  /** Protokollname je Schicht (z.B. 2 → «Ethernet II»). */
  names: Partial<Record<OsiLayer, string>>;
  outcome: UnpackOutcome;
}

/** Alle Schichten eines Rahmens von aussen (1) nach innen, mit Protokollnamen. */
export function layersOf(topology: Topology, entry: PacketLogEntry): { layers: OsiLayer[]; names: Partial<Record<OsiLayer, string>> } {
  const cable = topology.cables.find((c) => c.id === entry.cable);
  const wire = dissect(entry.frame, cable ? mediumOf(cable) : 'tp');
  const names: Partial<Record<OsiLayer, string>> = {};
  for (const layer of wire.layers) names[layer.osi] ??= layer.protocol;
  const layers = [...new Set(wire.layers.map((l) => l.osi))].sort((a, b) => a - b);
  return { layers, names };
}

const MULTICAST = /^01:00:5E:/i;

export function unpackPlan(topology: Topology, entry: PacketLogEntry): UnpackPlan | null {
  const device = topology.devices.find((d) => d.id === entry.to.device);
  if (!device) return null;
  const { layers, names } = layersOf(topology, entry);
  if (layers.length < 2) return null;
  const top = layers.at(-1)!;
  const upTo = (limit: number, outcome: UnpackOutcome): UnpackPlan => ({ layers: layers.filter((l) => l <= limit), names, outcome });

  const frame = entry.frame;
  const dst = frame.dst.toUpperCase();
  const ownMac = device.interfaces[entry.to.iface]?.mac?.toUpperCase();
  const forMe = !dst || dst === BROADCAST_MAC || MULTICAST.test(dst) || dst === ownMac || frame.l2 !== undefined || frame.access !== undefined;

  if (isBridge(device)) return upTo(2, 'forward');
  if (!forMe) return upTo(2, 'ignore');
  if (DEVICE_SPECS[device.type].role === 'endpoint') return upTo(top, 'deliver');
  // Router: Paket für ihn selbst (eigene Adresse, Broadcast, Multicast) ganz auspacken, sonst weiterleiten.
  const payload = frame.payload;
  if (payload.kind !== 'ipv4') return upTo(top, 'deliver');
  return isOwnAddress(device, payload.dst) ? upTo(top, 'deliver') : upTo(3, 'route');
}

function isOwnAddress(device: Device, ip: string): boolean {
  if (ip === '255.255.255.255' || ip.startsWith('224.')) return true;
  return interfaceAddresses(device).some((a) => formatIp(a.ip) === ip);
}
