import { describe, expect, it } from 'vitest';
import { projectFilename } from './files';

describe('Dateiname beim Speichern', () => {
  const date = new Date(2026, 10, 2);
  it('nimmt den Projektnamen', () => {
    expect(projectFilename(date, 'Übung 02')).toBe('Uebung 02.json');
    expect(projectFilename(date, 'Réseau Straße')).toBe('Reseau Strasse.json');
  });
  it('ersetzt Zeichen, die in Dateinamen stören', () => {
    expect(projectFilename(date, 'Netz: A/B?')).toBe('Netz- A-B.json');
  });
  it('ohne Namen: Datum', () => {
    expect(projectFilename(date)).toBe('netzwerk-2026-11-02.json');
    expect(projectFilename(date, '  ')).toBe('netzwerk-2026-11-02.json');
  });
});
