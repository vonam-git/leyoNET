import type { Cable, Topology } from '../core';

/** Abstand paralleler Kabel zwischen denselben zwei Geräten. */
export const PARALLEL_GAP = 12;

/**
 * Versatz eines Kabels quer zur Verbindungslinie, damit mehrere Kabel zwischen
 * denselben Geräten (z.B. Port-Channel, Schleife) nebeneinander sichtbar sind.
 * Ein einzelnes Kabel liegt in der Mitte (Versatz 0).
 */
export function parallelOffset(t: Topology, cable: Pick<Cable, 'id' | 'a' | 'b'>, from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } {
  const pair = [cable.a.device, cable.b.device].sort().join('|');
  const siblings = t.cables.filter((c) => [c.a.device, c.b.device].sort().join('|') === pair);
  if (siblings.length < 2) return { x: 0, y: 0 };
  const index = siblings.findIndex((c) => c.id === cable.id);
  const shift = (index - (siblings.length - 1) / 2) * PARALLEL_GAP;
  // Immer dieselbe Richtung, egal wie herum das Kabel gespeichert ist.
  const [p, q] = cable.a.device < cable.b.device ? [from, to] : [to, from];
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: (-dy / length) * shift, y: (dx / length) * shift };
}

/** Abstand der Kabelausgänge an einer Frontplatte im Rack. */
export const RACK_SLOT_GAP = 11;

/** Kabel zwischen zwei Geräten im selben Rack (Patchkabel). */
export function isRackPatch(t: Topology, cable: Pick<Cable, 'a' | 'b'>): boolean {
  const a = t.devices.find((d) => d.id === cable.a.device);
  const b = t.devices.find((d) => d.id === cable.b.device);
  return !!a?.rack && a.rack === b?.rack;
}

/**
 * Höhe des Kabelausgangs an der Frontplatte (relativ zur Gerätemitte): die Patchkabel eines
 * Geräts nach Portnummer übereinander, damit Kabel und Beschriftungen sich nicht überdecken.
 */
export function rackSlot(t: Topology, device: string, cableId: string): number {
  const mine = t.cables
    .filter((c) => (c.a.device === device || c.b.device === device) && isRackPatch(t, c))
    .map((c) => ({ id: c.id, port: c.a.device === device ? c.a.iface : c.b.iface }))
    .sort((x, y) => x.port - y.port);
  const k = mine.findIndex((c) => c.id === cableId);
  return k < 0 ? 0 : (k - (mine.length - 1) / 2) * slotGap(mine.length);
}

/** Viele Kabel an einem Gerät: enger zusammen, damit alle auf der Frontplatte (±22) bleiben. */
const slotGap = (n: number) => (n < 2 ? 0 : Math.min(RACK_SLOT_GAP, 44 / (n - 1)));

/** Reicht der Platz für eine Beschriftung je Kabelausgang? */
export const rackLabelsFit = (n: number) => n < 2 || slotGap(n) >= 9;

/** Ports eines Geräts mit Patchkabel im Rack und Höhe ihres Ausgangs (für die Beschriftung). */
export function rackSlots(t: Topology, device: string): { iface: number; y: number }[] {
  return t.cables
    .filter((c) => (c.a.device === device || c.b.device === device) && isRackPatch(t, c))
    .map((c) => ({ iface: c.a.device === device ? c.a.iface : c.b.iface, y: rackSlot(t, device, c.id) }));
}
