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
    sim.ping(id('Web ZH'), '10.2.20.10');
    sim.ping(id('Monitoring BS'), '10.1.99.10');
    sim.runUntil(20_000);
    const replies = (name: string) => sim.getDeviceState(id(name)).console.filter((l) => l.code === 'ping.reply').length;
    expect(replies('Web ZH')).toBeGreaterThan(0);
    expect(replies('Monitoring BS')).toBeGreaterThan(0);
    sim.browse(id('Monitoring ZH'), 'http://web.basel.rz.example/');
    sim.runUntil(sim.now + 8000);
    expect(sim.getDeviceState(id('Monitoring ZH')).browser?.response?.body ?? '').toContain('Basel');
    expect(getDevice(topology, id('Core ZH'))?.rack).toBeTruthy();
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
