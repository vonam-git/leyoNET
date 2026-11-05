import { describe as group, expect, it } from 'vitest';
import { configureHost6, setInterfaceCount, setInterfaceIpv6, setInterfaceShutdown, setIpMode, setOspf6, setPortVlan, setRipng, setSvi } from '../model/topology';
import { parseProject, serializeProject } from '../io/project';
import { sviId } from '../net/routing';
import { dissect } from '../wire/encode';
import { internetChecksum } from '../wire/part';
import { protocolOf } from './protocol';
import { Simulation } from './simulation';
import { NetBuilder, unwrap } from './testing';

/**
 * PC A – R1 – R2 – R3 – PC B, nur IPv6; dazu ein Querweg R1 – R3 (teurer bzw. mehr Hops nicht).
 * Netze: A 2001:db8:a::/64, R1-R2 2001:db8:12::/64, R2-R3 2001:db8:23::/64, B 2001:db8:b::/64.
 */
function chain() {
  const net = new NetBuilder();
  const pcA = net.add('pc', 'PC A');
  const pcB = net.add('pc', 'PC B');
  const r1 = net.add('router', 'R1');
  const r2 = net.add('router', 'R2');
  const r3 = net.add('router', 'R3');
  net.link(pcA, r1); // R1 eth0
  net.link(r1, r2); // R1 eth1 – R2 eth0
  net.link(r2, r3); // R2 eth1 – R3 eth0
  net.link(r3, pcB); // R3 eth1
  net.apply((t) => setIpMode(t, 'ipv6'));
  const v6 = (id: string, i: number, a: string) => net.apply((t) => setInterfaceIpv6(t, id, i, a));
  v6(r1, 0, '2001:db8:a::1/64');
  v6(r1, 1, '2001:db8:12::1/64');
  v6(r2, 0, '2001:db8:12::2/64');
  v6(r2, 1, '2001:db8:23::2/64');
  v6(r3, 0, '2001:db8:23::3/64');
  v6(r3, 1, '2001:db8:b::1/64');
  net.apply((t) => configureHost6(t, pcA, { auto: true }));
  net.apply((t) => configureHost6(t, pcB, { auto: false, address: '2001:db8:b::10/64', gateway: '2001:db8:b::1' }));
  return { net, pcA, pcB, r1, r2, r3 };
}

const run = (sim: Simulation, ms: number) => sim.runUntil(sim.now + ms);
const hops = (sim: Simulation, id: string) => sim.getDeviceState(id).console.filter((l) => l.code === 'tracert.hop').map((l) => l.params?.from);
const routes6 = (sim: Simulation, id: string) => (sim.getDeviceState(id) as { ipv6?: { routes6: { network: bigint; prefix: number; kind: string; metric?: number }[] } }).ipv6?.routes6 ?? [];

