import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Simulation, parseProject, serializeProject, getDevice } from '../core';
import { buildShowcase } from './showcase.build';

const FILE = 'docs/beispiele/rz-verbund.json';

describe('Schaufenster Rechenzentren-Verbund', () => {
  const topology = buildShowcase();
  const json = serializeProject(topology) + '\n';

  it('Projektdatei ist aktuell (neu schreiben: npm run schaufenster)', () => {
    if (process.env.SCHAUFENSTER === '1' || !existsSync(FILE)) writeFileSync(FILE, json);
    expect(readFileSync(FILE, 'utf8')).toBe(json);
    expect(parseProject(json).ok).toBe(true);
  });

  it('Standorte erreichen einander durch die IPsec-Tunnel, auch per Name', () => {
    const sim = new Simulation(topology);
    const id = (name: string) => topology.devices.find((d) => d.name === name)!.id;
    sim.runUntil(8000);
    sim.ping(id('Web ZH 1'), '10.2.20.10');
    sim.ping(id('Monitoring BS'), '10.1.99.10');
    sim.runUntil(20_000);
    const replies = (name: string) => sim.getDeviceState(id(name)).console.filter((l) => l.code === 'ping.reply').length;
    expect(replies('Web ZH 1')).toBeGreaterThan(0);
    expect(replies('Monitoring BS')).toBeGreaterThan(0);
    sim.browse(id('Monitoring ZH'), 'http://web.basel.rz.example/');
    sim.runUntil(sim.now + 8000);
    expect(sim.getDeviceState(id('Monitoring ZH')).browser?.response?.body ?? '').toContain('Basel');
    expect(getDevice(topology, id('Core ZH'))?.rack).toBeTruthy();
    // Load Balancer in Zürich: zwei Aufrufe landen bei zwei verschiedenen Webservern.
    sim.browse(id('Monitoring ZH'), 'http://web.zuerich.rz.example/');
    sim.runUntil(sim.now + 6000);
    sim.browse(id('Monitoring ZH'), 'http://web.zuerich.rz.example/');
    sim.runUntil(sim.now + 6000);
    expect(sim.getDeviceState(id('LB ZH')).loadBalancer?.backends.map((b) => b.total)).toEqual([1, 1]);
  });

  it('redundant: Port-Channels gebündelt, Rapid Spanning Tree sperrt die Reserve-Uplinks, kein Sturm', () => {
    const sim = new Simulation(topology);
    const id = (name: string) => topology.devices.find((d) => d.name === name)!.id;
    sim.runUntil(12_000);
    expect(sim.stormingDevices()).toEqual([]);
    for (const core of ['Core ZH', 'Core BE', 'Core BS']) {
      const channels = sim.getDeviceState(id(core)).channels ?? [];
      expect(channels.length, core).toBeGreaterThan(0);
      for (const c of channels) expect(c.ports.every((p) => p.status === 'bundled'), core).toBe(true);
      // Der Core ist Root-Bridge seines Rechenzentrums.
      const stp = sim.getDeviceState(id(core)).stp!;
      expect(stp.rootId, core).toBe(stp.bridgeId);
    }
    // Jeder Access-Switch in Zürich und Bern hat zwei Uplinks, einer ist blockiert.
    for (const access of ['Access A ZH', 'Access B ZH', 'Access A BE', 'Access B BE']) {
      const ports = sim.getDeviceState(id(access)).stp!.ports;
      expect(ports.filter((p) => p.state === 'discarding').length, access).toBe(1);
      expect(sim.getDeviceState(id(access)).stp!.mode, access).toBe('rstp');
    }
  });
});

describe('Schaufenster: Adresse', async () => {
  const { showcase, SHOWCASE_DEFAULT } = await import('./state/showcase.svelte');
  it('?schaufenster öffnet das Standard-Schaufenster, ein Name eine andere Demo, ohne Parameter nichts', () => {
    expect(showcase.fromUrl('https://app.leyonet.ch/?schaufenster')?.id).toBe(SHOWCASE_DEFAULT);
    expect(showcase.fromUrl('https://app.leyonet.ch/?schaufenster=vpn')?.id).toBe('vpn');
    expect(showcase.fromUrl('https://app.leyonet.ch/?schaufenster=gibtsnicht')?.id).toBe(SHOWCASE_DEFAULT);
    expect(showcase.fromUrl('https://app.leyonet.ch/')).toBeNull();
    expect(showcase.fromUrl('kaputt')).toBeNull();
  });
});
