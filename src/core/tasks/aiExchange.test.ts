import { describe, expect, it } from 'vitest';
import { AI_FORMAT, AI_LIMITS, extractJson, fromAiExchange, toAiExchange } from './aiExchange';
import { evaluateTasks } from './tasks';
import { getDevice } from '../model/topology';

const sample = {
  format: AI_FORMAT,
  version: 1,
  title: 'Zwei Netze verbinden',
  description: 'Verbinde die beiden Büros über einen Router.',
  difficulty: 2,
  grading: true,
  start: {
    devices: [
      { name: 'PC1', type: 'pc', x: 100, y: 100, addresses: [{ port: 0, ip: '192.168.10.10', mask: '255.255.255.0' }], gateway: '192.168.10.1' },
      { name: 'PC2', type: 'pc', x: 500, y: 100, dhcp: true },
      { name: 'R1', type: 'router', x: 300, y: 100, addresses: [{ port: 0, ip: '192.168.10.1', mask: '255.255.255.0' }] },
      { name: 'SW1', type: 'switch', ports: 12 },
    ],
    links: [
      { a: 'PC1', b: 'R1' },
      { a: 'SW1', b: 'R1', medium: 'tp', aPort: 3, bPort: 1 },
    ],
  },
  goals: [
    { text: 'PC1 erreicht PC2.', check: { type: 'ping', from: 'PC1', to: 'PC2' }, points: 3, section: 'Routing' },
    { text: 'PC2 hat eine Adresse per DHCP.', check: { type: 'dhcpLease', device: 'PC2' }, hint: 'DHCP-Server auf R1' },
  ],
};

describe('KI-Austauschformat', () => {
  it('baut Startnetz und Aufgabe aus einer gültigen Antwort', () => {
    const r = fromAiExchange('Hier ist die Aufgabe:\n```json\n' + JSON.stringify(sample) + '\n```\nViel Erfolg!');
    expect(r.ok ? "ok" : JSON.stringify(r)).toBe("ok");
    if (!r.ok) return;
    expect(r.topology.devices.map((d) => d.name)).toEqual(['PC1', 'PC2', 'R1', 'SW1']);
    expect(r.topology.cables).toHaveLength(2);
    expect(r.topology.cables[1]).toMatchObject({ a: { iface: 3 }, b: { iface: 1 } });
    const pc1 = r.topology.devices[0]!;
    expect(pc1.interfaces[0]!.ip).toBe('192.168.10.10');
    expect(pc1.gateway).toBe('192.168.10.1');
    expect(r.topology.devices[1]!.dhcp).toBe(true);
    expect(getDevice(r.topology, r.topology.devices[3]!.id)!.interfaces).toHaveLength(12);
    expect(r.tasks.goals.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(r.tasks.grading).toBe(true);
    expect(r.tasks.goals[0]!.points).toBe(3);
    // Die Prüfung läuft auf dem importierten Netz.
    expect(evaluateTasks(r.topology, r.tasks).length).toBe(2);
  });

  it('Export und erneuter Import ergeben dasselbe Netz', () => {
    const first = fromAiExchange(JSON.stringify(sample));
    if (!first.ok) throw new Error(first.path);
    const again = fromAiExchange(JSON.stringify(toAiExchange(first.topology, first.tasks)));
    if (!again.ok) throw new Error(again.path);
    expect(again.topology.devices.map((d) => [d.name, d.type, d.position, d.interfaces.length, d.interfaces[0]?.ip])).toEqual(
      first.topology.devices.map((d) => [d.name, d.type, d.position, d.interfaces.length, d.interfaces[0]?.ip]),
    );
    expect(again.topology.cables).toEqual(first.topology.cables);
    expect(again.tasks.goals).toEqual(first.tasks.goals);
  });

  it('meldet Fehler mit Pfad statt etwas Halbes zu bauen', () => {
    const bad = (patch: (s: typeof sample) => unknown) => {
      const r = fromAiExchange(JSON.stringify(patch(structuredClone(sample))));
      return r.ok ? 'ok' : r.path;
    };
    expect(bad((s) => ({ ...s, format: 'x' }))).toBe('format');
    expect(bad((s) => ({ ...s, version: 2 }))).toBe('version');
    expect(bad((s) => ({ ...s, goals: [] }))).toBe('goals');
    expect(bad((s) => (s.start.devices[0]!.type = 'toaster', s))).toBe('start.devices[0].type');
    expect(bad((s) => (s.start.devices[1]!.name = 'pc1', s))).toBe('start.devices[1].name');
    expect(bad((s) => (s.start.devices[0]!.addresses![0]!.ip = '999.1.1.1', s))).toBe('start.devices[0].addresses');
    expect(bad((s) => (s.start.links[0]!.b = 'R9', s))).toBe('start.links[0].b');
    expect(bad((s) => ((s.start.links[1] as { medium: string }).medium = 'laser', s))).toBe('start.links[1].medium');
    expect(bad((s) => ((s.goals[0]!.check as { type: string }).type = 'rm -rf', s))).toMatch(/^goals\[0\]\.check/);
    expect(bad((s) => ((s.start.devices[2] as Record<string, unknown>).gateway = '1.2.3.4', s))).toBe('start.devices[2].gateway');
    expect(fromAiExchange('kein JSON')).toMatchObject({ ok: false, path: 'json' });
    expect(fromAiExchange('{ "format": ')).toMatchObject({ ok: false, path: 'json' });
  });

  it('hält Grenzen ein (Grösse, Anzahl Geräte, Prüfziele)', () => {
    expect(fromAiExchange('{' + ' '.repeat(AI_LIMITS.chars) + '}')).toMatchObject({ ok: false, path: 'size' });
    const many = { ...sample, start: { devices: Array.from({ length: AI_LIMITS.devices + 1 }, (_, i) => ({ name: `PC${i}`, type: 'pc' })), links: [] } };
    expect(fromAiExchange(JSON.stringify(many))).toMatchObject({ ok: false, path: 'start.devices' });
    const goals = { ...sample, goals: Array.from({ length: AI_LIMITS.goals + 1 }, () => sample.goals[0]) };
    expect(fromAiExchange(JSON.stringify(goals))).toMatchObject({ ok: false, path: 'goals' });
  });

  it('Texte bleiben Text (kein HTML wird ausgewertet, Namen werden geprüft)', () => {
    const s = structuredClone(sample);
    s.title = '<img src=x onerror=alert(1)>';
    const r = fromAiExchange(JSON.stringify(s));
    expect(r.ok && r.tasks.title).toBe('<img src=x onerror=alert(1)>');
    s.start.devices[0]!.name = '<script>';
    expect(fromAiExchange(JSON.stringify(s)).ok).toBe(false);
  });

  it('findet JSON auch ohne Codeblock', () => {
    expect(extractJson('Antwort: {"a":1} Ende')).toBe('{"a":1}');
    expect(extractJson('nichts')).toBeNull();
  });
});
