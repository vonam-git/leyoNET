import { describe, expect, it } from 'vitest';
import { IDENTIFY_DEFAULT, identify } from './identify.svelte';
import { identifyMs } from './state/session.svelte';

describe('Erkennen', () => {
  it('Blinkdauer aus dem Lebenszeichen begrenzen', () => {
    expect(identifyMs(5000)).toBe(5000);
    expect(identifyMs(true)).toBe(7000);
    expect(identifyMs(1e9)).toBe(15_000);
    expect(identifyMs(-1)).toBe(3000);
    expect(identifyMs(Number.NaN)).toBe(7000);
  });

  it('nur 5–10 Sekunden wählbar', () => {
    expect(identify.seconds).toBe(IDENTIFY_DEFAULT);
    identify.setSeconds(9);
    expect(identify.seconds).toBe(9);
    identify.setSeconds(60);
    identify.setSeconds(2.5);
    expect(identify.seconds).toBe(9);
    expect(identify.label('ABC123')).toBeNull();
  });
});
