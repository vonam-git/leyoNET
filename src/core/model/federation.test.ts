import { describe, expect, it } from 'vitest';
import { Simulation } from '../sim/simulation';
import { addDevice, addPortForward, addStaticRoute, configureHost, connect, emptyTopology, setInterfaceAddress, setInterfaceNat, setVerbund, setVerbundProvider } from './topology';
import type { Topology } from './types';
import type { Result } from './topology';
import { federate, probeSites, verbundAddresses } from './federation';

const u = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};
const id = (t: Topology, name: string) => t.devices.find((d) => d.name === name)!.id;

/** Infrastruktur: Provider mit Zentrale (Webserver) in 198.51.100.0/24. */
export function infra(): Topology {
  let t = emptyTopology();
  t = u(addDevice(t, 'internet', 'Provider', { x: 0, y: 0 })).topology;
  t = u(addDevice(t, 'server', 'Zentrale', { x: 0, y: 200 })).topology;
  t = u(setVerbundProvider(t, id(t, 'Provider'), true));
  t = u(connect(t, id(t, 'Zentrale'), id(t, 'Provider'), 'tp', { b: 0 })).topology;
  t = u(setInterfaceAddress(t, id(t, 'Provider'), 0, '198.51.100.1', '24'));
  t = u(configureHost(t, id(t, 'Zentrale'), { ip: '198.51.100.10', mask: '24', gateway: '198.51.100.1' }));
  return t;
}

/** Standort: PC hinter einem Router mit NAT, WAN nach Adressplan des Platzes. */
export function site(seat: number, lan: string, configured = true): Topology {
  let t = emptyTopology();
  t = u(addDevice(t, 'pc', 'PC 1', { x: 0, y: 0 })).topology;
  t = u(addDevice(t, 'router', 'Router', { x: 200, y: 0 })).topology;
  t = u(connect(t, id(t, 'PC 1'), id(t, 'Router'), 'tp', { b: 0 })).topology;
  t = u(configureHost(t, id(t, 'PC 1'), { ip: `${lan}.10`, mask: '24', gateway: `${lan}.1` }));
  t = u(setInterfaceAddress(t, id(t, 'Router'), 0, `${lan}.1`, '24'));
  t = u(setVerbund(t, id(t, 'Router'), 1));
  if (configured) {
    const a = verbundAddresses(seat);
    t = u(setInterfaceAddress(t, id(t, 'Router'), 1, a.site, '30'));
    t = u(addStaticRoute(t, id(t, 'Router'), { network: '0.0.0.0', mask: '0.0.0.0', gateway: a.provider }));
    t = u(setInterfaceNat(t, id(t, 'Router'), 1, true));
  }
  return t;
}

const pingOk = (sim: Simulation, from: string, to: string) => {
  sim.runUntil(5_000);
  const before = sim.getDeviceState(from).console.length;
  sim.ping(from, to);
  sim.runUntil(sim.now + 10_000);
  return sim.getDeviceState(from).console.slice(before).some((l) => /bytes from|Antwort von|reply/i.test(typeof l === 'string' ? l : JSON.stringify(l)));
};

