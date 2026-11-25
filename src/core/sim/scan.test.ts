import { describe, expect, it } from 'vitest';
import { parsePing } from './apps';
import { hopsFromTtl, parsePorts, parseTargets, SCAN_MAX_PORTS } from './scan';
import { Simulation } from './simulation';
import { setScanner, setInterfaceShutdown } from '../model/topology';
import { parseProject, serializeProject } from '../io/project';
import { evaluateGoal, readTasks } from '../tasks/tasks';
import { readFileSync } from 'node:fs';
import type { Topology } from '../model/types';

const example = (name: string): Topology => {
  const r = parseProject(readFileSync(`docs/beispiele/${name}.json`, 'utf8'));
  if (!r.ok) throw new Error('Beispiel');
  return r.topology;
};
const id = (t: Topology, name: string) => t.devices.find((d) => d.name === name)!.id;
const codes = (sim: Simulation, device: string) => sim.getDeviceState(device).console.map((l) => l.code);

describe('Ping-Optionen', () => {
  it('liest -t, -n, -c, -i und lehnt Falsches ab', () => {
    expect(parsePing(['10.0.0.1'])).toEqual({ target: '10.0.0.1', options: {} });
    expect(parsePing(['10.0.0.1', '-t'])).toEqual({ target: '10.0.0.1', options: { count: null } });
    expect(parsePing(['-n', '10', 'server', '-i', '3'])).toEqual({ target: 'server', options: { count: 10, ttl: 3 } });
    expect(parsePing(['-c', '2', '::1'])).toEqual({ target: '::1', options: { count: 2 } });
    expect(parsePing(['-t', '-n', '5', 'x'])).toEqual({ target: 'x', options: { count: null } });
    for (const bad of [[], ['-t'], ['a', 'b'], ['-x', 'a'], ['a', '-n'], ['a', '-i']]) expect(parsePing(bad)).toEqual({ error: 'usage' });
    for (const n of ['0', '1001', '-1', 'x', '1e3']) expect(parsePing(['a', '-n', n])).toEqual({ error: 'badCount', value: n });
    for (const n of ['0', '256', 'x']) expect(parsePing(['a', '-i', n])).toEqual({ error: 'badTtl', value: n });
  });

  const t = example('zwei-subnetze');
  const pc = id(t, 'PC 1');
  it('sendet genau so viele Anfragen wie verlangt', () => {
    const sim = new Simulation(t);
    sim.runCommand(pc, 'ping -n 7 192.168.2.10');
    sim.runUntil(60_000);
    expect(codes(sim, pc).filter((c) => c === 'ping.reply')).toHaveLength(7);
    expect(sim.getDeviceState(pc).pinging).toBeUndefined();
    sim.runCommand(pc, 'ping -c 2 192.168.2.10');
    sim.runUntil(120_000);
    expect(codes(sim, pc).filter((c) => c === 'ping.summary')).toHaveLength(2);
  });

  it('Dauerping läuft bis Strg+C, zeigt Abbruch und Wiederkehr der Verbindung und dann die Statistik', () => {
    const sim = new Simulation(t);
    sim.runCommand(pc, 'ping -t 192.168.2.10');
    sim.runUntil(20_500);
    const before = codes(sim, pc).filter((c) => c === 'ping.reply').length;
    expect(before).toBeGreaterThan(15);
    expect(sim.getDeviceState(pc).pinging).toBe(true);
    const down = setInterfaceShutdown(t, id(t, 'PC 2'), 0, true);
    if (!down.ok) throw new Error(down.error.code);
    sim.updateTopology(down.value);
    sim.runUntil(40_000);
    expect(codes(sim, pc).filter((c) => c === 'ping.reply')).toHaveLength(before);
    expect(codes(sim, pc).some((c) => c === 'ping.timeout' || c.startsWith('ping.hostUnreachable'))).toBe(true);
    sim.updateTopology(t);
    sim.runUntil(60_000);
    expect(codes(sim, pc).filter((c) => c === 'ping.reply').length).toBeGreaterThan(before + 5);
    sim.interrupt(pc);
    const count = codes(sim, pc).length;
    expect(codes(sim, pc).slice(-2)).toEqual(['cmd.interrupt', 'ping.summary']);
    sim.runUntil(100_000);
    expect(codes(sim, pc)).toHaveLength(count);
    expect(sim.getDeviceState(pc).pinging).toBeUndefined();
  });

  it('ein neuer Ping beendet den Dauerping', () => {
    const sim = new Simulation(t);
    sim.runCommand(pc, 'ping -t 192.168.2.10');
    sim.runUntil(5000);
    sim.runCommand(pc, 'ping -n 1 192.168.1.1');
    sim.runUntil(30_000);
    expect(codes(sim, pc).filter((c) => c === 'ping.summary')).toHaveLength(2);
  });

  it('TTL 1 läuft beim ersten Router ab, TTL 2 reicht', () => {
    const sim = new Simulation(t);
    sim.runCommand(pc, 'ping -n 1 -i 1 192.168.2.10');
    sim.runUntil(10_000);
    const expired = sim.getDeviceState(pc).console.find((l) => l.code === 'ping.ttlExpiredSet');
    expect(expired?.params).toMatchObject({ from: '192.168.1.1', ttl: 1 });
    sim.runCommand(pc, 'ping -n 1 -i 2 192.168.2.10');
    sim.runUntil(20_000);
    expect(codes(sim, pc)).toContain('ping.reply');
    sim.runCommand(pc, 'ping -i 0 192.168.2.10');
    expect(codes(sim, pc).at(-1)).toBe('ping.badTtl');
  });
});

