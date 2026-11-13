/**
 * Beispielrahmen aus den Demo-Netzen, mit echten Bytes: für das Wiki (Aufbau, Kapselung, Felder)
 * und für die Tests der Formate. Weil sie aus der Simulation kommen, zeigt das Wiki genau das,
 * was leyoNET in der Paketliste zeigt.
 */
import { Simulation, dissect, mediumOf, parseProject, type Dissection, type PacketLogEntry } from '../core';
import { DEMOS, demoProject } from './demos';

export type ExampleId = 'http' | 'vlan' | 'arp' | 'stp' | 'ppp' | 'wlan' | 'ipv6';

interface ExampleSpec {
  demo: string;
  pick: (e: PacketLogEntry, wire: Dissection) => boolean;
}

const has = (wire: Dissection, protocol: string) => wire.layers.some((l) => l.protocol === protocol);

const SPECS: Record<ExampleId, ExampleSpec> = {
  // Browser holt eine Webseite: Ethernet II › IPv4 › TCP › HTTP.
  http: { demo: 'web', pick: (_, w) => has(w, 'HTTP') && !!w.layers.find((l) => l.protocol === 'HTTP')?.text?.startsWith('GET') },
  // Ping über einen Trunk: Ethernet mit 802.1Q-Tag › IPv4 › ICMP.
  vlan: { demo: 'routerOnAStick', pick: (e, w) => e.frame.vlan !== undefined && has(w, 'ICMP') },
  // ARP-Anfrage: kurz, darum mit Füllbytes.
  arp: { demo: 'arpPing', pick: (e, w) => has(w, 'ARP') && e.frame.payload.kind === 'arp' && e.frame.payload.op === 'request' },
  // Spanning Tree: IEEE 802.3 mit LLC.
  stp: { demo: 'vlanStp', pick: (_, w) => has(w, 'IEEE 802.3') },
  // Serielle Leitung: PPP › IPv4 › ICMP.
  ppp: { demo: 'ppp', pick: (_, w) => has(w, 'PPP (RFC 1662)') && has(w, 'ICMP') },
  // WLAN-Verwaltung: Anmelden am Access Point.
  wlan: { demo: 'wlan', pick: (_, w) => w.layers.some((l) => l.protocol === 'IEEE 802.11') },
  // IPv6 mit UDP: RIPng zwischen Routern.
  ipv6: { demo: 'ripng', pick: (_, w) => has(w, 'IPv6') && has(w, 'UDP') },
};

export interface FrameExample {
  id: ExampleId;
  demo: string;
  entry: PacketLogEntry;
  wire: Dissection;
}

const cache = new Map<string, { entries: PacketLogEntry[]; medium: (e: PacketLogEntry) => ReturnType<typeof mediumOf> }>();

function run(demoId: string) {
  const hit = cache.get(demoId);
  if (hit) return hit;
  const demo = DEMOS.find((d) => d.id === demoId);
  const text = demo && demoProject(demo);
  if (!demo || !text) throw new Error(`Demo ${demoId} fehlt`);
  const parsed = parseProject(text);
  if (!parsed.ok) throw new Error(`Demo ${demoId}: ${parsed.error.code}`);
  const topology = parsed.topology;
  const sim = new Simulation(topology);
  const byName = (name: string) => topology.devices.find((d) => d.name === name)!.id;
  for (const action of [...demo.actions].sort((a, b) => a.at - b.at)) {
    sim.runUntil(action.at);
    if ('command' in action) sim.runCommand(byName(action.device), action.command);
    else if ('browse' in action) sim.browse(byName(action.device), action.browse);
  }
  sim.runUntil(demo.until);
  const medium = (e: PacketLogEntry) => {
    const cable = topology.cables.find((c) => c.id === e.cable);
    return cable ? mediumOf(cable) : 'tp';
  };
  const result = { entries: [...sim.getPacketLog()], medium };
  cache.set(demoId, result);
  return result;
}

/** Erster passender Rahmen der Demo; wirft, wenn die Demo ihn nicht mehr liefert. */
export function frameExample(id: ExampleId): FrameExample {
  const spec = SPECS[id];
  const { entries, medium } = run(spec.demo);
  for (const entry of entries) {
    const wire = dissect(entry.frame, medium(entry));
    if (spec.pick(entry, wire)) return { id, demo: spec.demo, entry, wire };
  }
  throw new Error(`Beispiel ${id}: kein passender Rahmen in der Demo ${spec.demo}`);
}

export const EXAMPLE_IDS = Object.keys(SPECS) as ExampleId[];