describe('Klassen-Verbund: Standorte zusammensetzen', () => {
  it('Adressplan je Platz: /30 aus 203.0.113.0/24', () => {
    expect(verbundAddresses(1)).toEqual({ network: '203.0.113.4', provider: '203.0.113.5', site: '203.0.113.6', mask: '255.255.255.252' });
    expect(verbundAddresses(62).site).toBe('203.0.113.250');
  });

  it('eigener Standort behält Kennungen, andere bekommen eindeutige Kennungen, MACs und Vorsilben', () => {
    const own = site(1, '192.168.1');
    const f = federate(infra(), [
      { seat: 1, topology: own, own: true },
      { seat: 2, label: 'Bern', topology: site(2, '192.168.1') },
    ]);
    const ids = f.topology.devices.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(f.topology.devices.filter((d) => own.devices.some((o) => o.id === d.id)).map((d) => d.name)).toEqual(['PC 1', 'Router']);
    expect(f.topology.devices.map((d) => d.name)).toContain('Bern: PC 1');
    const macs = f.topology.devices.flatMap((d) => d.interfaces.map((i) => i.mac));
    expect(new Set(macs).size).toBe(macs.length);
    expect(f.sites.map((s) => s.name)).toEqual(['Platz 1', 'Bern']);
    // Jeder verbundene Standort hängt am Provider im Transfernetz seines Platzes.
    const provider = f.topology.devices.find((d) => d.id === f.provider)!;
    expect(provider.interfaces.map((i) => i.ip)).toEqual(expect.arrayContaining(['198.51.100.1', '203.0.113.5', '203.0.113.9']));
  });

  it('Standorte erreichen die Zentrale und sich gegenseitig (öffentliche Adressen), auch mit gleichem LAN', () => {
    const f = federate(infra(), [
      { seat: 1, topology: site(1, '192.168.1'), own: true },
      { seat: 2, label: 'Bern', topology: site(2, '192.168.1') },
    ]);
    const sim = new Simulation(f.topology);
    expect(pingOk(sim, id(f.topology, 'PC 1'), '198.51.100.10')).toBe(true);
    expect(pingOk(sim, id(f.topology, 'Bern: PC 1'), '198.51.100.10')).toBe(true);
    expect(pingOk(sim, id(f.topology, 'Zentrale'), verbundAddresses(2).site)).toBe(true);
  });

  it('Standort ohne WAN-Adresse ist verbunden, aber nicht online', () => {
    const f = federate(infra(), [{ seat: 3, topology: site(3, '192.168.3', false) }]);
    expect(f.sites[0]!.uplink).not.toBeNull();
    const sim = new Simulation(f.topology);
    expect(pingOk(sim, id(f.topology, 'Zentrale'), verbundAddresses(3).site)).toBe(false);
  });

  it('doppelter Platz wird gemeldet, nicht doppelt eingebaut; mehr Standorte als Provider-Anschlüsse gehen', () => {
    const sites = Array.from({ length: 12 }, (_, i) => ({ seat: i + 1, topology: site(i + 1, `10.0.${i}`) }));
    const f = federate(infra(), [...sites, { seat: 5, topology: site(5, '10.9.9') }]);
    expect(f.sites.filter((s) => s.problem === 'seatTaken')).toHaveLength(1);
    const provider = f.topology.devices.find((d) => d.id === f.provider)!;
    expect(provider.interfaces.filter((i) => i.ip?.startsWith('203.0.113.'))).toHaveLength(12);
  });

  it('Portweiterleitung: die Zentrale erreicht den Webserver eines Standorts über seine öffentliche Adresse', () => {
    let s = site(4, '192.168.4');
    s = u(addPortForward(s, id(s, 'Router'), { protocol: 'tcp', port: 80, to: '192.168.4.10', toPort: 80 }));
    const f = federate(infra(), [{ seat: 4, topology: s }]);
    expect(f.sites[0]!.problem).toBeUndefined();
    expect(f.topology.devices.find((d) => d.name === 'Platz 4: Router')!.portForwards).toHaveLength(1);
  });
});

describe('Klassen-Verbund: Zustand der Standorte prüfen', () => {
  it('offline ohne Anschluss, verbunden ohne Adresse, online mit Adresse', () => {
    const noUplink = site(1, '192.168.1');
    const t0 = { ...noUplink, devices: noUplink.devices.map(({ verbund: _v, ...d }) => d) };
    const f = federate(infra(), [
      { seat: 1, topology: t0 },
      { seat: 2, topology: site(2, '192.168.2', false) },
      { seat: 3, topology: site(3, '192.168.3') },
    ]);
    const probes = probeSites(f, new Simulation(f.topology));
    expect(probes.map((p) => [p.seat, p.level])).toEqual([
      [1, 'offline'],
      [2, 'connected'],
      [3, 'online'],
    ]);
  });
});
