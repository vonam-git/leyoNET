import { describe as group, expect, it } from 'vitest';
import { WAN_MEDIUM } from '../model/links';
import { addDevice, configureHost, setDefaultGateway, setInterfaceAddress } from '../model/topology';
import { MODEM_KINDS, type ModemKind } from '../model/types';
import { Simulation } from './simulation';
import { NetBuilder, unwrap } from './testing';

/** Zwei Rechner (per DHCP) – CPE (Internet-Box) – Provider – Webserver */
function home(kind: ModemKind | null) {
  const net = new NetBuilder();
  const added = unwrap(addDevice(net.topology, 'cpe', 'Internet-Box', { x: 0, y: 0 }, kind ? { modem: kind } : {}));
  net.topology = added.topology;
  const cpe = added.id;
  const a = net.add('pc', 'PC A');
  const b = net.add('notebook', 'Notebook B');
  for (const id of [a, b]) net.topology = unwrap(configureHost(net.topology, id, { ip: '', mask: '', dhcp: true }));
  net.topology = unwrap(setInterfaceAddress(net.topology, cpe, 0, '203.0.113.2', '30'));
  net.topology = unwrap(setDefaultGateway(net.topology, cpe, '203.0.113.1'));
  const isp = net.internet('Provider', ['203.0.113.1/30', '198.51.100.1/24']);
  const server = net.host('Webserver', '198.51.100.10', '24', '198.51.100.1');
  net.link(a, cpe);
  net.link(b, cpe);
  net.link(cpe, isp, kind ? WAN_MEDIUM[kind] : 'tp');
  net.link(isp, server);
  return { net, cpe, a, b, isp, server };
}

const replies = (sim: Simulation, id: string) => sim.getDeviceState(id).console.filter((l) => l.code === 'ping.reply').length;

group('CPE (Internet-Box)', () => {
  it('ab Werk: LAN 192.168.1.1/24, DHCP-Server und NAT am WAN', () => {
    const { net, cpe } = home(null);
    const device = net.topology.devices.find((d) => d.id === cpe)!;
    expect(device.interfaces).toHaveLength(5);
    expect(device.interfaces[1]).toMatchObject({ ip: '192.168.1.1', mask: '255.255.255.0' });
    expect(device.interfaces[0]?.nat).toBe(true);
    expect(device.dhcpServer).toMatchObject({ start: '192.168.1.100', end: '192.168.1.199' });
    expect(device.routes).toEqual([{ network: '0.0.0.0', mask: '0.0.0.0', gateway: '203.0.113.1' }]);
  });

  it('vergibt im LAN Adressen, verbindet die LAN-Buchsen und übersetzt ins Internet', () => {
    const { net, a, b } = home(null);
    const sim = new Simulation(net.topology);
    sim.runUntil(5000);
    expect(sim.getDeviceState(a).address?.ip).toBe('192.168.1.100');
    expect(sim.getDeviceState(b).address?.ip).toBe('192.168.1.101');
    sim.ping(a, '192.168.1.101');
    sim.runUntil(10_000);
    expect(replies(sim, a)).toBe(4);
    sim.ping(b, '198.51.100.10');
    sim.runUntil(20_000);
    expect(replies(sim, b)).toBe(4);
    // Im Internet erscheint nur die öffentliche WAN-Adresse.
    const outside = sim.getPacketLog().filter((e) => e.frame.payload.kind === 'ipv4' && e.frame.payload.payload.kind === 'icmp' && e.to.device !== a && e.to.device !== b && e.from.device !== a && e.from.device !== b);
    expect(outside.length).toBeGreaterThan(0);
    expect(outside.every((e) => e.frame.payload.kind === 'ipv4' && !e.frame.payload.src.startsWith('192.168.') && !e.frame.payload.dst.startsWith('192.168.'))).toBe(true);
  });

  for (const kind of MODEM_KINDS) {
    it(`${kind}: baut zuerst die Zugangsleitung auf, danach erreicht das LAN den Webserver`, () => {
      const { net, cpe, a } = home(kind);
      const sim = new Simulation(net.topology);
      sim.runUntil(8000);
      expect(sim.getDeviceState(cpe).modem).toMatchObject({ phase: 'online' });
      sim.ping(a, '198.51.100.10');
      sim.runUntil(30_000);
      expect(replies(sim, a)).toBeGreaterThan(0);
    });
  }
});