group('OSPFv3', () => {
  function withOspf6() {
    const n = chain();
    n.net.apply((t) => setOspf6(t, n.r1, { routerId: '1.1.1.1', interfaces: [{ iface: 0, area: 0 }, { iface: 1, area: 0 }], passive: [0] }));
    n.net.apply((t) => setOspf6(t, n.r2, { interfaces: [{ iface: 0, area: 0 }, { iface: 1, area: 0 }] }));
    n.net.apply((t) => setOspf6(t, n.r3, { routerId: '3.3.3.3', interfaces: [{ iface: 0, area: 0 }, { iface: 1, area: 0 }], passive: [1] }));
    return n;
  }

  it('bildet Nachbarschaften über Link-Local, lernt die Netze und routet', () => {
    const { net, pcA, r1, r2 } = withOspf6();
    const sim = new Simulation(net.topology);
    run(sim, 12_000);
    const state = sim.getDeviceState(r2) as { ospf6?: { routerId: string; neighbors: { routerId: string; state: string; ip: string }[]; lsdb: { type: string }[] } };
    // Reines IPv6-Netz: Router-ID aus der MAC, wenn keine gesetzt ist.
    expect(state.ospf6?.routerId).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(state.ospf6?.neighbors.map((n) => [n.routerId, n.state])).toEqual(expect.arrayContaining([['1.1.1.1', 'full'], ['3.3.3.3', 'full']]));
    expect(state.ospf6?.neighbors.every((n) => n.ip.startsWith('fe80:'))).toBe(true);
    expect(state.ospf6?.lsdb.some((l) => l.type === 'intraAreaPrefix')).toBe(true);
    const learned = routes6(sim, r1).filter((r) => r.kind === 'ospf').map((r) => r.prefix);
    expect(learned.length).toBe(2);
    expect(sim.getDeviceState(r1).console.map((l) => l.code)).toContain('ospf6.full');

    sim.runCommand(pcA, 'tracert 2001:db8:b::10');
    run(sim, 15_000);
    expect(hops(sim, pcA)).toEqual(['2001:db8:a::1', '2001:db8:12::2', '2001:db8:23::3', '2001:db8:b::10']);
  });

  it('echte Bytes: Next Header 89, Version 3, Prüfsumme über den IPv6-Pseudo-Header', () => {
    const { net } = withOspf6();
    const sim = new Simulation(net.topology);
    run(sim, 6000);
    const frames = sim.getPacketLog().filter((e) => protocolOf(e.frame) === 'OSPFv3');
    expect(frames.length).toBeGreaterThan(5);
    const kinds = new Set<string>();
    for (const e of frames) {
      const w = dissect(e.frame);
      const v6 = w.layers.find((l) => l.protocol === 'IPv6')!;
      expect(w.bytes[v6.start + 6]).toBe(89);
      const length = (w.bytes[v6.start + 4]! << 8) | w.bytes[v6.start + 5]!;
      const body = [...w.bytes.slice(v6.start + 40, v6.start + 40 + length)];
      expect(body[0]).toBe(3);
      kinds.add(String(body[1]));
      const pseudo = [...w.bytes.slice(v6.start + 8, v6.start + 40), 0, 0, (length >> 8) & 0xff, length & 0xff, 0, 0, 0, 89];
      expect(internetChecksum([...pseudo, ...body])).toBe(0);
    }
    // Hello, DBD, LSR, LSU, LSAck
    expect([...kinds].sort()).toEqual(['1', '2', '3', '4', '5']);
  });

  it('findet nach einem Ausfall einen anderen Weg', () => {
    const { net, pcA, r1, r3 } = withOspf6();
    // Querverbindung R1 eth2 – R3 eth2
    net.apply((t) => setInterfaceCount(t, r1, 3));
    net.apply((t) => setInterfaceCount(t, r3, 3));
    net.link(r1, r3);
    net.apply((t) => setInterfaceIpv6(t, r1, 2, '2001:db8:13::1/64'));
    net.apply((t) => setInterfaceIpv6(t, r3, 2, '2001:db8:13::3/64'));
    net.apply((t) => setOspf6(t, r1, { routerId: '1.1.1.1', interfaces: [{ iface: 0, area: 0 }, { iface: 1, area: 0 }, { iface: 2, area: 0 }], passive: [0] }));
    net.apply((t) => setOspf6(t, r3, { routerId: '3.3.3.3', interfaces: [{ iface: 0, area: 0 }, { iface: 1, area: 0 }, { iface: 2, area: 0 }], passive: [1] }));
    const sim = new Simulation(net.topology);
    run(sim, 12_000);
    sim.runCommand(pcA, 'tracert 2001:db8:b::10');
    run(sim, 10_000);
    expect(hops(sim, pcA)).toEqual(['2001:db8:a::1', '2001:db8:13::3', '2001:db8:b::10']);
    sim.updateTopology(unwrap(setInterfaceShutdown(sim.topology, r1, 2, true)));
    run(sim, 15_000);
    sim.runCommand(pcA, 'tracert 2001:db8:b::10');
    run(sim, 10_000);
    expect(hops(sim, pcA).slice(-4)).toEqual(['2001:db8:a::1', '2001:db8:12::2', '2001:db8:23::3', '2001:db8:b::10']);
  });

  it('Layer-3-Switch spricht OSPFv3 auf einem VLAN-Interface', () => {
    const net = new NetBuilder();
    const pc = net.add('pc', 'PC');
    const sw = net.add('l3switch', 'L3');
    const r = net.add('router', 'R');
    const srv = net.add('server', 'Server');
    net.link(pc, sw);
    net.link(sw, r);
    net.link(r, srv);
    net.apply((t) => setIpMode(t, 'ipv6'));
    net.apply((t) => setPortVlan(t, sw, 0, 10));
    net.apply((t) => setPortVlan(t, sw, 1, 99));
    for (const vlan of [10, 99]) net.apply((t) => setSvi(t, sw, vlan, '', ''));
    net.apply((t) => setInterfaceIpv6(t, sw, sviId(10), '2001:db8:10::1/64'));
    net.apply((t) => setInterfaceIpv6(t, sw, sviId(99), '2001:db8:99::2/64'));
    net.apply((t) => setInterfaceIpv6(t, r, 0, '2001:db8:99::1/64'));
    net.apply((t) => setInterfaceIpv6(t, r, 1, '2001:db8:fe::1/64'));
    net.apply((t) => setOspf6(t, sw, { routerId: '10.0.0.1', interfaces: [{ iface: sviId(10), area: 0 }, { iface: sviId(99), area: 0 }] }));
    net.apply((t) => setOspf6(t, r, { routerId: '10.0.0.2', interfaces: [{ iface: 0, area: 0 }, { iface: 1, area: 0 }] }));
    net.apply((t) => configureHost6(t, pc, { auto: true }));
    net.apply((t) => configureHost6(t, srv, { auto: false, address: '2001:db8:fe::10/64', gateway: '2001:db8:fe::1' }));
    const sim = new Simulation(net.topology);
    run(sim, 12_000);
    expect(routes6(sim, r).some((x) => x.kind === 'ospf' && x.prefix === 64)).toBe(true);
    sim.ping(pc, '2001:db8:fe::10');
    run(sim, 8000);
    expect(sim.getDeviceState(pc).console.filter((l) => l.code === 'ping.reply')).toHaveLength(4);
  });

  it('prüft und speichert die Einstellungen', () => {
    const { net, r1 } = withOspf6();
    expect(setOspf6(net.topology, r1, { interfaces: [{ iface: 9, area: 0 }] })).toMatchObject({ ok: false, error: { code: 'unknownInterface' } });
    expect(setOspf6(net.topology, r1, { routerId: 'x', interfaces: [] })).toMatchObject({ ok: false, error: { code: 'invalidIp' } });
    const parsed = parseProject(serializeProject(net.topology));
    expect(parsed.ok && parsed.topology.devices.find((d) => d.id === r1)?.ospf6).toEqual({ routerId: '1.1.1.1', interfaces: [{ iface: 0, area: 0 }, { iface: 1, area: 0 }], passive: [0] });
  });
});

