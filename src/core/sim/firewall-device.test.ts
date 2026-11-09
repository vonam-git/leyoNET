import { describe, expect, it } from 'vitest';
import { firewallDefaults, getDevice, setAccessList, setFirewall, setInterfaceAddress, setInterfaceCount, setPortAccessList, setPortVlan } from '../model/topology';
import { parseProject, serializeProject } from '../io/project';
import { Simulation } from './simulation';
import { NetBuilder } from './testing';

const replies = (sim: Simulation, id: string) => sim.getDeviceState(id).console.filter((l) => l.code === 'ping.reply').length;
const codes = (sim: Simulation, id: string) => sim.getDeviceState(id).console.map((l) => l.code);

/** Internet-PC (WAN 203.0.113.0/24) — Firewall — LAN-PC (192.168.1.0/24), DMZ-Webserver (192.168.2.0/24). */
function zones() {
  const net = new NetBuilder();
  const fw = net.add('firewall', 'FW');
  ['203.0.113.1', '192.168.1.1', '192.168.2.1'].forEach((ip, i) => net.apply((t) => setInterfaceAddress(t, fw, i, ip, '24')));
  const outside = net.host('Aussen', '203.0.113.10', '24', '203.0.113.1');
  const lan = net.host('LAN', '192.168.1.10', '24', '192.168.1.1');
  const web = net.host('Web', '192.168.2.80', '24', '192.168.2.1');
  net.webServer(web, { '/index.html': '<h1>DMZ</h1>' });
  net.link(fw, outside);
  net.link(fw, lan);
  net.link(fw, web);
  return { net, fw, outside, lan, web };
}

describe('Firewall als Gerät', () => {
  it('ab Werk: zustandsbehaftet, von innen nach aussen offen, vom WAN gesperrt', () => {
    const { net, fw, outside, lan } = zones();
    expect(getDevice(net.topology, fw)!.firewall).toEqual(firewallDefaults(getDevice(net.topology, fw)!));
    expect(getDevice(net.topology, fw)!.firewall!.defaultAction).toBe('deny');
    const sim = new Simulation(net.topology);
    sim.ping(lan, '203.0.113.10');
    sim.runUntil(6000);
    expect(replies(sim, lan)).toBe(4);
    sim.ping(outside, '192.168.1.10');
    sim.runUntil(12_000);
    expect(replies(sim, outside)).toBe(0);
    expect(codes(sim, fw)).toContain('firewall.blocked');
  });

  it('Regel für den Webserver in der DMZ öffnet nur HTTP von aussen', () => {
    const { net, fw, outside } = zones();
    const base = getDevice(net.topology, fw)!.firewall!;
    net.apply((t) => setFirewall(t, fw, { ...base, rules: [{ action: 'allow', protocol: 'tcp', src: 'any', dst: '192.168.2.80', port: 80, iface: 0 }, ...base.rules] }));
    const sim = new Simulation(net.topology);
    sim.browse(outside, 'http://192.168.2.80/');
    sim.runUntil(8000);
    expect(sim.getDeviceState(outside).browser?.response?.body).toContain('DMZ');
  });

  it('Regeln folgen den Anschlüssen, wenn Ports wegfallen', () => {
    const net = new NetBuilder();
    const fw = net.add('firewall', 'FW');
    expect(getDevice(net.topology, fw)!.firewall!.rules.map((r) => r.iface)).toEqual([1, 2, 3]);
    net.apply((t) => setInterfaceCount(t, fw, 2));
    expect(getDevice(net.topology, fw)!.firewall!.rules.map((r) => r.iface)).toEqual([1]);
  });

  it('wird gespeichert und geladen', () => {
    const { net } = zones();
    const parsed = parseProject(serializeProject(net.topology));
    expect(parsed.ok && parsed.topology.devices.find((d) => d.type === 'firewall')?.firewall?.rules).toHaveLength(3);
  });
});

/** Zwei PCs und ein Server an einem Switch; ACL am Port von PC 1. */
function acl() {
  const net = new NetBuilder();
  const sw = net.add('switch', 'SW');
  const pc1 = net.host('PC1', '192.168.10.11');
  const pc2 = net.host('PC2', '192.168.10.12');
  const srv = net.host('Srv', '192.168.10.80');
  net.webServer(srv, { '/index.html': '<h1>Intern</h1>' });
  net.link(pc1, sw);
  net.link(pc2, sw);
  net.link(srv, sw);
  return { net, sw, pc1, pc2, srv };
}

