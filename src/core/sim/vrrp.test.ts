import { describe as group, expect, it } from 'vitest';
import { dissect } from '../wire/encode';
import { removeCable, removeVrrpGroup, setStp, setSvi, setVrrpGroup } from '../model/topology';
import { sviId } from '../net/routing';
import { parseProject, serializeProject } from '../io/project';
import { vrrpMac } from './frames';
import { masterDownInterval } from './vrrp';
import { Simulation } from './simulation';
import { NetBuilder, unwrap } from './testing';

/**
 * PC im LAN 192.168.1.0/24, Server im Netz 10.0.0.0/24. R1 und R2 verbinden beide Netze;
 * in jedem Netz teilen sie sich eine virtuelle Gateway-Adresse (.1). R1 hat die höhere Priorität.
 */
function redundant(options: { r1Priority?: number; preemptR2?: boolean; accept?: boolean } = {}) {
  const net = new NetBuilder();
  const pc = net.host('PC', '192.168.1.10', '24', '192.168.1.1');
  const server = net.host('Server', '10.0.0.10', '24', '10.0.0.1');
  const r1 = net.router('R1', ['192.168.1.2/24', '10.0.0.2/24']);
  const r2 = net.router('R2', ['192.168.1.3/24', '10.0.0.3/24']);
  const lan = net.add('switch', 'LAN');
  const dmz = net.add('switch', 'DMZ');
  net.link(pc, lan);
  const r1lan = net.link(r1, lan);
  net.link(r2, lan);
  net.link(server, dmz);
  net.link(r1, dmz);
  net.link(r2, dmz);
  const prio = options.r1Priority ?? 110;
  for (const [router, priority] of [[r1, prio], [r2, 100]] as const) {
    net.apply((t) => setVrrpGroup(t, router, { iface: 0, vrid: 1, ip: '192.168.1.1', priority, ...(options.accept ? { accept: true } : {}) }));
    net.apply((t) => setVrrpGroup(t, router, { iface: 1, vrid: 2, ip: '10.0.0.1', priority }));
  }
  return { net, pc, server, r1, r2, lan, r1lan };
}

const stateOf = (sim: Simulation, id: string, vrid: number) => sim.getDeviceState(id).vrrp?.find((g) => g.vrid === vrid)?.state;
const replies = (sim: Simulation, id: string) => sim.getDeviceState(id).console.filter((l) => l.code === 'ping.reply').length;

