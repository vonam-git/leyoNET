import { describe, expect, it } from 'vitest';
import { setDhcpExcluded, setDhcpPool, setPortVlan, setSvi } from '../model/topology';
import { NetBuilder } from './testing';
import { Simulation } from './simulation';

/** Layer-3-Switch als DHCP-Server mit einem Pool je VLAN (Cisco: «ip dhcp pool»). */
function campus() {
  const net = new NetBuilder();
  const sw = net.add('l3switch', 'L3');
  const a = net.dhcpClient('PC A', 'pc');
  const b = net.dhcpClient('PC B', 'pc');
  net.link(a, sw);
  net.link(b, sw);
  net.apply((t) => setPortVlan(t, sw, 0, 10));
  net.apply((t) => setPortVlan(t, sw, 1, 20));
  net.apply((t) => setSvi(t, sw, 10, '192.168.10.1', '24'));
  net.apply((t) => setSvi(t, sw, 20, '192.168.20.1', '24'));
  net.apply((t) => setDhcpPool(t, sw, 'VLAN10', { name: 'VLAN10', network: '192.168.10.0', mask: '255.255.255.0', gateway: '192.168.10.1', dns: '1.1.1.1' }));
  net.apply((t) => setDhcpPool(t, sw, 'VLAN20', { name: 'VLAN20', network: '192.168.20.0', mask: '/24', gateway: '192.168.20.1' }));
  net.apply((t) => setDhcpExcluded(t, sw, '192.168.10.1', '192.168.10.9'));
  return { net, sw, a, b };
}

describe('DHCP-Pools auf dem Layer-3-Switch', () => {
  it('vergibt je VLAN aus dem passenden Pool, ohne ausgeschlossene Adressen', () => {
    const { net, a, b } = campus();
    const sim = new Simulation(net.topology);
    sim.runUntil(6000);
    expect(sim.getDeviceState(a).address).toMatchObject({ ip: '192.168.10.10', gateway: '192.168.10.1', dns: '1.1.1.1' });
    expect(sim.getDeviceState(b).address).toMatchObject({ ip: '192.168.20.2', gateway: '192.168.20.1' });
  });

  it('prüft Pools und lehnt Geräte ohne Routing ab', () => {
    const { net, sw } = campus();
    expect(setDhcpPool(net.topology, sw, 'X', { name: 'X', network: '10.0.0.0', mask: '255.255.255.255' })).toMatchObject({ ok: false });
    expect(setDhcpPool(net.topology, sw, 'bad name', { name: 'bad name' })).toMatchObject({ ok: false, error: { code: 'invalidPoolName' } });
    const pc = net.topology.devices.find((d) => d.type === 'pc')!.id;
    expect(setDhcpPool(net.topology, pc, 'P', { name: 'P' })).toMatchObject({ ok: false, error: { code: 'notDhcpPoolCapable' } });
    expect(setDhcpExcluded(net.topology, sw, '192.168.10.9', '192.168.10.1')).toMatchObject({ ok: false });
  });
});

describe('DHCP-Pools auf der Befehlszeile', () => {
  it('ip dhcp pool, network, default-router, dns-server, excluded-address und running-config', async () => {
    const { execute, startSession } = await import('../cli/cli');
    const net = new NetBuilder();
    const sw = net.add('l3switch', 'L3');
    let topology = net.topology;
    let session = startSession(topology.devices[0]!).session;
    for (const line of ['en', 'conf t', 'ip dhcp excluded-address 192.168.10.1 192.168.10.9', 'ip dhcp pool VLAN10', 'network 192.168.10.0 255.255.255.0', 'default-router 192.168.10.1', 'dns-server 1.1.1.1', 'exit', 'end']) {
      const r = execute(session, line, { topology });
      expect(r.lines.join('\n')).not.toMatch(/%/);
      if (r.topology) topology = r.topology;
      session = r.session;
    }
    const device = topology.devices.find((d) => d.id === sw)!;
    expect(device.dhcpPools).toEqual([{ name: 'VLAN10', network: '192.168.10.0', mask: '255.255.255.0', gateway: '192.168.10.1', dns: '1.1.1.1' }]);
    const config = execute(session, 'show running-config', { topology }).lines.join('\n');
    expect(config).toContain('ip dhcp excluded-address 192.168.10.1 192.168.10.9');
    expect(config).toContain('ip dhcp pool VLAN10\n network 192.168.10.0 255.255.255.0\n default-router 192.168.10.1\n dns-server 1.1.1.1');
  });
});
