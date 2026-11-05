import { describe as group, expect, it } from 'vitest';
import { configureHost6, setInterfaceDhcp6, setInterfaceDns6, setInterfaceIpv6, setIpMode, setIpRouting, setPortVlan, setRoutingMode, setSvi } from '../model/topology';
import { parseProject, serializeProject } from '../io/project';
import { sviId } from '../net/routing';
import { Simulation } from './simulation';
import { NetBuilder, describe as line, unwrap } from './testing';

/** PC 10 (SLAAC) in VLAN 10, PC 20 (DHCPv6) in VLAN 20, beide am Layer-3-Switch. */
function build(mode: 'ipv6' | 'dual' = 'ipv6') {
  const net = new NetBuilder();
  const pc10 = net.add('pc', 'PC10');
  const pc20 = net.add('pc', 'PC20');
  const sw = net.add('l3switch', 'L3');
  net.link(pc10, sw);
  net.link(pc20, sw);
  net.apply((t) => setIpMode(t, mode));
  net.apply((t) => setPortVlan(t, sw, 0, 10));
  net.apply((t) => setPortVlan(t, sw, 1, 20));
  net.apply((t) => setSvi(t, sw, 10, '', ''));
  net.apply((t) => setSvi(t, sw, 20, '', ''));
  net.apply((t) => setInterfaceIpv6(t, sw, sviId(10), '2001:db8:10::1/64'));
  net.apply((t) => setInterfaceIpv6(t, sw, sviId(20), '2001:db8:20::1/64'));
  net.apply((t) => setInterfaceDhcp6(t, sw, sviId(20), true));
  net.apply((t) => setInterfaceDns6(t, sw, sviId(10), '2001:db8:20::53'));
  net.apply((t) => configureHost6(t, pc10, { auto: true }));
  net.apply((t) => configureHost6(t, pc20, { auto: true }));
  return { net, pc10, pc20, sw };
}

const replies = (sim: Simulation, id: string) => sim.getDeviceState(id).console.filter((l) => l.code === 'ping.reply').length;
const run = (sim: Simulation, ms: number) => sim.runUntil(sim.now + ms);

group('IPv6 auf dem Layer-3-Switch', () => {
  it('kündigt das Präfix je VLAN an (SLAAC, DHCPv6, RDNSS) und routet zwischen den VLANs', () => {
    const { net, pc10, pc20, sw } = build();
    const sim = new Simulation(net.topology);
    run(sim, 3000);
    const a10 = sim.getDeviceState(pc10).ipv6!;
    const a20 = sim.getDeviceState(pc20).ipv6!;
    expect(a10.config).toBe('slaac');
    expect(a10.addresses.find((a) => a.origin === 'slaac')?.address).toMatch(/^2001:db8:10::/);
    expect(a10.dns).toBe('2001:db8:20::53');
    expect(a20.config).toBe('dhcpv6');
    expect(a20.addresses.find((a) => a.origin === 'dhcpv6')?.address).toBe('2001:db8:20::100');
    // Router Advertisements tragen ein VLAN-Tag nur auf Trunks; hier je Access-Port eines.
    const ras = sim.getPacketLog().filter((e) => line(net.topology, e).includes('routerAdvertisement'));
    expect(ras.some((e) => e.to.device === pc10)).toBe(true);
    expect(ras.some((e) => e.to.device === pc20)).toBe(true);

    sim.ping(pc10, '2001:db8:20::100');
    run(sim, 8000);
    expect(replies(sim, pc10)).toBe(4);
    const state = sim.getDeviceState(sw) as { ipv6?: { neighbors: { ip: string; iface: number }[] } };
    expect(state.ipv6?.neighbors).toContainEqual(expect.objectContaining({ ip: '2001:db8:20::100', iface: sviId(20) }));
  });

  it('antwortet auf Ping an die eigene SVI und pingt selbst', () => {
    const { net, pc10, sw } = build();
    const sim = new Simulation(net.topology);
    run(sim, 3000);
    sim.ping(pc10, '2001:db8:10::1');
    run(sim, 6000);
    expect(replies(sim, pc10)).toBe(4);
    sim.ping(sw, '2001:db8:20::100');
    run(sim, 6000);
    expect(replies(sim, sw)).toBe(4);
  });

  it('leitet mit «no ip routing» auch IPv6 nicht weiter', () => {
    const { net, pc10 } = build();
    const sw = net.topology.devices.find((d) => d.type === 'l3switch')!.id;
    net.apply((t) => setIpRouting(t, sw, false));
    const sim = new Simulation(net.topology);
    run(sim, 3000);
    sim.ping(pc10, '2001:db8:20::100');
    run(sim, 8000);
    expect(replies(sim, pc10)).toBe(0);
  });

  it('automatisches Routing über Layer-3-Switch und Router', () => {
    const { net, pc10, sw } = build();
    // Uplink: VLAN 99 zum Router, dahinter ein Server.
    const r = net.add('router', 'R1');
    const srv = net.add('server', 'Server');
    net.link(sw, r);
    net.link(r, srv);
    net.apply((t) => setPortVlan(t, sw, 2, 99));
    net.apply((t) => setSvi(t, sw, 99, '', ''));
    net.apply((t) => setInterfaceIpv6(t, sw, sviId(99), '2001:db8:99::2/64'));
    net.apply((t) => setInterfaceIpv6(t, r, 0, '2001:db8:99::1/64'));
    net.apply((t) => setInterfaceIpv6(t, r, 1, '2001:db8:fe::1/64'));
    net.apply((t) => configureHost6(t, srv, { auto: false, address: '2001:db8:fe::10/64', gateway: '2001:db8:fe::1' }));
    net.apply((t) => setRoutingMode(t, sw, 'auto'));
    net.apply((t) => setRoutingMode(t, r, 'auto'));
    const sim = new Simulation(net.topology);
    run(sim, 3000);
    sim.runCommand(pc10, 'tracert 2001:db8:fe::10');
    run(sim, 15_000);
    const hops = sim.getDeviceState(pc10).console.filter((l) => l.code === 'tracert.hop').map((l) => l.params?.from);
    expect(hops).toEqual(['2001:db8:10::1', '2001:db8:99::1', '2001:db8:fe::10']);
  });

  it('SVI-Einstellungen werden geprüft und gespeichert', () => {
    const { net, sw } = build();
    expect(setInterfaceIpv6(net.topology, sw, sviId(30), '2001:db8:30::1/64')).toMatchObject({ ok: false, error: { code: 'unknownInterface' } });
    const parsed = parseProject(serializeProject(net.topology));
    expect(parsed.ok && parsed.topology.devices.find((d) => d.id === sw)?.svis).toEqual([
      { vlan: 10, ipv6: '2001:db8:10::1/64', dns6: '2001:db8:20::53' },
      { vlan: 20, ipv6: '2001:db8:20::1/64', dhcp6: true },
    ]);
    // Adresse entfernen
    const removed = unwrap(setInterfaceIpv6(net.topology, sw, sviId(10), ''));
    expect(removed.devices.find((d) => d.id === sw)?.svis?.[0]).toEqual({ vlan: 10, dns6: '2001:db8:20::53' });
  });
});
