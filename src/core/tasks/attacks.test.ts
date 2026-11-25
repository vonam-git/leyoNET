import { describe, expect, it } from 'vitest';
import { parseProject, serializeProject } from '../io/project';
import { addDevice, configureHost, connect, setAttack, setCliConfig, setInterfaceAddress, setProtection, setWebServerEnabled, addPortForward, setInterfaceNat, addStaticRoute } from '../model/topology';
import { emptyTopology } from '../model/topology';
import { Simulation } from '../sim/simulation';
import { attackEffect, withAttacker } from './attacks';
import type { Result } from '../model/topology';
import type { DeviceType, Topology } from '../model/types';
import { evaluateGoal, readTasks } from './tasks';

const u = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};
/** Firma: zwei PCs und ein Webserver am Switch, Router ins Internet (NAT, Port 80 weitergeleitet). */
function firm() {
  let t: Topology = emptyTopology();
  const id: Record<string, string> = {};
  const add = (type: DeviceType, name: string, options = {}) => {
    const r = u(addDevice(t, type, name, { x: 0, y: 0 }, options));
    t = r.topology;
    id[name] = r.id;
  };
  add('pc', 'PC 1');
  add('pc', 'PC 2');
  add('server', 'Web');
  add('switch', 'Switch');
  add('router', 'Router');
  add('internet', 'Internet');
  t = u(configureHost(t, id['PC 1']!, { ip: '192.168.1.11', mask: '24', gateway: '192.168.1.1' }));
  t = u(configureHost(t, id['PC 2']!, { ip: '192.168.1.12', mask: '24', gateway: '192.168.1.1' }));
  t = u(configureHost(t, id['Web']!, { ip: '192.168.1.80', mask: '24', gateway: '192.168.1.1' }));
  t = u(setWebServerEnabled(t, id['Web']!, true, [{ path: '/index.html', content: 'Firma' }]));
  t = u(setInterfaceAddress(t, id['Router']!, 0, '192.168.1.1', '24'));
  t = u(setInterfaceAddress(t, id['Router']!, 1, '203.0.113.2', '30'));
  t = u(setInterfaceNat(t, id['Router']!, 1, true));
  t = u(addStaticRoute(t, id['Router']!, { network: '0.0.0.0', mask: '0', gateway: '203.0.113.1' }));
  t = u(addPortForward(t, id['Router']!, { protocol: 'tcp', port: 80, to: '192.168.1.80', toPort: 80 }));
  t = u(setInterfaceAddress(t, id['Internet']!, 0, '203.0.113.1', '30'));
  for (const n of ['PC 1', 'PC 2', 'Web']) t = u(connect(t, id[n]!, id['Switch']!)).topology;
  t = u(connect(t, id['Router']!, id['Switch']!, 'tp', { a: 0 })).topology;
  t = u(connect(t, id['Router']!, id['Internet']!, 'tp', { a: 1, b: 0 })).topology;
  return { t, id };
}

