import { describe, expect, it } from 'vitest';
import { parseProject, serializeProject } from '../io/project';
import { getDevice } from '../model/topology';
import { NetBuilder } from '../sim/testing';
import { evaluateTasks } from '../tasks/tasks';
import { configSaved, execute, startSession } from './cli';

function run(net: NetBuilder, id: string, lines: string[]) {
  let topology = net.topology;
  let session = startSession(getDevice(topology, id)!).session;
  const output: string[] = [];
  for (const line of lines) {
    const r = execute(session, line, { topology });
    if (r.topology) topology = r.topology;
    session = r.session;
    output.push(...r.lines);
  }
  return { topology, output: output.join('\n') };
}

describe('Konfiguration speichern (startup-config)', () => {
  it('speichert, zeigt und löscht die startup-config, erkennt Änderungen', () => {
    const net = new NetBuilder();
    const r1 = net.router('R1', ['10.0.0.1/24']);
    const first = run(net, r1, ['enable', 'show startup-config', 'copy running-config startup-config', 'show startup-config']);
    expect(first.output).toContain('startup-config is not present');
    expect(first.output).toContain('[OK]');
    expect(first.output).toContain('hostname R1');
    expect(configSaved(getDevice(first.topology, r1)!)).toBe(true);

    net.topology = first.topology;
    const changed = run(net, r1, ['enable', 'configure terminal', 'hostname Zentrale', 'end', 'reload']);
    expect(configSaved(getDevice(changed.topology, r1)!)).toBe(false);
    expect(changed.output).toContain('System configuration has been modified');

    net.topology = changed.topology;
    const saved = run(net, r1, ['enable', 'write memory']);
    expect(configSaved(getDevice(saved.topology, r1)!)).toBe(true);
    // Gespeicherte Konfiguration bleibt in der Projektdatei.
    const parsed = parseProject(serializeProject(saved.topology));
    expect(parsed.ok && getDevice(parsed.topology, r1)!.startupConfig).toContain('hostname Zentrale');

    net.topology = saved.topology;
    const erased = run(net, r1, ['enable', 'erase startup-config']);
    expect(getDevice(erased.topology, r1)!.startupConfig).toBeUndefined();
  });

  it('Prüfbaustein «Konfiguration gespeichert»', () => {
    const net = new NetBuilder();
    const r1 = net.router('R1', ['10.0.0.1/24']);
    const tasks = { title: 'x', goals: [{ id: 'g', text: 'gespeichert', check: { type: 'configSaved' as const, device: 'R1' } }] };
    expect(evaluateTasks(net.topology, tasks)[0]!.passed).toBe(false);
    const { topology } = run(net, r1, ['enable', 'write']);
    expect(evaluateTasks(topology, tasks)[0]!.passed).toBe(true);
  });
});
