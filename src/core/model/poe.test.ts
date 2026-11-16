import { describe, expect, it } from 'vitest';
import { execute, runningConfig, startSession } from '../cli/cli';
import { cliIfaceName } from '../cli/names';
import { parseProject, serializeProject } from '../io/project';
import { Simulation } from '../sim/simulation';
import { NetBuilder } from '../sim/testing';
import { devicePrice } from './costs';
import { linkStatus } from './links';
import { POE_CLASS_PSE_WATTS, poeReport } from './poe';
import { configureHost, getCable, getDevice, setPoe, setPoeClass, setPortPoe, setPowerSource } from './topology';

const replies = (sim: Simulation, id: string) => sim.getDeviceState(id).console.filter((l) => l.code === 'ping.reply').length;

/** PoE-Switch mit Telefon (Klasse 2), Kamera (Klasse 3) und Access Point per PoE (Klasse 4). */
function office(standard: 'af' | 'at' | 'bt3' | 'bt4' = 'at', budget = 60) {
  const net = new NetBuilder();
  const sw = net.add('switch', 'SW1');
  const phone = net.add('ipphone', 'Tel1');
  const cam = net.add('camera', 'Cam1');
  const ap = net.add('accesspoint', 'AP1');
  const pc = net.host('PC1', '192.168.10.10');
  net.apply((t) => configureHost(t, phone, { ip: '192.168.10.20', mask: '255.255.255.0' }));
  net.apply((t) => configureHost(t, cam, { ip: '192.168.10.30', mask: '255.255.255.0' }));
  net.apply((t) => setPowerSource(t, ap, 'poe'));
  const cables = { phone: net.link(sw, phone), cam: net.link(sw, cam), ap: net.link(sw, ap), pc: net.link(sw, pc) };
  net.apply((t) => setPoe(t, sw, { standard, budget }));
  return { net, sw, phone, cam, ap, pc, cables };
}

