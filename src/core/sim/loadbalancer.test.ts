import { describe as group, expect, it } from 'vitest';
import { removeCable, setLoadBalancer } from '../model/topology';
import { parseProject, serializeProject } from '../io/project';
import type { LbMethod } from '../model/types';
import { Simulation } from './simulation';
import { NetBuilder, unwrap } from './testing';

/** Load Balancer 192.168.1.80 vor drei Webservern; jede Seite nennt ihren Server. Clients im selben Netz. */
function farm(method: LbMethod = 'roundRobin', clients = 1) {
  const net = new NetBuilder();
  const sw = net.add('switch', 'S1');
  const pcs = Array.from({ length: clients }, (_, i) => net.host(`PC${i + 1}`, `192.168.1.${10 + i}`));
  const lb = net.add('server', 'LB');
  net.apply((t) => ({ ok: true, value: { ...t, devices: t.devices.map((d) => (d.id === lb ? { ...d, interfaces: [{ ...d.interfaces[0]!, ip: '192.168.1.80', mask: '255.255.255.0' }] } : d)) } }));
  const webs = [1, 2, 3].map((n) => {
    const id = net.add('server', `Web${n}`);
    net.apply((t) => ({ ok: true, value: { ...t, devices: t.devices.map((d) => (d.id === id ? { ...d, interfaces: [{ ...d.interfaces[0]!, ip: `192.168.1.${100 + n}`, mask: '255.255.255.0' }] } : d)) } }));
    net.webServer(id, { '/index.html': `<h1>Web${n}</h1>` });
    return id;
  });
  for (const id of [...pcs, lb, ...webs]) net.link(id, sw);
  net.apply((t) => setLoadBalancer(t, lb, { port: 80, method, backends: [1, 2, 3].map((n) => ({ ip: `192.168.1.${100 + n}` })) }));
  return { net, pcs, lb, webs };
}

/** Seite laden und den Server aus der Antwort lesen. */
function load(sim: Simulation, pc: string, until: number): string {
  sim.browse(pc, 'http://192.168.1.80/index.html');
  sim.runUntil(until);
  return sim.getDeviceState(pc).browser?.response?.body.match(/Web\d/)?.[0] ?? '–';
}

group('Load Balancer', () => {
  it('Round Robin: verteilt die Verbindungen der Reihe nach, die Server sehen den Load Balancer', () => {
    const { net, pcs, webs } = farm();
    const sim = new Simulation(net.topology);
    sim.runUntil(500);
    const seen = [1, 2, 3, 4].map((i) => load(sim, pcs[0]!, 500 + i * 1000));
    expect(seen).toEqual(['Web1', 'Web2', 'Web3', 'Web1']);
    const request = sim.getDeviceState(webs[1]!).console.find((l) => l.code === 'http.request');
    expect(request?.params?.client).toBe('192.168.1.80');
  });

  it('Health Check: Ein ausgefallener Server bekommt keine Verbindungen mehr und kommt zurück', () => {
    const { net, pcs, lb, webs } = farm();
    const sim = new Simulation(net.topology);
    sim.runUntil(3000);
    const cable = net.topology.cables.find((c) => c.a.device === webs[1] || c.b.device === webs[1])!;
    const before = net.topology;
    net.topology = unwrap(removeCable(net.topology, cable.id));
    sim.updateTopology(net.topology);
    sim.runUntil(12_000);
    const state = sim.getDeviceState(lb).loadBalancer!;
    expect(state.backends.map((b) => b.up)).toEqual([true, false, true]);
    expect(sim.getDeviceState(lb).console.map((l) => l.code)).toContain('lb.down');
    const seen = [1, 2, 3, 4].map((i) => load(sim, pcs[0]!, 12_000 + i * 1000));
    expect(seen).not.toContain('Web2');
    expect(seen).not.toContain('–');
    sim.updateTopology(before);
    sim.runUntil(25_000);
    expect(sim.getDeviceState(lb).loadBalancer!.backends.every((b) => b.up)).toBe(true);
  });

  it('ohne Health Check: Ist der gewählte Server weg, versucht er den nächsten', () => {
    const { net, pcs, lb, webs } = farm();
    net.apply((t) => setLoadBalancer(t, lb, { ...t.devices.find((d) => d.id === lb)!.loadBalancer!, healthCheck: false }));
    const cable = net.topology.cables.find((c) => c.a.device === webs[0] || c.b.device === webs[0])!;
    net.topology = unwrap(removeCable(net.topology, cable.id));
    const sim = new Simulation(net.topology);
    sim.runUntil(500);
    expect(load(sim, pcs[0]!, 10_000)).toMatch(/Web[23]/);
  });

  it('Source Hash: derselbe Client landet immer beim selben Server', () => {
    const { net, pcs } = farm('sourceHash', 4);
    const sim = new Simulation(net.topology);
    sim.runUntil(500);
    let t = 500;
    for (const pc of pcs) {
      const first = load(sim, pc, (t += 1000));
      expect(load(sim, pc, (t += 1000))).toBe(first);
      expect(first).toMatch(/Web\d/);
    }
  });

  it('prüft die Einstellungen und speichert sie im Projekt', () => {
    const { net, lb, pcs } = farm('leastConn');
    expect(setLoadBalancer(net.topology, pcs[0]!, { port: 80, method: 'roundRobin', backends: [] }).ok).toBe(false);
    expect(setLoadBalancer(net.topology, lb, { port: 0, method: 'roundRobin', backends: [] }).ok).toBe(false);
    expect(setLoadBalancer(net.topology, lb, { port: 80, method: 'roundRobin', backends: [{ ip: '192.168.1.80' }] }).ok).toBe(false);
    expect(setLoadBalancer(net.topology, lb, { port: 80, method: 'roundRobin', backends: [{ ip: '10.0.0.1' }, { ip: '10.0.0.1', port: 80 }] }).ok).toBe(false);
    const loaded = parseProject(serializeProject(net.topology));
    expect(loaded.ok && loaded.topology.devices.find((d) => d.id === lb)?.loadBalancer).toEqual(net.topology.devices.find((d) => d.id === lb)?.loadBalancer);
  });
});
