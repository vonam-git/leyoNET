import { describe, expect, it } from 'vitest';
import { qrMatrix, qrPath } from './qr';

describe('QR-Code (eigene Umsetzung)', () => {
  it('Grösse je nach Länge, Suchmarken in drei Ecken', () => {
    expect(qrMatrix('A').length).toBe(21);
    const uri = 'otpauth://totp/leyoNET:Admin?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=leyoNET&algorithm=SHA1&digits=6&period=30';
    const grid = qrMatrix(uri);
    expect(grid.length).toBe(45);
    const n = grid.length;
    for (const [x, y] of [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ] as const) {
      // Äusserer Rahmen der Suchmarke dunkel, Ring hell, Kern dunkel.
      expect(grid[y]![x]).toBe(true);
      expect(grid[y + 1]![x + 1]).toBe(false);
      expect(grid[y + 3]![x + 3]).toBe(true);
    }
    // Dunkles Feld neben der unteren Formatinformation (immer gesetzt).
    expect(grid[n - 8]![8]).toBe(true);
  });

  it('zu langer Text wird abgewiesen, Pfad enthält nur Zahlen und Befehle', () => {
    expect(() => qrMatrix('x'.repeat(300))).toThrow('qrTooLong');
    const { d, size } = qrPath(qrMatrix('<script>'));
    expect(size).toBe(29);
    expect(d).toMatch(/^[Mhvz0-9 -]+$/);
  });
});
