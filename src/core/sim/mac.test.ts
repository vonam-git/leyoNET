import { describe as group, expect, it } from 'vitest';
import { getDevice, setInterfaceMac } from '../model/topology';
import { duplicateMacs } from '../model/duplicates';
import { normalizeMac } from '../model/mac';
import { Simulation } from './simulation';
import { NetBuilder, describe, unwrap } from './testing';

function lan() {
  const net = new NetBuilder();
  const sw = net.add('switch', 'SW');
  const a = net.host('PC1', '10.0.0.1');
  const b = net.host('PC2', '10.0.0.2');
  const c = net.host('PC3', '10.0.0.3');
  for (const h of [a, b, c]) net.link(h, sw);
  return { net, sw, a, b, c };
}

group('MAC-Adressen von Hand', () => {
  it('Schreibweisen, ungültige und Gruppenadressen', () => {
    expect(normalizeMac('02-00-00-00-01-01')).toBe('02:00:00:00:01:01');
    expect(normalizeMac('0200.0000.0101')).toBe('02:00:00:00:01:01');
    expect(normalizeMac('020000000101')).toBe('02:00:00:00:01:01');
    expect(normalizeMac('2:0:0:0:1:1')).toBe('02:00:00:00:01:01');
    expect(normalizeMac('02:00:00:00:01')).toBeNull();
    const { net, a } = lan();
    expect(setInterfaceMac(net.topology, a, 0, 'xyz')).toMatchObject({ ok: false, error: { code: 'invalidMac' } });
    expect(setInterfaceMac(net.topology, a, 0, 'FF:FF:FF:FF:FF:FF')).toMatchObject({ ok: false, error: { code: 'macGroup' } });
    expect(setInterfaceMac(net.topology, a, 0, '01:00:5E:00:00:01')).toMatchObject({ ok: false, error: { code: 'macGroup' } });
    expect(setInterfaceMac(net.topology, a, 0, '00:00:00:00:00:00')).toMatchObject({ ok: false, error: { code: 'macZero' } });
    const original = getDevice(net.topology, a)!.interfaces[0]!.mac;
    const changed = unwrap(setInterfaceMac(net.topology, a, 0, 'aa-bb-cc-00-11-22'));
    expect(getDevice(changed, a)!.interfaces[0]!.mac).toBe('AA:BB:CC:00:11:22');
    // Leer = wieder ab Werk.
    expect(getDevice(unwrap(setInterfaceMac(changed, a, 0, '')), a)!.interfaces[0]!.mac).toBe(original);
  });

  it('doppelte MAC im selben Netz wird erkannt, hinter einem Router nicht', () => {
    const { net, a, b } = lan();
    const macA = getDevice(net.topology, a)!.interfaces[0]!.mac;
    expect(duplicateMacs(net.topology).size).toBe(0);
    net.apply((t) => setInterfaceMac(t, b, 0, macA));
    expect([...duplicateMacs(net.topology)].sort()).toEqual([`${a}#0`, `${b}#0`].sort());

    const other = new NetBuilder();
    const r = other.add('router', 'R');
    const x = other.host('X', '10.0.1.2');
    const y = other.host('Y', '10.0.2.2');
    other.link(x, r);
    other.link(y, r);
    other.apply((t) => setInterfaceMac(t, y, 0, getDevice(t, x)!.interfaces[0]!.mac));
    expect(duplicateMacs(other.topology).size).toBe(0);
  });

  it('Simulation: der Switch lernt die MAC abwechselnd an zwei Ports und meldet das', () => {
    const { net, sw, a, b, c } = lan();
    net.apply((t) => setInterfaceMac(t, b, 0, getDevice(t, a)!.interfaces[0]!.mac));
    const sim = new Simulation(net.topology);
    sim.ping(c, '10.0.0.1');
    sim.ping(b, '10.0.0.3');
    sim.runUntilIdle();
    const log = sim.getPacketLog().map((e) => describe(net.topology, e));
    expect(log.length).toBeGreaterThan(0);
    expect(sim.getDeviceState(sw).console.map((l) => l.code)).toContain('switch.macFlap');
  });
});
