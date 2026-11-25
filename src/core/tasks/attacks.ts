import { addDevice, cableAt, configureHost, connect, setInterfaceAddress, setInterfaceCount, copperPorts } from '../model/topology';
import { isSwitchType } from '../model/devices';
import type { AttackKind, Device, Topology } from '../model/types';
import { formatIp, networkOf, parseIp, parseMask } from '../net/ipv4';
import { ownDevices, resolveTarget } from '../sim/attack';
import { Simulation } from '../sim/simulation';

/**
 * Angriff auf ein bestehendes Netz (von der Lehrperson ausgelöst oder vom Prüfbaustein «resist»):
 * Ein virtueller Angreifer wird nur für die Simulation angeschlossen, das Projekt bleibt unverändert.
 * «Innen» (arpSpoof): an einem Switch im Netz. «Aussen» (übrige): am Internet-Gerät, sonst auch innen.
 */
export const ATTACKER_NAME = 'Angreifer (Lehrperson)';
const FIRST_ID = 8_000_000;
const OUTSIDE = { provider: '198.18.0.1', attacker: '198.18.0.2', prefix: '30' };

const freePort = (t: Topology, d: Device) => copperPorts(d).find((p) => !p.shutdown && !cableAt(t, { device: d.id, iface: p.index }));
const maskPrefix = (d: Device) => parseMask(d.interfaces[0]?.mask ?? '');

/** Netz mit Angreifer, oder null, wenn es keinen passenden Anschluss oder kein Ziel gibt. */
export function withAttacker(topology: Topology, kind: AttackKind): { topology: Topology; attacker: string } | null {
  const outside = kind === 'arpSpoof' ? null : attachOutside(topology);
  for (const placed of [outside, attachInside(topology)]) {
    if (!placed) continue;
    const devices = placed.topology.devices.map((d) => (d.id === placed.attacker ? { ...d, variant: 'attacker', attack: { kind, delay: 1 } } : d));
    const next = { ...placed.topology, devices };
    if (resolveTarget(next, devices.find((d) => d.id === placed.attacker)!, kind)) return { topology: { ...next, nextId: topology.nextId }, attacker: placed.attacker };
  }
  return null;
}

function add(t: Topology) {
  const added = addDevice({ ...t, nextId: Math.max(FIRST_ID, t.nextId) }, 'notebook', ATTACKER_NAME, { x: 0, y: -4000 });
  return added.ok ? added.value : null;
}

function attachOutside(t: Topology) {
  for (const provider of t.devices.filter((d) => d.type === 'internet')) {
    const added = add(t);
    if (!added) return null;
    let next = added.topology;
    let port = freePort(next, provider);
    if (!port || port.ip) {
      const grown = setInterfaceCount(next, provider.id, copperPorts(provider).length + 1);
      if (!grown.ok) continue;
      next = grown.value;
      port = copperPorts(next.devices.find((d) => d.id === provider.id)!).at(-1);
    }
    if (!port) continue;
    const addressed = setInterfaceAddress(next, provider.id, port.index, OUTSIDE.provider, OUTSIDE.prefix);
    if (!addressed.ok) continue;
    const host = configureHost(addressed.value, added.id, { ip: OUTSIDE.attacker, mask: OUTSIDE.prefix, gateway: OUTSIDE.provider });
    if (!host.ok) continue;
    const wired = connect(host.value, added.id, provider.id, 'tp', { b: port.index });
    if (wired.ok) return { topology: wired.value.topology, attacker: added.id };
  }
  return null;
}

