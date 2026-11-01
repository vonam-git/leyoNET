import { describe, expect, it } from 'vitest';
import { duplicateAddresses } from './duplicates';
import { addDevice, configureHost, connect, emptyTopology, setInterfaceAddress, type Result } from './topology';
import type { DeviceType, Topology } from './types';

function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`Unerwarteter Fehler: ${r.error.code}`);
  return r.value;
}

function build() {
  let t: Topology = emptyTopology();
  const ids: Record<string, string> = {};
  const add = (type: DeviceType, name: string) => {
    const r = unwrap(addDevice(t, type, name, { x: 0, y: 0 }));
    t = r.topology;
    ids[name] = r.id;
  };
  const link = (a: string, b: string) => (t = unwrap(connect(t, ids[a]!, ids[b]!)).topology);
  const host = (name: string, ip: string) => (t = unwrap(configureHost(t, ids[name]!, { ip, mask: '/24' })));
  return { add, link, host, ids, get t() { return t; }, set t(v) { t = v; } };
}

describe('Doppelte Adressen', () => {
  it('meldet zwei Rechner mit derselben Adresse am selben Switch', () => {
    const n = build();
    n.add('pc', 'A');
    n.add('pc', 'B');
    n.add('pc', 'C');
    n.add('switch', 'S');
    n.link('A', 'S');
    n.link('B', 'S');
    n.link('C', 'S');
    n.host('A', '192.168.1.10');
    n.host('B', '192.168.1.10');
    n.host('C', '192.168.1.11');
    const dup = duplicateAddresses(n.t);
    expect(dup).toEqual(new Set([`${n.ids.A}#192.168.1.10`, `${n.ids.B}#192.168.1.10`]));
  });

  it('erlaubt dieselbe private Adresse hinter verschiedenen Routern', () => {
    const n = build();
    n.add('pc', 'A');
    n.add('pc', 'B');
    n.add('router', 'R1');
    n.add('router', 'R2');
    n.link('A', 'R1');
    n.link('B', 'R2');
    n.link('R1', 'R2');
    n.host('A', '192.168.1.10');
    n.host('B', '192.168.1.10');
    expect(duplicateAddresses(n.t).size).toBe(0);
  });

  it('meldet einen Router, dessen Adresse ein Rechner im selben Netz auch hat', () => {
    const n = build();
    n.add('pc', 'A');
    n.add('router', 'R');
    n.link('A', 'R');
    n.host('A', '10.0.0.1');
    n.t = unwrap(setInterfaceAddress(n.t, n.ids.R!, 0, '10.0.0.1', '/24'));
    expect(duplicateAddresses(n.t)).toEqual(new Set([`${n.ids.A}#10.0.0.1`, `${n.ids.R}#10.0.0.1`]));
  });

  it('berücksichtigt per DHCP bezogene Adressen aus der Simulation', () => {
    const n = build();
    n.add('pc', 'A');
    n.add('pc', 'B');
    n.add('switch', 'S');
    n.link('A', 'S');
    n.link('B', 'S');
    n.host('A', '192.168.1.50');
    n.t = unwrap(configureHost(n.t, n.ids.B!, { ip: '', mask: '', dhcp: true }));
    expect(duplicateAddresses(n.t).size).toBe(0);
    expect(duplicateAddresses(n.t, new Map([[n.ids.B!, '192.168.1.50']])).size).toBe(2);
  });
});
