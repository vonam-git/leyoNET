// Aufgaben: Lernziele mit automatischen Prüfungen. Es gibt nur fest
// definierte Prüfbausteine (kein ausführbarer Code in Aufgabendateien).
// Dynamische Prüfungen (Ping, HTTP, DHCP, E-Mail) laufen in einer eigenen,
// frischen Simulation des aktuellen Netzes und sind deshalb wiederholbar.

import { DEVICE_TYPES } from '../model/devices';
import { cablesOf, otherEnd, vlanColor } from '../model/topology';
import { linkStatus, mediumOf } from '../model/links';
import { costOf } from '../model/costs';
import { duplicateAddresses } from '../model/duplicates';
import { MEDIA, type Device, type DeviceType, type Medium, type TagColor, type Topology } from '../model/types';
import { formatIp, networkOf, parseIp, parseMask } from '../net/ipv4';
import { protocolOf } from '../sim/protocol';
import { Simulation, type PacketLogEntry } from '../sim/simulation';

export type Check =
  | { type: 'deviceCount'; deviceType?: DeviceType; min?: number; max?: number }
  | { type: 'connected'; a: string; b: string }
  | { type: 'inNetwork'; device: string; network: string }
  | { type: 'sameNetwork'; devices: string[] }
  | { type: 'differentNetworks'; devices: string[] }
  | { type: 'gateway'; device: string; gateway?: string }
  | { type: 'ping'; from: string; to: string }
  /** Gegenprobe: Der Ping darf NICHT ankommen (z.B. VLANs trennen). */
  | { type: 'noPing'; from: string; to: string }
  | { type: 'http'; from: string; url: string; status?: number }
  /** Gerät bezieht per DHCP eine Adresse (optional genau diese, optional mit diesem DNS-Server). */
  | { type: 'dhcpLease'; device: string; ip?: string; dns?: string }
  | { type: 'mail'; from: string; to: string }
  | { type: 'packetSeen'; protocol: string; from?: string; to?: string }
  /** Router hat ein Netz über ein Routingprotokoll gelernt (oder überhaupt eine Route dorthin). */
  | { type: 'routeLearned'; device: string; network: string; protocol?: 'ospf' | 'rip' | 'bgp' }
  /** So viele OSPF-Nachbarn «Full» bzw. BGP-Sitzungen «Established». */
  | { type: 'neighbors'; device: string; protocol: 'ospf' | 'bgp'; min?: number }
  /** Kein Broadcast-Sturm (Schleifen nur mit Spanning Tree). */
  | { type: 'noStorm' }
  /** Keine IP-Adresse ist im selben Netz doppelt vergeben (auch per DHCP bezogene). */
  | { type: 'noDuplicateIp' }
  /** Ping von `from` an `to`; beim Ziel kommt er mit dieser Absenderadresse an (NAT prüfen). */
  | { type: 'seenAs'; from: string; to: string; address: string }
  /** Modem hat seine Zugangsleitung aufgebaut. */
  | { type: 'modemOnline'; device: string }
  /** Alle (oder mindestens `min`) Rechner der Client-Gruppe haben eine Adresse. */
  | { type: 'groupLeases'; device: string; min?: number }
  /** Gesamtkosten höchstens so viele CHF. */
  | { type: 'budget'; max: number }
  /** Direkte Verbindung zwischen zwei Geräten ist aktiv (optional mit bestimmtem Medium). */
  | { type: 'linkUp'; a: string; b: string; medium?: Medium }
  /** VLAN ist mit Farbe dokumentiert. */
  | { type: 'vlanDocumented'; vlan: number }
  /** Geräte mit diesen Namen (und optional diesem Typ) sind vorhanden. */
  | { type: 'device'; names: string[]; deviceType?: DeviceType }
  /** Ein Anschluss des Geräts hat diese feste Adresse mit Präfix, z.B. "10.33.0.1/22". */
  | { type: 'address'; device: string; address: string }
  /** DHCP-Server ist eingerichtet: Bereich, optional Gateway und DNS-Server, die er mitgibt. */
  | { type: 'dhcpServer'; device: string; start: string; end: string; gateway?: string; dns?: string }
  /** DNS-Server hat einen A-Eintrag (Name → Adresse). */
  | { type: 'dnsRecord'; device: string; name: string; value: string }
  /** Bereich auf der Zeichenfläche: Titel enthält den Text, optional Farbe und Netz. */
  | { type: 'area'; title: string; color?: TagColor; network?: string };

