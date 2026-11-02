import { hasRoutingTable } from '../model/devices';
import { isBridge } from '../model/topology';
import type { Device, Topology } from '../model/types';
import { networkOf } from './ipv4';
import { ADMIN_DISTANCE, decodeIface, interfaceAddresses, type IfaceAddress, type Route } from './routing';

/**
 * Automatisches Routing für Einsteiger: Ein Router mit Routing-Art «auto»
 * kennt alle Netze im Plan, ohne dass man Routen eintragen muss. Das ist
 * kein echtes Protokoll (dafür gibt es OSPF und RIP), sondern eine Abkürzung:
 * Die Simulation liest den Netzplan und wählt zu jedem Netz den Weg mit den
 * wenigsten Routern. Führt ein Weg zum Internet (Provider oder Internet-Box),
 * kommt eine Standardroute dorthin dazu.
 *
 * Nachbarn sind Vermittlungsrechner, deren Anschlüsse im selben Netzabschnitt
 * (Kabel, Switches, Access Points, Modems) und im selben Subnetz liegen.
 * Abgeschaltete Anschlüsse zählen nicht: Schaltet man einen ab, sucht sich
 * das automatische Routing einen anderen Weg, falls es einen gibt.
 */

interface Neighbor {
  /** Index des Nachbarn in `nodes`. */
  to: number;
  /** Eigener Anschluss Richtung Nachbar. */
  iface: number;
  /** Adresse des Nachbarn im gemeinsamen Netz (nächster Router). */
  via: number;
}

interface L3Node {
  device: Device;
  addresses: IfaceAddress[];
  neighbors: Neighbor[];
  /** Leitet weiter (Layer-3-Switch mit «no ip routing» nicht). */
  transit: boolean;
  /** Ausgang ins Internet: Provider oder Internet-Box. */
  exit: boolean;
}

interface Graph {
  nodes: L3Node[];
  routes: Map<string, Route[]>;
}

const graphs = new WeakMap<Topology, Graph>();

/** Physischer Anschluss eines logischen Interfaces (Subinterface → Elternanschluss). */
function portOf(device: Device, iface: number): number | null {
  const ref = decodeIface(iface);
  return ref.kind === 'svi' ? null : ref.port;
}

function build(t: Topology): Graph {
  // Netzabschnitte wie bei den doppelten Adressen: Brücken verbinden alle ihre Anschlüsse.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const devices = new Map(t.devices.map((d) => [d.id, d]));
  const node = (device: Device | undefined, iface: number) =>
    device && isBridge(device) ? device.id : device?.type === 'cpe' && iface !== 0 ? `${device.id}:lan` : `${device?.id}:${iface}`;
  for (const cable of t.cables) {
    const a = find(node(devices.get(cable.a.device), cable.a.iface));
    const b = find(node(devices.get(cable.b.device), cable.b.iface));
    if (a !== b) parent.set(a, b);
  }

  const nodes: L3Node[] = t.devices
    .filter((d) => hasRoutingTable(d.type))
    .map((device) => ({
      device,
      addresses: interfaceAddresses(device).filter((a) => {
        const port = portOf(device, a.index);
        return port === null || !device.interfaces[port]?.shutdown;
      }),
      neighbors: [],
      transit: !(device.type === 'l3switch' && device.ipRouting === false),
      exit: device.type === 'internet' || device.type === 'cpe',
    }));

  const segment = (n: L3Node, a: IfaceAddress) => {
    const port = portOf(n.device, a.index);
    return find(port === null ? n.device.id : node(n.device, port));
  };
  nodes.forEach((n, i) => {
    for (const a of n.addresses) {
      const seg = segment(n, a);
      const net = networkOf(a.ip, a.prefix);
      nodes.forEach((m, j) => {
        if (i === j) return;
        for (const b of m.addresses) {
          if (b.prefix !== a.prefix || networkOf(b.ip, b.prefix) !== net || segment(m, b) !== seg) continue;
          if (!n.neighbors.some((x) => x.to === j && x.iface === a.index)) n.neighbors.push({ to: j, iface: a.index, via: b.ip });
        }
      });
    }
  });
  return { nodes, routes: new Map() };
}

function compute(graph: Graph, start: number): Route[] {
  const { nodes } = graph;
  // Breitensuche: wenigste Router bis zum Ziel; der erste Schritt bestimmt Anschluss und Gateway.
  const first = new Map<number, { iface: number; via: number; hops: number }>();
  const queue: number[] = [];
  for (const n of nodes[start]!.neighbors) {
    if (first.has(n.to)) continue;
    first.set(n.to, { iface: n.iface, via: n.via, hops: 1 });
    queue.push(n.to);
  }
  while (queue.length > 0) {
    const current = queue.shift()!;
    const hop = first.get(current)!;
    if (!nodes[current]!.transit) continue;
    for (const n of nodes[current]!.neighbors) {
      if (n.to === start || first.has(n.to)) continue;
      first.set(n.to, { ...hop, hops: hop.hops + 1 });
      queue.push(n.to);
    }
  }

  const own = new Set(nodes[start]!.addresses.map((a) => `${networkOf(a.ip, a.prefix)}/${a.prefix}`));
  const routes = new Map<string, Route>();
  let exit: { iface: number; via: number; hops: number } | undefined;
  for (const [index, hop] of first) {
    const target = nodes[index]!;
    if (target.exit && (!exit || hop.hops < exit.hops)) exit = hop;
    for (const a of target.addresses) {
      const network = networkOf(a.ip, a.prefix);
      const key = `${network}/${a.prefix}`;
      if (own.has(key)) continue;
      const known = routes.get(key);
      if (known && (known.metric ?? 0) <= hop.hops) continue;
      routes.set(key, { network, prefix: a.prefix, iface: hop.iface, via: hop.via, kind: 'auto', metric: hop.hops, distance: ADMIN_DISTANCE.static });
    }
  }
  const list = [...routes.values()].sort((a, b) => a.network - b.network || a.prefix - b.prefix);
  if (exit && !nodes[start]!.exit) list.push({ network: 0, prefix: 0, iface: exit.iface, via: exit.via, kind: 'auto', metric: exit.hops, distance: ADMIN_DISTANCE.static });
  return list;
}

/** Automatisch berechnete Routen eines Vermittlungsrechners (ohne direkt verbundene Netze). */
export function autoRoutes(t: Topology, deviceId: string): Route[] {
  let graph = graphs.get(t);
  if (!graph) {
    graph = build(t);
    graphs.set(t, graph);
  }
  const cached = graph.routes.get(deviceId);
  if (cached) return cached;
  const start = graph.nodes.findIndex((n) => n.device.id === deviceId);
  const routes = start < 0 ? [] : compute(graph, start);
  graph.routes.set(deviceId, routes);
  return routes;
}
