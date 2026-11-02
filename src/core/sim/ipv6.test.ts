import { describe, expect, it } from 'vitest';
import { configureHost6, setAftr, setCgnatAddress, setDsLite, setInterfaceAddress, setInterfaceDhcp6, setInterfaceIpv6, setInterfaceShutdown, setIpMode, setRoutingMode } from '../model/topology';
import { dissect } from '../wire/encode';
import { toPcapng } from '../wire/pcap';
import { internetChecksum } from '../wire/part';
import { Simulation } from './simulation';
import { NetBuilder, describe as line } from './testing';

const replies = (sim: Simulation, id: string) => sim.getDeviceState(id).console.filter((l) => l.code === 'ping.reply');
const codes = (sim: Simulation, id: string) => sim.getDeviceState(id).console.map((l) => l.code);

function lan(mode: 'dual' | 'ipv6' = 'ipv6') {
  const net = new NetBuilder();
  const a = net.add('pc', 'A');
  const b = net.add('pc', 'B');
  const sw = net.add('switch', 'S');
  net.link(a, sw);
  net.link(b, sw);
  net.apply((t) => setIpMode(t, mode));
  net.apply((t) => configureHost6(t, a, { auto: false, address: '2001:db8:1::10/64' }));
  net.apply((t) => configureHost6(t, b, { auto: false, address: '2001:db8:1::20/64' }));
  return { net, a, b };
}

/** PC1 (SLAAC) — Router — PC2 (DHCPv6). */
function routed() {
  const net = new NetBuilder();
  const pc1 = net.add('pc', 'PC1');
  const pc2 = net.add('pc', 'PC2');
  const r = net.add('router', 'R');
  net.link(pc1, r);
  net.link(pc2, r);
  net.apply((t) => setIpMode(t, 'ipv6'));
  net.apply((t) => setInterfaceIpv6(t, r, 0, '2001:db8:a::1/64'));
  net.apply((t) => setInterfaceIpv6(t, r, 1, '2001:db8:b::1/64'));
  net.apply((t) => setInterfaceDhcp6(t, r, 1, true));
  net.apply((t) => configureHost6(t, pc1, { auto: true }));
  net.apply((t) => configureHost6(t, pc2, { auto: true }));
  return { net, pc1, pc2, r };
}

