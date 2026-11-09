import { describe, expect, it } from 'vitest';
import { removeCable, setPortChannel, setPortTrunk, setPortVlan, setStp } from '../model/topology';
import { dissect } from '../wire/encode';
import { Simulation } from './simulation';
import { NetBuilder } from './testing';

const replies = (sim: Simulation, id: string) => sim.getDeviceState(id).console.filter((l) => l.code === 'ping.reply').length;

/** PC1 – SW1 ==2 Kabel== SW2 – PC2; Ports 2 und 3 der Switches verbinden. */
function pair(mode1: 'active' | 'passive' | 'on' | null, mode2: 'active' | 'passive' | 'on' | null) {
  const net = new NetBuilder();
  const sw1 = net.add('switch', 'SW1');
  const sw2 = net.add('switch', 'SW2');
  const pc1 = net.host('PC1', '192.168.1.1');
  const pc2 = net.host('PC2', '192.168.1.2');
  net.link(pc1, sw1); // port1
  net.link(pc2, sw2); // port1
  const c1 = net.link(sw1, sw2); // port2–port2
  const c2 = net.link(sw1, sw2); // port3–port3
  for (const [sw, mode] of [
    [sw1, mode1],
    [sw2, mode2],
  ] as const) {
    if (mode) for (const p of [1, 2]) net.apply((t) => setPortChannel(t, sw, p, 1, mode));
  }
  return { net, sw1, sw2, pc1, pc2, c1, c2 };
}

describe('Mehrere Kabel und Port-Channel (LACP)', () => {
  it('zwei Kabel zwischen denselben Switches sind erlaubt; ohne Channel und STP gibt es einen Sturm', () => {
    const { net, sw1 } = pair(null, null);
    expect(net.topology.cables).toHaveLength(4);
    const sim = new Simulation(net.topology);
    sim.ping(net.topology.devices.find((d) => d.name === 'PC1')!.id, '192.168.1.2');
    sim.runUntil(3000);
    expect(sim.getDeviceState(sw1).storm).toBeDefined();
  });

  it('LACP aktiv/aktiv bündelt beide Ports, kein Sturm, Ping geht, LACPDUs mit echten Bytes', () => {
    const { net, sw1, sw2, pc1 } = pair('active', 'active');
    const sim = new Simulation(net.topology);
    sim.runUntil(2500);
    const state = sim.getDeviceState(sw1).channels![0]!;
    expect(state.ports.map((p) => p.status)).toEqual(['bundled', 'bundled']);
    expect(sim.getDeviceState(sw1).console.some((l) => l.code === 'lacp.bundled')).toBe(true);
    sim.ping(pc1, '192.168.1.2');
    sim.runUntil(8000);
    expect(replies(sim, pc1)).toBe(4);
    expect(sim.getDeviceState(sw1).storm).toBeUndefined();
    expect(sim.getDeviceState(sw2).storm).toBeUndefined();
    const lacp = sim.getPacketLog().find((e) => e.frame.payload.kind === 'lacp')!;
    const w = dissect(lacp.frame);
    // 14 Bytes Ethernet + 110 Bytes LACPDU, EtherType 0x8809 (Slow Protocols).
    expect(w.bytes.length).toBe(124);
    expect([w.bytes[12], w.bytes[13], w.bytes[14]]).toEqual([0x88, 0x09, 0x01]);
  });

  it('aktiv/passiv bündelt, passiv/passiv nicht (niemand beginnt)', () => {
    const ap = pair('active', 'passive');
    const sim = new Simulation(ap.net.topology);
    sim.runUntil(3000);
    expect(sim.getDeviceState(ap.sw2).channels![0]!.ports.every((p) => p.status === 'bundled')).toBe(true);
    const pp = pair('passive', 'passive');
    const sim2 = new Simulation(pp.net.topology);
    sim2.runUntil(3000);
    expect(sim2.getDeviceState(pp.sw1).channels![0]!.ports.every((p) => p.status === 'suspended' && p.reason === 'noPartner')).toBe(true);
  });

  it('Gegenseite ohne Channel: Ports bleiben ausgestellt, keine Schleife', () => {
    const { net, sw1, pc1 } = pair('active', null);
    const sim = new Simulation(net.topology);
    sim.runUntil(3000);
    expect(sim.getDeviceState(sw1).channels![0]!.ports.map((p) => p.reason)).toEqual(['noPartner', 'noPartner']);
    expect(sim.getDeviceState(sw1).console.some((l) => l.code === 'lacp.suspended.noPartner')).toBe(true);
    sim.ping(pc1, '192.168.1.2');
    sim.runUntil(8000);
    expect(replies(sim, pc1)).toBe(0);
    expect(sim.getDeviceState(sw1).storm).toBeUndefined();
  });

  it('Kabel fällt aus: der Channel läuft auf dem anderen weiter', () => {
    const { net, pc1, c1 } = pair('active', 'active');
    const sim = new Simulation(net.topology);
    sim.runUntil(2500);
    sim.updateTopology(removeCable(net.topology, c1).ok ? (removeCable(net.topology, c1) as { ok: true; value: typeof net.topology }).value : net.topology);
    sim.runUntil(4000);
    sim.ping(pc1, '192.168.1.2');
    sim.runUntil(10_000);
    expect(replies(sim, pc1)).toBe(4);
  });

  it('abweichende Einstellung (anderes VLAN) stellt den Port aus; mit STP zählt der Channel als ein Port', () => {
    const { net, sw1, sw2 } = pair('active', 'active');
    net.apply((t) => setPortVlan(t, sw1, 2, 10));
    for (const sw of [sw1, sw2]) net.apply((t) => setStp(t, sw, true));
    const sim = new Simulation(net.topology);
    sim.runUntil(3000);
    const ports = sim.getDeviceState(sw1).channels![0]!.ports;
    expect(ports[1]).toMatchObject({ status: 'suspended', reason: 'config' });
    // Trunks auf beiden Ports gleich: wieder gebündelt; STP blockiert keinen Channel-Port.
    let t = net.topology;
    for (const sw of [sw1, sw2]) for (const p of [1, 2]) t = (setPortTrunk(t, sw, p, true) as { ok: true; value: typeof t }).value;
    t = (setPortVlan(t, sw1, 2, 1) as { ok: true; value: typeof t }).value;
    const sim2 = new Simulation(t);
    sim2.runUntil(20_000);
    expect(sim2.getDeviceState(sw1).channels![0]!.ports.every((p) => p.status === 'bundled')).toBe(true);
    expect(sim2.getDeviceState(sw2).stp!.ports.filter((p) => p.state === 'blocking')).toHaveLength(0);
  });
});
