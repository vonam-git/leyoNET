import { macFor } from './mac';
import { suggestName } from './topology';
import type { Cable, Device, DocArea, Point, Topology } from './types';

/**
 * Ausschnitt einer Topologie für Kopieren/Einfügen und Duplizieren: mehrere
 * Geräte samt den Kabeln zwischen ihnen und Bereichen (Räume, Racks). Kabel zu
 * Geräten ausserhalb der Auswahl gehören nicht dazu.
 */
export interface Fragment {
  devices: Device[];
  cables: Cable[];
  areas: DocArea[];
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Löst Geräte und Bereiche als unabhängige Kopie aus der Topologie. */
export function extractFragment(t: Topology, deviceIds: readonly string[], areaIds: readonly string[] = []): Fragment {
  const ids = new Set(deviceIds);
  const areaSet = new Set(areaIds);
  return clone({
    devices: t.devices.filter((d) => ids.has(d.id)),
    cables: t.cables.filter((c) => ids.has(c.a.device) && ids.has(c.b.device)),
    areas: (t.areas ?? []).filter((a) => areaSet.has(a.id)),
  });
}

export function fragmentEmpty(f: Fragment): boolean {
  return f.devices.length === 0 && f.areas.length === 0;
}

/** Auf das angezeigte Stockwerk legen (Stockwerk 0 wird nicht gespeichert). */
function onFloor<T extends { floor?: number }>(item: T, floor: number | undefined): T {
  if (floor === undefined) return item;
  const copy = { ...item };
  if (floor > 0) copy.floor = floor;
  else delete copy.floor;
  return copy;
}

/** Name ohne angehängte Nummer («PC 3» → «PC»). */
function baseName(name: string): string {
  return name.replace(/\s*\d+$/, '') || name;
}

/** Einzelnes Gerät ohne Adressen: Es landet meist im selben Netz wie das Original. */
function stripAddresses(device: Device): Device {
  const copy: Device = { ...device, interfaces: device.interfaces.map(({ ip: _ip, mask: _mask, ipv6: _v6, ...rest }) => rest) };
  delete copy.dhcpServer;
  delete copy.gateway6;
  if (copy.svis) copy.svis = copy.svis.map(({ ip: _i, mask: _m, ...s }) => s);
  if (copy.subinterfaces) copy.subinterfaces = copy.subinterfaces.map(({ ip: _i, mask: _m, ...s }) => s);
  return copy;
}

/**
 * Fügt einen Ausschnitt versetzt ein: neue Kennungen, MAC-Adressen und Namen,
 * Kabel innerhalb des Ausschnitts bleiben verbunden, eingebaute Geräte bleiben
 * in ihrem (mitkopierten) Rack. Ein einzelnes Gerät kommt ohne Adressen, weil
 * es meist ins selbe Netz gehört; eine Gruppe behält ihre Einstellungen (z.B.
 * eine zweite Filiale), die Doppel-Warnung meldet sich, sobald zwei gleiche
 * Adressen im selben Netz hängen.
 */
export function pasteFragment(t: Topology, f: Fragment, offset: Point, floor?: number): { topology: Topology; devices: string[]; areas: string[] } {
  let seq = t.nextId;
  const areaIds = new Map<string, string>();
  const areas = f.areas.map((a) => {
    const id = `a${seq++}`;
    areaIds.set(a.id, id);
    return onFloor({ ...clone(a), id, x: a.x + offset.x, y: a.y + offset.y }, floor);
  });

  const deviceIds = new Map<string, string>();
  const names: Device[] = [...t.devices];
  const single = f.devices.length === 1;
  const devices = f.devices.map((original) => {
    const n = seq++;
    const id = `d${n}`;
    deviceIds.set(original.id, id);
    const source = single ? stripAddresses(clone(original)) : clone(original);
    const { rack, ...rest } = source;
    const device: Device = {
      ...rest,
      id,
      name: suggestName({ ...t, devices: names }, baseName(original.name)),
      position: { x: original.position.x + offset.x, y: original.position.y + offset.y },
      interfaces: source.interfaces.map((i) => ({ ...i, mac: macFor(n, i.index) })),
      ...(rack && areaIds.has(rack) ? { rack: areaIds.get(rack)! } : {}),
    };
    if (floor !== undefined) {
      if (floor > 0) device.floor = floor;
      else delete device.floor;
    }
    names.push(device);
    return device;
  });

  const cables = f.cables.flatMap((c) => {
    const a = deviceIds.get(c.a.device);
    const b = deviceIds.get(c.b.device);
    if (!a || !b) return [];
    return [{ ...clone(c), id: `c${seq++}`, a: { ...c.a, device: a }, b: { ...c.b, device: b } }];
  });

  return {
    topology: {
      ...t,
      devices: [...t.devices, ...devices],
      cables: [...t.cables, ...cables],
      areas: [...(t.areas ?? []), ...areas],
      nextId: seq,
    },
    devices: devices.map((d) => d.id),
    areas: areas.map((a) => a.id),
  };
}

/** Verschiebt mehrere Geräte und Bereiche gemeinsam um denselben Abstand. */
export function moveGroup(t: Topology, deviceIds: readonly string[], areaIds: readonly string[], delta: Point): Topology {
  if (delta.x === 0 && delta.y === 0) return t;
  const ids = new Set(deviceIds);
  const areaSet = new Set(areaIds);
  return {
    ...t,
    devices: t.devices.map((d) => (ids.has(d.id) ? { ...d, position: { x: d.position.x + delta.x, y: d.position.y + delta.y } } : d)),
    ...(t.areas ? { areas: t.areas.map((a) => (areaSet.has(a.id) ? { ...a, x: a.x + delta.x, y: a.y + delta.y } : a)) } : {}),
  };
}

/** Geräte, deren Mitte im Rechteck liegt, und Bereiche, die ganz darin liegen. */
export function itemsInRect(t: Topology, rect: { x: number; y: number; width: number; height: number }, visible: (floor: number | undefined) => boolean = () => true) {
  const inside = (p: Point) => p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
  return {
    devices: t.devices.filter((d) => visible(d.floor ?? 0) && inside(d.position)).map((d) => d.id),
    areas: (t.areas ?? [])
      .filter((a) => visible(a.floor) && inside({ x: a.x, y: a.y }) && inside({ x: a.x + a.width, y: a.y + a.height }))
      .map((a) => a.id),
  };
}
