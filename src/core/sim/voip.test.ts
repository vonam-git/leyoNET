import { describe, expect, it } from 'vitest';
import { addStaticRoute, configureHost, setInterfaceAddress, setPoe, setPortRate, setPowerSource, setQos, setSipServer, setVoip } from '../model/topology';
import { dissect } from '../wire/encode';
import { Simulation } from './simulation';
import { NetBuilder } from './testing';

/** Telefonanlage und zwei Telefone an einem Switch. */
function office() {
  const net = new NetBuilder();
  const sw = net.add('switch', 'SW');
  const pbx = net.host('PBX', '192.168.10.5');
  const a = net.add('ipphone', 'Tel 201');
  const b = net.add('ipphone', 'Tel 202');
  net.apply((t) => configureHost(t, a, { ip: '192.168.10.21', mask: '24' }));
  net.apply((t) => configureHost(t, b, { ip: '192.168.10.22', mask: '24' }));
  net.apply((t) => setSipServer(t, pbx, true));
  net.apply((t) => setVoip(t, a, { number: '201', server: '192.168.10.5' }));
  net.apply((t) => setVoip(t, b, { number: '202', server: '192.168.10.5' }));
  for (const id of [pbx, a, b]) net.link(sw, id);
  net.apply((t) => setPoe(t, sw, { standard: 'at', budget: 60 }));
  return { net, sw, pbx, a, b };
}

describe('Telefonie (SIP, RTP)', () => {
  it('meldet die Telefone an und verbindet einen Anruf über die Anlage', () => {
    const { net, pbx, a, b } = office();
    const sim = new Simulation(net.topology);
    sim.runUntil(4000);
    expect(sim.getDeviceState(pbx).sipRegistrations).toEqual([
      { number: '201', address: '192.168.10.21' },
      { number: '202', address: '192.168.10.22' },
    ]);
    expect(sim.getDeviceState(a).voip?.registered).toBe(true);
    sim.call(a, '202', 3);
    sim.runUntil(sim.now + 6000);
    const call = sim.getDeviceState(a).voip!.call!;
    expect(call.phase).toBe('ended');
    expect(call.stats.received).toBeGreaterThan(90);
    expect(call.stats.loss).toBe(0);
    expect(call.stats.quality).toBe('good');
    expect(sim.getDeviceState(b).voip!.call!.stats.received).toBeGreaterThan(90);
    // Ablauf nach RFC 3261: INVITE, 180, 200, ACK, …, BYE, 200.
    const sip = sim.getPacketLog().flatMap((e) => (e.frame.payload.kind === 'ipv4' && e.frame.payload.payload.kind === 'udp' && e.frame.payload.payload.payload.kind === 'sip' && e.from.device === a ? [e.frame.payload.payload.payload.method ?? ''] : []));
    expect(sip).toEqual(['REGISTER', 'INVITE', 'ACK', 'BYE']);
    // RTP ist mit EF (46) markiert, SIP mit CS5 (40); die Bytes zeigen es im TOS-Feld.
    const rtp = sim.getPacketLog().find((e) => e.frame.payload.kind === 'ipv4' && e.frame.payload.payload.kind === 'udp' && e.frame.payload.payload.payload.kind === 'rtp')!;
    expect(rtp.frame.payload.kind === 'ipv4' && rtp.frame.payload.dscp).toBe(46);
    const bytes = dissect(rtp.frame).bytes;
    expect(bytes[15]).toBe(46 << 2);
    expect(dissect(rtp.frame).layers.map((l) => l.protocol)).toContain('RTP');
  });

  it('unbekannte Rufnummer: 404; direkter Anruf an eine IP-Adresse ohne Anlage', () => {
    const { net, a, b } = office();
    let sim = new Simulation(net.topology);
    sim.runUntil(4000);
    sim.call(a, '299', 2);
    sim.runUntil(sim.now + 2000);
    expect(sim.getDeviceState(a).voip!.call).toMatchObject({ phase: 'failed', reason: '404' });
    net.apply((t) => setVoip(t, a, null));
    net.apply((t) => setVoip(t, b, null));
    sim = new Simulation(net.topology);
    sim.runUntil(2000);
    sim.call(a, '192.168.10.22', 2);
    sim.runUntil(sim.now + 5000);
    expect(sim.getDeviceState(a).voip!.call!.stats.received).toBeGreaterThan(50);
  });
});