describe('Angriffe und Abwehr', () => {
  const { t, id } = firm();
  it('ARP-Spoofing unterbricht den Weg zum Gateway; ARP-Schutz auf allen Geräten wehrt ab', () => {
    expect(attackEffect(t, 'arpSpoof')).toBe('effective');
    const part = u(setProtection(t, id['PC 1']!, 'arpGuard', true));
    expect(attackEffect(part, 'arpSpoof')).toBe('effective');
    const all = u(setProtection(part, id['PC 2']!, 'arpGuard', true));
    expect(attackEffect(all, 'arpSpoof')).toBe('blocked');
  });
  it('ARP-Spoofing: Der Verkehr landet beim Angreifer, der Wächter meldet die geänderte MAC', () => {
    const a = withAttacker(t, 'arpSpoof')!;
    const sim = new Simulation(a.topology);
    sim.runUntil(5000);
    sim.ping(id['PC 1']!, '192.168.1.1');
    sim.runUntil(20_000);
    expect(sim.getDeviceState(a.attacker).attack!.captured).toBeGreaterThan(0);
    const guarded = withAttacker(u(setProtection(t, id['PC 1']!, 'arpGuard', true)), 'arpSpoof')!;
    const safe = new Simulation(guarded.topology);
    safe.runUntil(5000);
    safe.ping(id['PC 1']!, '192.168.1.1');
    safe.runUntil(20_000);
    expect(safe.getDeviceState(id['PC 1']!).console.filter((l) => l.code === 'ping.reply')).toHaveLength(4);
    expect(safe.getDeviceState(id['PC 1']!).alerts!.some((x) => x.kind === 'arpBlocked')).toBe(true);
  });
  it('Der Wächter warnt auch, wenn die falsche ARP-Angabe die erste war; ohne Angriff bleibt er still', () => {
    for (const guard of [false, true]) {
      const net = guard ? u(setProtection(t, id['PC 1']!, 'arpGuard', true)) : t;
      const a = withAttacker(net, 'arpSpoof')!;
      const sim = new Simulation(a.topology);
      sim.runUntil(10_000);
      sim.ping(id['PC 1']!, '192.168.1.1');
      sim.runUntil(20_000);
      expect(sim.getDeviceState(id['PC 1']!).alerts!.map((x) => x.kind)).toContain(guard ? 'arpRejected' : 'arpFlood');
    }
    const quiet = new Simulation(t);
    for (let i = 0; i < 12; i++) {
      quiet.ping(id['PC 1']!, '192.168.1.80');
      quiet.ping(id['PC 2']!, '192.168.1.11');
      quiet.runUntil(quiet.now + 5000);
    }
    for (const n of ['PC 1', 'PC 2', 'Web']) expect(quiet.getDeviceState(id[n]!).alerts).toBeUndefined();
  });
  it('SYN-Flood aus dem Internet legt die Webseite lahm; SYN-Cookies wehren ab', () => {
    expect(attackEffect(t, 'synFlood')).toBe('effective');
    expect(attackEffect(u(setProtection(t, id['Web']!, 'synCookies', true)), 'synFlood')).toBe('blocked');
    const a = withAttacker(t, 'synFlood')!;
    expect(a.topology.devices.find((d) => d.id === a.attacker)!.interfaces[0]!.ip).toBe('198.18.0.2');
    const sim = new Simulation(a.topology);
    sim.runUntil(10_000);
    expect(sim.getDeviceState(id['Web']!).alerts!.some((x) => x.kind === 'synFlood')).toBe(true);
  });
  it('SSH: schwaches Passwort wird erraten, starkes nicht; ohne SSH kein Ziel', () => {
    expect(attackEffect(t, 'sshGuess')).toBe('noTarget');
    const ssh = (password: string) => u(setCliConfig(t, id['Router']!, { ssh: true, users: [{ name: 'admin', password }] }));
    expect(attackEffect(ssh('cisco'), 'sshGuess')).toBe('effective');
    expect(attackEffect(ssh('Zug-nach-Sursee-17'), 'sshGuess')).toBe('blocked');
  });
  it('Portscan von aussen: nur Web offen ist gut, ein zusätzlicher Port nicht', () => {
    expect(attackEffect(t, 'portScan')).toBe('blocked');
    const more = u(addPortForward(t, id['Router']!, { protocol: 'tcp', port: 8080, to: '192.168.1.80', toPort: 80 }));
    expect(attackEffect(more, 'portScan')).toBe('effective');
  });
  it('ohne Netz kein Ziel; das Projekt bleibt unverändert', () => {
    for (const kind of ['arpSpoof', 'synFlood', 'portScan', 'sshGuess'] as const) expect(attackEffect(emptyTopology(), kind)).toBe('noTarget');
    const before = JSON.stringify(t);
    withAttacker(t, 'arpSpoof');
    expect(JSON.stringify(t)).toBe(before);
  });
  it('Angreifer als Gerät: nur die Variante darf angreifen; die Datei prüft die Angaben', () => {
    const added = u(addDevice(t, 'notebook', 'Angreifer', { x: 0, y: 0 }, { variant: 'attacker' }));
    expect(setAttack(added.topology, id['PC 1']!, { kind: 'synFlood' }).ok).toBe(false);
    expect(setAttack(added.topology, added.id, { kind: 'synFlood', delay: 9999 }).ok).toBe(false);
    let x = u(setAttack(added.topology, added.id, { kind: 'synFlood', target: 'Web', delay: 5 }));
    x = u(configureHost(x, added.id, { ip: '192.168.1.66', mask: '24', gateway: '192.168.1.1' }));
    x = u(connect(x, added.id, id['Switch']!)).topology;
    const back = parseProject(serializeProject(x));
    expect(back.ok && back.topology.devices.find((d) => d.id === added.id)!.attack).toEqual({ kind: 'synFlood', target: 'Web', delay: 5 });
    const sim = new Simulation(x);
    sim.runUntil(4000);
    expect(sim.getDeviceState(added.id).attack).toMatchObject({ sent: 0 });
    sim.runUntil(8000);
    expect(sim.getDeviceState(added.id).attack).toMatchObject({ kind: 'synFlood', target: '192.168.1.80' });
    expect(sim.getDeviceState(added.id).attack!.sent).toBeGreaterThan(50);
    sim.updateTopology(u(setAttack(x, added.id, null)));
    sim.runUntil(9000);
    expect(sim.getDeviceState(added.id).attack).toBeUndefined();
    const raw = JSON.parse(serializeProject(x));
    raw.topology.devices.find((d: { id: string }) => d.id === id['PC 1']).attack = { kind: 'synFlood' };
    expect(parseProject(JSON.stringify(raw)).ok).toBe(false);
    raw.topology.devices.find((d: { id: string }) => d.id === id['PC 1']).attack = undefined;
    raw.topology.devices.find((d: { id: string }) => d.id === added.id).attack = { kind: 'rm' };
    expect(parseProject(JSON.stringify(raw)).ok).toBe(false);
  });
  it('Prüfbaustein «resist»', () => {
    const goal = (attack: string) => readTasks({ title: 'x', goals: [{ id: 'a', text: 'a', check: { type: 'resist', attack } }] }, (p) => { throw new Error(p); }).goals[0]!;
    expect(evaluateGoal(t, goal('synFlood'))).toMatchObject({ passed: false, reason: { code: 'attackEffective' } });
    expect(evaluateGoal(t, goal('portScan')).passed).toBe(true);
    expect(evaluateGoal(t, goal('sshGuess'))).toMatchObject({ passed: false, reason: { code: 'attackNoTarget' } });
    expect(() => goal('rm -rf')).toThrow();
  });
});
