import { describe, expect, it } from 'vitest';
import { addVpnTunnel, setDefaultGateway, setFirewall, setInterfaceNat } from '../model/topology';
import type { FirewallConfig } from '../model/security';
import { dissect } from '../wire/encode';
import { Simulation } from './simulation';
import { NetBuilder, describe as line } from './testing';

const replies = (sim: Simulation, id: string) => sim.getDeviceState(id).console.filter((l) => l.code === 'ping.reply');
const codes = (sim: Simulation, id: string) => sim.getDeviceState(id).console.map((l) => l.code);

/** PC (LAN 192.168.1.0/24) — Router — Webserver (DMZ 192.168.2.0/24). */
function dmz() {
  const net = new NetBuilder();
  const pc = net.host('PC', '192.168.1.10', '24', '192.168.1.1');
  const r = net.router('Router', ['192.168.1.1/24', '192.168.2.1/24']);
  const web = net.host('Web', '192.168.2.80', '24', '192.168.2.1');
  net.webServer(web, { '/index.html': '<h1>DMZ</h1>' });
  net.link(pc, r);
  net.link(r, web);
  return { net, pc, r, web };
}

const onlyWeb: FirewallConfig = { defaultAction: 'deny', rules: [{ action: 'allow', protocol: 'tcp', src: 'any', dst: '192.168.2.80', port: 80 }] };

describe('Firewall', () => {
  it('Router: nur HTTP zum Webserver erlaubt, Ping gesperrt; Antworten kommen zurück (zustandsbehaftet)', () => {
    const { net, pc, r } = dmz();
    net.apply((t) => setFirewall(t, r, onlyWeb));
    const sim = new Simulation(net.topology);
    sim.ping(pc, '192.168.2.80');
    sim.runUntil(6000);
    expect(replies(sim, pc)).toHaveLength(0);
    expect(codes(sim, r)).toContain('firewall.blocked');
    sim.browse(pc, 'http://192.168.2.80/');
    sim.runUntil(10_000);
    expect(sim.getDeviceState(pc).browser?.response?.body).toContain('DMZ');
    const fw = sim.getDeviceState(r).firewall!;
    expect(fw.hits[0]).toBeGreaterThan(0);
    expect(fw.blocked).toBeGreaterThanOrEqual(2);
  });

  it('zustandslos braucht auch die Antwort eine Regel', () => {
    const { net, pc, r } = dmz();
    net.apply((t) => setFirewall(t, r, { ...onlyWeb, stateful: false }));
    const sim = new Simulation(net.topology);
    sim.browse(pc, 'http://192.168.2.80/');
    sim.runUntil(8000);
    expect(sim.getDeviceState(pc).browser?.response?.body ?? '').not.toContain('DMZ');
  });

  it('Endgerät: eingehender Ping gesperrt, eigene Pings bekommen Antworten', () => {
    const { net, pc, web } = dmz();
    net.apply((t) => setFirewall(t, web, onlyWeb));
    const sim = new Simulation(net.topology);
    sim.ping(pc, '192.168.2.80');
    sim.runUntil(6000);
    expect(replies(sim, pc)).toHaveLength(0);
    sim.ping(web, '192.168.1.10');
    sim.runUntil(12_000);
    expect(replies(sim, web).length).toBeGreaterThanOrEqual(3);
  });
});

/** PC A — R1 ==Internet== R2 — PC B, beide Router mit NAT ins Internet. */
function sites(keyB = 'geheim123') {
  const net = new NetBuilder();
  const a = net.host('PC A', '10.1.0.10', '24', '10.1.0.1');
  const b = net.host('PC B', '10.2.0.10', '24', '10.2.0.1');
  const r1 = net.router('R1', ['10.1.0.1/24', '198.51.100.1/30']);
  const r2 = net.router('R2', ['203.0.113.1/30', '10.2.0.1/24']);
  const isp = net.internet('Internet', ['198.51.100.2/30', '203.0.113.2/30']);
  net.link(a, r1);
  net.link(r1, isp);
  net.link(r2, isp);
  net.link(r2, b);
  net.apply((t) => setDefaultGateway(t, r1, '198.51.100.2'));
  net.apply((t) => setDefaultGateway(t, r2, '203.0.113.2'));
  net.apply((t) => setInterfaceNat(t, r1, 1, true));
  net.apply((t) => setInterfaceNat(t, r2, 0, true));
  return { net, a, b, r1, r2, isp, keyB };
}

