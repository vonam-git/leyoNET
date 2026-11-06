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
