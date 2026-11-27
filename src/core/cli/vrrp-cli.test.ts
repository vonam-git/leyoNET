import { describe as group, expect, it } from 'vitest';
import { getDevice } from '../model/topology';
import type { Topology } from '../model/types';
import { NetBuilder } from '../sim/testing';
import { Simulation } from '../sim/simulation';
import { execute, runningConfig, startSession, type CliSession } from './cli';

function run(topology: Topology, device: string, lines: string[], state?: () => ReturnType<Simulation['getDeviceState']>) {
  let session: CliSession = startSession(getDevice(topology, device)!).session;
  const output: string[] = [];
  for (const line of lines) {
    const result = execute(session, line, { topology, state: state?.() });
    output.push(...result.lines);
    if (result.topology) topology = result.topology;
    session = result.session;
  }
  return { topology, output };
}

group('CLI VRRP und RSTP', () => {
  it('richtet eine VRRP-Gruppe ein, zeigt sie und schreibt sie in die Konfiguration', () => {
    const net = new NetBuilder();
    const r = net.router('R1', ['192.168.1.2/24', '10.0.0.2/24']);
    const { topology, output } = run(net.topology, r, ['en', 'conf t', 'int eth0', 'vrrp 1 priority 110', 'vrrp 1 ip 192.168.1.1', 'vrrp 1 priority 110', 'vrrp 1 track eth1 decrement 20', 'vrrp 1 accept-mode', 'no vrrp 1 preempt', 'vrrp 1 ip 10.9.9.9', 'end']);
    expect(output[0]).toContain('VRRP group 1 not configured');
    expect(output.some((l) => l.includes('not in the subnet'))).toBe(true);
    expect(getDevice(topology, r)?.vrrp).toEqual([{ iface: 0, vrid: 1, ip: '192.168.1.1', priority: 110, preempt: false, accept: true, track: { iface: 1, decrement: 20 } }]);
    const config = runningConfig(getDevice(topology, r)!).join('\n');
    expect(config).toContain(' vrrp 1 ip 192.168.1.1\n vrrp 1 priority 110\n no vrrp 1 preempt\n vrrp 1 accept-mode\n vrrp 1 track eth1 decrement 20');
    const sim = new Simulation(topology);
    sim.runUntil(5000);
    const shown = run(topology, r, ['show vrrp brief', 'show vrrp'], () => sim.getDeviceState(r)).output.join('\n');
    expect(shown).toContain('Master');
    expect(shown).toContain('00:00:5e:00:01:01');
    const removed = run(topology, r, ['en', 'conf t', 'int eth0', 'no vrrp 1']).topology;
    expect(getDevice(removed, r)?.vrrp).toBeUndefined();
  });

  it('schaltet den Switch auf RSTP um', () => {
    const net = new NetBuilder();
    const s = net.add('switch', 'S1');
    const { topology, output } = run(net.topology, s, ['en', 'conf t', 'spanning-tree', 'spanning-tree mode rapid-pvst', 'spanning-tree mode xyz']);
    expect(output.at(-1)).toContain('Invalid mode');
    expect(getDevice(topology, s)?.stpMode).toBe('rstp');
    expect(runningConfig(getDevice(topology, s)!)).toContain('spanning-tree mode rstp');
  });
});
