import { describe, expect, it } from 'vitest';
import { addDnsRecord, setDhcpServer, setDnsServerEnabled, setRoutingMode } from '../model/topology';
import { NetBuilder, unwrap } from '../sim/testing';
import { FAULT_KINDS, injectFaults } from './faults';
import { evaluateGoal } from './tasks';

/** Zwei Standorte mit automatischem Routing, DHCP- und DNS-Server, Switches. */
function sites() {
  const n = new NetBuilder();
  const r1 = n.router('R1', ['192.168.1.1/24', '10.0.0.1/30']);
  const r2 = n.router('R2', ['192.168.2.1/24', '10.0.0.2/30']);
  const s1 = n.add('switch', 'SW1');
  const s2 = n.add('switch', 'SW2');
  const srv = n.host('Server', '192.168.1.10', '24', '192.168.1.1');
  const pc1 = n.host('PC1', '192.168.1.20', '24', '192.168.1.1');
  const pc2 = n.host('PC2', '192.168.2.20', '24', '192.168.2.1');
  n.link(r1, s1);
  n.link(r2, s2);
  n.link(r1, r2);
  n.link(srv, s1);
  n.link(pc1, s1);
  n.link(pc2, s2);
  n.apply((t) => setRoutingMode(t, r1, 'auto'));
  n.apply((t) => setRoutingMode(t, r2, 'auto'));
  n.apply((t) => setDhcpServer(t, srv, { start: '192.168.1.100', end: '192.168.1.150', gateway: '192.168.1.1', dns: '192.168.1.10', leaseTime: 3600 }));
  n.apply((t) => setDnsServerEnabled(t, srv, true));
  n.apply((t) => addDnsRecord(t, srv, { name: 'intranet.schule.example', type: 'A', value: '192.168.2.20', ttl: 300 }));
  return n.topology;
}

describe('Fehlersuche: Fehler einbauen', () => {
  it('jeder eingebaute Fehler macht seinen Prüfbaustein falsch, das Original erfüllt ihn', () => {
    const original = sites();
    for (const seed of [1, 2, 3, 42]) {
      const { topology, faults } = injectFaults(original, { seed, count: 4 });
      expect(faults).toHaveLength(4);
      expect(new Set(faults.map((f) => f.device)).size).toBe(4);
      for (const f of faults) {
        const goal = { id: f.kind, text: '', check: f.check };
        expect(evaluateGoal(topology, goal).passed, `${seed} ${f.kind} ${f.device}`).toBe(false);
        expect(evaluateGoal(original, goal).passed, `${seed} ${f.kind} ${f.device}`).toBe(true);
      }
    }
  });

  it('gleicher Startwert, gleiche Fehler; andere Startwerte, andere Fehler', () => {
    const original = sites();
    const a = injectFaults(original, { seed: 7, count: 3 }).faults;
    expect(injectFaults(original, { seed: 7, count: 3 }).faults).toEqual(a);
    const variants = new Set([1, 2, 3, 4, 5, 6].map((seed) => JSON.stringify(injectFaults(original, { seed, count: 3 }).faults.map((f) => [f.kind, f.device]))));
    expect(variants.size).toBeGreaterThan(3);
  });

  it('jede Fehlerart kommt vor', () => {
    const original = sites();
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) for (const f of injectFaults(original, { seed, count: 5 }).faults) seen.add(f.kind);
    expect([...seen].sort()).toEqual([...FAULT_KINDS].sort());
  });

  it('Auswahl der Arten', () => {
    const { faults } = injectFaults(sites(), { seed: 3, count: 2, kinds: ['dnsRecord', 'hostGateway'] });
    expect(faults.every((f) => f.kind === 'dnsRecord' || f.kind === 'hostGateway')).toBe(true);
    void unwrap;
  });
});
