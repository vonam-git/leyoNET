/**
 * Netzpläne für die Arbeitsblätter: das Startnetz jeder Übung als schlichte Zeichnung (Geräte mit
 * denselben Symbolen wie in der App, Kabel nach Medium, Bereiche). Nur Daten; gezeichnet wird in
 * scripts/arbeitsblaetter/erzeugen.mjs. Nicht Teil der App.
 */
import { DEVICE_SPECS, mediumOf, type Topology } from '../core';
import { CATALOG } from './catalog';
import { winAnsi } from './catalogSheets';
import { iconShapes, type IconShape } from './deviceIcons';
import { TAG_HEX } from './tags';

export interface SheetPlan {
  devices: { name: string; role: string; x: number; y: number; shapes: IconShape[] }[];
  cables: { a: number; b: number; medium: string }[];
  areas: { title: string; color: string; x: number; y: number; width: number; height: number }[];
}

export function planOf(topology: Topology): SheetPlan | null {
  if (topology.devices.length === 0) return null;
  const index = new Map(topology.devices.map((d, i) => [d.id, i]));
  return {
    devices: topology.devices.map((d) => ({
      name: winAnsi(d.name),
      role: DEVICE_SPECS[d.type].role,
      x: d.position.x,
      y: d.position.y,
      shapes: iconShapes(d.type, d.variant),
    })),
    cables: topology.cables.flatMap((c) => {
      const a = index.get(c.a.device);
      const b = index.get(c.b.device);
      return a === undefined || b === undefined ? [] : [{ a, b, medium: mediumOf(c) as string }];
    }),
    // Textfelder weglassen: Ihr Inhalt steht im Auftrag.
    areas: (topology.areas ?? [])
      .filter((a) => a.kind !== 'note')
      .map((a) => ({ title: winAnsi(a.title), color: TAG_HEX[a.color], x: a.x, y: a.y, width: a.width, height: a.height })),
  };
}

/** Pläne aller Übungen nach ihrer Kennung (Startnetz leer: kein Plan). */
export function sheetPlans(): Record<string, SheetPlan> {
  const out: Record<string, SheetPlan> = {};
  for (const e of CATALOG) {
    const plan = planOf(e.build().topology);
    if (plan) out[e.id] = plan;
  }
  return out;
}
