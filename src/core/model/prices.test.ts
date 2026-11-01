import { describe, expect, it } from 'vitest';
import registry from '../../../docs/preise.json';
import { PRICES, devicePrice } from './costs';

/**
 * Automatische Preisprüfung: Jeder Richtpreis steht im Preisverzeichnis
 * (docs/preise.json) und liegt in seinem plausiblen Bereich; grössere
 * Ausführungen kosten mehr als kleinere. Ob die Bereiche noch zum Markt
 * passen, prüft eine Person (Datum «geprueft», Erinnerung wöchentlich).
 */
type Band = { min: number; max: number };
const bands = registry.preise as Record<string, Band>;

function flatten(prefix: string, value: unknown, out: Map<string, number>) {
  if (typeof value === 'number') out.set(prefix, value);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) flatten(prefix ? `${prefix}.${k}` : k, v, out);
}

describe('Preise', () => {
  const prices = new Map<string, number>();
  flatten('', PRICES, prices);

  it('jeder Preis steht im Verzeichnis und liegt im plausiblen Bereich', () => {
    for (const [key, price] of prices) {
      const band = bands[key];
      expect(band, `${key} fehlt in docs/preise.json`).toBeDefined();
      expect(price, `${key}: ${price} CHF`).toBeGreaterThanOrEqual(band!.min);
      expect(price, `${key}: ${price} CHF`).toBeLessThanOrEqual(band!.max);
    }
    // Keine verwaisten Einträge.
    for (const key of Object.keys(bands)) expect(prices.has(key), `${key} gibt es nicht mehr in costs.ts`).toBe(true);
  });

  it('grössere Ausführungen kosten mehr', () => {
    const ports = (n: number, slots = 0) => [...Array.from({ length: n }, (_, i) => ({ index: i, mac: '' })), ...Array.from({ length: slots }, (_, i) => ({ index: n + i, mac: '', sfpSlot: true }))];
    const sw = (n: number) => devicePrice({ type: 'switch', interfaces: ports(n, 2) });
    expect(sw(16)).toBeGreaterThan(sw(8));
    expect(sw(24)).toBeGreaterThan(sw(16));
    expect(devicePrice({ type: 'l3switch', interfaces: ports(24, 4) })).toBeGreaterThan(sw(24));
    expect(PRICES.serverRack).toBeGreaterThan(PRICES.server);
    expect(PRICES.sfp['10G-LR']).toBeGreaterThan(PRICES.sfp['10G-SR']);
    expect(PRICES.sfp['1G-LX']).toBeGreaterThan(PRICES.sfp['1G-SX']);
  });

  it('das Prüfdatum ist gesetzt', () => {
    expect(Number.isNaN(Date.parse(registry.geprueft))).toBe(false);
  });
});
