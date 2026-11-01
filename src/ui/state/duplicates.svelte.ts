import { duplicateAddresses } from '../../core';
import { editor } from './editor.svelte';
import { simStore } from './sim.svelte';

/**
 * Doppelt vergebene Adressen im ganzen Projekt (siehe core/model/duplicates).
 * In der Simulation zählen auch die per DHCP bezogenen Adressen mit.
 */
class Duplicates {
  readonly keys = $derived.by(() => {
    const topology = editor.topology;
    let live: Map<string, string> | undefined;
    if (editor.acting) {
      void simStore.tick;
      live = new Map();
      for (const d of topology.devices) {
        if (!d.dhcp) continue;
        const ip = simStore.sim?.getDeviceState(d.id).address?.ip;
        if (ip) live.set(d.id, ip);
      }
    }
    return duplicateAddresses(topology, live);
  });

  has(deviceId: string, ip: string | undefined): boolean {
    return !!ip && this.keys.has(`${deviceId}#${ip}`);
  }

  /** Alle doppelten Adressen eines Geräts. */
  of(deviceId: string): string[] {
    const prefix = `${deviceId}#`;
    return [...this.keys].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  }
}

export const duplicates = new Duplicates();
