import { describe, expect, it } from 'vitest';
import { getDevice } from '../model/topology';
import type { Topology } from '../model/types';
import { parseProject, serializeProject } from '../io/project';
import { execute, runningConfig, startSession, type CliSession } from '../cli/cli';
import { Simulation } from './simulation';
import { NetBuilder } from './testing';

function cli(topology: Topology, device: string, lines: string[]) {
  let session: CliSession = startSession(getDevice(topology, device)!).session;
  const output: string[] = [];
  for (const line of lines) {
    const r = execute(session, line, { topology });
    output.push(...r.lines);
    if (r.topology) topology = r.topology;
    session = r.session;
  }
  return { topology, output };
}
const replies = (sim: Simulation, id: string) => sim.getDeviceState(id).console.filter((l) => l.code === 'ping.reply').length;

/**
 * Provider-Router mit zwei Kunden, beide mit 10.0.0.0/24 (überlappend):
 *   Kunde A: PC A1 (10.0.0.10) – eth0 [VRF A] – PE – eth1 [VRF A] – Server A (10.9.0.10)
 *   Kunde B: PC B1 (10.0.0.10) – eth2 [VRF B] – PE – eth3 [VRF B] – Server B (10.9.0.10)
 */
function provider() {
  const net = new NetBuilder();
  // Kunde B bekommt seine (gleichen) Adressen erst nach «vrf forwarding»: in derselben
  // Tabelle lehnt der Router ein zweites Interface im selben Netz ab.
  const pe = net.router('PE', ['10.0.0.1/24', '10.9.0.1/24', '', '']);
  const a1 = net.host('PC A1', '10.0.0.10', '24', '10.0.0.1');
  const sa = net.host('Server A', '10.9.0.10', '24', '10.9.0.1');
  const b1 = net.host('PC B1', '10.0.0.10', '24', '10.0.0.1');
  const sb = net.host('Server B', '10.9.0.10', '24', '10.9.0.1');
  net.link(a1, pe);
  net.link(sa, pe);
  net.link(b1, pe);
  net.link(sb, pe);
  const { topology, output } = cli(net.topology, pe, [
    'en',
    'conf t',
    'vrf definition KUNDE-A',
    'vrf definition KUNDE-B',
    'interface eth0',
    'vrf forwarding KUNDE-A',
    'interface eth1',
    'vrf forwarding KUNDE-A',
    'interface range eth2-3',
    'interface eth2',
    'vrf forwarding KUNDE-B',
    'ip address 10.0.0.1 255.255.255.0',
    'interface eth3',
    'vrf forwarding KUNDE-B',
    'ip address 10.9.0.1 255.255.255.0',
    'end',
  ]);
  return { topology, output, pe, a1, b1, sa, sb };
}