describe('QoS bei einem Engpass', () => {
  /** Zwei Standorte, WAN zwischen den Routern mit 1 Mbit/s; ein PC erzeugt 3 Mbit/s Last. */
  function wan(qos: boolean) {
    const net = new NetBuilder();
    const r1 = net.router('R1', ['192.168.1.1/24', '10.0.0.1/30']);
    const r2 = net.router('R2', ['192.168.2.1/24', '10.0.0.2/30']);
    net.apply((t) => addStaticRoute(t, r1, { network: '192.168.2.0', mask: '255.255.255.0', gateway: '10.0.0.2' }));
    net.apply((t) => addStaticRoute(t, r2, { network: '192.168.1.0', mask: '255.255.255.0', gateway: '10.0.0.1' }));
    const a = net.add('ipphone', 'Tel A');
    const b = net.add('ipphone', 'Tel B');
    const pc = net.host('PC', '192.168.1.10', '24', '192.168.1.1');
    const srv = net.host('Server', '192.168.2.10', '24', '192.168.2.1');
    net.apply((t) => configureHost(t, a, { ip: '192.168.1.21', mask: '24', gateway: '192.168.1.1' }));
    net.apply((t) => configureHost(t, b, { ip: '192.168.2.22', mask: '24', gateway: '192.168.2.1' }));
    const s1 = net.add('switch', 'S1');
    const s2 = net.add('switch', 'S2');
    for (const id of [r1, a, pc]) net.link(s1, id);
    for (const id of [r2, b, srv]) net.link(s2, id);
    net.link(r1, r2);
    for (const s of [s1, s2]) net.apply((t) => setPoe(t, s, { standard: 'af', budget: 30 }));
    net.apply((t) => setPortRate(t, r1, 1, 1000));
    if (qos) net.apply((t) => setQos(t, r1, {}));
    const sim = new Simulation(net.topology);
    sim.runUntil(2000);
    sim.ping(pc, '192.168.2.10');
    sim.ping(a, '192.168.2.22');
    sim.runUntil(sim.now + 5000);
    sim.iperf(pc, '192.168.2.10', 3000, 8);
    sim.call(a, '192.168.2.22', 6);
    sim.runUntil(sim.now + 9000);
    return { sim, a, b };
  }

  it('ohne QoS leidet das Gespräch, mit Priority Queuing für EF nicht', () => {
    const without = wan(false);
    const bad = without.sim.getDeviceState(without.b).voip!.call!.stats;
    expect(bad.quality).toBe('poor');
    expect(without.sim.getPacketLog().some((e) => e.lostBecause === 'queueFull')).toBe(true);
    const withQos = wan(true);
    const good = withQos.sim.getDeviceState(withQos.b).voip!.call!.stats;
    expect(good.loss).toBe(0);
    expect(good.quality).toBe('good');
  });
});


describe('SIP-Provider im Internet, Telefone hinter NAT', () => {
  /** Zwei Heimnetze mit Internet-Box (beide 192.168.1.0/24), dazwischen der Provider mit SIP-Server. */
  function homes() {
    const net = new NetBuilder();
    const isp = net.router('Internet', ['203.0.113.1/30', '203.0.113.5/30', '198.51.100.1/24'], 'internet');
    const sip = net.host('SIP-Provider', '198.51.100.50', '24', '198.51.100.1');
    net.apply((t) => setSipServer(t, sip, true));
    const phones: string[] = [];
    for (const [n, wan, gw] of [['1', '203.0.113.2', '203.0.113.1'], ['2', '203.0.113.6', '203.0.113.5']] as const) {
      const cpe = net.add('cpe', `Box ${n}`);
      net.apply((t) => setInterfaceAddress(t, cpe, 0, wan, '255.255.255.252'));
      net.apply((t) => addStaticRoute(t, cpe, { network: '0.0.0.0', mask: '0.0.0.0', gateway: gw }));
      const phone = net.add('ipphone', `Telefon ${n}`);
      net.apply((t) => configureHost(t, phone, { ip: '', mask: '', dhcp: true }));
      net.apply((t) => setPowerSource(t, phone, 'local'));
      net.apply((t) => setVoip(t, phone, { number: `04412345${n}0`, server: '198.51.100.50' }));
      net.link(cpe, isp);
      net.link(phone, cpe);
      phones.push(phone);
    }
    net.link(sip, isp);
    return { net, sip, phones };
  }

  it('meldet beide Telefone über NAT an, verbindet und leitet die Sprache über den Provider', () => {
    const { net, sip, phones } = homes();
    const sim = new Simulation(net.topology);
    sim.runUntil(8000);
    const regs = sim.getDeviceState(sip).sipRegistrations!;
    expect(regs).toHaveLength(2);
    // Gesehen wird die öffentliche Adresse der Internet-Box mit übersetztem Port.
    expect(regs.every((r) => r.nat && /^203\.0\.113\.[26]:\d+$/.test(r.address))).toBe(true);
    sim.call(phones[0]!, '0441234520', 3);
    sim.runUntil(sim.now + 6000);
    const a = sim.getDeviceState(phones[0]!).voip!.call!;
    const b = sim.getDeviceState(phones[1]!).voip!.call!;
    expect(a.phase).toBe('ended');
    expect(a.stats.received).toBeGreaterThan(80);
    expect(b.stats.received).toBeGreaterThan(80);
    expect(a.stats.quality).toBe('good');
    // Die Sprache läuft über den Provider (Media-Relay), nie an eine private Adresse ins Internet.
    const rtpToPrivate = sim.getPacketLog().some((e) => e.frame.payload.kind === 'ipv4' && e.frame.payload.payload.kind === 'udp' && e.frame.payload.payload.payload.kind === 'rtp' && e.from.device === sip && e.frame.payload.dst.startsWith('192.168.'));
    expect(rtpToPrivate).toBe(false);
  });
});
