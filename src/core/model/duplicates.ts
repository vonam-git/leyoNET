import { decodeIface, loopbackId, subifId, sviId, vrfOfIface } from '../net/routing';
import { isBridge } from './topology';
import type { Device, Topology } from './types';

/**
 * Doppelt vergebene IPv4-Adressen. Zwei Schnittstellen stören sich nur, wenn
 * sie im selben Netzabschnitt liegen: verbunden über Kabel, Switches, Access
 * Points oder Modems, ohne Router dazwischen. Hinter verschiedenen Routern
 * (z.B. zwei Heimnetze mit 192.168.1.1) ist dieselbe Adresse erlaubt.
 *
 * `live`: per DHCP bezogene Adressen aus der Simulation (Geräte-ID → Adresse).
 * Ergebnis: Schlüssel `<Geräte-ID>#<Adresse>` aller betroffenen Stellen.
 */
export function duplicateAddresses(topology: Topology, live?: ReadonlyMap<string, string>): Set<string> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const join = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const devices = new Map(topology.devices.map((d) => [d.id, d]));
  // Brücken (Switch, Access Point, Modem) bilden mit allen Anschlüssen einen Abschnitt.
  // Die LAN-Buchsen einer CPE hängen am internen Switch: ein gemeinsames Netz.
  const node = (device: Device | undefined, iface: number) =>
    device && isBridge(device) ? device.id : device?.type === 'cpe' && iface !== 0 ? `${device.id}:lan` : `${device?.id}:${iface}`;
  for (const cable of topology.cables) {
    join(node(devices.get(cable.a.device), cable.a.iface), node(devices.get(cable.b.device), cable.b.iface));
  }

  const seen = new Map<string, string[]>();
  const note = (device: Device, iface: number, ip: string | undefined) => {
    if (!ip) return;
    const ref = decodeIface(iface);
    const port = ref.kind === 'sub' ? ref.port : iface;
    // Gleiche Adresse auf zwei Schnittstellen desselben Geräts ist ein Fehler, ausser in verschiedenen VRFs.
    const segment = ref.kind === 'svi' || ref.kind === 'loopback' ? find(`${device.id}|${vrfOfIface(device, iface) ?? ''}`) : find(node(device, port));
    for (const key of [`${segment}|${ip}`, `dev:${device.id}|${ip}|${vrfOfIface(device, iface) ?? ''}|${iface}`]) {
      const list = seen.get(key) ?? [];
      list.push(`${device.id}#${ip}`);
      seen.set(key, list);
    }
  };

  for (const device of topology.devices) {
    if (device.dhcp) {
      note(device, 0, live?.get(device.id));
      continue;
    }
    for (const iface of device.interfaces) note(device, iface.index, iface.ip);
    for (const sub of device.subinterfaces ?? []) note(device, subifId(sub.parent, sub.vlan), sub.ip);
    for (const svi of device.svis ?? []) note(device, sviId(svi.vlan), svi.ip);
    for (const lo of device.loopbacks ?? []) note(device, loopbackId(lo.id), lo.ip);
  }

  const result = new Set<string>();
  for (const [key, list] of seen) {
    if (key.startsWith('dev:')) continue;
    if (list.length > 1) for (const entry of list) result.add(entry);
  }
  // Dieselbe Adresse auf mehreren Schnittstellen eines Geräts.
  const perDevice = new Map<string, number>();
  for (const key of seen.keys()) {
    if (!key.startsWith('dev:')) continue;
    const [dev, ip, vrf] = key.slice(4).split('|');
    const id = `${dev}#${ip}|${vrf}`;
    perDevice.set(id, (perDevice.get(id) ?? 0) + 1);
  }
  for (const [id, count] of perDevice) if (count > 1) result.add(id.slice(0, id.lastIndexOf('|')));
  return result;
}

/**
 * Doppelte MAC-Adressen im selben Netzabschnitt (ohne Router dazwischen).
 * Dort lernen Switches die Adresse abwechselnd an zwei Ports, und Rahmen landen
 * beim falschen Gerät. Hinter verschiedenen Routern stört dieselbe MAC nicht.
 * Ergebnis: Schlüssel `<Geräte-ID>#<Anschluss>` aller betroffenen Anschlüsse.
 */
export function duplicateMacs(topology: Topology): Set<string> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const devices = new Map(topology.devices.map((d) => [d.id, d]));
  const node = (device: Device | undefined, iface: number) =>
    device && isBridge(device) ? device.id : device?.type === 'cpe' && iface !== 0 ? `${device.id}:lan` : `${device?.id}:${iface}`;
  for (const cable of topology.cables) {
    const a = find(node(devices.get(cable.a.device), cable.a.iface));
    const b = find(node(devices.get(cable.b.device), cable.b.iface));
    if (a !== b) parent.set(a, b);
  }
  const seen = new Map<string, string[]>();
  for (const device of topology.devices) {
    // Brücken leiten nur weiter; ihre eigenen Port-MACs senden (fast) nie.
    if (isBridge(device)) continue;
    for (const iface of device.interfaces) {
      // Nur verkabelte Anschlüsse stören sich.
      if (!topology.cables.some((c) => (c.a.device === device.id && c.a.iface === iface.index) || (c.b.device === device.id && c.b.iface === iface.index))) continue;
      const key = `${find(node(device, iface.index))}|${iface.mac}`;
      const list = seen.get(key) ?? [];
      list.push(`${device.id}#${iface.index}`);
      seen.set(key, list);
    }
  }
  const result = new Set<string>();
  for (const list of seen.values()) if (list.length > 1) for (const k of list) result.add(k);
  return result;
}
