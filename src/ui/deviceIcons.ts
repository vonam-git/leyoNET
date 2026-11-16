/**
 * Symbole der Geräte als Daten: dieselben Zeichnungen in der App (DeviceIcon.svelte) und im Wiki
 * (src/wiki/build.ts). Eigene, schlichte Symbole (keine fremden Grafiken, siehe docs/herkunft.md).
 * Koordinaten um den Mittelpunkt, Platz etwa −28…28 × −24…24.
 * Klasse «line»: nur Kontur; «fill»: ausgefüllt in der Farbe der Rolle; sonst Fläche mit Rand.
 */
import type { DeviceType } from '../core';

export interface IconShape {
  tag: 'rect' | 'circle' | 'path';
  cls?: 'line' | 'fill';
  attrs: Record<string, string | number>;
}

const rect = (x: number, y: number, width: number, height: number, rx: number): IconShape => ({ tag: 'rect', attrs: { x, y, width, height, rx } });
const circle = (cx: number, cy: number, r: number, cls?: 'fill'): IconShape => ({ tag: 'circle', ...(cls ? { cls } : {}), attrs: { cx, cy, r } });
const path = (d: string): IconShape => ({ tag: 'path', attrs: { d } });
const line = (d: string): IconShape => ({ tag: 'path', cls: 'line', attrs: { d } });

const ICONS: Record<string, IconShape[]> = {
  notebook: [rect(-17, -18, 34, 23, 2), path('M-24 8 H24 L20 15 H-20 Z')],
  pc: [rect(-24, -18, 30, 22, 2), line('M-9 4 V10 M-15 11 H-3'), rect(11, -18, 13, 30, 2), line('M14 -12 H21 M14 -7 H21')],
  'server:rack': [rect(-24, -13, 48, 11, 2), rect(-24, 1, 48, 11, 2), line('M-18 -7.5 H-6 M-18 6.5 H-6'), circle(17, -7.5, 1.8, 'fill'), circle(17, 6.5, 1.8, 'fill')],
  server: [rect(-13, -20, 26, 40, 3), line('M-8 -13 H8 M-8 -7 H8 M-8 -1 H8'), circle(0, 12, 2.2, 'fill')],
  clientgroup: [rect(-8, -20, 26, 18, 2), rect(-16, -12, 26, 18, 2), rect(-24, -4, 26, 18, 2), line('M-11 14 V19 M-17 19 H-5')],
  switch: [rect(-25, -12, 50, 24, 4), line('M-14 -5 H14 M9 -8 L14 -5 L9 -2 M14 5 H-14 M-9 2 L-14 5 L-9 8')],
  l3switch: [rect(-25, -12, 50, 24, 4), line('M-14 -5 H6 M1 -8 L6 -5 L1 -2 M6 5 H-14 M-9 2 L-14 5 L-9 8'), circle(16, 0, 6), line('M13 0 H19 M16 -3 V3')],
  accesspoint: [rect(-20, 2, 40, 13, 4), line('M-11 -7 Q0 -17 11 -7 M-6.5 -3 Q0 -9 6.5 -3'), circle(0, 1, 2, 'fill'), line('M-12 9 H-10 M-6 9 H-4')],
  router: [circle(0, 0, 20), line('M-5 -5 L-12 -12 M-12 -7 V-12 H-7 M5 5 L12 12 M12 7 V12 H7 M5 -5 L12 -12 M7 -12 H12 V-7 M-5 5 L-12 12 M-7 12 H-12 V7')],
  // Firewall: Mauer aus versetzten Ziegeln.
  firewall: [rect(-21, -16, 42, 32, 3), line('M-21 -5.3 H21 M-21 5.3 H21 M-7 -16 V-5.3 M7 -16 V-5.3 M-14 -5.3 V5.3 M0 -5.3 V5.3 M14 -5.3 V5.3 M-7 5.3 V16 M7 5.3 V16')],
  // Internet-Box: Gehäuse in Hausform (Heimanschluss), Zugang oben, vier LAN-Buchsen unten.
  cpe: [path('M-22 13 V-3 L0 -17 L22 -3 V13 Z'), line('M0 -17 V-23 M-4 -21 Q0 -25 4 -21'), line('M-14 7 H-10 M-5 7 H-1 M4 7 H8 M13 7 H17'), circle(0, -3, 2.4, 'fill')],
  internet: [path('M-16 12 H16 A10 10 0 0 0 15 -7 A13 13 0 0 0 -9 -11 A11 11 0 0 0 -16 12 Z'), line('M-9 3 H9 M0 -6 V12 M-6 -3 Q0 3 -6 9 M6 -3 Q0 3 6 9')],
  // Alles Übrige (Modem): flaches Gehäuse mit Signal.
  other: [rect(-23, -6, 46, 18, 4), line('M-9 -12 Q0 -20 9 -12 M-5 -10 Q0 -14 5 -10'), line('M-14 3 H-12 M-7 3 H-5 M0 3 H2')],
};

/** Formen eines Symbols (Variante «rack» nur beim Server). */
export function iconShapes(type: DeviceType | string, variant?: string): IconShape[] {
  return ICONS[variant ? `${type}:${variant}` : type] ?? ICONS[type] ?? ICONS.other!;
}

const esc = (s: string | number) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Symbol als eigenständiges SVG (Wiki). Farben über die Klasse role-… aus farben.css. */
export function iconSvg(type: DeviceType | string, role: string, size = 48, variant?: string): string {
  const shapes = iconShapes(type, variant)
    .map((s) => `<${s.tag}${s.cls ? ` class="${s.cls}"` : ''}${Object.entries(s.attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join('')}/>`)
    .join('');
  return `<svg class="dev-icon role-${esc(role)}" viewBox="-28 -24 56 48" width="${size}" height="${Math.round((size * 48) / 56)}" aria-hidden="true" focusable="false">${shapes}</svg>`;
}