const TAG_COLOR_NAMES: readonly TagColor[] = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'gray'];

export const CHECK_TYPES = [
  'deviceCount',
  'connected',
  'inNetwork',
  'sameNetwork',
  'differentNetworks',
  'gateway',
  'ping',
  'noPing',
  'http',
  'dhcpLease',
  'mail',
  'packetSeen',
  'routeLearned',
  'neighbors',
  'noStorm',
  'noDuplicateIp',
  'seenAs',
  'modemOnline',
  'groupLeases',
  'budget',
  'linkUp',
  'vlanDocumented',
  'device',
  'address',
  'dhcpServer',
  'dnsRecord',
  'area',
] as const satisfies readonly Check['type'][];

export interface Goal {
  id: string;
  /** Lernziel in Worten, wie es die Lernenden sehen. */
  text: string;
  check: Check;
  /** Hinweis, der bei nicht erfülltem Ziel angezeigt wird. */
  hint?: string;
  /** Punkte für dieses Ziel (Prüfungen); fehlt = 1. */
  points?: number;
}

export interface TaskSet {
  title: string;
  description?: string;
  /** Schwierigkeit von 1 (einfach) bis 5 (anspruchsvoll) Sternen. */
  difficulty?: number;
  /** Prüfung: Note nach Schweizer Skala aus den Punkten (5 × Punkte / Maximum + 1). */
  grading?: boolean;
  /** Prüfung: «Prüfen» ist für Lernende ausgeblendet; ausgewertet wird mit «Abgaben auswerten». */
  noSelfCheck?: boolean;
  goals: Goal[];
}

export const MAX_GOAL_POINTS = 100;

/** Punkte eines Ziels (Standard 1). */
export const pointsOf = (goal: Goal) => goal.points ?? 1;

/** Note 1–6 nach Schweizer Skala, auf Zehntel gerundet. */
export function swissGrade(points: number, max: number): number {
  if (max <= 0) return 1;
  return Math.round((5 * Math.min(points, max) / max + 1) * 10) / 10;
}

/** Erreichte und mögliche Punkte; Ziele in `skip` zählen nicht. */
export function scoreOf(tasks: TaskSet, results: readonly { id: string; passed: boolean; skipped?: boolean }[]): { points: number; max: number } {
  let points = 0;
  let max = 0;
  for (const goal of tasks.goals) {
    const r = results.find((x) => x.id === goal.id);
    if (!r || r.skipped) continue;
    max += pointsOf(goal);
    if (r.passed) points += pointsOf(goal);
  }
  return { points, max };
}

export interface GoalResult {
  id: string;
  passed: boolean;
  /** Warum nicht erfüllt; die Oberfläche übersetzt den Code. */
  reason?: { code: string; params?: Record<string, string | number> };
}

/** Wie lange eine Prüf-Simulation laufen darf (virtuelle Zeit): DHCP-Bezug, dann die Aktion. */
const BOOT_MS = 10_000;
/** Routingprotokolle brauchen etwas länger, bis sie sich gefunden haben. */
const CONVERGE_MS = 25_000;
const ACTION_MS = 15_000;

const fail = (id: string, code: string, params?: Record<string, string | number>): GoalResult => ({
  id,
  passed: false,
  reason: { code, ...(params ? { params } : {}) },
});

/** Geräte werden in Aufgaben über ihren Namen angesprochen (Gross-/Kleinschreibung egal). */
function byName(topology: Topology, name: string): Device | undefined {
  const wanted = name.trim().toLowerCase();
  return topology.devices.find((d) => d.name.toLowerCase() === wanted);
}

/** Netz eines Geräts aus seiner statischen Konfiguration, z.B. "192.168.1.0/24". */
function networkOfDevice(device: Device): string | null {
  const iface = device.interfaces[0];
  const ip = iface?.ip ? parseIp(iface.ip) : null;
  const prefix = iface?.mask ? parseMask(iface.mask) : null;
  return ip === null || prefix === null ? null : `${formatIp(networkOf(ip, prefix))}/${prefix}`;
}

/** "10.33.0.1/22" oder "10.33.0.1/255.255.252.0" → Adresse und Präfix. */
function parseCidr(text: string): { ip: number; prefix: number } | null {
  const [ipText = '', prefixText = ''] = text.trim().split('/');
  const ip = parseIp(ipText);
  const prefix = parseMask(prefixText);
  return ip === null || prefix === null ? null : { ip, prefix };
}

