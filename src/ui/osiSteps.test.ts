import { describe, expect, it } from 'vitest';
import { Simulation, addDevice, configureHost, connect, emptyTopology, setInterfaceAddress, type Result, type Topology } from '../core';
import { unpackPlan } from './osiSteps';

const unwrap = <T,>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};

/** PC A – Switch – Router – PC B (zwei Netze) */
function net() {
  let t: Topology = emptyTopology();
  const ids: Record<string, string> = {};
  for (const [type, name] of [['pc', 'A'], ['switch', 'S'], ['router', 'R'], ['pc', 'B'], ['pc', 'C']] as const) {
    const r = unwrap(addDevice(t, type, name, { x: 0, y: 0 }));
    t = r.topology;
    ids[name] = r.id;
  }
  t = unwrap(configureHost(t, ids.A!, { ip: '10.0.1.10', mask: '24', gateway: '10.0.1.1' }));
  t = unwrap(configureHost(t, ids.C!, { ip: '10.0.1.11', mask: '24', gateway: '10.0.1.1' }));
  t = unwrap(configureHost(t, ids.B!, { ip: '10.0.2.10', mask: '24', gateway: '10.0.2.1' }));
  t = unwrap(setInterfaceAddress(t, ids.R!, 0, '10.0.1.1', '24'));
  t = unwrap(setInterfaceAddress(t, ids.R!, 1, '10.0.2.1', '24'));
  for (const [a, b] of [['A', 'S'], ['C', 'S'], ['S', 'R'], ['R', 'B']]) t = unwrap(connect(t, ids[a]!, ids[b]!)).topology;
  return { t, ids };
}

describe('Einzelschritt: Auspacken nach OSI', () => {
  it('Switch bis Schicht 2, Router bis 3, Ziel ganz, fremde Ziel-MAC wird verworfen', () => {
    const { t, ids } = net();
    const sim = new Simulation(t);
    sim.ping(ids.A!, '10.0.2.10');
    sim.runUntilIdle();
    const log = sim.getPacketLog();
    const icmp = log.filter((e) => e.frame.payload.kind === 'ipv4' && e.frame.payload.payload.kind === 'icmp');
    const toSwitch = icmp.find((e) => e.to.device === ids.S)!;
    const toRouter = icmp.find((e) => e.to.device === ids.R && e.from.device === ids.S)!;
    const toB = icmp.find((e) => e.to.device === ids.B)!;
    expect(unpackPlan(t, toSwitch)).toMatchObject({ layers: [1, 2], outcome: 'forward' });
    expect(unpackPlan(t, toRouter)).toMatchObject({ layers: [1, 2, 3], outcome: 'route' });
    expect(unpackPlan(t, toB)).toMatchObject({ outcome: 'deliver' });
    expect(unpackPlan(t, toB)!.layers.at(-1)).toBe(3);
    // ARP-Broadcast erreicht C (gehört allen), ein Unicast an den Router, den der Switch noch flutet, nicht.
    const flooded = log.find((e) => e.to.device === ids.C && e.frame.dst !== 'FF:FF:FF:FF:FF:FF');
    if (flooded) expect(unpackPlan(t, flooded)?.outcome).toBe('ignore');
  });
});
