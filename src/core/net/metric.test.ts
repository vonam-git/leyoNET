import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseProject, serializeProject } from '../io/project';
import { addStaticRoute, removeCable } from '../model/topology';
import type { Topology } from '../model/types';
import { Simulation } from '../sim/simulation';
import { execute, runningConfig, startSession } from '../cli/cli';
import { lookupRoute, type Route } from './routing';

const example = (name: string): Topology => {
  const r = parseProject(readFileSync(`docs/beispiele/${name}.json`, 'utf8'));
  if (!r.ok) throw new Error('Beispiel');
  return r.topology;
};
const u = <T>(r: { ok: true; value: T } | { ok: false; error: { code: string } }): T => {
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};

describe('Routenwahl nach RFC 1812 (5.2.4.3): Präfix, Distanz, Metrik', () => {
  const r = (prefix: number, distance: number, metric: number, via: number): Route => ({ network: 0, prefix, iface: 0, via, kind: 'ospf', distance, metric });
  it('längster Präfix vor Distanz, Distanz vor Metrik, sonst die kleinere Metrik', () => {
    expect(lookupRoute([r(0, 1, 0, 1), r(8, 110, 50, 2)], 5)!.via).toBe(2);
    expect(lookupRoute([r(8, 120, 1, 1), r(8, 110, 50, 2)], 5)!.via).toBe(2);
    expect(lookupRoute([r(8, 110, 30, 1), r(8, 110, 20, 2)], 5)!.via).toBe(2);
    expect(lookupRoute([r(8, 110, 20, 1), r(8, 110, 20, 2)], 5)!.via).toBe(1);
  });
});

describe('Statische Route mit Distanz (Floating Static Route)', () => {
  it('Reserve-Route gilt erst, wenn der bessere Anschluss ausfällt; Befehlszeile und Datei kennen die Distanz', () => {
    const t = example('statische-routen');
    const router = t.devices.find((d) => d.type === 'router' && (d.routes ?? []).length > 0)!;
    const first = router.routes![0]!;
    // Doppelt mit gleicher Distanz: abgelehnt; mit anderer Distanz erlaubt.
    expect(addStaticRoute(t, router.id, { ...first }).ok).toBe(false);
    expect(addStaticRoute(t, router.id, { ...first, distance: 0 }).ok).toBe(false);
    expect(addStaticRoute(t, router.id, { ...first, distance: 256 }).ok).toBe(false);
    // Reserve über einen anderen Anschluss (der erste mit Adresse, der nicht der bisherige Weg ist).
    const sim0 = new Simulation(t);
    const primary = sim0.getRoutes(router.id).find((x) => x.kind === 'static')!;
    const other = router.interfaces.find((i) => i.ip && i.index !== primary.iface)!;
    const backup = u(addStaticRoute(t, router.id, { network: first.network, mask: first.mask, iface: other.index, distance: 200 }));
    const back = parseProject(serializeProject(backup));
    expect(back.ok && back.topology.devices.find((d) => d.id === router.id)!.routes!.at(-1)!.distance).toBe(200);
    const sim = new Simulation(backup);
    const chosen = (s: Simulation) => s.getRoutes(router.id).filter((x) => x.kind === 'static').sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))[0]!;
    expect(chosen(sim).iface).toBe(primary.iface);
    // Kabel am bisherigen Weg ziehen: Die Reserve-Route übernimmt.
    const cable = backup.cables.find((c) => (c.a.device === router.id && c.a.iface === primary.iface) || (c.b.device === router.id && c.b.iface === primary.iface))!;
    const cut = u(removeCable(backup, cable.id));
    const sim2 = new Simulation(cut);
    expect(chosen(sim2)).toMatchObject({ iface: other.index, distance: 200 });
    // Befehlszeile: «ip route … 200» und running-config.
    const d = backup.devices.find((x) => x.id === router.id)!;
    expect(runningConfig(d).some((l) => l.startsWith('ip route') && l.endsWith(' 200'))).toBe(true);
    let { session } = startSession(router);
    let topology = t;
    for (const line of ['enable', 'configure terminal', `ip route 10.77.0.0/16 ${router.interfaces.find((i) => i.ip)!.ip!.replace(/\.\d+$/, '.250')} 150`]) {
      const out = execute(session, line, { topology });
      session = out.session;
      if (out.topology) topology = out.topology;
      expect(out.lines.join('\n')).not.toMatch(/%/);
    }
    expect(topology.devices.find((x) => x.id === router.id)!.routes!.at(-1)).toMatchObject({ network: '10.77.0.0', distance: 150 });
    expect(execute(session, 'do show ip route', { topology }).lines.join('\n') + runningConfig(topology.devices.find((x) => x.id === router.id)!).join('\n')).toContain(' 150');
  });
});
