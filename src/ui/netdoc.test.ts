import { describe, expect, it } from 'vitest';
import { parseProject, type Topology } from '../core';
import { setLocale } from '../i18n';
import { DEMOS, demoProject } from './demos';
import { configText, csvCell, networkDocCsv } from './netdoc';

function demo(id: string): Topology {
  const parsed = parseProject(demoProject(DEMOS.find((d) => d.id === id)!)!);
  if (!parsed.ok) throw new Error(id);
  return parsed.topology;
}

describe('Netzdokumentation', () => {
  setLocale('de');

  it('Zellen: Semikolon und Anführungszeichen maskiert, Formeln entschärft', () => {
    expect(csvCell('PC 1')).toBe('PC 1');
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('sagt "hallo"')).toBe('"sagt ""hallo"""');
    expect(csvCell('=HYPERLINK("http://x.example")')).toBe('"\'=HYPERLINK(""http://x.example"")"');
    expect(csvCell('+41')).toBe("'+41");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(24)).toBe('24');
  });

  it('Adressplan und Verbindungen der Demo «Automatisches Routing»', () => {
    const topology = demo('autoRouting');
    const csv = networkDocCsv(topology);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('Adressplan');
    expect(lines[1]).toBe('Gerät;Typ;Anschluss;IP-Adresse;Subnetzmaske;Präfix;Netz;Standardgateway;DNS-Server;MAC-Adresse;VLAN');
    // Ein Endgerät mit Gateway, ein Router-Anschluss im Transitnetz mit berechnetem Netz.
    const pc = lines.find((l) => l.startsWith('PC A;'))!;
    expect(pc).toContain(';192.168.10.10;255.255.255.0;/24;192.168.10.0/24;192.168.10.1;');
    expect(lines.some((l) => l.startsWith('Router 1;') && l.includes(';10.0.12.1;255.255.255.252;/30;10.0.12.0/30;'))).toBe(true);
    // Unbenutzte Anschlüsse ohne Adresse fehlen.
    const at = lines.indexOf('Verbindungen');
    const routerRows = lines.slice(0, at).filter((l) => l.startsWith('Router 2;'));
    expect(routerRows.length).toBe(3);
    expect(csv).not.toContain('\u00ad');
    // Verbindungen: so viele Zeilen wie Kabel, jede mit beiden Enden und Medium.
    expect(lines[at + 1]).toBe('Gerät A;Anschluss A;Gerät B;Anschluss B;Medium');
    const links = lines.slice(at + 2);
    expect(links.length).toBe(topology.cables.length);
    for (const l of links) expect(l.split(';').length).toBe(5);
    expect(links.every((l) => l.endsWith(';TP-Kabel'))).toBe(true);
  });

  it('Gerätenamen aus einer fremden Datei können keine Formel in die Tabelle bringen', () => {
    const topology = demo('autoRouting');
    const evil: Topology = { ...topology, devices: topology.devices.map((d, i) => (i === 0 ? { ...d, name: '=cmd|calc' } : d)) };
    const csv = networkDocCsv(evil);
    expect(csv).not.toMatch(/(^|;|\n)=cmd/);
    expect(csv).toContain("'=cmd|calc");
  });

  it('VLAN und Trunk der Switch-Ports stehen im Adressplan', () => {
    const csv = networkDocCsv(demo('vlanStp'));
    expect(csv).toMatch(/;Trunk/);
    expect(csv.split('\r\n').some((l) => /;(10|20)$/.test(l))).toBe(true);
  });

  it('Konfiguration als Text: je Gerät mit Befehlszeile ein Abschnitt, Endgeräte fehlen', () => {
    const text = configText(demo('autoRouting'));
    expect(text).toContain('! ===== Router 1 (');
    expect(text).toContain('hostname ');
    expect(text.match(/! ===== /g)?.length).toBe(3);
    expect(text).not.toContain('PC A');
    expect(configText({ ...demo('autoRouting'), devices: [], cables: [] })).toBe('');
  });
});
