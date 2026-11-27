import { describe, expect, it } from 'vitest';
import { parseProject, serializeProject } from '../io/project';
import { addDevice, configureHost, connect, emptyTopology, setDhcpServer, setDhcpSnooping, setDhcpTrusted, setInterfaceAddress, setPortSecurity, setProtection, setSvi, setSyslog, setSyslogServer, cableAt } from '../model/topology';
import type { Result } from '../model/topology';
import type { DeviceType, Topology } from '../model/types';
import { Simulation } from '../sim/simulation';
import { formatSyslog } from '../sim/syslog';
import { dissect } from '../wire/encode';
import { attackEffect, attackLogged, withAttacker } from './attacks';
import { evaluateGoal, readTasks } from './tasks';

const u = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};

/** Büro: DHCP-Server und Router am Switch, zwei PCs beziehen ihre Adresse per DHCP. */
function office() {
  let t: Topology = emptyTopology();
  const id: Record<string, string> = {};
  const add = (type: DeviceType, name: string) => {
    const r = u(addDevice(t, type, name, { x: 0, y: 0 }));
    t = r.topology;
    id[name] = r.id;
  };
  add('pc', 'PC 1');
  add('pc', 'PC 2');
  add('server', 'DHCP');
  add('switch', 'Switch');
  add('router', 'Router');
  t = u(configureHost(t, id['PC 1']!, { ip: '', mask: '', dhcp: true }));
  t = u(configureHost(t, id['PC 2']!, { ip: '', mask: '', dhcp: true }));
  t = u(configureHost(t, id['DHCP']!, { ip: '192.168.1.10', mask: '24', gateway: '192.168.1.1' }));
  t = u(setDhcpServer(t, id['DHCP']!, { start: '192.168.1.100', end: '192.168.1.140', gateway: '192.168.1.1', dns: '192.168.1.10', leaseTime: 3600 }));
  t = u(setInterfaceAddress(t, id['Router']!, 0, '192.168.1.1', '24'));
  for (const n of ['PC 1', 'PC 2', 'DHCP', 'Router']) t = u(connect(t, id[n]!, id['Switch']!)).topology;
  return { t, id };
}

/** Ports des Switches, an denen DHCP-Server bzw. Router hängen. */
function portOf(t: Topology, sw: string, device: string): number {
  const port = t.devices.find((d) => d.id === sw)!.interfaces.find((i) => {
    const c = cableAt(t, { device: sw, iface: i.index });
    return c && (c.a.device === device || c.b.device === device);
  });
  return port!.index;
}

/** DHCP-Snooping mit vertrauenswürdigen Ports zu Server und Router; optional Port-Sicherheit auf allen anderen. */
function protect(t: Topology, id: Record<string, string>, portSecurity: boolean): Topology {
  const sw = id['Switch']!;
  let x = u(setDhcpSnooping(t, sw, true));
  const trusted = [portOf(t, sw, id['DHCP']!), portOf(t, sw, id['Router']!)];
  for (const p of trusted) x = u(setDhcpTrusted(x, sw, p, true));
  if (portSecurity) for (const i of x.devices.find((d) => d.id === sw)!.interfaces) if (!trusted.includes(i.index)) x = u(setPortSecurity(x, sw, i.index, 2));
  return x;
}

describe('Falscher DHCP-Server (Tampering), DHCP-Snooping und Port-Sicherheit', () => {
  const { t, id } = office();

  it('ohne Schutz: Der Angreifer verteilt sich selbst als Gateway, der echte Vorrat ist aufgebraucht', () => {
    expect(attackEffect(t, 'dhcpRogue')).toBe('effective');
    const a = withAttacker(t, 'dhcpRogue')!;
    const sim = new Simulation(a.topology);
    sim.runUntil(10_000, 200_000);
    expect(sim.getDeviceState(a.attacker).attack!.starved).toBeGreaterThan(30);
    expect(sim.getDeviceState(id['DHCP']!).dhcpLeases!.length).toBeGreaterThan(30);
  });

  it('nur DHCP-Snooping: kein falscher Server mehr, aber der Vorrat ist leer; mit Port-Sicherheit abgewehrt', () => {
    const snoop = protect(t, id, false);
    expect(attackEffect(snoop, 'dhcpRogue')).toBe('effective');
    const both = protect(t, id, true);
    expect(attackEffect(both, 'dhcpRogue')).toBe('blocked');
    // Die PCs bekommen ihre Adresse weiterhin vom echten Server.
    const sim = new Simulation(both);
    sim.runUntil(8000);
    expect(sim.getDeviceState(id['PC 1']!).address!.gateway).toBe('192.168.1.1');
  });

  it('Snooping verwirft Antworten von nicht vertrauenswürdigen Ports und meldet es an der Konsole', () => {
    const a = withAttacker(protect(t, id, true), 'dhcpRogue')!;
    const sim = new Simulation(a.topology);
    sim.runUntil(8000);
    sim.runCommand(id['PC 1']!, 'ipconfig /release');
    sim.runCommand(id['PC 1']!, 'ipconfig /renew');
    sim.runUntil(20_000, 200_000);
    const codes = sim.getDeviceState(id['Switch']!).console.map((l) => l.code);
    expect(codes).toContain('switch.portSecurity');
    expect((sim.getDeviceState(id['Switch']!) as { violations?: { portSecurity: number }[] }).violations!.some((v) => v.portSecurity > 0)).toBe(true);
  });

  it('kein Ziel ohne DHCP-Clients', () => {
    const fixed = u(configureHost(u(configureHost(t, id['PC 1']!, { ip: '192.168.1.21', mask: '24', gateway: '192.168.1.1' })), id['PC 2']!, { ip: '192.168.1.22', mask: '24', gateway: '192.168.1.1' }));
    expect(attackEffect(fixed, 'dhcpRogue')).toBe('noTarget');
  });

  it('Einstellungen bleiben beim Speichern erhalten und werden geprüft', () => {
    const both = protect(t, id, true);
    const logged = u(setSyslog(u(setSyslogServer(both, id['DHCP']!, true)), id['Switch']!, '192.168.1.10'));
    const back = parseProject(serializeProject(logged));
    expect(back.ok).toBe(true);
    const sw = back.ok ? back.topology.devices.find((d) => d.id === id['Switch'])! : null;
    expect(sw?.dhcpSnooping).toBe(true);
    expect(sw?.syslog).toBe('192.168.1.10');
    expect(sw?.interfaces.filter((i) => i.dhcpTrusted)).toHaveLength(2);
    expect(sw?.interfaces.some((i) => i.portSecurity === 2)).toBe(true);
    expect(setPortSecurity(t, id['Switch']!, 0, 0).ok).toBe(false);
    expect(setPortSecurity(t, id['Switch']!, 0, 65).ok).toBe(false);
    expect(setDhcpSnooping(t, id['PC 1']!, true).ok).toBe(false);
    expect(setSyslog(t, id['PC 1']!, 'kein.server').ok).toBe(false);
    expect(setSyslogServer(t, id['Router']!, true).ok).toBe(false);
  });
});

