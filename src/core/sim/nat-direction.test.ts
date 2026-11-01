import { describe as group, expect, it } from 'vitest';
import { addStaticNat } from '../model/topology';
import { Simulation } from './simulation';
import { NetBuilder, describe } from './testing';

const log = (net: NetBuilder, sim: Simulation) => sim.getPacketLog().map((e) => describe(net.topology, e));
const replies = (sim: Simulation, id: string) => sim.getDeviceState(id).console.filter((l) => l.code === 'ping.reply');

/** Firmennetz – Router (WAN /29) – Internet – Aussen; Regeln je Test. */
function company(rule: { inside: string; outside: string; kind?: 'snat' | 'dnat' }) {
  const net = new NetBuilder();
  const pc = net.host('PC', '192.168.0.10', '24', '192.168.0.1');
  const server = net.host('Server', '192.168.0.80', '24', '192.168.0.1');
  const sw = net.add('switch', 'S1');
  const router = net.router('Firmenrouter', ['192.168.0.1/24', '203.0.113.2/29']);
  net.nat(router, 1);
  net.route(router, '0.0.0.0', '0', '203.0.113.1');
  net.apply((t) => addStaticNat(t, router, rule));
  const internet = net.internet('Internet', ['203.0.113.1/29', '198.51.100.1/24']);
  const outsider = net.host('Aussen', '198.51.100.20', '24', '198.51.100.1');
  net.link(pc, sw);
  net.link(server, sw);
  net.link(sw, router);
  net.link(router, internet);
  net.link(internet, outsider);
  return { net, pc, server, router, outsider };
}

group('SNAT und DNAT getrennt', () => {
  it('SNAT: ausgehend mit fester Adresse, Antworten kommen zurück', () => {
    const { net, server } = company({ inside: '192.168.0.80', outside: '203.0.113.5', kind: 'snat' });
    const sim = new Simulation(net.topology);
    sim.ping(server, '198.51.100.20');
    sim.runUntil(20_000);
    expect(replies(sim, server)).toHaveLength(4);
    expect(log(net, sim)).toContain('Internet→Aussen ICMP echoRequest 203.0.113.5>198.51.100.20');
    expect(log(net, sim)).toContain('S1→Server ICMP echoReply 198.51.100.20>192.168.0.80');
  });

  it('SNAT allein lässt keine neue Verbindung von aussen herein', () => {
    const { net, outsider } = company({ inside: '192.168.0.80', outside: '203.0.113.5', kind: 'snat' });
    const sim = new Simulation(net.topology);
    sim.ping(outsider, '203.0.113.5');
    sim.runUntil(20_000);
    expect(replies(sim, outsider)).toHaveLength(0);
    expect(log(net, sim).some((l) => l.includes('→Server ICMP echoRequest'))).toBe(false);
  });

  it('DNAT: von aussen erreichbar, Antwort mit der äusseren Adresse', () => {
    const { net, outsider } = company({ inside: '192.168.0.80', outside: '203.0.113.5', kind: 'dnat' });
    const sim = new Simulation(net.topology);
    sim.ping(outsider, '203.0.113.5');
    sim.runUntil(20_000);
    expect(replies(sim, outsider)).toHaveLength(4);
    expect(log(net, sim)).toContain('S1→Server ICMP echoRequest 198.51.100.20>192.168.0.80');
    expect(log(net, sim)).toContain('Internet→Aussen ICMP echoReply 203.0.113.5>198.51.100.20');
  });

  it('DNAT allein: eigene Verbindungen des Servers gehen per PAT über die Router-Adresse', () => {
    const { net, server } = company({ inside: '192.168.0.80', outside: '203.0.113.5', kind: 'dnat' });
    const sim = new Simulation(net.topology);
    sim.ping(server, '198.51.100.20');
    sim.runUntil(20_000);
    expect(replies(sim, server)).toHaveLength(4);
    expect(log(net, sim)).toContain('Internet→Aussen ICMP echoRequest 203.0.113.2>198.51.100.20');
  });
});
