import { describe, expect, it } from 'vitest';
import { examSheetsHtml } from './seatCards';

describe('Prüfungsblätter zum Drucken', () => {
  const html = examSheetsHtml({
    title: 'M117 LB3',
    label: 'INF22a',
    minutes: 80,
    url: 'https://app.leyonet.example/',
    seats: [
      { id: '01', code: 'ABCD-EFGH', extra: 0, sheet: { title: 'Firma Muster', description: '**Auftrag:** Baue das Netz.\n\n- Router `R1` mit 10.0.0.1/24\n- <script>alert(1)</script>', goals: [{ text: 'PC erreicht R1.', points: 3 }], raster: [{ label: 'Zürich', points: 10 }] } },
      { id: '02', code: 'JKLM-NPQR', extra: 15, sheet: null },
    ],
  });

  it('je Platz eine Seite mit Platz-Code, Zeit und Auftrag', () => {
    expect(html.match(/<section class="page">/g)).toHaveLength(2);
    expect(html).toContain('ABCD-EFGH');
    expect(html).toContain('JKLM-NPQR');
    expect(html).toContain('95 min');
    expect(html).toContain('<strong>Auftrag:</strong>');
    expect(html).toContain('<code>R1</code>');
    expect(html).toContain('<li>');
  });

  it('gibt Text aus der Prüfungsdatei nie als HTML aus', () => {
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain("default-src 'none'");
  });
});
