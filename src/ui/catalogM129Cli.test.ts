import { describe, expect, it } from 'vitest';
import { evaluateTasks, getDevice, type Topology } from '../core';
import { execute, startSession } from '../core/cli/cli';
import { SHEETS } from '../../scripts/arbeitsblaetter/inhalt.mjs';
import { CATALOG } from './catalog';

/** Die Befehle aus der Musterlösung der Arbeitsblätter lösen die Übungen auf der Befehlszeile. */
function cli(topology: Topology, name: string, answer: string): Topology {
  let t = topology;
  const device = t.devices.find((d) => d.name === name)!;
  let session = startSession(getDevice(t, device.id)!).session;
  const lines = ['enable', ...answer.split(/;\s*|,\s*/).map((l) => l.trim()).filter(Boolean)];
  for (const line of lines) {
    const r = execute(session, line, { topology: t });
    expect(r.lines.join('\n'), `${name}: ${line}`).not.toMatch(/% (Invalid|Unknown|Incomplete)/i);
    if (r.topology) t = r.topology;
    session = r.session;
  }
  return t;
}

function answers(file: string, section: string): Record<string, string> {
  type Sheet = { file: string; sections: { id: string; blocks: { question?: { name: string; answer: string } }[] }[] };
  const sheet = (SHEETS as Sheet[]).find((s) => s.file === file)!;
  const blocks = sheet.sections.find((s) => s.id === section)!.blocks;
  return Object.fromEntries(blocks.flatMap((b) => (b.question ? [[b.question.name, b.question.answer]] : [])));
}

describe('M129 Dynamisches Routing: Befehle aus der Musterlösung', () => {
  it.each([
    ['m129-dyn-a1', 'a1', 'rip_cmd_r'],
    ['m129-dyn-a2', 'a2', 'ospf_cmd_r'],
  ])('%s', (id, section, prefix) => {
    const entry = CATALOG.find((e) => e.id === id)!.build();
    const a = answers('M129_Dynamisches_Routing', section);
    let t = entry.topology;
    for (const n of [1, 2, 3]) t = cli(t, `Router${n}`, a[`${prefix}${n}`]!);
    const results = evaluateTasks(t, entry.tasks);
    expect(results.filter((r) => !r.passed)).toEqual([]);
  });
});
