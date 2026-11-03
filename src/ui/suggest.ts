// Prüfung aus einem fertigen Netz: Die Lehrperson baut die Lösung, leyoNET
// schlägt dazu Lernziele mit Punkten vor (Geräte, Adressen, Gateways, DHCP,
// DNS, Bereiche, Verbindungen). Die Vorschläge landen im Aufgabeneditor und
// lassen sich dort streichen oder gewichten.

import { DEVICE_SPECS, ROUTER_REF, formatIp, networkOf, parseIp, parseMask, type Device, type DeviceType, type Topology } from '../core';
import { t } from '../i18n';
import type { GoalDraft } from './taskForm';

const ROUTERS = new Set<DeviceType>(['router', 'l3switch']);
const DEVICE_ORDER: DeviceType[] = ['router', 'l3switch', 'switch', 'accesspoint', 'server', 'pc', 'notebook'];

const netOf = (d: Device): string | null => {
  const ip = d.interfaces[0]?.ip ? parseIp(d.interfaces[0].ip) : null;
  const prefix = d.interfaces[0]?.mask ? parseMask(d.interfaces[0].mask) : null;
  return ip === null || prefix === null ? null : `${formatIp(networkOf(ip, prefix))}/${prefix}`;
};
const cidr = (ip: string, mask: string) => `${ip}/${parseMask(mask) ?? mask}`;

/** Werte aus einer Notiz, die sich prüfen lassen: Adressen (mit Präfix) und Zahlen. */
export function noteValues(note: string): string[] {
  const values = new Set<string>();
  const ips = note.match(/\b\d{1,3}(?:\.\d{1,3}){3}(?:\s*\/\s*\d{1,2})?\b/g) ?? [];
  for (const ip of ips) values.add(ip.replace(/\s+/g, ''));
  const rest = note.replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?:\s*\/\s*\d{1,2})?\b/g, ' ');
  for (const n of rest.match(/\b\d[\d'’]{1,8}\b/g) ?? []) values.add(n.replace(/['’]/g, ''));
  return [...values];
}

/** Vorschläge für Lernziele aus dem Netz; `taken`: schon vergebene Ziel-IDs. */
export function suggestGoals(topology: Topology, taken: Iterable<string> = []): GoalDraft[] {
  const ids = new Set(taken);
  let n = 1;
  const out: GoalDraft[] = [];
  const add = (section: string, type: GoalDraft['type'], fields: Record<string, string>, points = '') => {
    while (ids.has(`ziel-${n}`)) n++;
    ids.add(`ziel-${n}`);
    out.push({ id: `ziel-${n}`, text: '', hint: '', type, fields, points, section: t(`suggest.section.${section}`) });
  };
  const devices = topology.devices;

  // Geräte je Typ (Teilpunkte je Gerät).
  for (const type of DEVICE_ORDER) {
    const names = devices.filter((d) => d.type === type).map((d) => d.name);
    if (names.length) add('devices', 'device', { names: names.join(', '), deviceType: type }, String(Math.min(names.length, 5)));
  }

  // Adressen: Router-Anschlüsse, feste Adressen der Endgeräte, Gateways (Folgefehler: «@router»).
  for (const d of devices.filter((x) => ROUTERS.has(x.type))) {
    for (const i of d.interfaces) if (i.ip && i.mask) add('addresses', 'address', { device: d.name, address: cidr(i.ip, i.mask) });
  }
  for (const d of devices.filter((x) => DEVICE_SPECS[x.type].role === 'endpoint' && !x.dhcp && x.type !== 'clientgroup')) {
    const i = d.interfaces[0];
    if (i?.ip && i.mask) add('addresses', 'address', { device: d.name, address: cidr(i.ip, i.mask) });
    if (d.gateway) add('addresses', 'gateway', { device: d.name, gateway: ROUTER_REF });
  }

  // Dienste: DHCP, feste Zuweisungen, DNS-Einträge, Webseiten.
  const clients = devices.filter((d) => d.dhcp);
  for (const d of devices.filter((x) => x.dhcpServer)) {
    const s = d.dhcpServer!;
    add('services', 'dhcpServer', { device: d.name, start: s.start, end: s.end, ...(s.gateway ? { gateway: ROUTER_REF } : {}), ...(s.dns ? { dns: s.dns } : {}) }, '2');
    for (const r of s.reservations ?? []) {
      const client = devices.find((x) => x.interfaces.some((i) => i.mac.toUpperCase() === r.mac.toUpperCase()));
      if (client) add('services', 'dhcpLease', { device: client.name, ip: r.ip }, '2');
    }
  }
  const reserved = new Set(devices.flatMap((d) => (d.dhcpServer?.reservations ?? []).map((r) => r.mac.toUpperCase())));
  for (const c of clients.filter((x) => !x.interfaces.some((i) => reserved.has(i.mac.toUpperCase()))).slice(0, 3)) add('services', 'dhcpLease', { device: c.name });
  for (const d of devices.filter((x) => x.dnsServer)) {
    for (const r of d.dnsServer!.records.filter((x) => x.type === 'A')) add('services', 'dnsRecord', { device: d.name, name: r.name, value: r.value });
  }

  // Verbindungen: je Netz ein Gerät, Pings im Kreis; Webseiten aus einem anderen Netz.
  const reps = new Map<string, Device>();
  for (const d of devices.filter((x) => DEVICE_SPECS[x.type].role === 'endpoint' && x.type !== 'clientgroup')) {
    const net = netOf(d);
    if (net && !d.dhcp && !reps.has(net)) reps.set(net, d);
  }
  const list = [...reps.values()];
  if (list.length >= 2) {
    const pairs = list.slice(0, 10).map((d, i, all) => `${d.name} > ${all[(i + 1) % all.length]!.name}`);
    add('connections', 'pings', { pairs: pairs.join('; ') }, String(pairs.length));
  }
  for (const web of devices.filter((d) => d.webServer)) {
    const ip = web.interfaces[0]?.ip;
    const from = list.find((d) => d.id !== web.id && netOf(d) !== netOf(web)) ?? clients[0];
    if (!ip || !from) continue;
    const record = devices.flatMap((d) => d.dnsServer?.records ?? []).find((r) => r.type === 'A' && r.value === ip);
    add('connections', 'http', { from: from.name, url: `http://${record?.name ?? ip}/` }, '2');
  }

  // Dokumentation: Bereiche mit Farbe und Netz, Werte aus der Notiz.
  for (const a of (topology.areas ?? []).filter((x) => x.kind !== 'rack' && x.title.trim())) {
    add('documentation', 'area', { title: a.title, color: a.color, ...(a.network ? { network: a.network } : {}) });
    const values = noteValues(a.note ?? '');
    if (values.length) add('documentation', 'areaNote', { title: a.title, values: values.join(', ') }, String(Math.min(values.length, 6)));
  }
  return out;
}