describe('Power over Ethernet (IEEE 802.3, Klausel 33 und 145)', () => {
  it('speist die Geräte nach Klasse und rechnet das Budget', () => {
    const { net, sw, phone, cam, ap } = office('at', 60);
    const r = poeReport(net.topology);
    expect(r.devices.get(phone)).toMatchObject({ powered: true, watts: 7 });
    expect(r.devices.get(cam)).toMatchObject({ powered: true, watts: 15.4 });
    expect(r.devices.get(ap)).toMatchObject({ powered: true, watts: 30 });
    expect(r.supplies.get(sw)).toMatchObject({ used: 52.4, budget: 60 });
  });

  it('ohne Strom ist das Gerät aus: Budget aufgebraucht, Klasse zu hoch, kein PoE', () => {
    const tight = office('at', 25);
    const r = poeReport(tight.net.topology);
    expect(r.devices.get(tight.phone)!.powered).toBe(true);
    expect(r.devices.get(tight.cam)!.powered).toBe(true);
    expect(r.devices.get(tight.ap)).toMatchObject({ powered: false, reason: 'budget' });
    expect(linkStatus(tight.net.topology, getCable(tight.net.topology, tight.cables.ap)!)).toMatchObject({ up: false, reason: 'noPower' });

    const af = office('af', 370);
    expect(poeReport(af.net.topology).devices.get(af.ap)).toMatchObject({ powered: false, reason: 'classTooHigh' });

    const none = office();
    none.net.apply((t) => setPoe(t, none.sw, null));
    expect(poeReport(none.net.topology).devices.get(none.phone)).toMatchObject({ powered: false, reason: 'noSource' });
    // Der PC braucht keinen Strom vom Switch.
    expect(linkStatus(none.net.topology, getCable(none.net.topology, none.cables.pc)!).up).toBe(true);
  });

  it('Port ohne PoE, Netzteil und eigene Klasse', () => {
    const o = office('at', 60);
    o.net.apply((t) => setPortPoe(t, o.sw, 0, false));
    expect(poeReport(o.net.topology).devices.get(o.phone)).toMatchObject({ powered: false, reason: 'portOff' });
    o.net.apply((t) => setPowerSource(t, o.phone, 'local'));
    expect(poeReport(o.net.topology).devices.has(o.phone)).toBe(false);
    o.net.apply((t) => setPoeClass(t, o.cam, 1));
    expect(poeReport(o.net.topology).devices.get(o.cam)!.watts).toBe(POE_CLASS_PSE_WATTS[1]);
    expect(setPoeClass(o.net.topology, o.cam, 9).ok).toBe(false);
    expect(setPoe(o.net.topology, o.phone, { standard: 'at', budget: 30 }).ok).toBe(false);
    expect(setPoe(o.net.topology, o.sw, { standard: 'at', budget: 0 }).ok).toBe(false);
    expect(setPowerSource(o.net.topology, o.pc, 'poe').ok).toBe(false);
  });

  it('gespeiste Geräte antworten auf Ping, ungespeiste nicht', () => {
    const o = office('at', 25);
    o.net.apply((t) => setPowerSource(t, o.ap, 'local'));
    o.net.apply((t) => setPoeClass(t, o.cam, 4));
    // Telefon (7 W) passt ins Budget, die Kamera mit Klasse 4 (30 W) nicht mehr.
    const ping = (ip: string) => {
      const sim = new Simulation(o.net.topology);
      sim.ping(o.pc, ip);
      sim.runUntilIdle();
      return replies(sim, o.pc);
    };
    expect(ping('192.168.10.20')).toBe(4);
    expect(ping('192.168.10.30')).toBe(0);
  });

  it('Access Points ohne Angabe behalten ihr Netzteil (ältere Projekte)', () => {
    const net = new NetBuilder();
    const sw = net.add('switch', 'SW1');
    const ap = net.add('accesspoint', 'AP1');
    const cable = net.link(sw, ap);
    expect(linkStatus(net.topology, getCable(net.topology, cable)!).up).toBe(true);
  });

  it('wird gespeichert und geladen, PoE kostet Aufpreis', () => {
    const o = office('bt4', 740);
    o.net.apply((t) => setPortPoe(t, o.sw, 3, false));
    o.net.apply((t) => setPoeClass(t, o.cam, 4));
    const parsed = parseProject(serializeProject(o.net.topology));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const sw = getDevice(parsed.topology, o.sw)!;
    expect(sw.poe).toEqual({ standard: 'bt4', budget: 740 });
    expect(sw.interfaces[3]!.poeOff).toBe(true);
    expect(getDevice(parsed.topology, o.cam)!.poeClass).toBe(4);
    expect(getDevice(parsed.topology, o.ap)!.power).toBe('poe');
    const plain = { ...sw, poe: undefined };
    expect(devicePrice(sw)).toBeGreaterThan(devicePrice(plain));
    // Fremde Dateien: PoE nur auf Switches, Klassen 0–8.
    const bad = JSON.parse(serializeProject(o.net.topology));
    bad.topology.devices.find((d: { name: string }) => d.name === 'Cam1').poeClass = 12;
    expect(parseProject(JSON.stringify(bad)).ok).toBe(false);
  });
});


describe('PoE in der CLI', () => {
  it('show power inline, power inline never und running-config', () => {
    const o = office('at', 60);
    const run = (topology: typeof o.net.topology, lines: string[]) => {
      let session = startSession(getDevice(topology, o.sw)!).session;
      let current = topology;
      const output: string[] = [];
      for (const line of lines) {
        const result = execute(session, line, { topology: current });
        if (result.topology) current = result.topology;
        output.push(...result.lines);
        session = result.session;
      }
      return { topology: current, output };
    };
    const shown = run(o.net.topology, ['show power inline']).output.join('\n');
    expect(shown).toContain('Available:60.0(w)  Used:52.4(w)  Remaining:7.6(w)');
    expect(shown).toMatch(/Tel1/);
    const { topology } = run(o.net.topology, ['enable', 'configure terminal', `interface ${cliIfaceName(getDevice(o.net.topology, o.sw)!, 0)}`, 'power inline never']);
    expect(poeReport(topology).devices.get(o.phone)).toMatchObject({ powered: false, reason: 'portOff' });
    expect(runningConfig(getDevice(topology, o.sw)!).join('\n')).toContain(' power inline never');
  });
});