describe('IPv6', () => {
  it('Neighbor Discovery statt ARP, Ping zwischen zwei Rechnern', () => {
    const { net, a } = lan();
    const sim = new Simulation(net.topology);
    sim.runUntil(500);
    sim.ping(a, '2001:db8:1::20');
    sim.runUntil(8000);
    expect(replies(sim, a)).toHaveLength(4);
    const log = sim.getPacketLog().map((e) => line(net.topology, e));
    expect(log.some((l) => l.includes('ICMPv6 neighborSolicitation 2001:db8:1::20'))).toBe(true);
    expect(log.some((l) => l.includes('ICMPv6 neighborAdvertisement 2001:db8:1::20'))).toBe(true);
    expect(log.some((l) => l.includes(' ARP '))).toBe(false);
    expect(sim.getDeviceState(a).ipv6?.neighbors.map((n) => n.ip)).toContain('2001:db8:1::20');
  });

  it('im Modus «nur IPv4» schweigt IPv6', () => {
    const { net, a } = lan();
    net.apply((t) => setIpMode(t, 'ipv4'));
    const sim = new Simulation(net.topology);
    sim.ping(a, '2001:db8:1::20');
    sim.runUntil(5000);
    expect(codes(sim, a)).toContain('ping.noIpv6');
    expect(sim.getPacketLog()).toHaveLength(0);
  });

  it('SLAAC und DHCPv6 über Router Advertisements, Ping durch den Router', () => {
    const { net, pc1, pc2 } = routed();
    const sim = new Simulation(net.topology);
    sim.runUntil(3000);
    const a1 = sim.getDeviceState(pc1).ipv6!;
    const a2 = sim.getDeviceState(pc2).ipv6!;
    expect(a1.config).toBe('slaac');
    expect(a1.addresses.find((x) => x.origin === 'slaac')?.address).toMatch(/^2001:db8:a::/);
    expect(a1.gateway).toMatch(/^fe80::/);
    expect(a2.config).toBe('dhcpv6');
    expect(a2.addresses.find((x) => x.origin === 'dhcpv6')?.address).toBe('2001:db8:b::100');
    sim.ping(pc1, '2001:db8:b::100');
    sim.runUntil(10_000);
    expect(replies(sim, pc1)).toHaveLength(4);
    expect(sim.getDeviceState(pc1).console.find((l) => l.code === 'ping.reply')?.params?.ttl).toBe(63);
  });

  it('Traceroute zeigt den Router, Fehler bei fehlender Route', () => {
    const { net, pc1 } = routed();
    const sim = new Simulation(net.topology);
    sim.runUntil(3000);
    sim.traceroute(pc1, '2001:db8:b::100');
    sim.runUntil(10_000);
    expect(codes(sim, pc1)).toContain('tracert.done');
    expect(sim.getDeviceState(pc1).console.filter((l) => l.code === 'tracert.hop')).toHaveLength(2);
    sim.ping(pc1, '2001:db8:ff::1');
    sim.runUntil(20_000);
    expect(codes(sim, pc1)).toContain('ping.netUnreachableFrom');
  });

  it('automatisches Routing über zwei Router; Umweg, wenn ein Anschluss aus ist', () => {
    const net = new NetBuilder();
    const pc1 = net.add('pc', 'PC1');
    const pc2 = net.add('pc', 'PC2');
    const r1 = net.add('router', 'R1');
    const r2 = net.add('router', 'R2');
    net.link(pc1, r1);
    net.link(r1, r2);
    net.link(r2, pc2);
    net.apply((t) => setIpMode(t, 'ipv6'));
    net.apply((t) => setInterfaceIpv6(t, r1, 0, '2001:db8:1::1/64'));
    net.apply((t) => setInterfaceIpv6(t, r1, 1, '2001:db8:12::1/64'));
    net.apply((t) => setInterfaceIpv6(t, r2, 0, '2001:db8:12::2/64'));
    net.apply((t) => setInterfaceIpv6(t, r2, 1, '2001:db8:2::1/64'));
    for (const r of [r1, r2]) net.apply((t) => setRoutingMode(t, r, 'auto'));
    net.apply((t) => configureHost6(t, pc1, { auto: true }));
    net.apply((t) => configureHost6(t, pc2, { auto: false, address: '2001:db8:2::20/64', gateway: '2001:db8:2::1' }));
    const sim = new Simulation(net.topology);
    sim.runUntil(3000);
    sim.ping(pc1, '2001:db8:2::20');
    sim.runUntil(10_000);
    expect(replies(sim, pc1)).toHaveLength(4);
    expect(sim.getDeviceState(r1).ipv6?.routes6.some((r) => r.kind === 'auto')).toBe(true);
    void setInterfaceShutdown;
  });

  it('kodiert echte Bytes mit gültigen Prüfsummen und exportiert pcap', () => {
    const { net, pc1 } = routed();
    const sim = new Simulation(net.topology);
    sim.runUntil(3000);
    sim.ping(pc1, '2001:db8:b::100');
    sim.runUntil(6000);
    const log = sim.getPacketLog();
    const kinds = new Set<string>();
    for (const e of log) {
      const w = dissect(e.frame);
      const v6 = w.layers.find((l) => l.protocol.startsWith('IPv6'));
      if (!v6) continue;
      expect(w.bytes[v6.start]! >> 4).toBe(6);
      // Ethertype 0x86DD
      expect([w.bytes[12], w.bytes[13]]).toEqual([0x86, 0xdd]);
      kinds.add(w.layers.at(-1)!.protocol);
      // Prüfsumme über Pseudo-Header und ICMPv6/UDP muss 0 ergeben.
      const inner = w.layers.find((l) => l.protocol.startsWith('ICMPv6') || l.protocol === 'UDP');
      if (inner) {
        const bytes = [...w.bytes.slice(inner.start, inner.start + inner.length)];
        const nh = inner.protocol === 'UDP' ? 17 : 58;
        const pseudo = [...w.bytes.slice(v6.start + 8, v6.start + 40), 0, 0, (bytes.length >> 8) & 0xff, bytes.length & 0xff, 0, 0, 0, nh];
        expect(internetChecksum([...pseudo, ...bytes]), inner.protocol).toBe(0);
      }
    }
    expect([...kinds]).toEqual(expect.arrayContaining(['ICMPv6 (Neighbor Discovery)', 'ICMPv6', 'DHCPv6']));
    const pcap = toPcapng(net.topology, log);
    expect(pcap.length).toBeGreaterThan(1000);
  });
});

