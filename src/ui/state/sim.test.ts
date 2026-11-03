import { describe, expect, it } from 'vitest';
import { NetBuilder } from '../../core/sim/testing';
import { simStore } from './sim.svelte';

(globalThis as unknown as { requestAnimationFrame: () => number }).requestAnimationFrame = () => 0;
(globalThis as unknown as { cancelAnimationFrame: () => void }).cancelAnimationFrame = () => {};

function net() {
  const n = new NetBuilder();
  const sw = n.add('switch', 'SW');
  const a = n.host('PC1', '10.0.0.1');
  const b = n.host('PC2', '10.0.0.2');
  n.link(a, sw);
  n.link(b, sw);
  return { topology: n.topology, a, b };
}

const snapshot = () => simStore.sim!.getPacketLog().map((e) => `${e.id}:${e.from.device}>${e.to.device}@${e.sent}:${e.status}`);

describe('Simulation zurückspulen', () => {
  it('Schritt zurück ergibt genau den Zustand von vorher, auch mit Eingaben dazwischen', () => {
    const { topology, a } = net();
    simStore.activate(topology, 1001);
    simStore.ping(a, '10.0.0.2');
    // Zustand je Anzahl verarbeiteter Ereignisse merken (Auspack-Schritte ändern nichts daran).
    const byEvents = new Map<number, string[]>([[simStore.events, snapshot()]]);
    for (let i = 0; i < 14; i++) {
      simStore.step();
      byEvents.set(simStore.events, snapshot());
    }
    simStore.runCommand(a, 'arp -a');
    for (let i = 0; i < 8; i++) {
      simStore.step();
      byEvents.set(simStore.events, snapshot());
    }
    const top = simStore.events;
    expect(top).toBeGreaterThan(5);
    for (let target = top - 1; target >= 0; target--) {
      while (simStore.events > target) simStore.stepBack();
      expect(simStore.unpacking).toBeNull();
      expect(snapshot(), `nach ${target} Ereignissen`).toEqual(byEvents.get(target));
    }
    expect(simStore.canStepBack).toBe(false);
  });

  it('Zurücksetzen: Zeit 0, leere Paketliste', () => {
    const { topology, a } = net();
    simStore.activate(topology, 1002);
    simStore.ping(a, '10.0.0.2');
    for (let i = 0; i < 10; i++) simStore.step();
    expect(simStore.sim!.getPacketLog().length).toBeGreaterThan(0);
    simStore.reset(topology);
    expect(simStore.sim!.now).toBe(0);
    expect(simStore.sim!.getPacketLog()).toHaveLength(0);
    expect(simStore.events).toBe(0);
  });
});
