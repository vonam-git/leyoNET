import { describe, expect, it } from 'vitest';
import { getDevice } from '../model/topology';
import type { Topology } from '../model/types';
import { Simulation } from '../sim/simulation';
import { NetBuilder } from '../sim/testing';
import { allowedVlans, execute, formatVlanList, parseVlanList, prompt, runningConfig, startSession, type CliSession } from './cli';

function run(topology: Topology, device: string, lines: string[]) {
  let session: CliSession = startSession(getDevice(topology, device)!).session;
  const output: string[] = [];
  const prompts: string[] = [];
  for (const line of lines) {
    const result = execute(session, line, { topology });
    output.push(...result.lines);
    if (result.topology) topology = result.topology;
    session = result.session;
    prompts.push(prompt(topology, session));
  }
  return { topology, session, output, prompts };
}

describe('VLAN-Listen', () => {
  it('lesen, schreiben, add/remove/except', () => {
    expect(parseVlanList('10,20,30-32')).toEqual([10, 20, 30, 31, 32]);
    expect(parseVlanList('0')).toBeNull();
    expect(parseVlanList('20-10')).toBeNull();
    expect(formatVlanList([10, 20, 30, 31, 32])).toBe('10,20,30-32');
    expect(allowedVlans('10,20', null)).toEqual([10, 20]);
    expect(allowedVlans('add 30', [10, 20])).toEqual([10, 20, 30]);
    expect(allowedVlans('remove 10', [10, 20])).toEqual([20]);
    expect(allowedVlans('all', [10])).toBeNull();
    expect(allowedVlans('none', null)).toEqual([]);
    expect(allowedVlans('except 1-4093', null)).toEqual([4094]);
    expect(allowedVlans('add x', null)).toBeUndefined();
  });
});

describe('CLI: Modi wechseln wie bei Cisco', () => {
  it('von «vlan 10» direkt zu «vlan 20», von Port zu Port, vom VLAN zum Interface', () => {
    const net = new NetBuilder();
    const sw = net.add('switch', 'SW1');
    const r = run(net.topology, sw, ['en', 'conf t', 'vlan 10', 'name Verwaltung', 'vlan 20', 'name Schulung', 'interface port1', 'switchport access vlan 10', 'interface port2', 'switchport access vlan 20', 'vlan 30', 'end']);
    expect(r.output).toEqual([]);
    expect(r.prompts.slice(2, 11)).toEqual([
      'SW1(config-vlan)#',
      'SW1(config-vlan)#',
      'SW1(config-vlan)#',
      'SW1(config-vlan)#',
      'SW1(config-if)#',
      'SW1(config-if)#',
      'SW1(config-if)#',
      'SW1(config-if)#',
      'SW1(config-vlan)#',
    ]);
    const d = getDevice(r.topology, sw)!;
    expect(d.vlanDb).toEqual([10, 20, 30]);
    expect(d.vlanNames).toEqual([
      { vlan: 10, name: 'Verwaltung' },
      { vlan: 20, name: 'Schulung' },
    ]);
    expect(d.interfaces[1]!.vlan).toBe(20);
  });

  it('unbekannter Befehl bleibt ein Fehler und der Modus bleibt', () => {
    const net = new NetBuilder();
    const sw = net.add('switch', 'SW1');
    const r = run(net.topology, sw, ['en', 'conf t', 'vlan 10', 'blabla']);
    expect(r.output.join('\n')).toMatch(/Invalid input/);
    expect(r.session.mode).toBe('vlan');
  });
});