describe('Zugriffslisten (ACL) auf Switches', () => {
  it('nur HTTP zum Server erlaubt, Ping an den Server und an PC2 verworfen (implizites deny)', () => {
    const { net, sw, pc1, pc2 } = acl();
    net.apply((t) => setAccessList(t, sw, 'NUR-WEB', [{ action: 'allow', protocol: 'tcp', src: '192.168.10.0/24', dst: '192.168.10.80', port: 80 }]));
    net.apply((t) => setPortAccessList(t, sw, 0, 'NUR-WEB'));
    const sim = new Simulation(net.topology);
    sim.ping(pc1, '192.168.10.12');
    sim.runUntil(6000);
    expect(replies(sim, pc1)).toBe(0);
    expect(codes(sim, sw)).toContain('acl.denied');
    sim.browse(pc1, 'http://192.168.10.80/');
    sim.runUntil(12_000);
    expect(sim.getDeviceState(pc1).browser?.response?.body).toContain('Intern');
    // Andere Ports sind nicht betroffen.
    sim.ping(pc2, '192.168.10.80');
    sim.runUntil(18_000);
    expect(replies(sim, pc2)).toBe(4);
    const state = sim.getDeviceState(sw).acls![0]!;
    expect(state.hits[0]).toBeGreaterThan(0);
    expect(state.implicitDeny).toBeGreaterThan(0);
  });

  it('ARP geht immer durch; fehlende Liste lässt alles durch', () => {
    const { net, sw, pc1 } = acl();
    net.apply((t) => setPortAccessList(t, sw, 0, 'FEHLT'));
    const sim = new Simulation(net.topology);
    sim.ping(pc1, '192.168.10.12');
    sim.runUntil(6000);
    expect(replies(sim, pc1)).toBe(4);
  });

  it('Liste ersetzen, löschen, prüfen und speichern', () => {
    const { net, sw } = acl();
    net.apply((t) => setAccessList(t, sw, 'A', [{ action: 'deny', protocol: 'icmp', src: 'any', dst: 'any' }]));
    net.apply((t) => setAccessList(t, sw, 'A', [{ action: 'allow', protocol: 'any', src: '10.0.0.1', dst: 'any' }]));
    expect(getDevice(net.topology, sw)!.acls).toEqual([{ name: 'A', rules: [{ action: 'allow', protocol: 'any', src: '10.0.0.1', dst: 'any' }] }]);
    expect(setAccessList(net.topology, sw, 'böse name', []).ok).toBe(false);
    expect(setAccessList(net.topology, sw, 'B', [{ action: 'allow', protocol: 'icmp', src: 'any', dst: 'any', port: 80 }]).ok).toBe(false);
    net.apply((t) => setPortAccessList(t, sw, 1, 'A'));
    net.apply((t) => setPortVlan(t, sw, 1, 1));
    const parsed = parseProject(serializeProject(net.topology));
    expect(parsed.ok && parsed.topology.devices.find((d) => d.id === sw)).toMatchObject({ acls: [{ name: 'A' }], interfaces: expect.arrayContaining([expect.objectContaining({ aclIn: 'A' })]) });
    net.apply((t) => setAccessList(t, sw, 'A', null));
    expect(getDevice(net.topology, sw)!.acls).toBeUndefined();
  });

  it('Projektdatei mit ACL auf einem Router wird abgelehnt', () => {
    const net = new NetBuilder();
    net.add('router', 'R');
    const data = JSON.parse(serializeProject(net.topology));
    data.topology.devices[0].acls = [{ name: 'X', rules: [] }];
    expect(parseProject(JSON.stringify(data)).ok).toBe(false);
  });
});

describe('Firewall als Gerät schützt sich selbst', () => {
  it('Ping an die WAN-Adresse wird blockiert, an die LAN-Adresse beantwortet; eigene Pings kommen zurück', () => {
    const { net, fw, outside, lan } = zones();
    const sim = new Simulation(net.topology);
    sim.ping(outside, '203.0.113.1');
    sim.runUntil(6000);
    expect(replies(sim, outside)).toBe(0);
    sim.ping(lan, '192.168.1.1');
    sim.runUntil(12_000);
    expect(replies(sim, lan)).toBe(4);
    sim.ping(fw, '203.0.113.10');
    sim.runUntil(18_000);
    expect(replies(sim, fw)).toBe(4);
  });
});