const sameIp = (a: string | undefined, b: string) => a !== undefined && parseIp(a) !== null && parseIp(a) === parseIp(b);

/** Boot-Simulation je Topologie: Prüfungen, die nur lesen (DHCP), teilen sie sich. */
const bootCache = new WeakMap<Topology, Simulation>();
function readOnlyBoot(topology: Topology): Simulation {
  let sim = bootCache.get(topology);
  if (!sim) {
    sim = bootedSimulation(topology);
    bootCache.set(topology, sim);
  }
  return sim;
}

function bootedSimulation(topology: Topology): Simulation {
  const sim = new Simulation(topology);
  sim.runUntil(BOOT_MS);
  return sim;
}

export function evaluateGoal(topology: Topology, goal: Goal, liveLog: readonly PacketLogEntry[] = []): GoalResult {
  const { id, check } = goal;
  const need = (name: string) => byName(topology, name);
  const missing = (name: string) => fail(id, 'deviceMissing', { name });

  switch (check.type) {
    case 'deviceCount': {
      const count = topology.devices.filter((d) => !check.deviceType || d.type === check.deviceType).length;
      if (check.min !== undefined && count < check.min) return fail(id, 'tooFewDevices', { count, min: check.min });
      if (check.max !== undefined && count > check.max) return fail(id, 'tooManyDevices', { count, max: check.max });
      return { id, passed: true };
    }
    case 'connected': {
      const a = need(check.a);
      const b = need(check.b);
      if (!a) return missing(check.a);
      if (!b) return missing(check.b);
      const linked = cablesOf(topology, a.id).some((c) => otherEnd(c, a.id).device === b.id);
      return linked ? { id, passed: true } : fail(id, 'notConnected', { a: a.name, b: b.name });
    }
    case 'inNetwork': {
      const device = need(check.device);
      if (!device) return missing(check.device);
      const actual = networkOfDevice(device);
      const [netText = '', prefixText = ''] = check.network.split('/');
      const wantedIp = parseIp(netText);
      const prefix = parseMask(prefixText);
      if (!actual) return fail(id, 'noAddress', { name: device.name });
      const wanted = wantedIp === null || prefix === null ? check.network : `${formatIp(networkOf(wantedIp, prefix))}/${prefix}`;
      return actual === wanted ? { id, passed: true } : fail(id, 'wrongNetwork', { name: device.name, actual, expected: wanted });
    }
    case 'sameNetwork':
    case 'differentNetworks': {
      const networks: string[] = [];
      for (const name of check.devices) {
        const device = need(name);
        if (!device) return missing(name);
        const net = networkOfDevice(device);
        if (!net) return fail(id, 'noAddress', { name: device.name });
        networks.push(net);
      }
      const distinct = new Set(networks).size;
      if (check.type === 'sameNetwork') return distinct === 1 ? { id, passed: true } : fail(id, 'notSameNetwork');
      return distinct === networks.length ? { id, passed: true } : fail(id, 'notDifferentNetworks');
    }
    case 'gateway': {
      const device = need(check.device);
      if (!device) return missing(check.device);
      if (!device.gateway) return fail(id, 'noGateway', { name: device.name });
      if (check.gateway && device.gateway !== check.gateway) {
        return fail(id, 'wrongGateway', { name: device.name, actual: device.gateway, expected: check.gateway });
      }
      return { id, passed: true };
    }
    case 'ping': {
      const from = need(check.from);
      if (!from) return missing(check.from);
      // Ziel als Gerätename (dann dessen Adresse), IP-Adresse oder DNS-Name.
      const targetDevice = need(check.to);
      // Projekt nur mit IPv6: Zielgerät über seine IPv6-Adresse (fest oder per SLAAC/DHCPv6 bezogen).
      const v6 = topology.ipMode === 'ipv6';
      const fixed6 = targetDevice?.interfaces[0]?.ipv6 && !targetDevice.ipv6Auto ? targetDevice.interfaces[0].ipv6.split('/')[0] : undefined;
      const target = targetDevice ? (v6 ? fixed6 : targetDevice.interfaces[0]?.ip) : check.to;
      if (targetDevice && !target && !(v6 ? targetDevice.ipv6Auto : targetDevice.dhcp)) return fail(id, 'noAddress', { name: targetDevice.name });
      const sim = bootedSimulation(topology);
      const learned6 = () => sim.getDeviceState(targetDevice!.id).ipv6?.addresses.find((a) => a.origin === 'slaac' || a.origin === 'dhcpv6')?.address;
      const address = target ?? (v6 ? learned6() : sim.getDeviceState(targetDevice!.id).address?.ip);
      if (!address) return fail(id, 'noAddress', { name: check.to });
      sim.ping(from.id, address);
      sim.runUntil(BOOT_MS + ACTION_MS);
      const lines = sim.getDeviceState(from.id).console;
      if (lines.some((l) => l.code === 'ping.reply')) return { id, passed: true };
      const last = lines.filter((l) => l.code !== 'ping.summary' && !l.code.startsWith('dhcp.')).at(-1);
      return fail(id, 'pingFailed', { from: from.name, to: check.to, detail: last?.code ?? '' });
    }
    case 'noPing': {
      const from = need(check.from);
      if (!from) return missing(check.from);
      const targetDevice = need(check.to);
      const sim = bootedSimulation(topology);
      const address = targetDevice ? (targetDevice.interfaces[0]?.ip ?? sim.getDeviceState(targetDevice.id).address?.ip) : check.to;
      // Ohne Adresse ist das Ziel ohnehin nicht erreichbar; das zählt aber nicht als gelöst.
      if (!address) return fail(id, 'noAddress', { name: check.to });
      sim.ping(from.id, address);
      sim.runUntil(BOOT_MS + ACTION_MS);
      const reached = sim.getDeviceState(from.id).console.some((l) => l.code === 'ping.reply');
      return reached ? fail(id, 'pingReached', { from: from.name, to: check.to }) : { id, passed: true };
    }
    case 'http': {
      const from = need(check.from);
      if (!from) return missing(check.from);
      const sim = bootedSimulation(topology);
      sim.browse(from.id, check.url);
      sim.runUntil(BOOT_MS + ACTION_MS);
      const browser = sim.getDeviceState(from.id).browser;
      const status = browser?.response?.status;
      if (browser?.status === 'done' && (check.status === undefined ? status === 200 : status === check.status)) {
        return { id, passed: true };
      }
      return fail(id, 'httpFailed', { url: check.url, detail: status ?? browser?.steps.at(-1)?.code ?? '' });
    }
    case 'dhcpLease': {
      const device = need(check.device);
      if (!device) return missing(check.device);
      if (!device.dhcp) return fail(id, 'notDhcp', { name: device.name });
      const address = readOnlyBoot(topology).getDeviceState(device.id).address;
      if (!address?.ip) return fail(id, 'noLease', { name: device.name });
      if (check.ip && !sameIp(address.ip, check.ip)) return fail(id, 'wrongLease', { name: device.name, actual: address.ip, expected: check.ip });
      if (check.dns && !sameIp(address.dns, check.dns)) return fail(id, 'wrongLeaseDns', { name: device.name, actual: address.dns ?? '–', expected: check.dns });
      return { id, passed: true };
    }
    case 'mail': {
      const from = need(check.from);
      if (!from) return missing(check.from);
      if (!from.mailAccount) return fail(id, 'noMailAccount', { name: from.name });
      const sim = bootedSimulation(topology);
      sim.sendMail(from.id, { to: [check.to], subject: 'Prüfung', body: 'Automatische Prüfung der Aufgabe.' });
      sim.runUntil(BOOT_MS + ACTION_MS);
      const sent = sim.getDeviceState(from.id).mail?.sent.at(-1);
      return sent?.ok ? { id, passed: true } : fail(id, 'mailFailed', { from: from.name, to: check.to });
    }
    case 'packetSeen': {
      // Prüft, was die Lernenden selbst in der Simulation ausgelöst haben.
      const from = check.from ? need(check.from) : undefined;
      const to = check.to ? need(check.to) : undefined;
      if (check.from && !from) return missing(check.from);
      if (check.to && !to) return missing(check.to);
      const seen = liveLog.some(
        (e) =>
          protocolOf(e.frame) === check.protocol.toUpperCase() &&
          (!from || e.from.device === from.id) &&
          (!to || e.to.device === to.id),
      );
      return seen ? { id, passed: true } : fail(id, 'packetNotSeen', { protocol: check.protocol.toUpperCase() });
    }
    case 'routeLearned': {
      const device = need(check.device);
      if (!device) return missing(check.device);
      const [netText = '', prefixText = ''] = check.network.split('/');
      const network = parseIp(netText);
      const prefix = parseMask(prefixText);
      if (network === null || prefix === null) return fail(id, 'noRoute', { name: device.name, network: check.network });
      const sim = new Simulation(topology);
      sim.runUntil(CONVERGE_MS);
      const route = sim.getRoutes(device.id).find((r) => r.network === networkOf(network, prefix) && r.prefix === prefix && (!check.protocol || r.kind === check.protocol));
      return route ? { id, passed: true } : fail(id, 'noRoute', { name: device.name, network: check.network });
    }
    case 'neighbors': {
      const device = need(check.device);
      if (!device) return missing(check.device);
      const sim = new Simulation(topology);
      sim.runUntil(CONVERGE_MS);
      const state = sim.getDeviceState(device.id);
      const count =
        check.protocol === 'ospf'
          ? (state.ospf?.neighbors.filter((n) => n.state === 'full').length ?? 0)
          : (state.bgp?.filter((p) => p.state === 'established').length ?? 0);
      const min = check.min ?? 1;
      return count >= min ? { id, passed: true } : fail(id, 'tooFewNeighbors', { name: device.name, count, min, protocol: check.protocol.toUpperCase() });
    }
    case 'noStorm': {
      const sim = bootedSimulation(topology);
      // Broadcasts auslösen: jedes Endgerät fragt per ARP nach einer unbekannten Adresse.
      for (const d of topology.devices) if (d.type === 'pc' || d.type === 'notebook' || d.type === 'server') sim.ping(d.id, '255.255.255.254');
      sim.runUntil(BOOT_MS + 3000);
      const storming = sim.stormingDevices().map((sid) => topology.devices.find((d) => d.id === sid)?.name ?? sid);
      return storming.length ? fail(id, 'storm', { names: storming.join(', ') }) : { id, passed: true };
    }
    case 'seenAs': {
      const from = need(check.from);
      if (!from) return missing(check.from);
      const target = need(check.to);
      if (!target) return missing(check.to);
      const address = target.interfaces[0]?.ip;
      if (!address) return fail(id, 'noAddress', { name: target.name });
      const sim = bootedSimulation(topology);
      sim.ping(from.id, address);
      sim.runUntil(BOOT_MS + ACTION_MS);
      const arrived = sim.getPacketLog().filter((e) => e.to.device === target.id && e.frame.payload.kind === 'ipv4' && e.frame.payload.payload.kind === 'icmp' && e.frame.payload.payload.type === 'echoRequest');
      if (!arrived.length) return fail(id, 'pingFailedTo', { name: target.name });
      const seen = arrived[0]!.frame.payload.kind === 'ipv4' ? arrived[0]!.frame.payload.src : '';
      return seen === check.address ? { id, passed: true } : fail(id, 'seenAsOther', { name: from.name, seen, address: check.address });
    }
    case 'noDuplicateIp': {
      const sim = bootedSimulation(topology);
      const live = new Map<string, string>();
      for (const d of topology.devices) {
        const ip = d.dhcp ? sim.getDeviceState(d.id).address?.ip : undefined;
        if (ip) live.set(d.id, ip);
      }
      const keys = [...duplicateAddresses(topology, live)];
      if (!keys.length) return { id, passed: true };
      const names = [...new Set(keys.map((k) => topology.devices.find((d) => d.id === k.split('#')[0])?.name ?? k))];
      const ips = [...new Set(keys.map((k) => k.split('#')[1]))];
      return fail(id, 'duplicateIp', { names: names.join(', '), ips: ips.join(', ') });
    }
    case 'modemOnline': {
      const device = need(check.device);
      if (!device) return missing(check.device);
      const modem = bootedSimulation(topology).getDeviceState(device.id).modem;
      return modem?.phase === 'online' ? { id, passed: true } : fail(id, 'modemOffline', { name: device.name });
    }
    case 'groupLeases': {
      const device = need(check.device);
      if (!device) return missing(check.device);
      const sim = new Simulation(topology);
      sim.runUntil(BOOT_MS + (device.groupSize ?? 0) * 25);
      const members = sim.getDeviceState(device.id).group ?? [];
      const withIp = members.filter((m) => m.ip).length;
      const min = check.min ?? members.length;
      return members.length > 0 && withIp >= min ? { id, passed: true } : fail(id, 'groupWithoutLease', { name: device.name, count: withIp, total: members.length });
    }
    case 'budget': {
      const total = costOf(topology).total;
      return total <= check.max ? { id, passed: true } : fail(id, 'overBudget', { total, max: check.max });
    }
    case 'linkUp': {
      const a = need(check.a);
      const b = need(check.b);
      if (!a) return missing(check.a);
      if (!b) return missing(check.b);
      const cable = cablesOf(topology, a.id).find((c) => otherEnd(c, a.id).device === b.id);
      if (!cable) return fail(id, 'notConnected', { a: a.name, b: b.name });
      if (check.medium && mediumOf(cable) !== check.medium) return fail(id, 'wrongMedium', { a: a.name, b: b.name, medium: check.medium });
      const status = linkStatus(topology, cable);
      return status.up ? { id, passed: true } : fail(id, 'linkDown', { a: a.name, b: b.name, reason: status.reason ?? '' });
    }
    case 'vlanDocumented': {
      return vlanColor(topology, check.vlan) ? { id, passed: true } : fail(id, 'vlanUndocumented', { vlan: check.vlan });
    }
    case 'device': {
      for (const name of check.names) {
        const device = need(name);
        if (!device) return missing(name);
        if (check.deviceType && device.type !== check.deviceType) return fail(id, 'wrongDeviceType', { name: device.name, expected: check.deviceType });
      }
      return { id, passed: true };
    }
    case 'address': {
      const device = need(check.device);
      if (!device) return missing(check.device);
      const wanted = parseCidr(check.address);
      if (!wanted) return fail(id, 'noAddress', { name: device.name });
      const has = device.interfaces.some((i) => {
        const ip = i.ip ? parseIp(i.ip) : null;
        const prefix = i.mask ? parseMask(i.mask) : null;
        return ip === wanted.ip && prefix === wanted.prefix;
      });
      return has ? { id, passed: true } : fail(id, 'addressMissing', { name: device.name, address: `${formatIp(wanted.ip)}/${wanted.prefix}` });
    }
    case 'dhcpServer': {
      const device = need(check.device);
      if (!device) return missing(check.device);
      const s = device.dhcpServer;
      if (!s) return fail(id, 'noDhcpServer', { name: device.name });
      const range = `${check.start} – ${check.end}`;
      if (!sameIp(s.start, check.start) || !sameIp(s.end, check.end)) return fail(id, 'wrongDhcpRange', { name: device.name, actual: `${s.start} – ${s.end}`, expected: range });
      if (check.gateway && !sameIp(s.gateway, check.gateway)) return fail(id, 'wrongDhcpOption', { name: device.name, option: 'Gateway', expected: check.gateway });
      if (check.dns && !sameIp(s.dns, check.dns)) return fail(id, 'wrongDhcpOption', { name: device.name, option: 'DNS', expected: check.dns });
      return { id, passed: true };
    }
    case 'dnsRecord': {
      const device = need(check.device);
      if (!device) return missing(check.device);
      if (!device.dnsServer) return fail(id, 'noDnsServer', { name: device.name });
      const name = check.name.trim().toLowerCase().replace(/\.$/, '');
      const found = device.dnsServer.records.some((r) => r.type === 'A' && r.name === name && sameIp(r.value, check.value));
      return found ? { id, passed: true } : fail(id, 'dnsRecordMissing', { name: device.name, record: `${name} → ${check.value}` });
    }
    case 'area': {
      const wanted = check.title.trim().toLowerCase();
      const areas = (topology.areas ?? []).filter((a) => a.kind !== 'rack' && a.title.toLowerCase().includes(wanted));
      if (areas.length === 0) return fail(id, 'areaMissing', { title: check.title });
      const net = check.network ? parseCidr(check.network) : null;
      const fits = areas.some((a) => {
        if (check.color && a.color !== check.color) return false;
        if (!net) return true;
        const actual = a.network ? parseCidr(a.network) : null;
        return actual !== null && actual.prefix === net.prefix && networkOf(actual.ip, actual.prefix) === networkOf(net.ip, net.prefix);
      });
      return fits ? { id, passed: true } : fail(id, 'areaIncomplete', { title: check.title, color: check.color ?? '–', network: check.network ?? '–' });
    }
  }
}