function withVpn(keyB = 'geheim123') {
  const s = sites();
  s.net.apply((t) => addVpnTunnel(t, s.r1, { name: 'Zürich – Bern', peer: '203.0.113.1', local: '10.1.0.0/24', remote: '10.2.0.0/24', key: 'geheim123' }));
  s.net.apply((t) => addVpnTunnel(t, s.r2, { name: 'Bern – Zürich', peer: '198.51.100.1', local: '10.2.0.0/24', remote: '10.1.0.0/24', key: keyB }));
  return s;
}

describe('VPN (IPsec)', () => {
  it('ohne VPN kommt nichts an: das Internet verwirft private Adressen', () => {
    const { net, a } = sites();
    const sim = new Simulation(net.topology);
    sim.ping(a, '10.2.0.10');
    sim.runUntil(10_000);
    expect(replies(sim, a)).toHaveLength(0);
  });

  it('IKEv2 baut den Tunnel auf, Pakete laufen verschlüsselt in ESP', () => {
    const { net, a, r1, r2, isp } = withVpn();
    const sim = new Simulation(net.topology);
    sim.ping(a, '10.2.0.10');
    sim.runUntil(10_000);
    expect(replies(sim, a).length).toBeGreaterThanOrEqual(3);
    expect(codes(sim, r1)).toContain('vpn.up');
    expect(codes(sim, r2)).toContain('vpn.up');
    expect(sim.getDeviceState(r1).vpn?.[0]).toMatchObject({ status: 'up' });
    const log = sim.getPacketLog().map((e) => line(net.topology, e));
    expect(log.some((l) => l.includes('IKEv2 IKE_SA_INIT'))).toBe(true);
    expect(log.some((l) => l.includes('IKEv2 IKE_AUTH response'))).toBe(true);
    expect(log.some((l) => l.startsWith('R1→Internet ESP') && l.includes('198.51.100.1>203.0.113.1'))).toBe(true);
    // Im Internet tauchen keine privaten Adressen auf.
    const onWire = sim.getPacketLog().filter((e) => e.from.device === isp || e.to.device === isp);
    expect(onWire.every((e) => e.frame.payload.kind !== 'ipv4' || !e.frame.payload.dst.startsWith('10.'))).toBe(true);
    // Mitschnitt: ESP mit SPI, verschlüsselte Nutzlast, kein lesbares ICMP.
    const esp = sim.getPacketLog().find((e) => e.frame.payload.kind === 'ipv4' && e.frame.payload.payload.kind === 'esp')!;
    const w = dissect(esp.frame);
    expect(w.layers.map((l) => l.protocol)).toContain('ESP (IPsec)');
    expect(w.layers.map((l) => l.protocol)).not.toContain('ICMP');
  });

  it('falscher Schlüssel: Authentisierung scheitert, nichts kommt durch', () => {
    const { net, a, r1, r2 } = withVpn('anders');
    const sim = new Simulation(net.topology);
    sim.ping(a, '10.2.0.10');
    sim.runUntil(10_000);
    expect(replies(sim, a)).toHaveLength(0);
    expect(codes(sim, r2)).toContain('vpn.authFailed');
    expect(codes(sim, r1)).toContain('vpn.authFailed');
  });

  it('Traceroute durch den Tunnel zeigt nur die zwei Router', () => {
    const { net, a } = withVpn();
    const sim = new Simulation(net.topology);
    sim.ping(a, '10.2.0.10');
    sim.runUntil(6000);
    sim.traceroute(a, '10.2.0.10');
    sim.runUntil(20_000);
    expect(sim.getDeviceState(a).console.filter((l) => l.code === 'tracert.hop')).toHaveLength(3);
    expect(codes(sim, a)).toContain('tracert.done');
  });
});
