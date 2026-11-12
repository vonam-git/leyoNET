import { describe, expect, it } from 'vitest';
import { Simulation, evaluateTasks, federate, parseProject, serializeProject, type PacketLogEntry, type Topology } from '../core';
import { setLocale } from '../i18n';
import { CATALOG } from './catalog';
import { ANSWERS, SOLUTIONS } from './catalogSolutions';
import { verbundInfra } from './verbundTemplate';

setLocale('de');

const byName = (t: Topology, name: string) => t.devices.find((d) => d.name === name)!.id;
const passed = (t: Topology, id: string, log: readonly PacketLogEntry[] = [], answers?: Record<string, string>) => {
  const entry = CATALOG.find((e) => e.id === id)!;
  const { tasks } = entry.build();
  // Verbund-Aufgaben laufen im zusammengesetzten Netz (Vorlage der Lehrperson, Platz 1).
  const net = entry.verbund ? federate(verbundInfra(), [{ seat: 1, topology: t, own: true }]).topology : t;
  return evaluateTasks(net, answers ? { ...tasks, answers } : tasks, log);
};

/** Mitschnitt im Labornetz M129: Ping in die DMZ, DHCP des Gast-Notebooks, Webseite per Name. */
const labLog = (t: Topology) => {
  const sim = new Simulation(t);
  sim.runUntil(4000);
  sim.ping(byName(t, 'PC W11'), '10.10.1.20');
  sim.runUntil(sim.now + 6000);
  sim.browse(byName(t, 'PC W11'), 'http://web.labor.example/');
  sim.runUntil(sim.now + 6000);
  return sim.getPacketLog();
};

/** Mitschnitt einer Simulation, für Aufgaben, die gesendete Pakete prüfen. */
const LOGS: Record<string, (t: Topology) => readonly PacketLogEntry[]> = {
  'm129-lab-a1': labLog,
  'm129-lab-a2': labLog,
  'm129-lab-a3': labLog,
  'sniff-arp': (t) => {
    const sim = new Simulation(t);
    sim.ping(byName(t, 'PC 1'), '192.168.1.20');
    sim.runUntil(10_000);
    return sim.getPacketLog();
  },
};

describe('Aufgabenkatalog', () => {
  it('hat Aufgaben von 1 bis 5 Sternen', () => {
    expect(new Set(CATALOG.map((e) => e.stars))).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it.each(CATALOG.map((e) => e.id))('%s: Startnetz ist gültig, ungelöst und hat eine funktionierende Musterlösung', (id) => {
    const entry = CATALOG.find((e) => e.id === id)!;
    const { topology, tasks } = entry.build();
    const parsed = parseProject(serializeProject(topology, tasks));
    expect(parsed.ok).toBe(true);
    expect(tasks.difficulty).toBe(entry.stars);
    expect(passed(topology, id).every((r) => r.passed)).toBe(false);
    const solved = SOLUTIONS[id]!(topology);
    const results = passed(solved, id, LOGS[id]?.(solved), ANSWERS[id]);
    expect(results.filter((r) => !r.passed)).toEqual([]);
  });
});