describe('CLI: VLAN-Datenbank und Trunks', () => {
  it('Access-VLAN wird angelegt (mit Meldung), «no vlan» löscht, Trunk erlaubt nur einzelne VLANs', () => {
    const net = new NetBuilder();
    const sw = net.add('switch', 'SW1');
    const r = run(net.topology, sw, [
      'en',
      'conf t',
      'interface port1',
      'switchport access vlan 30',
      'interface port8',
      'switchport mode trunk',
      'switchport trunk allowed vlan 10,30',
      'switchport trunk allowed vlan add 40-41',
      'switchport trunk native vlan 99',
      'exit',
      'vlan 10,40',
      'no vlan 40',
      'end',
    ]);
    expect(r.output).toEqual(['% Access VLAN does not exist. Creating vlan 30']);
    const d = getDevice(r.topology, sw)!;
    expect(d.vlanDb).toEqual([10, 30]);
    expect(d.interfaces[7]).toMatchObject({ trunk: true, allowedVlans: [10, 30, 40, 41], nativeVlan: 99 });
    const config = runningConfig(d).join('\n');
    expect(config).toContain('vlan 10\n!\nvlan 30');
    expect(config).toContain(' switchport mode trunk\n switchport trunk native vlan 99\n switchport trunk allowed vlan 10,30,40-41');
    const show = run(r.topology, sw, ['show interfaces trunk']).output.join('\n');
    expect(show).toMatch(/port8\s+\S+\s+99\s+10,30,40-41\s+10,30/);
    expect(run(r.topology, sw, ['en', 'conf t', 'no vlan 1']).output[0]).toMatch(/^%/);
  });

  it('Simulation: Trunk ohne VLAN in der Liste und Transit-Switch ohne VLAN verwerfen', () => {
    // PC1 (VLAN 10) – SW1 ==trunk== SW2 ==trunk== SW3 – PC2 (VLAN 10)
    const net = new NetBuilder();
    const sws = ['SW1', 'SW2', 'SW3'].map((n) => net.add('switch', n));
    const pc1 = net.host('PC1', '192.168.10.1');
    const pc2 = net.host('PC2', '192.168.10.2');
    net.link(pc1, sws[0]!);
    net.link(sws[0]!, sws[1]!);
    net.link(sws[1]!, sws[2]!);
    net.link(pc2, sws[2]!);
    let t = net.topology;
    // port1 PC, port2 Trunk (SW1, SW3); SW2: port1 und port2 Trunks.
    t = run(t, sws[0]!, ['en', 'conf t', 'int port1', 'switchport access vlan 10', 'int port2', 'switchport mode trunk']).topology;
    t = run(t, sws[2]!, ['en', 'conf t', 'int port2', 'switchport access vlan 10', 'int port1', 'switchport mode trunk']).topology;
    t = run(t, sws[1]!, ['en', 'conf t', 'int range port1-2', 'switchport mode trunk']).topology;
    const ping = (topo: Topology) => {
      const sim = new Simulation(topo);
      sim.ping(pc1, '192.168.10.2');
      sim.runUntil(6000);
      return { sim, replies: sim.getDeviceState(pc1).console.filter((l) => l.code === 'ping.reply').length };
    };
    const missing = ping(t);
    expect(missing.replies).toBe(0);
    expect(missing.sim.getDeviceState(sws[1]!).console.some((l) => l.code === 'switch.vlanMissing')).toBe(true);
    t = run(t, sws[1]!, ['en', 'conf t', 'vlan 10']).topology;
    expect(ping(t).replies).toBe(4);
    const restricted = run(t, sws[1]!, ['en', 'conf t', 'int port1', 'switchport trunk allowed vlan 20']).topology;
    const blocked = ping(restricted);
    expect(blocked.replies).toBe(0);
    expect(blocked.sim.getDeviceState(sws[1]!).console.some((l) => l.code === 'switch.vlanNotAllowed')).toBe(true);
  });

  it('ältere Datei ohne VLAN-Datenbank: alle verwendeten VLANs gelten als angelegt', () => {
    const net = new NetBuilder();
    const sw = net.add('switch', 'SW1');
    let t = run(net.topology, sw, ['en', 'conf t', 'int port1', 'switchport access vlan 30']).topology;
    t = { ...t, devices: t.devices.map((d) => (d.id === sw ? (({ vlanDb: _v, ...rest }) => rest)(d) : d)) };
    expect(run(t, sw, ['show vlan brief']).output.join('\n')).toMatch(/30\s+VLAN0030\s+active/);
    // «vlan 40» übernimmt die verwendeten VLANs in die Datenbank.
    expect(getDevice(run(t, sw, ['en', 'conf t', 'vlan 40']).topology, sw)!.vlanDb).toEqual([30, 40]);
  });
});