group('VRRP (RFC 9568)', () => {
  it('wählt den Router mit der höheren Priorität zum Master, das Backup schweigt', () => {
    const { net, r1, r2 } = redundant();
    const sim = new Simulation(net.topology);
    sim.runUntil(6000);
    expect(stateOf(sim, r1, 1)).toBe('master');
    expect(stateOf(sim, r2, 1)).toBe('backup');
    expect(sim.getDeviceState(r2).vrrp?.find((g) => g.vrid === 1)?.master).toBe('192.168.1.2');
    // Advertisements: an 224.0.0.18, TTL 255, Absender-MAC ist die virtuelle MAC, nur vom Master.
    const adverts = sim.getPacketLog().filter((e) => e.frame.payload.kind === 'ipv4' && e.frame.payload.payload.kind === 'vrrp' && e.sent > 4500);
    expect(adverts.length).toBeGreaterThan(0);
    expect(adverts.filter((e) => e.from.device === r1 || e.from.device === r2).every((e) => e.from.device === r1 && e.frame.src === vrrpMac(e.frame.payload.kind === 'ipv4' && e.frame.payload.payload.kind === 'vrrp' ? e.frame.payload.payload.vrid : 0))).toBe(true);
    expect(adverts.every((e) => e.frame.payload.kind === 'ipv4' && e.frame.payload.ttl === 255 && e.frame.payload.dst === '224.0.0.18')).toBe(true);
  });

  it('beantwortet ARP für die virtuelle Adresse mit der virtuellen MAC und leitet weiter', () => {
    const { net, pc, server } = redundant();
    const sim = new Simulation(net.topology);
    sim.runUntil(5000);
    sim.ping(pc, '10.0.0.10');
    sim.runUntil(12_000);
    expect(replies(sim, pc)).toBe(4);
    const arpReply = sim.getPacketLog().find((e) => e.frame.payload.kind === 'arp' && e.frame.payload.op === 'reply' && e.frame.payload.senderIp === '192.168.1.1');
    expect(arpReply?.frame.payload.kind === 'arp' && arpReply.frame.payload.senderMac).toBe('00:00:5E:00:01:01');
    expect(sim.getDeviceState(pc).arp?.find((a) => a.ip === '192.168.1.1')?.mac).toBe('00:00:5E:00:01:01');
    expect(sim.getDeviceState(server).arp?.find((a) => a.ip === '10.0.0.1')?.mac).toBe('00:00:5E:00:01:02');
  });

  it('übernimmt beim Ausfall des Masters nach dem Master_Down_Interval, der PC behält sein Gateway', () => {
    const { net, pc, r1, r2, r1lan } = redundant();
    // Im Servernetz muss R1 ebenfalls abgeben, sonst schickt der Server die Antworten an R1, der das LAN nicht mehr erreicht.
    net.apply((t) => setVrrpGroup(t, r1, { iface: 1, vrid: 2, ip: '10.0.0.1', priority: 110, track: { iface: 0, decrement: 20 } }));
    const sim = new Simulation(net.topology);
    sim.runUntil(5000);
    net.topology = unwrap(removeCable(net.topology, r1lan));
    sim.updateTopology(net.topology);
    expect(stateOf(sim, r1, 1)).toBe('init');
    // Backup mit Priorität 100: 3 × 1 s + (256 − 100) / 256 s nach dem letzten Advertisement.
    sim.runUntil(5000 + masterDownInterval(100) - 1100);
    expect(stateOf(sim, r2, 1)).toBe('backup');
    sim.runUntil(5000 + masterDownInterval(100) + 50);
    expect(stateOf(sim, r2, 1)).toBe('master');
    // Neuer Master meldet sich per Gratuitous ARP; der Weg ins andere Netz geht jetzt über R2.
    expect(sim.getPacketLog().some((e) => e.from.device === r2 && e.frame.payload.kind === 'arp' && e.frame.payload.senderIp === '192.168.1.1' && e.frame.dst === 'FF:FF:FF:FF:FF:FF')).toBe(true);
    sim.ping(pc, '10.0.0.10');
    sim.runUntil(20_000);
    expect(replies(sim, pc)).toBe(4);
    expect(sim.getDeviceState(pc).console.map((l) => l.code)).toContain('ping.reply');
  });

  it('Preempt: Der stärkere Router holt sich die Rolle zurück, ohne Preempt bleibt der bisherige Master', () => {
    const { net, r1, r2 } = redundant({ r1Priority: 90 });
    const sim = new Simulation(net.topology);
    sim.runUntil(6000);
    expect(stateOf(sim, r2, 1)).toBe('master');
    // R1 bekommt eine höhere Priorität: Er übernimmt (Preempt ist Standard).
    net.apply((t) => setVrrpGroup(t, r1, { iface: 0, vrid: 1, ip: '192.168.1.1', priority: 120 }));
    sim.updateTopology(net.topology);
    sim.runUntil(12_000);
    expect(stateOf(sim, r1, 1)).toBe('master');
    expect(stateOf(sim, r2, 1)).toBe('backup');
    // Ohne Preempt übernimmt R2 trotz höherer Priorität nicht.
    net.apply((t) => setVrrpGroup(t, r2, { iface: 0, vrid: 1, ip: '192.168.1.1', priority: 200, preempt: false }));
    sim.updateTopology(net.topology);
    sim.runUntil(20_000);
    expect(stateOf(sim, r1, 1)).toBe('master');
  });

  it('Tracking: Fällt der Uplink des Masters aus, sinkt seine Priorität und das Backup übernimmt', () => {
    const { net, r1, r2 } = redundant();
    net.apply((t) => setVrrpGroup(t, r1, { iface: 0, vrid: 1, ip: '192.168.1.1', priority: 110, track: { iface: 1, decrement: 20 } }));
    const sim = new Simulation(net.topology);
    sim.runUntil(5000);
    expect(stateOf(sim, r1, 1)).toBe('master');
    const uplink = net.topology.cables.find((c) => (c.a.device === r1 && c.a.iface === 1) || (c.b.device === r1 && c.b.iface === 1))!;
    net.topology = unwrap(removeCable(net.topology, uplink.id));
    sim.updateTopology(net.topology);
    sim.runUntil(10_000);
    expect(sim.getDeviceState(r1).vrrp?.find((g) => g.vrid === 1)?.priority).toBe(90);
    expect(stateOf(sim, r2, 1)).toBe('master');
    expect(stateOf(sim, r1, 1)).toBe('backup');
  });

  it('Ping an die virtuelle Adresse nur im Accept Mode; der Besitzer (eigene Adresse) antwortet immer', () => {
    const plain = redundant();
    let sim = new Simulation(plain.net.topology);
    sim.runUntil(5000);
    sim.ping(plain.pc, '192.168.1.1');
    sim.runUntil(12_000);
    expect(replies(sim, plain.pc)).toBe(0);

    const accept = redundant({ accept: true });
    sim = new Simulation(accept.net.topology);
    sim.runUntil(5000);
    sim.ping(accept.pc, '192.168.1.1');
    sim.runUntil(12_000);
    expect(replies(sim, accept.pc)).toBe(4);

    // Besitzer: virtuelle Adresse = eigene Adresse, Priorität 255, sofort Master.
    const owner = redundant();
    owner.net.apply((t) => setVrrpGroup(t, owner.r2, { iface: 0, vrid: 1, ip: '192.168.1.3' }));
    owner.net.apply((t) => setVrrpGroup(t, owner.r1, { iface: 0, vrid: 1, ip: '192.168.1.3', priority: 254 }));
    sim = new Simulation(owner.net.topology);
    sim.runUntil(100);
    expect(stateOf(sim, owner.r2, 1)).toBe('master');
    expect(sim.getDeviceState(owner.r2).vrrp?.find((g) => g.vrid === 1)?.priority).toBe(255);
    sim.runUntil(5000);
    expect(stateOf(sim, owner.r1, 1)).toBe('backup');
  });

  it('tritt beim Löschen der Gruppe mit Priorität 0 zurück, das Backup übernimmt sofort', () => {
    const { net, r1, r2 } = redundant();
    const sim = new Simulation(net.topology);
    sim.runUntil(5000);
    net.apply((t) => removeVrrpGroup(t, r1, 0, 1));
    sim.updateTopology(net.topology);
    sim.runUntil(5000 + 700);
    expect(stateOf(sim, r2, 1)).toBe('master');
  });

  it('kodiert das Advertisement nach RFC 9568 mit gültiger Prüfsumme', () => {
    const { net } = redundant();
    const sim = new Simulation(net.topology);
    sim.runUntil(5000);
    const advert = sim.getPacketLog().find((e) => e.frame.payload.kind === 'ipv4' && e.frame.payload.payload.kind === 'vrrp')!;
    const wire = dissect(advert.frame);
    const layer = wire.layers.find((l) => l.protocol === 'IPv4')!;
    const ip = [...wire.bytes.slice(layer.start, layer.start + layer.length)];
    expect(ip[9]).toBe(112);
    const vrrp = ip.slice(20);
    expect(vrrp[0]).toBe(0x31);
    expect(vrrp[2]).toBe(110);
    expect(((vrrp[4]! & 0x0f) << 8) | vrrp[5]!).toBe(100);
    // Prüfsumme über Pseudo-Header und Nachricht ergibt 0xFFFF.
    const words = [...ip.slice(12, 20), 0, 112, 0, vrrp.length, ...vrrp];
    let sum = 0;
    for (let i = 0; i < words.length; i += 2) sum += (words[i]! << 8) | (words[i + 1] ?? 0);
    while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
    expect(sum).toBe(0xffff);
  });

  it('läuft auch auf Layer-3-Switches über das VLAN-Interface', () => {
    const net = new NetBuilder();
    const pc = net.host('PC', '192.168.1.10', '24', '192.168.1.1');
    const a = net.add('l3switch', 'A');
    const b = net.add('l3switch', 'B');
    for (const sw of [a, b]) net.apply((t) => setStp(t, sw, true));
    net.apply((t) => setSvi(t, a, 1, '192.168.1.2', '24'));
    net.apply((t) => setSvi(t, b, 1, '192.168.1.3', '24'));
    net.apply((t) => setVrrpGroup(t, a, { iface: sviId(1), vrid: 1, ip: '192.168.1.1', priority: 120, accept: true }));
    net.apply((t) => setVrrpGroup(t, b, { iface: sviId(1), vrid: 1, ip: '192.168.1.1', accept: true }));
    net.link(pc, a);
    net.link(a, b);
    const sim = new Simulation(net.topology);
    sim.runUntil(6000);
    expect(stateOf(sim, a, 1)).toBe('master');
    expect(stateOf(sim, b, 1)).toBe('backup');
    sim.ping(pc, '192.168.1.1');
    sim.runUntil(12_000);
    expect(replies(sim, pc)).toBe(4);
  });

  it('prüft die Einstellungen und speichert sie im Projekt', () => {
    const { net, r1, lan } = redundant();
    expect(setVrrpGroup(net.topology, r1, { iface: 0, vrid: 1, ip: '10.9.9.9' }).ok).toBe(false);
    expect(setVrrpGroup(net.topology, r1, { iface: 0, vrid: 0, ip: '192.168.1.1' }).ok).toBe(false);
    expect(setVrrpGroup(net.topology, r1, { iface: 0, vrid: 1, ip: '192.168.1.1', priority: 255 }).ok).toBe(false);
    expect(setVrrpGroup(net.topology, lan, { iface: 0, vrid: 1, ip: '192.168.1.1' }).ok).toBe(false);
    const loaded = parseProject(serializeProject(net.topology));
    expect(loaded.ok && loaded.topology.devices.find((d) => d.id === r1)?.vrrp).toEqual(net.topology.devices.find((d) => d.id === r1)?.vrrp);
  });
});
