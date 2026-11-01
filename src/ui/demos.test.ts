import { describe, expect, it } from 'vitest';
import { Simulation, parseProject, type Topology } from '../core';
import de from '../i18n/de.json';
import en from '../i18n/en.json';
import { DEMOS, demoProject, type Demo } from './demos';

/**
 * Automatische Funktionsprüfung der Demo-Netze: Jede Demo wird ohne
 * Oberfläche geladen, ihre Aktionen laufen zur vorgesehenen Zeit, und am
 * Ende muss sichtbar sein, was sie zeigen soll (Ping-Antworten, Webseite,
 * Adressen per DHCP, E-Mail, Broadcast-Sturm, Traceroute bis zum Ziel).
 */
function load(demo: Demo): Topology {
  const text = demoProject(demo);
  if (!text) throw new Error(`${demo.file} fehlt`);
  const parsed = parseProject(text);
  if (!parsed.ok) throw new Error(`${demo.file}: ${parsed.error.code}`);
  return parsed.topology;
}

function run(demo: Demo) {
  const topology = load(demo);
  const id = (name: string) => {
    const device = topology.devices.find((d) => d.name === name);
    if (!device) throw new Error(`${demo.id}: Gerät «${name}» fehlt`);
    return device.id;
  };
  const sim = new Simulation(topology);
  for (const action of [...demo.actions].sort((a, b) => a.at - b.at)) {
    sim.runUntil(action.at);
    const device = id(action.device);
    if ('command' in action) sim.runCommand(device, action.command);
    else if ('browse' in action) sim.browse(device, action.browse);
    else if ('mail' in action) sim.sendMail(device, action.mail);
    else sim.fetchMail(device);
  }
  sim.runUntil(demo.until);
  return { sim, id };
}

describe('Demo-Netze', () => {
  it('jede Demo hat ihre Projektdatei und gültige Gerätenamen', () => {
    for (const demo of DEMOS) {
      const topology = load(demo);
      for (const action of demo.actions) expect(topology.devices.some((d) => d.name === action.device), `${demo.id}: ${action.device}`).toBe(true);
    }
  });

  it('Texte und Geräte der geführten Demos sind vollständig', () => {
    for (const demo of DEMOS) {
      const names = new Set(load(demo).devices.map((d) => d.name));
      for (const key of ['title', 'text', 'show']) for (const lang of [de, en] as Record<string, string>[]) expect(lang[`demo.${demo.id}.${key}`], `${demo.id}.${key}`).toBeTruthy();
      (demo.tour ?? []).forEach((step, n) => {
        for (const lang of [de, en] as Record<string, string>[]) expect(lang[`demo.${demo.id}.tour.${n}`], `${demo.id}.tour.${n}`).toBeTruthy();
        for (const name of [step.highlight, step.window?.device, step.action?.device]) if (name) expect(names.has(name), `${demo.id}: ${name}`).toBe(true);
      });
      // Keine überzähligen Texte (z.B. nach dem Entfernen eines Schritts).
      expect(Object.keys(de).filter((k) => k.startsWith(`demo.${demo.id}.tour.`))).toHaveLength(demo.tour?.length ?? 0);
    }
  });

  it.each(DEMOS.map((d) => [d.id, d] as const))('%s zeigt, was versprochen ist', (_name, demo) => {
    const { sim, id } = run(demo);
    const check = demo.check;
    const codes = (device: string) => sim.getDeviceState(id(device)).console.map((l) => l.code);
    switch (check.kind) {
      case 'ping':
        expect(codes(check.device).filter((c) => c === 'ping.reply').length).toBeGreaterThanOrEqual(check.min ?? 3);
        break;
      case 'trace':
        expect(codes(check.device)).toContain('tracert.done');
        expect(codes(check.device)).not.toContain('tracert.timeout');
        break;
      case 'browser':
        expect(sim.getDeviceState(id(check.device)).browser?.response?.body ?? '').toContain(check.contains);
        break;
      case 'dhcp':
        for (const device of check.devices) expect(sim.getDeviceState(id(device)).address?.ip, device).toBeTruthy();
        break;
      case 'mail':
        expect(sim.getDeviceState(id(check.device)).mail?.inbox.map((m) => m.subject)).toContain(check.subject);
        break;
      case 'storm':
        expect(sim.stormingDevices().length).toBeGreaterThan(0);
        break;
    }
  });
});
