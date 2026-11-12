import { describe, expect, it } from 'vitest';
import { addArea, addDevice, connect, emptyTopology, setDeviceRack, type Result, type Topology } from '../core';
import { isRackPatch, rackLabelsFit, rackSlot, rackSlots } from './cableGeometry';

const u = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};

function rack(): { t: Topology; ids: string[] } {
  let t = emptyTopology();
  const ids: string[] = [];
  for (const [type, name] of [['switch', 'SW'], ['router', 'R1'], ['pc', 'PC']] as const) {
    const r = u(addDevice(t, type, name, { x: 0, y: ids.length * 100 }));
    t = r.topology;
    ids.push(r.id);
  }
  const area = u(addArea(t, { kind: 'rack', title: 'Rack', color: 'gray', x: -100, y: -60, width: 240, height: 400 }));
  t = area.topology;
  for (const id of ids.slice(0, 2)) t = u(setDeviceRack(t, id, area.id));
  t = u(connect(t, ids[0]!, ids[1]!, 'tp', { a: 0, b: 0 })).topology;
  t = u(connect(t, ids[0]!, ids[1]!, 'tp', { a: 1, b: 1 })).topology;
  t = u(connect(t, ids[0]!, ids[2]!, 'tp', { a: 2 })).topology;
  return { t, ids };
}

describe('Patchkabel im Rack', () => {
  it('nur Kabel zwischen Geräten im selben Rack', () => {
    const { t } = rack();
    expect(t.cables.map((c) => isRackPatch(t, c))).toEqual([true, true, false]);
  });

  it('Ausgänge je Gerät nach Port übereinander, symmetrisch zur Mitte', () => {
    const { t, ids } = rack();
    const [c0, c1] = t.cables;
    expect(rackSlot(t, ids[0]!, c0!.id)).toBe(-5.5);
    expect(rackSlot(t, ids[0]!, c1!.id)).toBe(5.5);
    expect(rackSlots(t, ids[0]!).map((s) => s.iface)).toEqual([0, 1]);
    expect(rackSlots(t, ids[2]!)).toEqual([]);
  });

  it('viele Kabel: enger, ohne Beschriftung, wenn kein Platz', () => {
    expect(rackLabelsFit(4)).toBe(true);
    expect(rackLabelsFit(8)).toBe(false);
  });
});
