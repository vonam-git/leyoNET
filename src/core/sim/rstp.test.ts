import { describe as group, expect, it } from 'vitest';
import { removeCable, setStp, setStpMode, setStpPriority } from '../model/topology';
import { Simulation } from './simulation';
import { NetBuilder, unwrap } from './testing';

/** Dreieck aus drei Switches, PC1 an S1, PC2 an S3; `mode` für alle drei. */
function triangle(mode: 'stp' | 'rstp') {
  const net = new NetBuilder();
  const pc1 = net.host('PC1', '10.0.0.1');
  const pc2 = net.host('PC2', '10.0.0.2');
  const [s1, s2, s3] = ['S1', 'S2', 'S3'].map((name) => net.add('switch', name)) as [string, string, string];
  for (const sw of [s1, s2, s3]) {
    net.topology = unwrap(setStp(net.topology, sw, true));
    net.topology = unwrap(setStpMode(net.topology, sw, mode));
  }
  net.link(pc1, s1);
  net.link(pc2, s3);
  net.link(s1, s2);
  net.link(s2, s3);
  const closing = net.link(s3, s1);
  return { net, pc1, pc2, s1, s2, s3, closing };
}

const blocked = (sim: Simulation, ids: string[]) => ids.flatMap((id) => sim.getDeviceState(id).stp!.ports.filter((p) => p.state === 'blocking' || p.state === 'discarding'));

/** Erste Zeit, ab der alle Switch-Ports, die nicht gesperrt sein sollen, weiterleiten. */
function convergedAt(sim: Simulation, ids: string[], until: number, step = 50): number | null {
  for (let t = 0; t <= until; t += step) {
    sim.runUntil(t);
    const ports = ids.flatMap((id) => sim.getDeviceState(id).stp!.ports);
    const notReady = ports.filter((p) => p.role !== 'alternate' && p.state !== 'forwarding');
    if (ports.length && notReady.length === 0) return t;
  }
  return null;
}

group('Rapid Spanning Tree (RSTP)', () => {
  it('sendet RST BPDUs (Version 2) mit Vorschlag und Zustimmung und leitet ohne Wartezeit weiter', () => {
    const { net, s1, s2, s3 } = triangle('rstp');
    const sim = new Simulation(net.topology);
    const at = convergedAt(sim, [s1, s2, s3], 3000);
    // Proposal/Agreement statt Weiterleitungsverzögerung: nach wenigen Millisekunden statt Sekunden.
    expect(at).not.toBeNull();
    expect(at!).toBeLessThan(500);
    const bpdus = sim.getPacketLog().map((e) => e.frame.payload).filter((p) => p.kind === 'stp');
    expect(bpdus.every((b) => b.kind === 'stp' && b.version === 2)).toBe(true);
    expect(bpdus.some((b) => b.kind === 'stp' && b.flags?.proposal)).toBe(true);
    expect(bpdus.some((b) => b.kind === 'stp' && b.flags?.agreement)).toBe(true);
    expect(sim.getDeviceState(s1).stp?.mode).toBe('rstp');
    // Genau ein Port ist gesperrt (Alternate, «discarding»).
    const off = blocked(sim, [s1, s2, s3]);
    expect(off).toHaveLength(1);
    expect(off[0]).toMatchObject({ role: 'alternate', state: 'discarding' });
  });

  it('ein Port im Zustand «discarding» nimmt keine Rahmen an: kein Broadcast-Sturm', () => {
    const { net, pc1, s1, s2, s3 } = triangle('rstp');
    const sim = new Simulation(net.topology);
    sim.runUntil(1000);
    const before = sim.getPacketLog().length;
    sim.ping(pc1, '10.0.0.2');
    sim.runUntil(6000);
    expect(sim.stormingDevices()).toEqual([]);
    expect(sim.getPacketLog().length - before).toBeLessThan(80);
    expect([s1, s2, s3].every((id) => !sim.getDeviceState(id).storm)).toBe(true);
    expect(sim.getDeviceState(pc1).console.filter((l) => l.code === 'ping.reply')).toHaveLength(4);
  });

  it('klassisches STP braucht dafür die Weiterleitungsverzögerung', () => {
    const { net, s1, s2, s3 } = triangle('stp');
    const sim = new Simulation(net.topology);
    const at = convergedAt(sim, [s1, s2, s3], 8000);
    expect(at).not.toBeNull();
    expect(at!).toBeGreaterThanOrEqual(2000);
  });

  it('übernimmt beim Ausfall der Verbindung sofort den Alternate-Port, ohne Ping-Verlust', () => {
    const { net, pc1, s1, s2, s3, closing } = triangle('rstp');
    const sim = new Simulation(net.topology);
    sim.runUntil(3000);
    sim.ping(pc1, '10.0.0.2');
    sim.runUntil(3500);
    // Mitten im Ping fällt die direkte Verbindung S1–S3 aus.
    net.topology = unwrap(removeCable(net.topology, closing));
    sim.updateTopology(net.topology);
    sim.runUntil(3600);
    expect(blocked(sim, [s1, s2, s3])).toEqual([]);
    sim.runUntil(10_000);
    const lines = sim.getDeviceState(pc1).console.map((l) => l.code);
    expect(lines.filter((c) => c === 'ping.reply')).toHaveLength(4);
    expect(lines).not.toContain('ping.timeout');
  });

  it('meldet die Topologieänderung (TC) an die Nachbarn weiter', () => {
    const { net, s1, s2, s3, closing } = triangle('rstp');
    const sim = new Simulation(net.topology);
    sim.runUntil(5000);
    const before = sim.getPacketLog().length;
    sim.updateTopology(unwrap(removeCable(net.topology, closing)));
    sim.runUntil(5200);
    const tc = sim.getPacketLog().slice(before).filter((e) => e.frame.payload.kind === 'stp' && e.frame.payload.flags?.tc);
    expect(tc.length).toBeGreaterThan(0);
    // Die Meldung läuft nicht endlos im Kreis: Nach dem Abklingen tragen die Hellos kein TC mehr.
    sim.runUntil(20_000);
    const late = sim.getPacketLog().filter((e) => e.sent > 12_000 && e.frame.payload.kind === 'stp' && e.frame.payload.flags?.tc);
    expect(late).toEqual([]);
    expect([s1, s2, s3].every((id) => sim.getDeviceState(id).stp)).toBe(true);
  });

  it('spricht mit einem Nachbarn mit klassischem STP wieder STP (Version 0) und wartet wie dort', () => {
    const { net, s1, s2, s3 } = triangle('rstp');
    net.topology = unwrap(setStpMode(net.topology, s2, 'stp'));
    const sim = new Simulation(net.topology);
    sim.runUntil(8000);
    const fromS1toS2 = sim.getPacketLog().filter((e) => e.from.device === s1 && e.to.device === s2 && e.frame.payload.kind === 'stp' && e.sent > 4000);
    expect(fromS1toS2.length).toBeGreaterThan(0);
    expect(fromS1toS2.every((e) => e.frame.payload.kind === 'stp' && e.frame.payload.version === undefined)).toBe(true);
    expect(blocked(sim, [s1, s2, s3])).toHaveLength(1);
  });

  it('wählt die Root-Bridge wie STP nach Priorität', () => {
    const { net, s1, s3 } = triangle('rstp');
    net.topology = unwrap(setStpPriority(net.topology, s3, 4096));
    const sim = new Simulation(net.topology);
    sim.runUntil(1000);
    expect(sim.getDeviceState(s1).stp?.rootId).toBe(sim.getDeviceState(s3).stp?.bridgeId);
  });
});