describe('VRF', () => {
  it('trennt zwei Kunden mit gleichen Adressen; jeder erreicht nur seinen Server', () => {
    const { topology, pe, a1, b1 } = provider();
    expect(getDevice(topology, pe)!.vrfs).toEqual([{ name: 'KUNDE-A' }, { name: 'KUNDE-B' }]);
    const sim = new Simulation(topology);
    sim.ping(a1, '10.9.0.10');
    sim.runUntil(6000);
    expect(replies(sim, a1)).toBe(4);
    sim.ping(b1, '10.9.0.10');
    sim.runUntil(12_000);
    expect(replies(sim, b1)).toBe(4);
    // Die Pakete von A gehen zu Server A (eth1), nicht zu Server B (eth3).
    const sa = topology.devices.find((d) => d.name === 'Server A')!.id;
    const sb = topology.devices.find((d) => d.name === 'Server B')!.id;
    const icmpTo = (id: string) => sim.getPacketLog().filter((e) => e.to.device === id && e.frame.payload.kind === 'ipv4' && e.frame.payload.payload.kind === 'icmp').length;
    expect(icmpTo(sa)).toBeGreaterThanOrEqual(4);
    expect(icmpTo(sb)).toBeGreaterThanOrEqual(4);
  });

  it('globale Tabelle kennt die VRF-Netze nicht; ping vrf und show ip route vrf', () => {
    const { topology, pe } = provider();
    const show = cli(topology, pe, ['show ip route vrf KUNDE-A']).output.join('\n');
    expect(show).toContain('Routing Table: VRF KUNDE-A');
    expect(show).toMatch(/C>\* 10\.0\.0\.0\/24 is directly connected, eth0/);
    expect(show).not.toMatch(/eth2/);
    expect(cli(topology, pe, ['show ip route']).output.join('\n')).toContain('(no routes)');
    const ping = cli(topology, pe, ['ping vrf KUNDE-B 10.9.0.10']);
    expect(ping.output[0]).toContain('VRF KUNDE-B');
    const sim = new Simulation(topology);
    sim.ping(pe, '10.9.0.10', 1, 'KUNDE-B');
    sim.runUntil(6000);
    expect(replies(sim, pe)).toBe(4);
    const sim2 = new Simulation(topology);
    sim2.ping(pe, '10.9.0.10');
    sim2.runUntil(6000);
    expect(replies(sim2, pe)).toBe(0);
  });

  it('statische Route in der VRF, running-config, speichern und laden, VRF löschen', () => {
    const { topology, pe } = provider();
    const r = cli(topology, pe, ['en', 'conf t', 'ip route vrf KUNDE-A 172.16.0.0/16 10.9.0.10', 'end']);
    expect(r.output).toEqual([]);
    const config = runningConfig(getDevice(r.topology, pe)!).join('\n');
    expect(config).toContain('vrf definition KUNDE-A\nvrf definition KUNDE-B');
    expect(config).toContain('interface eth0\n vrf forwarding KUNDE-A\n ip address 10.0.0.1/24');
    expect(config).toContain('ip route vrf KUNDE-A 172.16.0.0/16 10.9.0.10');
    const parsed = parseProject(serializeProject(r.topology));
    expect(parsed.ok && parsed.topology.devices.find((d) => d.id === pe)?.vrfs?.[0]).toEqual({ name: 'KUNDE-A', routes: [{ network: '172.16.0.0', mask: '255.255.0.0', gateway: '10.9.0.10' }] });
    const removed = cli(r.topology, pe, ['en', 'conf t', 'no vrf definition KUNDE-A']).topology;
    expect(getDevice(removed, pe)!.interfaces[0]!.vrf).toBeUndefined();
    expect(cli(r.topology, pe, ['en', 'conf t', 'int eth0', 'vrf forwarding GIBTS-NICHT']).output[0]).toMatch(/^%/);
  });

  it('Projektdatei mit Verweis auf fehlende VRF wird abgelehnt', () => {
    const { topology } = provider();
    const data = JSON.parse(serializeProject(topology));
    const pe = data.topology.devices.find((d: { name: string }) => d.name === 'PE');
    pe.vrfs = [{ name: 'KUNDE-A' }];
    expect(parseProject(JSON.stringify(data)).ok).toBe(false);
  });
});

describe('VRF: Interfaces im selben Netz', () => {
  it('lehnt ein zweites Interface im selben Netz derselben Tabelle ab, in einer anderen VRF nicht', () => {
    const net = new NetBuilder();
    const r = net.router('R1', ['192.168.1.1/24', '', '']);
    const { output, topology } = cli(net.topology, r, ['en', 'conf t', 'interface eth1', 'ip address 192.168.1.2 255.255.255.0', 'interface eth2', 'ip address 192.168.1.130 255.255.255.128', 'interface loopback0', 'ip address 192.168.1.200 255.255.255.255', 'end']);
    expect(output.filter((l) => l.includes('overlaps with eth0'))).toHaveLength(3);
    expect(getDevice(topology, r)!.interfaces[1]!.ip).toBeUndefined();
    // Anderes Netz geht, VRF erlaubt dasselbe Netz.
    const ok = cli(topology, r, ['en', 'conf t', 'interface eth1', 'ip address 192.168.2.1 255.255.255.0', 'vrf definition X', 'interface eth2', 'vrf forwarding X', 'ip address 192.168.1.1 255.255.255.0', 'end']);
    expect(ok.output.join('\n')).not.toContain('overlaps');
    expect(getDevice(ok.topology, r)!.interfaces[2]!.ip).toBe('192.168.1.1');
    // Gleiche Adresse am selben Interface neu setzen ist kein Konflikt.
    expect(cli(ok.topology, r, ['en', 'conf t', 'interface eth0', 'ip address 192.168.1.1 255.255.255.0', 'end']).output.join('\n')).not.toContain('overlaps');
  });
});

describe('VRF: doppelte Adressen', () => {
  it('gleiche Adresse in zwei VRFs gilt nicht als doppelt, in derselben schon', async () => {
    const { duplicateAddresses } = await import('../model/duplicates');
    const { setInterfaceVrf } = await import('../model/topology');
    const { topology, pe } = provider();
    expect([...duplicateAddresses(topology)].filter((d) => d.startsWith(`${pe}#`))).toEqual([]);
    const same = setInterfaceVrf(topology, pe, 2, 'KUNDE-A');
    expect(same.ok && [...duplicateAddresses(same.value)]).toContain(`${pe}#10.0.0.1`);
  });
});