describe('Netzscanner: Angaben', () => {
  it('Ziele: Adresse, Bereich, Netz; Grenzen', () => {
    expect(parseTargets('192.168.1.0/30')).toEqual({ ips: ['192.168.1.1', '192.168.1.2'] });
    expect(parseTargets('10.0.0.4/31')).toEqual({ ips: ['10.0.0.4', '10.0.0.5'] });
    expect(parseTargets('10.0.0.8-10, 10.0.0.1')).toEqual({ ips: ['10.0.0.8', '10.0.0.9', '10.0.0.10', '10.0.0.1'] });
    expect((parseTargets('192.168.1.77/24') as { ips: string[] }).ips).toHaveLength(254);
    for (const bad of ['', 'x', '10.0.0.300', '10.0.0.5-3', '10.0.0.1/33', '10.0.0']) expect(parseTargets(bad)).toEqual({ error: 'badTarget' });
    for (const big of ['10.0.0.0/8', '10.0.0.0/24 10.0.1.0/24']) expect(parseTargets(big)).toEqual({ error: 'tooManyHosts' });
  });
  it('Ports: Liste und Bereich; Grenzen', () => {
    expect(parsePorts('80,22,20-23')).toEqual({ ports: [20, 21, 22, 23, 80] });
    for (const bad of ['', '0', '65536', '9-3', 'http', '80;90']) expect(parsePorts(bad)).toEqual({ error: 'badPorts' });
    expect(parsePorts(`1-${SCAN_MAX_PORTS + 1}`)).toEqual({ error: 'tooManyPorts' });
    expect(parsePorts('1-65535')).toEqual({ error: 'tooManyPorts' });
  });
  it('Router aus der TTL', () => {
    expect([64, 63, 61, 128, 127, 250].map(hopsFromTtl)).toEqual([0, 1, 3, 0, 1, 5]);
  });
});

