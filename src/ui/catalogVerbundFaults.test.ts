import { describe, expect, it } from 'vitest';
import { FAULT_GOAL_PREFIX, evaluateTasks, federate } from '../core';
import { setLocale } from '../i18n';
import { VERBUND_FAULTS, buildVerbundFaults, verbundFaultSite } from './catalogVerbundFaults';
import { verbundInfra } from './verbundTemplate';

setLocale('de');

const inVerbund = (seat: number, topology: Parameters<typeof evaluateTasks>[0]) => federate(verbundInfra(), [{ seat, topology, own: true }]).topology;

describe('Verbund-Fehlersuche', () => {
  it('baut an jedem Platz fünf Fehler ein, die anfangs alle offen sind', () => {
    for (const seat of [1, 2, 7, 23, 62]) {
      const { topology, tasks } = buildVerbundFaults({ seat, salt: 'K-ABC' });
      const faults = tasks.goals.filter((g) => g.id.startsWith(FAULT_GOAL_PREFIX));
      expect(faults).toHaveLength(VERBUND_FAULTS);
      const results = evaluateTasks(inVerbund(seat, topology), tasks);
      for (const f of faults) expect(results.find((r) => r.id === f.id)?.passed).toBe(false);
    }
  });

  it('die fehlerfreie Vorlage erfüllt an jedem Platz alle Ziele', () => {
    for (const seat of [3, 41]) {
      const { tasks } = buildVerbundFaults({ seat, salt: 'K-ABC' });
      const results = evaluateTasks(inVerbund(seat, verbundFaultSite(seat)), tasks);
      expect(results.filter((r) => !r.passed)).toEqual([]);
    }
  });

  it('Nachbarn haben andere Fehler, derselbe Platz bleibt gleich', () => {
    const kinds = (seat: number, salt = 'K-ABC') => JSON.stringify(buildVerbundFaults({ seat, salt }).tasks.goals.filter((g) => g.id.startsWith(FAULT_GOAL_PREFIX)).map((g) => g.check));
    expect(kinds(4)).toBe(kinds(4));
    const all = new Set(Array.from({ length: 12 }, (_, i) => kinds(i + 1)));
    expect(all.size).toBeGreaterThan(8);
    expect(kinds(4, 'K-XYZ')).not.toBe(kinds(4, 'K-ABC'));
  });

  it('verrät die Fehler nicht im Ziel-Text, nur im Tipp', () => {
    const { tasks } = buildVerbundFaults({ seat: 5 });
    for (const g of tasks.goals.filter((x) => x.id.startsWith(FAULT_GOAL_PREFIX))) {
      expect(g.text).toMatch(/^Fehler \d von 5 behoben$/);
      expect(g.hint).toBeTruthy();
    }
  });

  it('ein einzelner Fehler lässt sich unabhängig von den anderen beheben', () => {
    // Behebt man nur die Konfiguration eines Fehlers (Gerät aus der Vorlage), ist genau dieses Ziel erfüllt.
    const seat = 9;
    const { topology, tasks } = buildVerbundFaults({ seat, salt: 'K-ABC' });
    const clean = verbundFaultSite(seat);
    const faults = tasks.goals.filter((g) => g.id.startsWith(FAULT_GOAL_PREFIX));
    for (const f of faults) {
      const device = 'device' in f.check ? (f.check as { device: string }).device : null;
      if (!device || f.check.type === 'connected' || f.check.type === 'linkUp') continue;
      const fixed = { ...topology, devices: topology.devices.map((d) => (d.name === device ? clean.devices.find((c) => c.name === device)! : d)) };
      const results = evaluateTasks(inVerbund(seat, fixed), tasks);
      expect(results.find((r) => r.id === f.id)?.passed).toBe(true);
    }
  });
});
