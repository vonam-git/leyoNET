import { describe as group, expect, it } from 'vitest';
import { addStaticRoute, removeCable, setOspf } from '../model/topology';
import { flowHash, lookupRoutes, pickPath } from '../net/routing';
import { parseIp } from '../net/ipv4';
import { showIpRoute } from '../cli/cli';
import { Simulation } from './simulation';
import { NetBuilder } from './testing';

/**
 * Raute: R1 erreicht das Netz 10.4.0.0/24 hinter R4 über R2 oder R3, beide Wege gleich lang.
 * Vor R1 hängen vier PCs, damit es mehrere Datenflüsse gibt.
 */
function diamond(routing: 'static' | 'ospf') {
  const net = new NetBuilder();
  const pcs = [10, 11, 12, 13, 14, 15].map((n) => net.host(`PC${n}`, `192.168.1.${n}`, '24', '192.168.1.1'));
  const server = net.host('Server', '10.4.0.10', '24', '10.4.0.1');
  const r1 = net.router('R1', ['192.168.1.1/24', '10.0.12.1/29', '10.0.13.1/29']);
  const r2 = net.router('R2', ['10.0.12.2/29', '10.0.24.2/29']);
  const r3 = net.router('R3', ['10.0.13.3/29', '10.0.34.3/29']);
  const r4 = net.router('R4', ['10.4.0.1/24', '10.0.24.4/29', '10.0.34.4/29']);
  const lan = net.add('switch', 'LAN');
  for (const pc of pcs) net.link(pc, lan);
  net.link(r1, lan);
  const r1r2 = net.link(r1, r2);
  net.link(r1, r3);
  net.link(server, r4);
  net.link(r2, r4);
  net.link(r3, r4);
  if (routing === 'static') {
    net.apply((t) => addStaticRoute(t, r1, { network: '10.4.0.0', mask: '255.255.255.0', gateway: '10.0.12.2' }));
    net.apply((t) => addStaticRoute(t, r1, { network: '10.4.0.0', mask: '255.255.255.0', gateway: '10.0.13.3' }));
    net.apply((t) => addStaticRoute(t, r2, { network: '0.0.0.0', mask: '0.0.0.0', gateway: '10.0.12.1' }));
    net.apply((t) => addStaticRoute(t, r2, { network: '10.4.0.0', mask: '255.255.255.0', gateway: '10.0.24.4' }));
    net.apply((t) => addStaticRoute(t, r3, { network: '0.0.0.0', mask: '0.0.0.0', gateway: '10.0.13.1' }));
    net.apply((t) => addStaticRoute(t, r3, { network: '10.4.0.0', mask: '255.255.255.0', gateway: '10.0.34.4' }));
    net.apply((t) => addStaticRoute(t, r4, { network: '0.0.0.0', mask: '0.0.0.0', gateway: '10.0.24.2' }));
  } else {
    for (const r of [r1, r2, r3, r4]) net.apply((t) => setOspf(t, r, { networks: [{ network: '0.0.0.0', mask: '0.0.0.0', area: 0 }] }));
  }
  return { net, pcs, server, r1, r2, r3, r4, r1r2 };
}

const replies = (sim: Simulation, id: string) => sim.getDeviceState(id).console.filter((l) => l.code === 'ping.reply').length;
/** Nächster Router, an den R1 die Pakete Richtung Server geschickt hat. */
const viaOf = (sim: Simulation, r1: string, net: NetBuilder) =>
  new Set(sim.getPacketLog().filter((e) => e.from.device === r1 && e.frame.payload.kind === 'ipv4' && e.frame.payload.dst === '10.4.0.10').map((e) => net.topology.devices.find((d) => d.id === e.to.device)?.name));

group('Gleich gute Wege (ECMP)', () => {
  it('Hash-Threshold (RFC 2992): gleicher Fluss, gleicher Weg; verschiedene Flüsse verteilen sich', () => {
    const paths = ['A', 'B'];
    expect(pickPath(paths, 0)).toBe('A');
    expect(pickPath(paths, 0xffffffff)).toBe('B');
    expect(pickPath(['A'], 123)).toBe('A');
    const keys = Array.from({ length: 200 }, (_, i) => `192.168.1.${i}|10.4.0.10|tcp|${49152 + i}|80`);
    const chosen = keys.map((k) => pickPath(paths, flowHash(k)));
    expect(chosen.filter((c) => c === 'A').length).toBeGreaterThan(60);
    expect(chosen.filter((c) => c === 'B').length).toBeGreaterThan(60);
    expect(keys.map((k) => pickPath(paths, flowHash(k)))).toEqual(chosen);
  });

  it('zwei statische Routen mit gleicher Distanz: beide aktiv, die Flüsse teilen sich auf', () => {
    const { net, pcs, r1 } = diamond('static');
    const routes = lookupRoutes(new Simulation(net.topology).getRoutes(r1), parseIp('10.4.0.10')!);
    expect(routes.map((r) => r.via)).toEqual([parseIp('10.0.12.2'), parseIp('10.0.13.3')]);
    // Doppelt ist nur derselbe Weg; ein anderer nächster Hop ist erlaubt.
    expect(addStaticRoute(net.topology, r1, { network: '10.4.0.0', mask: '255.255.255.0', gateway: '10.0.12.2' }).ok).toBe(false);
    const sim = new Simulation(net.topology);
    for (const pc of pcs) sim.ping(pc, '10.4.0.10');
    sim.runUntil(10_000);
    for (const pc of pcs) expect(replies(sim, pc)).toBe(4);
    expect(viaOf(sim, r1, net)).toEqual(new Set(['R2', 'R3']));
    const lines = showIpRoute(net.topology.devices.find((d) => d.id === r1)!);
    expect(lines.filter((l) => l.startsWith('S>*') && l.includes('10.4.0.0/24'))).toHaveLength(2);
  });

  it('OSPF: zwei gleich lange Wege werden beide eingetragen; fällt einer aus, bleibt der andere', () => {
    const { net, pcs, r1, r1r2 } = diamond('ospf');
    const sim = new Simulation(net.topology);
    sim.runUntil(15_000);
    const routes = sim.getRoutes(r1).filter((r) => r.network === parseIp('10.4.0.0') && r.kind === 'ospf');
    expect(routes.map((r) => r.via).sort()).toEqual([parseIp('10.0.12.2'), parseIp('10.0.13.3')].sort());
    for (const pc of pcs) sim.ping(pc, '10.4.0.10');
    sim.runUntil(25_000);
    for (const pc of pcs) expect(replies(sim, pc)).toBe(4);
    expect(viaOf(sim, r1, net)).toEqual(new Set(['R2', 'R3']));
    net.apply((t) => removeCable(t, r1r2));
    sim.updateTopology(net.topology);
    sim.runUntil(45_000);
    expect(sim.getRoutes(r1).filter((r) => r.network === parseIp('10.4.0.0') && r.kind === 'ospf').map((r) => r.via)).toEqual([parseIp('10.0.13.3')]);
  });
});
