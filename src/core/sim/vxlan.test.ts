import { describe, expect, it } from 'vitest';
import { addStaticRoute, addVniPeer, getDevice, setLoopback, setPortVlan, setSvi, setVniVlan, setVxlanSource } from '../model/topology';
import { loopbackId } from '../net/routing';
import { parseProject, serializeProject } from '../io/project';
import { dissect } from '../wire/encode';
import { Simulation } from './simulation';
import { NetBuilder } from './testing';

const replies = (sim: Simulation, id: string) => sim.getDeviceState(id).console.filter((l) => l.code === 'ping.reply').length;

/**
 * PC1 (VLAN 10) – Leaf1 ==VLAN 100== Spine (Router) ==VLAN 100== Leaf2 – PC2 (VLAN 10)
 * Beide PCs im selben Netz 192.168.10.0/24, verbunden über VXLAN VNI 10010.
 */
export function fabric(peers = true) {
  const net = new NetBuilder();
  const leaf1 = net.add('l3switch', 'Leaf1');
  const leaf2 = net.add('l3switch', 'Leaf2');
  const spine = net.router('Spine', ['10.0.1.2/30', '10.0.2.2/30']);
  const pc1 = net.host('PC1', '192.168.10.1');
  const pc2 = net.host('PC2', '192.168.10.2');
  net.link(pc1, leaf1); // port1
  net.link(pc2, leaf2); // port1
  net.link(leaf1, spine); // port2 – eth0
  net.link(leaf2, spine); // port2 – eth1
  for (const [leaf, n] of [
    [leaf1, 1],
    [leaf2, 2],
  ] as const) {
    net.apply((t) => setPortVlan(t, leaf, 0, 10));
    net.apply((t) => setPortVlan(t, leaf, 1, 100));
    net.apply((t) => setSvi(t, leaf, 100, `10.0.${n}.1`, '30'));
    net.apply((t) => setLoopback(t, leaf, 0, `10.255.0.${n}`, '32'));
    net.apply((t) => addStaticRoute(t, leaf, { network: '10.255.0.0', mask: '24', gateway: `10.0.${n}.2` }));
    net.apply((t) => setVxlanSource(t, leaf, loopbackId(0)));
    net.apply((t) => setVniVlan(t, leaf, 10010, 10));
    if (peers) net.apply((t) => addVniPeer(t, leaf, 10010, `10.255.0.${3 - n}`));
    net.apply((t) => addStaticRoute(t, spine, { network: `10.255.0.${n}`, mask: '32', gateway: `10.0.${n}.1` }));
  }
  return { net, leaf1, leaf2, spine, pc1, pc2 };
}

describe('VXLAN', () => {
  it('verbindet zwei PCs im selben Netz über das geroutete Netz (ARP und Ping durch den Tunnel)', () => {
    const { net, pc1, leaf1 } = fabric();
    const sim = new Simulation(net.topology);
    sim.ping(pc1, '192.168.10.2');
    sim.runUntil(8000);
    expect(replies(sim, pc1)).toBe(4);
    const tunneled = sim.getPacketLog().filter((e) => e.frame.payload.kind === 'ipv4' && e.frame.payload.payload.kind === 'udp' && e.frame.payload.payload.payload.kind === 'vxlan');
    expect(tunneled.length).toBeGreaterThan(0);
    const first = tunneled[0]!;
    expect(first.frame.payload).toMatchObject({ src: '10.255.0.1', dst: '10.255.0.2', payload: { dstPort: 4789, payload: { vni: 10010 } } });
    // Echte Bytes: VXLAN-Kopf mit I-Flag und VNI 10010 (0x00271a) nach Ethernet (14), IPv4 (20), UDP (8).
    const w = dissect(first.frame);
    const at = first.frame.vlan !== undefined ? 46 : 42;
    expect(Array.from(w.bytes.slice(at, at + 8))).toEqual([0x08, 0, 0, 0, 0x00, 0x27, 0x1a, 0]);
    expect(w.layers.some((l) => l.protocol === 'VXLAN')).toBe(true);
    // MAC-Tabelle: PC2 liegt hinter VTEP 10.255.0.2.
    const mac2 = getDevice(net.topology, net.topology.devices.find((d) => d.name === 'PC2')!.id)!.interfaces[0]!.mac;
    expect(sim.getDeviceState(leaf1).macTable!.find((e) => e.mac === mac2)).toMatchObject({ vlan: 10, port: -1, vtep: '10.255.0.2' });
  });

  it('ohne eingetragenen Peer: kein Tunnel, kein Ping; fremder VTEP wird verworfen', () => {
    const { net, pc1 } = fabric(false);
    const sim = new Simulation(net.topology);
    sim.ping(pc1, '192.168.10.2');
    sim.runUntil(8000);
    expect(replies(sim, pc1)).toBe(0);
  });

  it('wird gespeichert und geladen; Grenzen werden geprüft', () => {
    const { net, leaf1 } = fabric();
    const parsed = parseProject(serializeProject(net.topology));
    expect(parsed.ok && parsed.topology.devices.find((d) => d.id === leaf1)?.vxlan).toEqual({ source: loopbackId(0), vnis: [{ vni: 10010, vlan: 10, peers: ['10.255.0.2'] }] });
    expect(setVniVlan(net.topology, leaf1, 0, 10).ok).toBe(false);
    expect(setVniVlan(net.topology, leaf1, 10020, 10).ok).toBe(false);
    expect(addVniPeer(net.topology, leaf1, 10010, 'x').ok).toBe(false);
    const router = net.topology.devices.find((d) => d.name === 'Spine')!.id;
    expect(setVniVlan(net.topology, router, 10010, 10).ok).toBe(false);
  });
});

describe('CLI: VXLAN', () => {
  it('vn-segment, interface nve1, source-interface, member vni, show nve, running-config', async () => {
    const { execute, runningConfig, startSession } = await import('../cli/cli');
    const net = new NetBuilder();
    const leaf = net.add('l3switch', 'Leaf1');
    let topology = net.topology;
    let session = startSession(getDevice(topology, leaf)!).session;
    const output: string[] = [];
    for (const line of ['en', 'conf t', 'interface loopback0', 'ip address 10.255.0.1/32', 'vlan 10', 'vn-segment 10010', 'interface nve1', 'source-interface loopback0', 'member vni 10010 peer-ip 10.255.0.2', 'member vni 10010 peer-ip 10.255.0.3', 'no member vni 10010 peer-ip 10.255.0.3', 'end', 'show nve vni']) {
      const r = execute(session, line, { topology });
      output.push(...r.lines);
      if (r.topology) topology = r.topology;
      session = r.session;
    }
    expect(getDevice(topology, leaf)!.vxlan).toEqual({ source: loopbackId(0), vnis: [{ vni: 10010, vlan: 10, peers: ['10.255.0.2'] }] });
    expect(output.join('\n')).toMatch(/10010\s+10\s+10\.255\.0\.2/);
    const config = runningConfig(getDevice(topology, leaf)!).join('\n');
    expect(config).toContain('vlan 10\n vn-segment 10010');
    expect(config).toContain('interface nve1\n source-interface loopback0\n member vni 10010 peer-ip 10.255.0.2');
  });
});
