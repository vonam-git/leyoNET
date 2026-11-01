import { describe, expect, it } from 'vitest';
import { duplicateAddresses } from './duplicates';
import { extractFragment, itemsInRect, moveGroup, pasteFragment } from './fragment';
import { addArea, addDevice, configureHost, connect, emptyTopology, getDevice, setDeviceRack, type Result } from './topology';
import type { Topology } from './types';

function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`Unerwarteter Fehler: ${r.error.code}`);
  return r.value;
}

/** PC 1 und PC 2 am Switch 1, dazu ein Bereich. */
function net() {
  let t: Topology = emptyTopology();
  const add = (type: 'pc' | 'switch', name: string, x: number, y: number) => {
    const r = unwrap(addDevice(t, type, name, { x, y }));
    t = r.topology;
    return r.id;
  };
  const pc1 = add('pc', 'PC 1', 100, 100);
  const pc2 = add('pc', 'PC 2', 200, 100);
  const sw = add('switch', 'Switch 1', 150, 200);
  t = unwrap(connect(t, pc1, sw)).topology;
  t = unwrap(connect(t, pc2, sw)).topology;
  t = unwrap(configureHost(t, pc1, { ip: '192.168.1.10', mask: '/24' }));
  t = unwrap(configureHost(t, pc2, { ip: '192.168.1.11', mask: '/24' }));
  const area = unwrap(addArea(t, { title: 'Büro', color: 'blue', x: 50, y: 50, width: 250, height: 200 }));
  t = area.topology;
  return { t, pc1, pc2, sw, area: area.id };
}

describe('Ausschnitt kopieren und einfügen', () => {
  it('kopiert Geräte mit den Kabeln dazwischen, neue Kennungen, Namen und MAC-Adressen', () => {
    const n = net();
    const f = extractFragment(n.t, [n.pc1, n.pc2, n.sw], [n.area]);
    expect(f.cables).toHaveLength(2);
    const r = pasteFragment(n.t, f, { x: 400, y: 0 });
    expect(r.devices).toHaveLength(3);
    expect(r.areas).toHaveLength(1);
    expect(r.topology.cables).toHaveLength(4);
    const copies = r.devices.map((id) => getDevice(r.topology, id)!);
    expect(copies.map((d) => d.name)).toEqual(['PC 3', 'PC 4', 'Switch 2']);
    expect(copies[0]!.position).toEqual({ x: 500, y: 100 });
    expect(copies[0]!.interfaces[0]!.mac).not.toBe(getDevice(n.t, n.pc1)!.interfaces[0]!.mac);
    // Kabel verbinden die Kopien untereinander, nicht mit den Originalen.
    const ids = new Set(r.devices);
    for (const c of r.topology.cables.slice(2)) expect(ids.has(c.a.device) && ids.has(c.b.device)).toBe(true);
    // Gruppe behält Adressen; getrenntes Netz, also keine Doppel-Warnung.
    expect(copies[0]!.interfaces[0]!.ip).toBe('192.168.1.10');
    expect(duplicateAddresses(r.topology).size).toBe(0);
    expect(r.topology.areas!.at(-1)).toMatchObject({ title: 'Büro', x: 450, y: 50 });
  });

  it('lässt Kabel zu Geräten ausserhalb der Auswahl weg', () => {
    const n = net();
    const f = extractFragment(n.t, [n.pc1, n.pc2]);
    expect(f.cables).toHaveLength(0);
  });

  it('ein einzelnes Gerät kommt ohne Adresse', () => {
    const n = net();
    const r = pasteFragment(n.t, extractFragment(n.t, [n.pc1]), { x: 40, y: 40 });
    expect(getDevice(r.topology, r.devices[0]!)!.interfaces[0]!.ip).toBeUndefined();
  });

  it('eingebaute Geräte bleiben im mitkopierten Rack, sonst ausgebaut', () => {
    let t: Topology = emptyTopology();
    const rack = unwrap(addArea(t, { kind: 'rack', title: 'Rack', color: 'gray', x: 0, y: 0, width: 200, height: 300 }));
    t = rack.topology;
    const sw = unwrap(addDevice(t, 'switch', 'Switch 1', { x: 100, y: 100 }));
    t = unwrap(setDeviceRack(sw.topology, sw.id, rack.id));
    const both = pasteFragment(t, extractFragment(t, [sw.id], [rack.id]), { x: 300, y: 0 });
    expect(getDevice(both.topology, both.devices[0]!)!.rack).toBe(both.areas[0]);
    const alone = pasteFragment(t, extractFragment(t, [sw.id]), { x: 300, y: 0 });
    expect(getDevice(alone.topology, alone.devices[0]!)!.rack).toBeUndefined();
  });

  it('verschiebt Geräte und Bereiche gemeinsam', () => {
    const n = net();
    const moved = moveGroup(n.t, [n.pc1, n.sw], [n.area], { x: 20, y: -10 });
    expect(getDevice(moved, n.pc1)!.position).toEqual({ x: 120, y: 90 });
    expect(getDevice(moved, n.pc2)!.position).toEqual({ x: 200, y: 100 });
    expect(moved.areas![0]).toMatchObject({ x: 70, y: 40 });
  });

  it('wählt im Rechteck Geräte (Mitte) und ganz enthaltene Bereiche', () => {
    const n = net();
    expect(itemsInRect(n.t, { x: 90, y: 90, width: 70, height: 120 })).toEqual({ devices: [n.pc1, n.sw], areas: [] });
    expect(itemsInRect(n.t, { x: 0, y: 0, width: 400, height: 400 }).areas).toEqual([n.area]);
  });
});