export function evaluateTasks(topology: Topology, tasks: TaskSet, liveLog: readonly PacketLogEntry[] = []): GoalResult[] {
  return tasks.goals.map((goal) => evaluateGoal(topology, goal, liveLog));
}

// --- Einlesen -----------------------------------------------------------------

/** Liest den `tasks`-Block einer Datei; wirft bei Fehlern den betroffenen Pfad. */
export function readTasks(value: unknown, invalid: (path: string) => never): TaskSet {
  const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const str = (v: unknown, path: string) => (typeof v === 'string' ? v : invalid(path));
  const optStr = (v: unknown, path: string) => (v === undefined ? undefined : str(v, path));
  const names = (v: unknown, path: string) =>
    Array.isArray(v) && v.length > 0 ? v.map((n, i) => str(n, `${path}[${i}]`)) : invalid(path);
  const optNum = (v: unknown, path: string) =>
    v === undefined ? undefined : typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : invalid(path);

  if (!isObject(value)) invalid('tasks');
  const t = value as Record<string, unknown>;
  const goals = Array.isArray(t.goals) ? t.goals : invalid('tasks.goals');
  const ids = new Set<string>();
  return {
    title: str(t.title, 'tasks.title'),
    ...(t.description !== undefined ? { description: str(t.description, 'tasks.description') } : {}),
    ...(t.difficulty !== undefined
      ? { difficulty: typeof t.difficulty === 'number' && Number.isInteger(t.difficulty) && t.difficulty >= 1 && t.difficulty <= 5 ? t.difficulty : invalid('tasks.difficulty') }
      : {}),
    ...(t.grading !== undefined ? (typeof t.grading === 'boolean' ? (t.grading ? { grading: true } : {}) : invalid('tasks.grading')) : {}),
    ...(t.noSelfCheck !== undefined ? (typeof t.noSelfCheck === 'boolean' ? (t.noSelfCheck ? { noSelfCheck: true } : {}) : invalid('tasks.noSelfCheck')) : {}),
    goals: goals.map((raw, i): Goal => {
      const p = `tasks.goals[${i}]`;
      if (!isObject(raw)) invalid(p);
      const g = raw as Record<string, unknown>;
      const id = str(g.id, `${p}.id`);
      if (ids.has(id)) invalid(`${p}.id`);
      ids.add(id);
      if (!isObject(g.check)) invalid(`${p}.check`);
      const c = g.check as Record<string, unknown>;
      const cp = `${p}.check`;
      const type = c.type;
      let check: Check;
      switch (type) {
        case 'deviceCount': {
          const deviceType = c.deviceType;
          if (deviceType !== undefined && !(DEVICE_TYPES as readonly unknown[]).includes(deviceType)) invalid(`${cp}.deviceType`);
          const min = optNum(c.min, `${cp}.min`);
          const max = optNum(c.max, `${cp}.max`);
          check = { type, ...(deviceType ? { deviceType: deviceType as DeviceType } : {}), ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
          break;
        }
        case 'connected':
          check = { type, a: str(c.a, `${cp}.a`), b: str(c.b, `${cp}.b`) };
          break;
        case 'inNetwork':
          check = { type, device: str(c.device, `${cp}.device`), network: str(c.network, `${cp}.network`) };
          break;
        case 'sameNetwork':
        case 'differentNetworks':
          check = { type, devices: names(c.devices, `${cp}.devices`) };
          break;
        case 'gateway': {
          const gateway = optStr(c.gateway, `${cp}.gateway`);
          check = { type, device: str(c.device, `${cp}.device`), ...(gateway ? { gateway } : {}) };
          break;
        }
        case 'ping':
        case 'noPing':
          check = { type, from: str(c.from, `${cp}.from`), to: str(c.to, `${cp}.to`) };
          break;
        case 'http': {
          const status = optNum(c.status, `${cp}.status`);
          check = { type, from: str(c.from, `${cp}.from`), url: str(c.url, `${cp}.url`), ...(status !== undefined ? { status } : {}) };
          break;
        }
        case 'dhcpLease': {
          const ip = optStr(c.ip, `${cp}.ip`);
          const dns = optStr(c.dns, `${cp}.dns`);
          check = { type, device: str(c.device, `${cp}.device`), ...(ip ? { ip } : {}), ...(dns ? { dns } : {}) };
          break;
        }
        case 'mail':
          check = { type, from: str(c.from, `${cp}.from`), to: str(c.to, `${cp}.to`) };
          break;
        case 'packetSeen': {
          const from = optStr(c.from, `${cp}.from`);
          const to = optStr(c.to, `${cp}.to`);
          check = { type, protocol: str(c.protocol, `${cp}.protocol`), ...(from ? { from } : {}), ...(to ? { to } : {}) };
          break;
        }
        case 'routeLearned': {
          const protocol = c.protocol;
          if (protocol !== undefined && protocol !== 'ospf' && protocol !== 'rip' && protocol !== 'bgp') invalid(`${cp}.protocol`);
          check = { type, device: str(c.device, `${cp}.device`), network: str(c.network, `${cp}.network`), ...(protocol ? { protocol: protocol as 'ospf' | 'rip' | 'bgp' } : {}) };
          break;
        }
        case 'neighbors': {
          if (c.protocol !== 'ospf' && c.protocol !== 'bgp') invalid(`${cp}.protocol`);
          const min = optNum(c.min, `${cp}.min`);
          check = { type, device: str(c.device, `${cp}.device`), protocol: c.protocol as 'ospf' | 'bgp', ...(min !== undefined ? { min } : {}) };
          break;
        }
        case 'noStorm':
        case 'noDuplicateIp':
          check = { type };
          break;
        case 'seenAs':
          check = { type, from: str(c.from, `${cp}.from`), to: str(c.to, `${cp}.to`), address: str(c.address, `${cp}.address`) };
          break;
        case 'modemOnline':
          check = { type, device: str(c.device, `${cp}.device`) };
          break;
        case 'groupLeases': {
          const min = optNum(c.min, `${cp}.min`);
          check = { type, device: str(c.device, `${cp}.device`), ...(min !== undefined ? { min } : {}) };
          break;
        }
        case 'budget':
          check = { type, max: optNum(c.max, `${cp}.max`) ?? invalid(`${cp}.max`) };
          break;
        case 'linkUp': {
          if (c.medium !== undefined && !(MEDIA as readonly unknown[]).includes(c.medium)) invalid(`${cp}.medium`);
          check = { type, a: str(c.a, `${cp}.a`), b: str(c.b, `${cp}.b`), ...(c.medium ? { medium: c.medium as Medium } : {}) };
          break;
        }
        case 'vlanDocumented': {
          const vlan = optNum(c.vlan, `${cp}.vlan`);
          if (vlan === undefined || vlan < 1 || vlan > 4094) invalid(`${cp}.vlan`);
          check = { type, vlan: vlan! };
          break;
        }
        case 'device': {
          const deviceType = c.deviceType;
          if (deviceType !== undefined && !(DEVICE_TYPES as readonly unknown[]).includes(deviceType)) invalid(`${cp}.deviceType`);
          check = { type, names: names(c.names, `${cp}.names`), ...(deviceType ? { deviceType: deviceType as DeviceType } : {}) };
          break;
        }
        case 'address':
          check = { type, device: str(c.device, `${cp}.device`), address: str(c.address, `${cp}.address`) };
          break;
        case 'dhcpServer': {
          const gateway = optStr(c.gateway, `${cp}.gateway`);
          const dns = optStr(c.dns, `${cp}.dns`);
          check = { type, device: str(c.device, `${cp}.device`), start: str(c.start, `${cp}.start`), end: str(c.end, `${cp}.end`), ...(gateway ? { gateway } : {}), ...(dns ? { dns } : {}) };
          break;
        }
        case 'dnsRecord':
          check = { type, device: str(c.device, `${cp}.device`), name: str(c.name, `${cp}.name`), value: str(c.value, `${cp}.value`) };
          break;
        case 'area': {
          if (c.color !== undefined && !(TAG_COLOR_NAMES as readonly unknown[]).includes(c.color)) invalid(`${cp}.color`);
          const network = optStr(c.network, `${cp}.network`);
          check = { type, title: str(c.title, `${cp}.title`), ...(c.color ? { color: c.color as TagColor } : {}), ...(network ? { network } : {}) };
          break;
        }
        default:
          return invalid(`${cp}.type`);
      }
      const hint = optStr(g.hint, `${p}.hint`);
      const points = optNum(g.points, `${p}.points`);
      if (points !== undefined && points > MAX_GOAL_POINTS) invalid(`${p}.points`);
      return { id, text: str(g.text, `${p}.text`), check, ...(hint ? { hint } : {}), ...(points !== undefined ? { points } : {}) };
    }),
  };
}