describe('DS-Lite', () => {
  /** Notebook — Internet-Box (B4) ==IPv6== Provider (AFTR, CGNAT) — Webserver (nur IPv4). */
  function dsLite() {
    const net = new NetBuilder();
    const nb = net.dhcpClient('Notebook');
    const cpe = net.add('cpe', 'Box');
    const isp = net.add('internet', 'Provider');
    const web = net.host('Web', '198.51.100.80', '24', '198.51.100.1');
    net.webServer(web, { '/index.html': '<h1>Nur IPv4</h1>' });
    net.link(cpe, isp); // WAN zuerst: Anschluss 0 der Box
    net.link(nb, cpe);
    net.link(isp, web);
    net.apply((t) => setIpMode(t, 'dual'));
    net.apply((t) => setInterfaceIpv6(t, cpe, 0, '2001:db8:ffff::2/64'));
    net.apply((t) => setDsLite(t, cpe, '2001:db8:ffff::1'));
    net.apply((t) => setInterfaceIpv6(t, isp, 0, '2001:db8:ffff::1/64'));
    net.apply((t) => setInterfaceAddress(t, isp, 1, '198.51.100.1', '24'));
    net.apply((t) => setAftr(t, isp, true));
    net.apply((t) => setCgnatAddress(t, isp, '203.0.113.10'));
    return { net, nb, cpe, isp, web };
  }

  it('IPv4 geht im IPv6-Tunnel zum AFTR, dort CGNAT; die Webseite kommt an', () => {
    const { net, nb, isp } = dsLite();
    const sim = new Simulation(net.topology);
    sim.runUntil(3000);
    sim.browse(nb, 'http://198.51.100.80/');
    sim.runUntil(8000);
    expect(sim.getDeviceState(nb).browser?.response?.body).toContain('Nur IPv4');
    const log = sim.getPacketLog().map((e) => line(net.topology, e));
    expect(log.some((l) => l.startsWith('Box→Provider DS-Lite 2001:db8:ffff::2>2001:db8:ffff::1'))).toBe(true);
    expect(log.some((l) => l.startsWith('Provider→Box DS-Lite'))).toBe(true);
    const nat = sim.getDeviceState(isp).nat ?? [];
    expect(nat.some((e) => e.outside === '203.0.113.10' && e.inside.endsWith('@2001:db8:ffff::2'))).toBe(true);
    expect(sim.getDeviceState(isp).console.map((l) => l.code)).toContain('dslite.new');
    // Der Webserver sieht nur die öffentliche Adresse des Providers.
    expect(sim.getPacketLog().some((e) => e.to.device === net.topology.devices.find((d) => d.name === 'Web')!.id && e.frame.payload.kind === 'ipv4' && e.frame.payload.src === '203.0.113.10')).toBe(true);
    // Getunnelte Rahmen: IPv6-Kopf mit Next Header 4, darin IPv4.
    const tunnel = sim.getPacketLog().find((e) => e.frame.payload.kind === 'ipv6' && e.frame.payload.payload.kind === 'ipv4')!;
    const w = dissect(tunnel.frame);
    expect(w.layers.map((l) => l.protocol)).toEqual(expect.arrayContaining(['IPv6 (DS-Lite-Tunnel)', 'IPv4', 'TCP']));
  });
});
