import { describe, expect, it } from 'vitest';
import { parseProject, serializeProject } from '../io/project';
import { autoRoutes } from '../net/autoroute';
import { parseIp } from '../net/ipv4';
import { addStaticRoute, setInterfaceShutdown, setOspf, setRoutingMode } from '../model/topology';
import { Simulation } from './simulation';
import { NetBuilder } from './testing';

const replies = (sim: Simulation, id: string) => sim.getDeviceState(id).console.filter((l) => l.code === 'ping.reply');

/**
 *  PC1 — R1 ——— R2 — PC2        (R1–R3–R2 als Umweg)
 *          \   /
 *           R3
 */
function triangle(auto: boolean) {
  const net = new NetBuilder();
  const pc1 = net.host('PC1', '192.168.1.10', '24', '192.168.1.1');
  const pc2 = net.host('PC2', '192.168.2.10', '24', '192.168.2.1');
  const r1 = net.router('R1', ['192.168.1.1/24', '10.0.12.1/30', '10.0.13.1/30']);
  const r2 = net.router('R2', ['192.168.2.1/24', '10.0.12.2/30', '10.0.23.2/30']);
  const r3 = net.router('R3', ['10.0.13.3/30', '10.0.23.3/30']);
  net.link(pc1, r1);
  net.link(pc2, r2);
  net.link(r1, r2);
  net.link(r1, r3);
  net.link(r2, r3);
  if (auto) for (const r of [r1, r2, r3]) net.apply((t) => setRoutingMode(t, r, 'auto'));
  return { net, pc1, pc2, r1, r2, r3 };
}

describe('Automatisches Routing', () => {
  it('berechnet Routen über die wenigsten Router, Ping klappt ohne eingetragene Routen', () => {
    const { net, pc1, r1 } = triangle(true);
    const routes = autoRoutes(net.topology, r1);
    expect(routes.find((r) => r.network === parseIp('192.168.2.0'))).toMatchObject({ kind: 'auto', prefix: 24, via: parseIp('10.0.12.2'), metric: 1 });
    expect(routes.find((r) => r.network === parseIp('10.0.23.0'))?.metric).toBe(1);
    // Eigene Netze kommen nicht doppelt vor.
    expect(routes.some((r) => r.network === parseIp('192.168.1.0'))).toBe(false);
    const sim = new Simulation(net.topology);
    sim.ping(pc1, '192.168.2.10');
    sim.runUntil(10_000);
    expect(replies(sim, pc1).length).toBeGreaterThanOrEqual(3);
  });

  it('ohne Häkchen und ohne Routen kommt nichts an', () => {
    const { net, pc1 } = triangle(false);
    const sim = new Simulation(net.topology);
    sim.ping(pc1, '192.168.2.10');
    sim.runUntil(10_000);
    expect(replies(sim, pc1)).toHaveLength(0);
  });

  it('weicht auf einen anderen Weg aus, wenn ein Anschluss abgeschaltet ist', () => {
    const { net, pc1, r1 } = triangle(true);
    net.apply((t) => setInterfaceShutdown(t, r1, 1, true));
    expect(autoRoutes(net.topology, r1).find((r) => r.network === parseIp('192.168.2.0'))).toMatchObject({ via: parseIp('10.0.13.3'), metric: 2 });
    const sim = new Simulation(net.topology);
    sim.ping(pc1, '192.168.2.10');
    sim.runUntil(10_000);
    expect(replies(sim, pc1).length).toBeGreaterThanOrEqual(3);
  });

  it('findet Nachbarn auch über einen Switch und legt eine Standardroute zum Internet', () => {
    const net = new NetBuilder();
    // Die erste freie Buchse geht an den Switch: dort liegt 10.0.0.0/24.
    const r1 = net.router('R1', ['10.0.0.1/24', '192.168.1.1/24']);
    const r2 = net.router('R2', ['10.0.0.2/24', '192.168.2.1/24']);
    const isp = net.internet('Internet', ['203.0.113.1/30', '198.51.100.1/24']);
    const edge = net.router('Edge', ['10.0.0.254/24', '203.0.113.2/30']);
    const sw = net.add('switch', 'S');
    net.link(r1, sw);
    net.link(r2, sw);
    net.link(edge, sw);
    net.link(edge, isp);
    net.apply((t) => setRoutingMode(t, r1, 'auto'));
    const routes = autoRoutes(net.topology, r1);
    expect(routes.find((r) => r.network === parseIp('192.168.2.0'))?.via).toBe(parseIp('10.0.0.2'));
    expect(routes.find((r) => r.prefix === 0)).toMatchObject({ via: parseIp('10.0.0.254'), metric: 2 });
  });

  it('statische Routen und OSPF ruhen bei «auto»; «static» schaltet OSPF ab', () => {
    const { net, r1, r2 } = triangle(false);
    net.apply((t) => addStaticRoute(t, r1, { network: '172.16.0.0', mask: '16', gateway: '10.0.12.2' }));
    net.apply((t) => setRoutingMode(t, r1, 'auto'));
    let sim = new Simulation(net.topology);
    sim.runUntil(100);
    expect(sim.getRoutes(r1).some((r) => r.kind === 'static')).toBe(false);
    expect(sim.getRoutes(r1).some((r) => r.kind === 'auto')).toBe(true);

    const all = [{ network: '0.0.0.0', mask: '0.0.0.0', area: 0 }];
    for (const r of [r1, r2]) net.apply((t) => setOspf(t, r, { networks: all }));
    net.apply((t) => setRoutingMode(t, r1, 'static'));
    net.apply((t) => setRoutingMode(t, r2, 'dynamic'));
    sim = new Simulation(net.topology);
    sim.runUntil(15_000);
    expect(sim.getDeviceState(r1).ospf).toBeUndefined();
    expect(sim.getRoutes(r2).some((r) => r.kind === 'ospf')).toBe(false);
    expect(sim.getRoutes(r1).some((r) => r.kind === 'static')).toBe(true);
  });

  it('bleibt beim Speichern und Laden erhalten', () => {
    const { net, r1 } = triangle(true);
    const parsed = parseProject(serializeProject(net.topology));
    expect(parsed.ok && parsed.topology.devices.find((d) => d.id === r1)?.routingMode).toBe('auto');
  });
});