function attachInside(t: Topology) {
  // Ein Endgerät mit fester Adresse und Gateway an einem Switch mit freiem Port bestimmt das Netz.
  for (const host of ownDevices(t)) {
    const own = host.interfaces[0];
    const prefix = maskPrefix(host);
    const ip = own?.ip ? parseIp(own.ip) : null;
    if (!host.gateway || prefix === null || ip === null || host.attack) continue;
    const cable = cableAt(t, { device: host.id, iface: 0 });
    const end = cable && (cable.a.device === host.id ? cable.b : cable.a);
    const sw = end && t.devices.find((d) => d.id === end.device);
    if (!sw || !isSwitchType(sw.type)) continue;
    const port = freePort(t, sw);
    const added = port && add(t);
    if (!port || !added) continue;
    const used = new Set(t.devices.flatMap((d) => d.interfaces.map((i) => i.ip)));
    const base = networkOf(ip, prefix);
    let address: string | undefined;
    for (let n = 2 ** (32 - prefix) - 20; n > 1 && !address; n--) if (!used.has(formatIp(base + n))) address = formatIp(base + n);
    if (!address) continue;
    const configured = configureHost(added.topology, added.id, { ip: address, mask: String(prefix), gateway: host.gateway });
    if (!configured.ok) continue;
    const wired = connect(configured.value, added.id, sw.id, 'tp', { b: port.index });
    if (!wired.ok) continue;
    // Gleiches VLAN wie das Vorbild.
    const vlan = sw.interfaces[end.iface]?.vlan;
    const topology = vlan === undefined ? wired.value.topology : { ...wired.value.topology, devices: wired.value.topology.devices.map((d) => (d.id === sw.id ? { ...d, interfaces: d.interfaces.map((i) => (i.index === port.index ? { ...i, vlan } : i)) } : d)) };
    return { topology, attacker: added.id };
  }
  return null;
}

/** Ports, die von aussen offen sein dürfen (Web, E-Mail-Empfang). */
const PUBLIC_PORTS = new Set([25, 80, 443]);
const BOOT_MS = 8000;
const RUN_MS = 22_000;

export type AttackEffect = 'effective' | 'blocked' | 'noTarget';

/** Wirkt der Angriff auf dieses Netz? Geprüft wird in eigenen Simulationen mit und ohne Angreifer. */
export function attackEffect(topology: Topology, kind: AttackKind): AttackEffect {
  // Ein eigener Angreifer auf der Zeichenfläche soll das Ergebnis nicht verfälschen.
  const clean: Topology = { ...topology, devices: topology.devices.map((d) => (d.attack ? { ...d, attack: undefined } : d)) as Device[] };
  const attacked = withAttacker(clean, kind);
  if (!attacked) return 'noTarget';
  const sim = (t: Topology, act?: (s: Simulation) => void, until = BOOT_MS + RUN_MS) => {
    const s = new Simulation(t);
    s.runUntil(BOOT_MS);
    act?.(s);
    s.runUntil(until);
    return s;
  };
  if (kind === 'sshGuess') return sim(attacked.topology, undefined, 60_000).getDeviceState(attacked.attacker).attack?.compromised ? 'effective' : 'blocked';
  if (kind === 'portScan') {
    const scan = sim(attacked.topology, undefined, 30_000).getDeviceState(attacked.attacker).scan;
    return scan?.hosts.some((h) => h.ports.some((p) => p.state === 'open' && !PUBLIC_PORTS.has(p.port))) ? 'effective' : 'blocked';
  }
  // Dienst vorher und während des Angriffs: Webseite (synFlood) bzw. Ping durchs Gateway (arpSpoof).
  const attacker = attacked.topology.devices.find((d) => d.id === attacked.attacker)!;
  const target = resolveTarget(attacked.topology, attacker, kind)!;
  const clients = ownDevices(clean).filter((d) => ['pc', 'notebook', 'server'].includes(d.type) && !d.webServer && d.variant !== 'attacker' && (d.dhcp || d.interfaces[0]?.ip));
  const works = (t: Topology, client: Device): boolean => {
    if (kind === 'synFlood') {
      const inside = ownDevices(t).find((d) => d.webServer && d.interfaces[0]?.ip);
      const url = `http://${inside?.interfaces[0]?.ip ?? target}/`;
      const b = sim(t, (s) => s.browse(client.id, url)).getDeviceState(client.id).browser;
      return b?.status === 'done' && b.response?.status === 200;
    }
    return sim(t, (s) => s.ping(client.id, target)).getDeviceState(client.id).console.some((l) => l.code === 'ping.reply');
  };
  const affected = clients.filter((c) => (kind === 'synFlood' || c.gateway === target || c.dhcp) && works(clean, c));
  if (!affected.length) return 'noTarget';
  const check = kind === 'arpSpoof' ? affected : affected.slice(0, 1);
  return check.every((c) => works(attacked.topology, c)) ? 'blocked' : 'effective';
}