group('RIPng', () => {
  function withRipng() {
    const n = chain();
    n.net.apply((t) => setRipng(t, n.r1, { interfaces: [0, 1], passive: [0] }));
    n.net.apply((t) => setRipng(t, n.r2, { interfaces: [0, 1] }));
    n.net.apply((t) => setRipng(t, n.r3, { interfaces: [0, 1], passive: [1] }));
    return n;
  }

  it('lernt die Netze mit Hop-Anzahl und routet', () => {
    const { net, pcA, r1 } = withRipng();
    const sim = new Simulation(net.topology);
    run(sim, 15_000);
    const rip = routes6(sim, r1).filter((r) => r.kind === 'rip');
    // Wie bei RIPv2: Netz des Nachbarn Metrik 1, eins weiter 2.
    expect(rip.map((r) => r.metric).sort()).toEqual([1, 2]);
    sim.runCommand(pcA, 'tracert 2001:db8:b::10');
    run(sim, 15_000);
    expect(hops(sim, pcA)).toEqual(['2001:db8:a::1', '2001:db8:12::2', '2001:db8:23::3', '2001:db8:b::10']);
    // UDP 521 an ff02::9 vom Link-Local, Hop Limit 255
    const update = sim.getPacketLog().find((e) => protocolOf(e.frame) === 'RIPng' && e.frame.payload.kind === 'ipv6' && e.frame.payload.dst === 'ff02::9');
    expect(update?.frame.payload.kind === 'ipv6' && update.frame.payload.src.startsWith('fe80:') && update.frame.payload.hopLimit === 255).toBe(true);
    const w = dissect(update!.frame);
    expect(w.layers.map((l) => l.protocol)).toContain('RIPng');
  });

  it('Standardroute per default-information originate, Redistribution von connected', () => {
    const { net, r1, r3 } = withRipng();
    net.apply((t) => setRipng(t, r3, { interfaces: [0], defaultOriginate: true, redistribute: ['connected'] }));
    const sim = new Simulation(net.topology);
    run(sim, 15_000);
    const rip = routes6(sim, r1).filter((r) => r.kind === 'rip');
    expect(rip.some((r) => r.prefix === 0)).toBe(true);
    expect(rip.some((r) => r.prefix === 64 && r.network === 0x20010db8000b0000n << 64n)).toBe(true);
  });

  it('speichert die Einstellungen', () => {
    const { net, r2 } = withRipng();
    const parsed = parseProject(serializeProject(net.topology));
    expect(parsed.ok && parsed.topology.devices.find((d) => d.id === r2)?.ripng).toEqual({ interfaces: [0, 1] });
    expect(setRipng(net.topology, r2, { interfaces: [7] })).toMatchObject({ ok: false, error: { code: 'unknownInterface' } });
  });
});