describe('Layer-2-Switch: Verwaltungsadresse', () => {
  it('interface vlan 1 mit Adresse und ip default-gateway; Ping und SSH-Ziel über Router', () => {
    const net = new NetBuilder();
    const sw = net.add('switch', 'SW1');
    const pc = net.host('PC', '192.168.2.10', '24', '192.168.2.1');
    const router = net.router('R', ['192.168.1.1/24', '192.168.2.1/24']);
    net.link(router, sw);
    net.link(pc, router);
    const r = run(net.topology, sw, ['en', 'conf t', 'interface vlan 1', 'ip address 192.168.1.2/24', 'no shutdown', 'exit', 'ip default-gateway 192.168.1.1', 'end']);
    expect(r.output).toEqual([]);
    const config = runningConfig(getDevice(r.topology, sw)!).join('\n');
    expect(config).toContain('interface vlan1\n ip address 192.168.1.2/24');
    expect(config).toContain('ip default-gateway 192.168.1.1');
    const sim = new Simulation(r.topology);
    sim.ping(pc, '192.168.1.2');
    sim.runUntil(6000);
    expect(sim.getDeviceState(pc).console.filter((l) => l.code === 'ping.reply')).toHaveLength(4);
  });
});

describe('CLI: Loopback', () => {
  it('interface loopback0 anlegen, Adresse, running-config, show ip interface brief, löschen', () => {
    const net = new NetBuilder();
    const r = net.router('R1', ['10.0.0.1/24']);
    const step = run(net.topology, r, ['en', 'conf t', 'interface loopback0', 'ip address 10.255.0.1/32', 'interface lo1', 'ip address 10.255.1.1 255.255.255.0', 'end']);
    expect(step.output).toEqual([]);
    const d = getDevice(step.topology, r)!;
    expect(d.loopbacks).toEqual([
      { id: 0, ip: '10.255.0.1', mask: '255.255.255.255' },
      { id: 1, ip: '10.255.1.1', mask: '255.255.255.0' },
    ]);
    expect(runningConfig(d).join('\n')).toContain('interface loopback0\n ip address 10.255.0.1/32');
    expect(run(step.topology, r, ['show ip interface brief']).output.join('\n')).toMatch(/loopback0\s+10\.255\.0\.1\/32\s+up/);
    const removed = run(step.topology, r, ['en', 'conf t', 'no interface loopback1']).topology;
    expect(getDevice(removed, r)!.loopbacks).toHaveLength(1);
  });
});

describe('CLI: Port-Channel', () => {
  it('channel-group auf zwei Ports, interface port-channel konfiguriert beide, show etherchannel summary', () => {
    const net = new NetBuilder();
    const sw = net.add('switch', 'SW1');
    const r = run(net.topology, sw, ['en', 'conf t', 'interface range port7-8', 'channel-group 1 mode active', 'interface port-channel 1', 'switchport mode trunk', 'switchport trunk allowed vlan 10,20', 'end']);
    expect(r.output).toEqual([]);
    const d = getDevice(r.topology, sw)!;
    expect([d.interfaces[6], d.interfaces[7]].map((i) => [i!.channel, i!.trunk, i!.allowedVlans])).toEqual([
      [1, true, [10, 20]],
      [1, true, [10, 20]],
    ]);
    expect(runningConfig(d).join('\n')).toContain('interface port8\n switchport mode trunk\n switchport trunk allowed vlan 10,20\n channel-group 1 mode active');
    expect(run(r.topology, sw, ['show etherchannel summary']).output.join('\n')).toMatch(/1\s+Po1\(-\)\s+LACP\s+port7\(active\) port8\(active\)/);
    expect(run(r.topology, sw, ['en', 'conf t', 'interface port-channel 2']).output[0]).toMatch(/no ports/);
    expect(run(r.topology, sw, ['en', 'conf t', 'int port1', 'channel-group 1 mode maybe']).output[0]).toMatch(/active, passive or on/);
  });
});