describe('Netzscanner: Suche', () => {
  const web = example('web');
  const server = web.devices.find((d) => d.webServer)!;
  const client = web.devices.find((d) => d.type === 'pc' || d.type === 'notebook')!;
  const ip = server.interfaces[0]!.ip!;

  it('findet Geräte und unterscheidet offen und geschlossen; hinterlässt keine Verbindungen', () => {
    const sim = new Simulation(web);
    sim.runUntil(5000);
    expect(sim.scan(client.id, { target: ip, ports: [22, 80] })).toBeNull();
    sim.runUntil(20_000);
    const scan = sim.getDeviceState(client.id).scan!;
    expect(scan.status).toBe('done');
    expect(scan.hosts).toHaveLength(1);
    expect(scan.hosts[0]!.ports).toEqual([
      { port: 22, state: 'closed', service: 'ssh' },
      { port: 80, state: 'open', service: 'http' },
    ]);
    sim.runUntil(60_000);
    expect(sim.getDeviceState(server.id).connections).toEqual([]);
  });

  it('abgeschaltete Adressen fehlen, ein ganzes Netz endet von selbst', () => {
    const t = example('arp-ping');
    const pc = t.devices.find((d) => d.interfaces[0]?.ip === '192.168.1.10')!;
    const sim = new Simulation(t);
    expect(sim.scan(pc.id, { target: '192.168.1.0/24', discoverOnly: true })).toBeNull();
    sim.runUntil(15_000);
    const scan = sim.getDeviceState(pc.id).scan!;
    expect(scan.status).toBe('done');
    const expected = t.devices.map((d) => d.interfaces[0]?.ip).filter((x): x is string => !!x && x.startsWith('192.168.1.')).sort();
    expect(scan.hosts.map((h) => h.ip).sort()).toEqual(expected);
    expect(scan.hosts.find((h) => h.ip === '192.168.1.10')!.via).toBe('self');
    expect(scan.hosts.filter((h) => h.via === 'icmp').every((h) => h.mac && h.hops === 0)).toBe(true);
  });

  it('lässt sich anhalten; eine neue Suche löst die alte ab', () => {
    const sim = new Simulation(web);
    sim.runUntil(5000);
    sim.scan(client.id, { target: ip, ports: [80, 81, 82] });
    sim.runUntil(5100);
    sim.scanStop(client.id);
    expect(sim.getDeviceState(client.id).scan!.status).toBe('stopped');
    sim.runUntil(20_000);
    expect(sim.getDeviceState(client.id).scan!.status).toBe('stopped');
    expect(sim.scan(client.id, { target: 'x' })).toBe('badTarget');
    expect(sim.scan(client.id, { target: '10.0.0.0/24', ports: Array.from({ length: 100 }, (_, i) => i + 1), skipDiscovery: true })).toBe('tooManyProbes');
  });

  it('gefiltert: Ein Router beantwortet unbekannte Ports nicht; die Befehlszeile braucht die Installation', () => {
    const t = example('zwei-subnetze');
    const pc = id(t, 'PC 1');
    const sim = new Simulation(t);
    sim.runCommand(pc, 'nmap 192.168.1.1');
    expect(codes(sim, pc).at(-1)).toBe('scan.notInstalled');
    const installed = setScanner(t, pc, true);
    if (!installed.ok) throw new Error();
    sim.updateTopology(installed.value);
    sim.runCommand(pc, 'nmap -p 80 192.168.1.1');
    sim.runUntil(20_000);
    expect(sim.getDeviceState(pc).scan!.hosts[0]!.ports).toEqual([{ port: 80, state: 'filtered', service: 'http' }]);
    expect(codes(sim, pc)).toEqual(expect.arrayContaining(['scan.start', 'scan.host', 'scan.filtered', 'scan.done']));
    sim.runCommand(pc, 'nmap -p 0 192.168.1.1');
    expect(codes(sim, pc).at(-1)).toBe('scan.badPorts');
    sim.runCommand(pc, 'nmap --script x 192.168.1.1');
    expect(codes(sim, pc).at(-1)).toBe('cmd.usage.nmap');
  });

  it('installieren nur auf PC, Notebook, Server; die Datei behält es', () => {
    const t = example('zwei-subnetze');
    expect(setScanner(t, id(t, 'Router 1'), true).ok).toBe(false);
    const on = setScanner(t, id(t, 'PC 1'), true);
    if (!on.ok) throw new Error();
    const back = parseProject(serializeProject(on.value));
    expect(back.ok && back.topology.devices.find((d) => d.name === 'PC 1')!.scanner).toBe(true);
    const off = setScanner(on.value, id(t, 'PC 1'), false);
    expect(off.ok && 'scanner' in off.value.devices.find((d) => d.name === 'PC 1')!).toBe(false);
  });
});

describe('Prüfbaustein «port»', () => {
  const goal = (check: object) => readTasks({ title: 'x', goals: [{ id: 'a', text: 'a', check }] }, (path) => {
      throw new Error(path);
    });
  it('offen, geschlossen, gefiltert, nicht offen; von aussen über die Portweiterleitung', () => {
    const t = example('web');
    const from = t.devices.find((d) => d.type === 'pc' || d.type === 'notebook')!.name;
    const to = t.devices.find((d) => d.webServer)!.name;
    const run = (port: number, state?: string) => evaluateGoal(t, goal({ type: 'port', from, to, port, ...(state ? { state } : {}) }).goals[0]!).passed;
    expect([run(80), run(80, 'blocked'), run(81), run(81, 'closed'), run(81, 'blocked')]).toEqual([true, false, false, true, true]);
    expect(evaluateGoal(t, goal({ type: 'port', from, to, port: 81 }).goals[0]!)).toMatchObject({ passed: false, reason: { code: 'portState' } });
  });
  it('lehnt falsche Angaben ab', () => {
    for (const bad of [{ port: 0 }, { port: 70000 }, { port: 1.5 }, {}, { port: 80, state: 'x' }]) expect(() => goal({ type: 'port', from: 'a', to: 'b', ...bad })).toThrow();
  });
});