describe('Syslog (RFC 5424/5426) und Nachweis (Repudiation)', () => {
  const { t, id } = office();
  const withServer = (x: Topology) => u(setSyslogServer(x, id['DHCP']!, true));

  it('Format der Meldung nach RFC 5424', () => {
    const text = formatSyslog({ kind: 'syslog', facility: 4, severity: 4, host: 'Switch 1', msgid: 'PORTSEC', text: 'violation', params: { port: '3', note: 'a"b]' } });
    expect(text).toBe('<36>1 - Switch_1 leyonet - PORTSEC [leyonet@32473 port="3" note="a\\"b\\]"] violation');
  });

  it('Der Switch meldet Verletzungen an den Syslog-Server; der Prüfbaustein «logged» erkennt das', () => {
    const sw = id['Switch']!;
    let net = withServer(protect(t, id, true));
    expect(attackLogged(net, 'dhcpRogue')).toBe('notLogged');
    net = u(setSvi(net, sw, 1, '192.168.1.2', '24'));
    net = u(setSyslog(net, sw, '192.168.1.10'));
    expect(attackLogged(net, 'dhcpRogue')).toBe('logged');
    expect(attackLogged(protect(t, id, true), 'dhcpRogue')).toBe('noServer');
    const goal = readTasks({ title: 'Syslog', goals: [{ id: 'g1', text: 'Protokoll', check: { type: 'logged', attack: 'dhcpRogue' } }] }, (p) => {
      throw new Error(p);
    }).goals[0]!;
    expect(evaluateGoal(net, goal).passed).toBe(true);
  });

  it('Der Wächter eines Rechners meldet ARP-Spoofing an den Syslog-Server; Meldungen gehen als echte Bytes über UDP 514', () => {
    let net = withServer(t);
    // PCs mit fester Adresse (ARP-Spoofing braucht Ziele mit Gateway).
    net = u(configureHost(net, id['PC 1']!, { ip: '192.168.1.21', mask: '24', gateway: '192.168.1.1' }));
    net = u(setProtection(net, id['PC 1']!, 'arpGuard', true));
    expect(attackLogged(net, 'arpSpoof')).toBe('notLogged');
    net = u(setSyslog(net, id['PC 1']!, '192.168.1.10'));
    expect(attackLogged(net, 'arpSpoof')).toBe('logged');
    const a = withAttacker(net, 'arpSpoof')!;
    const sim = new Simulation(a.topology);
    sim.runUntil(10_000);
    sim.ping(id['PC 1']!, '192.168.1.1');
    sim.runUntil(25_000);
    const entry = sim.getPacketLog().find((e) => e.frame.payload.kind === 'ipv4' && e.frame.payload.payload.kind === 'udp' && e.frame.payload.payload.dstPort === 514)!;
    expect(entry).toBeDefined();
    expect(JSON.stringify(dissect(entry.frame))).toContain('leyonet@32473');
  });
});

describe('Befehlszeile: DHCP-Snooping, Port-Sicherheit, Syslog', () => {
  it('Befehle setzen die Werte, running-config gibt sie wieder aus', async () => {
    const { startSession, execute, runningConfig } = await import('../cli/cli');
    const { t, id } = office();
    const sw = id['Switch']!;
    let topology = t;
    let { session } = startSession(topology.devices.find((d) => d.id === sw)!);
    for (const line of ['enable', 'configure terminal', 'ip dhcp snooping', 'logging host 192.168.1.10', 'interface fa0/1', 'ip dhcp snooping trust', 'interface fa0/2', 'switchport port-security', 'switchport port-security maximum 3', 'end']) {
      const out = execute(session, line, { topology });
      expect(out.lines.join('\n'), line).not.toMatch(/%/);
      session = out.session;
      if (out.topology) topology = out.topology;
    }
    const d = topology.devices.find((x) => x.id === sw)!;
    expect([d.dhcpSnooping, d.syslog, d.interfaces[0]!.dhcpTrusted, d.interfaces[1]!.portSecurity]).toEqual([true, '192.168.1.10', true, 3]);
    const config = runningConfig(d).join('\n');
    for (const line of ['ip dhcp snooping', 'logging host 192.168.1.10', ' ip dhcp snooping trust', ' switchport port-security maximum 3']) expect(config).toContain(line);
    expect(execute(session, 'show port-security', { topology }).lines.join('\n')).toContain('Restrict');
  });
});
