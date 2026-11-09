import { describe, expect, it } from 'vitest';
import { Simulation, parseIp } from '../core';
import { datacenter, datacenterBgp, datacenterUnderlay } from './datacenter';

const byName = (t: ReturnType<typeof datacenter>, n: string) => t.devices.find((d) => d.name === n)!.id;
const replies = (sim: Simulation, id: string) => sim.getDeviceState(id).console.filter((l) => l.code === 'ping.reply').length;

describe('Rechenzentrum Leaf-Spine (BGP + VXLAN)', () => {
  it('BGP verteilt die Loopbacks, VXLAN verbindet die Server im selben VLAN über das Underlay', () => {
    const t = datacenter();
    const sim = new Simulation(t);
    sim.runUntil(15_000);
    const routes = (sim.getDeviceState(byName(t, 'Leaf 1')) as { routes?: { network: number; kind: string }[] }).routes ?? [];
    expect(routes.some((r) => r.network === parseIp('10.255.0.13') && r.kind === 'bgp')).toBe(true);
    sim.ping(byName(t, 'Web 1'), '192.168.10.12');
    sim.ping(byName(t, 'DB 1'), '192.168.20.12');
    sim.runUntil(sim.now + 10_000);
    expect(replies(sim, byName(t, 'Web 1'))).toBe(4);
    expect(replies(sim, byName(t, 'DB 1'))).toBe(4);
  });

  it('ohne VXLAN bleiben die Server getrennt', () => {
    const t = datacenterBgp(datacenterUnderlay());
    const sim = new Simulation(t);
    sim.runUntil(15_000);
    sim.ping(byName(t, 'Web 1'), '192.168.10.12');
    sim.runUntil(sim.now + 8000);
    expect(replies(sim, byName(t, 'Web 1'))).toBe(0);
  });
});
