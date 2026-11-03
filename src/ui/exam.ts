/**
 * Prüfungen «Firmennetz mit drei Standorten» (wie die praktische Prüfung im
 * Modul 117): Aus einer Vorgabe (Firma, drei Standorte, Transportnetze,
 * Intranet mit Webserver) entstehen
 *   - die Aufgabe mit automatischer Prüfung und Punkten (je Standort 21,
 *     Netzwerkdienste 12, total 75; Note = 5 × Punkte / 75 + 1),
 *   - die Musterlösung als fertiges Netz,
 *   - das Aufgabenblatt zum Drucken.
 * Varianten entstehen per Zufall (mit Startwert, wiederholbar) oder von Hand.
 * Feste Varianten stehen bewusst nicht im öffentlichen Quellcode.
 */
import {
  addArea,
  addDevice,
  addDhcpReservation,
  addDnsRecord,
  configureHost,
  connect,
  emptyTopology,
  formatIp,
  getDevice,
  maskToText,
  networkOf,
  parseIp,
  parseMask,
  setDhcpServer,
  setDnsServerEnabled,
  setInterfaceAddress,
  setInterfaceCount,
  setRoutingMode,
  setWebServerEnabled,
  saveWebFile,
  ROUTER_REF,
  type Goal,
  type Result,
  type TagColor,
  type TaskSet,
  type Topology,
} from '../core';
import { t } from '../i18n';

export interface ExamSite {
  /** Standortname, z.B. «Burgdorf»; daraus entstehen die Gerätenamen. */
  name: string;
  /** Netz mit Präfix, z.B. «10.44.0.0/18». */
  network: string;
  dhcpStart: string;
  dhcpEnd: string;
  /** Notebooks mit dynamischer Adresse. */
  dynamic: number;
  /** Notebooks mit fester Adresse über DHCP (Reservierung). */
  fixed: string[];
  color: TagColor;
}

export interface ExamSpec {
  /** Kennung der Variante, z.B. «A». */
  id: string;
  company: string;
  /** Hauptsitz, Filiale, Filiale mit Intranet. */
  sites: [ExamSite, ExamSite, ExamSite];
  /** Transportnetze /30: Hauptsitz–Filiale 1, Hauptsitz–Filiale 2, Filiale 2–Filiale 1. */
  transfers: [string, string, string];
  intranet: { network: string; web: string; domain: string; color: TagColor };
}

export const EXAM_POINTS = { site: 21, services: 12, total: 75 } as const;
export const MAX_NOTEBOOKS = 8;

// --- Berechnete Werte ------------------------------------------------------------

export interface SiteFacts {
  network: string;
  prefix: number;
  mask: string;
  router: string;
  server: string;
  first: string;
  last: string;
  broadcast: string;
  hosts: number;
  dynamicNames: string[];
  routerName: string;
  switchName: string;
  serverName: string;
}

function cidr(text: string): { ip: number; prefix: number } | null {
  const [ipText = '', prefixText = ''] = text.trim().split('/');
  const ip = parseIp(ipText);
  const prefix = parseMask(prefixText);
  return ip === null || prefix === null ? null : { ip, prefix };
}

const size = (prefix: number) => 2 ** (32 - prefix);

/** Netzinfos eines Standorts: Router = kleinste Adresse, Server = Netz + 10, dynamische Notebooks heissen wie ihre Adresse. */
export function siteFacts(site: ExamSite): SiteFacts {
  const c = cidr(site.network)!;
  const net = networkOf(c.ip, c.prefix);
  const broadcast = net + size(c.prefix) - 1;
  const start = parseIp(site.dhcpStart) ?? net + 1;
  return {
    network: `${formatIp(net)}/${c.prefix}`,
    prefix: c.prefix,
    mask: maskToText(c.prefix),
    router: formatIp(net + 1),
    server: formatIp(net + 10),
    first: formatIp(net + 1),
    last: formatIp(broadcast - 1),
    broadcast: formatIp(broadcast),
    hosts: size(c.prefix) - 2,
    dynamicNames: Array.from({ length: site.dynamic }, (_, i) => formatIp(start + i)),
    routerName: `R_${site.name}`,
    switchName: `SW_${site.name}`,
    serverName: `DHCP ${site.name}`,
  };
}

/** Adresse `n` im Transportnetz (1 oder 2). */
function transferIp(net: string, n: 1 | 2): string {
  const c = cidr(net)!;
  return formatIp(networkOf(c.ip, c.prefix) + n);
}

/** Welche Standorte ein Transportnetz verbindet (Index in `sites`), in der Reihenfolge .1, .2. */
export const TRANSFER_ENDS: readonly [number, number][] = [
  [0, 1],
  [0, 2],
  [2, 1],
];

// --- Prüfung der Vorgabe -----------------------------------------------------------

export type SpecIssue = { field: string; code: string; params?: Record<string, string | number> };

/** Prüft eine (z.B. von Hand angepasste) Vorgabe; null = in Ordnung. */
export function checkExamSpec(spec: ExamSpec): SpecIssue | null {
  if (!spec.company.trim()) return { field: 'company', code: 'required' };
  const names = new Set<string>();
  const nets: { ip: number; prefix: number; field: string }[] = [];
  const overlaps = (a: { ip: number; prefix: number }, b: { ip: number; prefix: number }) => {
    const p = Math.min(a.prefix, b.prefix);
    return networkOf(a.ip, p) === networkOf(b.ip, p);
  };
  const addNet = (text: string, field: string, maxPrefix: number): SpecIssue | null => {
    const c = cidr(text);
    if (!c || c.prefix < 8 || c.prefix > maxPrefix) return { field, code: 'network', params: { value: text } };
    if (networkOf(c.ip, c.prefix) !== c.ip) return { field, code: 'hostBits', params: { value: text } };
    const clash = nets.find((n) => overlaps(n, c));
    if (clash) return { field, code: 'overlap', params: { value: text } };
    nets.push({ ...c, field });
    return null;
  };
  for (const [i, site] of spec.sites.entries()) {
    const f = (k: string) => `sites.${i}.${k}`;
    if (!/^[\p{L}][\p{L}\p{N} -]{0,23}$/u.test(site.name.trim())) return { field: f('name'), code: 'name' };
    if (names.has(site.name.trim().toLowerCase())) return { field: f('name'), code: 'duplicate' };
    names.add(site.name.trim().toLowerCase());
    const netIssue = addNet(site.network, f('network'), 28);
    if (netIssue) return netIssue;
    const facts = siteFacts(site);
    const c = cidr(site.network)!;
    const net = networkOf(c.ip, c.prefix);
    const inside = (ip: number | null) => ip !== null && networkOf(ip, c.prefix) === net && ip > net + 10 && ip < net + size(c.prefix) - 1;
    const start = parseIp(site.dhcpStart);
    const end = parseIp(site.dhcpEnd);
    if (!inside(start)) return { field: f('dhcpStart'), code: 'outside', params: { net: facts.network } };
    if (!inside(end)) return { field: f('dhcpEnd'), code: 'outside', params: { net: facts.network } };
    if (start! > end!) return { field: f('dhcpEnd'), code: 'order' };
    if (!Number.isInteger(site.dynamic) || site.dynamic < 1 || site.dynamic > Math.min(MAX_NOTEBOOKS, end! - start! + 1)) {
      return { field: f('dynamic'), code: 'count', params: { max: MAX_NOTEBOOKS } };
    }
    if (site.fixed.length < 1 || site.fixed.length + site.dynamic > MAX_NOTEBOOKS) return { field: f('fixed'), code: 'count', params: { max: MAX_NOTEBOOKS } };
    const fixedIps = new Set<number>();
    for (const text of site.fixed) {
      const ip = parseIp(text);
      if (!inside(ip)) return { field: f('fixed'), code: 'outside', params: { net: facts.network } };
      if (ip! >= start! && ip! <= end!) return { field: f('fixed'), code: 'inRange', params: { value: text } };
      if (fixedIps.has(ip!)) return { field: f('fixed'), code: 'duplicate' };
      fixedIps.add(ip!);
    }
  }
  for (const [i, net] of spec.transfers.entries()) {
    const c = cidr(net);
    if (!c || c.prefix !== 30) return { field: `transfers.${i}`, code: 'transfer', params: { value: net } };
    const issue = addNet(net, `transfers.${i}`, 30);
    if (issue) return issue;
  }
  const intranetIssue = addNet(spec.intranet.network, 'intranet.network', 28);
  if (intranetIssue) return intranetIssue;
  const c = cidr(spec.intranet.network)!;
  const web = parseIp(spec.intranet.web);
  if (web === null || networkOf(web, c.prefix) !== c.ip || web === c.ip + 1 || web === c.ip || web >= c.ip + size(c.prefix) - 1) {
    return { field: 'intranet.web', code: 'outside', params: { net: spec.intranet.network } };
  }
  if (!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+example$/.test(spec.intranet.domain.trim())) return { field: 'intranet.domain', code: 'domain' };
  return null;
}

// --- Aufgabe ---------------------------------------------------------------------------

const domainUrl = (spec: ExamSpec) => `http://${spec.intranet.domain}/`;

/** Beschreibung für die Lernenden (erscheint in der Aufgabe und auf dem Blatt). */
export function examDescription(spec: ExamSpec): string {
  const lines: string[] = [t('exam.intro', { company: spec.company, seat: spec.sites[0].name })];
  spec.sites.forEach((site, i) => {
    const f = siteFacts(site);
    lines.push(
      '',
      t(i === 0 ? 'exam.seat' : 'exam.branch', { name: site.name }),
      t('exam.siteNetwork', { network: f.network }),
      t('exam.siteServer', { server: f.serverName, ip: f.server, start: site.dhcpStart, end: site.dhcpEnd }),
      t('exam.siteNotebooks', { dynamic: site.dynamic, fixed: site.fixed.length, ips: site.fixed.join(', ') }),
      t('exam.siteNet', { sw: f.switchName, router: f.routerName }),
    );
  });
  const [s0, s1, s2] = spec.sites.map(siteFacts) as [SiteFacts, SiteFacts, SiteFacts];
  const routers = [s0, s1, s2].map((f) => f.routerName);
  lines.push(
    '',
    t('exam.task'),
    t('exam.taskBuild'),
    t('exam.taskTransfers', {
      a: `${routers[0]} – ${routers[1]}: ${spec.transfers[0]}`,
      b: `${routers[0]} – ${routers[2]}: ${spec.transfers[1]}`,
      c: `${routers[2]} – ${routers[1]}: ${spec.transfers[2]}`,
    }),
    t('exam.taskIntranet', { site: spec.sites[2].name, router: s2.routerName, network: spec.intranet.network, web: spec.intranet.web }),
    t('exam.taskDns', { domain: spec.intranet.domain }),
    t('exam.taskDocument', {
      colors: [...spec.sites.map((s) => `${s.name} = ${t(`color.${s.color}`)}`), `Intranet = ${t(`color.${spec.intranet.color}`)}`].join(', '),
    }),
    t('exam.taskNames'),
    t('exam.taskSubmit'),
  );
  return lines.join('\n');
}

/**
 * Aufgabe mit Punkten: je Standort 21, Netzwerkdienste 12. Teilpunkte bei
 * Geräten, Dokumentation und Pings; Gateways mit «@router», damit eine falsch
 * gewählte Router-Adresse nur einmal Punkte kostet (Folgefehler).
 */
export function buildExamTasks(spec: ExamSpec): TaskSet {
  const goals: Goal[] = [];
  let section = '';
  const add = (id: string, points: number, text: string, check: Goal['check']) => goals.push({ id, text, check, points, section });
  const facts = spec.sites.map(siteFacts);
  spec.sites.forEach((site, i) => {
    const f = facts[i]!;
    const next = facts[(i + 1) % 3]!;
    const prev = facts[(i + 2) % 3]!;
    const p = `s${i + 1}`;
    section = t('exam.section.site', { name: site.name });
    const notebooks = [...f.dynamicNames, ...site.fixed];
    const firstDynamic = f.dynamicNames[0]!;
    add(`${p}-router`, 1, t('exam.goal.router', { name: f.routerName }), { type: 'device', names: [f.routerName], deviceType: 'router' });
    add(`${p}-switch`, 1, t('exam.goal.switch', { name: f.switchName }), { type: 'device', names: [f.switchName], deviceType: 'switch' });
    add(`${p}-server`, 1, t('exam.goal.server', { name: f.serverName }), { type: 'device', names: [f.serverName], deviceType: 'server' });
    add(`${p}-notebooks`, 3, t('exam.goal.notebooks', { site: site.name, names: notebooks.join(', ') }), { type: 'device', names: notebooks, deviceType: 'notebook' });
    add(`${p}-router-ip`, 2, t('exam.goal.routerIp', { name: f.routerName, address: `${f.router}/${f.prefix}` }), { type: 'address', device: f.routerName, address: `${f.router}/${f.prefix}` });
    add(`${p}-server-ip`, 1, t('exam.goal.serverIp', { name: f.serverName, address: `${f.server}/${f.prefix}` }), { type: 'address', device: f.serverName, address: `${f.server}/${f.prefix}` });
    add(`${p}-server-gw`, 1, t('exam.goal.serverGatewayRouter', { name: f.serverName }), { type: 'gateway', device: f.serverName, gateway: ROUTER_REF });
    add(`${p}-dhcp`, 2, t('exam.goal.dhcpRouter', { name: f.serverName, start: site.dhcpStart, end: site.dhcpEnd }), {
      type: 'dhcpServer',
      device: f.serverName,
      start: site.dhcpStart,
      end: site.dhcpEnd,
      gateway: ROUTER_REF,
    });
    add(`${p}-lease`, 1, t('exam.goal.lease', { name: firstDynamic }), { type: 'dhcpLease', device: firstDynamic });
    add(`${p}-fixed`, 2, t('exam.goal.fixed', { name: site.fixed[0]!, ip: site.fixed[0]! }), { type: 'dhcpLease', device: site.fixed[0]!, ip: site.fixed[0]! });
    add(`${p}-area`, 1, t('exam.goal.area', { site: site.name, color: t(`color.${site.color}`), network: f.network }), { type: 'area', title: site.name, color: site.color, network: f.network });
    add(`${p}-doc`, 3, t('exam.goal.doc', { site: site.name }), { type: 'areaNote', title: site.name, values: [f.network, f.mask, f.first, f.last, f.broadcast, String(f.hosts)] });
    add(`${p}-ping`, 2, t('exam.goal.pings', { from: firstDynamic, a: next.serverName, b: prev.serverName }), {
      type: 'pings',
      pairs: [
        [firstDynamic, next.server],
        [firstDynamic, prev.server],
      ],
    });
  });
  section = t('exam.services');
  const s2 = facts[2]!;
  const webPrefix = cidr(spec.intranet.network)!.prefix;
  const webGateway = transferIp(spec.intranet.network, 1);
  add('d-web', 1, t('exam.goal.web', { address: `${spec.intranet.web}/${webPrefix}` }), { type: 'address', device: 'Webserver', address: `${spec.intranet.web}/${webPrefix}` });
  add('d-web-gw', 1, t('exam.goal.webGatewayRouter'), { type: 'gateway', device: 'Webserver', gateway: ROUTER_REF });
  add('d-intranet', 1, t('exam.goal.intranet', { name: s2.routerName, address: `${webGateway}/${webPrefix}` }), { type: 'address', device: s2.routerName, address: `${webGateway}/${webPrefix}` });
  facts.forEach((f, i) =>
    add(`d-dns-${i + 1}`, 1, t('exam.goal.dnsRecord', { name: f.serverName, domain: spec.intranet.domain, ip: spec.intranet.web }), {
      type: 'dnsRecord',
      device: f.serverName,
      name: spec.intranet.domain,
      value: spec.intranet.web,
    }),
  );
  facts.forEach((f, i) =>
    add(`d-dhcp-dns-${i + 1}`, 1, t('exam.goal.leaseDns', { name: f.dynamicNames[0]!, dns: f.server }), { type: 'dhcpLease', device: f.dynamicNames[0]!, dns: f.server }),
  );
  facts.forEach((f, i) =>
    add(`d-http-${i + 1}`, 1, t('exam.goal.http', { name: f.dynamicNames[0]!, url: domainUrl(spec) }), { type: 'http', from: f.dynamicNames[0]!, url: domainUrl(spec) }),
  );
  return {
    title: t('exam.title', { id: spec.id, company: spec.company }),
    description: examDescription(spec),
    difficulty: 4,
    grading: true,
    noSelfCheck: true,
    goals,
  };
}

// --- Musterlösung ----------------------------------------------------------------------

function must<T>(r: Result<T>, what: string): T {
  if (!r.ok) throw new Error(`${what}: ${r.error.code}`);
  return r.value;
}

/** Fertiges Netz, das alle Ziele erfüllt (für Lehrpersonen und den Test). */
export function buildExamSolution(spec: ExamSpec): Topology {
  let topo = emptyTopology();
  const add = (type: Parameters<typeof addDevice>[1], name: string, x: number, y: number, ports?: number) => {
    const r = must(addDevice(topo, type, name, { x, y }, ports ? { ports } : {}), name);
    topo = r.topology;
    return r.id;
  };
  const link = (a: string, b: string, ports: { a?: number; b?: number } = {}) => {
    topo = must(connect(topo, a, b, 'tp', ports), 'connect').topology;
  };
  const apply = (r: Result<Topology>, what: string) => {
    topo = must(r, what);
  };
  const origins: [number, number][] = [
    [0, 0],
    [1000, 0],
    [500, 620],
  ];
  const routers: string[] = [];
  spec.sites.forEach((site, i) => {
    const f = siteFacts(site);
    const [ox, oy] = origins[i]!;
    const notebooks = [...f.dynamicNames.map((n) => ({ name: n, fixed: false })), ...site.fixed.map((n) => ({ name: n, fixed: true }))];
    const width = Math.max(560, 200 + 105 * notebooks.length);
    const router = add('router', f.routerName, ox + width / 2, oy + 70);
    apply(setInterfaceCount(topo, router, i === 2 ? 4 : 3), 'ports');
    // Ein Switch mit 8 Anschlüssen reicht für Router, Server und bis zu 6 Notebooks; sonst einer mit 16.
    const sw = add('switch', f.switchName, ox + width / 2, oy + 200, notebooks.length + 2 > 8 ? 16 : undefined);
    const server = add('server', f.serverName, ox + 70, oy + 330);
    link(router, sw, { a: 0 });
    link(server, sw);
    apply(setInterfaceAddress(topo, router, 0, f.router, String(f.prefix)), 'router');
    apply(setRoutingMode(topo, router, 'auto'), 'auto');
    apply(configureHost(topo, server, { ip: f.server, mask: String(f.prefix), gateway: f.router, dns: f.server }), 'server');
    apply(setDhcpServer(topo, server, { start: site.dhcpStart, end: site.dhcpEnd, gateway: f.router, dns: f.server, leaseTime: 3600 }), 'dhcp');
    apply(setDnsServerEnabled(topo, server, true), 'dns');
    apply(addDnsRecord(topo, server, { name: spec.intranet.domain, type: 'A', value: spec.intranet.web, ttl: 300 }), 'record');
    notebooks.forEach((nb, k) => {
      const id = add('notebook', nb.name, ox + 190 + 105 * k, oy + 340);
      link(id, sw);
      apply(configureHost(topo, id, { ip: '', mask: '', dhcp: true }), 'notebook');
      if (nb.fixed) apply(addDhcpReservation(topo, server, { mac: getDevice(topo, id)!.interfaces[0]!.mac, ip: nb.name }), 'reservation');
    });
    topo = must(
      addArea(topo, { title: site.name, color: site.color, x: ox - 20, y: oy, width, height: 430, network: f.network, note: siteNote(site) }),
      'area',
    ).topology;
    routers.push(router);
  });
  // Transportnetze: Anschluss 1 und 2 der Router, in der Reihenfolge der Vorgabe.
  const nextPort = [1, 1, 1];
  TRANSFER_ENDS.forEach(([a, b], k) => {
    const pa = nextPort[a]!++;
    const pb = nextPort[b]!++;
    link(routers[a]!, routers[b]!, { a: pa, b: pb });
    const prefix = String(cidr(spec.transfers[k])!.prefix);
    apply(setInterfaceAddress(topo, routers[a]!, pa, transferIp(spec.transfers[k], 1), prefix), 'transfer');
    apply(setInterfaceAddress(topo, routers[b]!, pb, transferIp(spec.transfers[k], 2), prefix), 'transfer');
  });
  // Intranet am dritten Standort.
  const [ox, oy] = origins[2]!;
  const webPrefix = String(cidr(spec.intranet.network)!.prefix);
  const gateway = transferIp(spec.intranet.network, 1);
  const web = add('server', 'Webserver', ox + 900, oy + 120);
  link(routers[2]!, web, { a: 3 });
  apply(setInterfaceAddress(topo, routers[2]!, 3, gateway, webPrefix), 'intranet');
  apply(configureHost(topo, web, { ip: spec.intranet.web, mask: webPrefix, gateway }), 'web');
  apply(setWebServerEnabled(topo, web, true), 'webserver');
  apply(saveWebFile(topo, web, { path: '/index.html', content: `<h1>${spec.company}</h1><p>Intranet</p>` }), 'page');
  topo = must(addArea(topo, { title: 'Intranet', color: spec.intranet.color, x: ox + 800, y: oy + 20, width: 220, height: 220, network: spec.intranet.network }), 'area').topology;
  return topo;
}

/** Beschriftung eines Standorts (wie in roter Schrift verlangt): Netzinfos und Dienste. */
export function siteNote(site: ExamSite): string {
  const f = siteFacts(site);
  return [
    `${t('exam.doc.network')}: ${f.network}`,
    `${t('exam.doc.mask')}: ${f.mask}`,
    `${t('exam.doc.first')}: ${f.first}`,
    `${t('exam.doc.last')}: ${f.last}`,
    `${t('exam.doc.broadcast')}: ${f.broadcast}`,
    `${t('exam.doc.hosts')}: ${f.hosts}`,
    `${t('exam.doc.dns')}: ${f.server}`,
    `${t('exam.doc.dhcp')}: ${f.server}`,
    `${t('exam.doc.range')}: ${site.dhcpStart} – ${site.dhcpEnd}`,
  ].join('\n');
}

// --- Zufällige Variante ------------------------------------------------------------

const TOWNS = [
  'Aarau', 'Baden', 'Brugg', 'Olten', 'Solothurn', 'Grenchen', 'Langenthal', 'Huttwil', 'Willisau', 'Sursee', 'Sempach', 'Hochdorf',
  'Stans', 'Sarnen', 'Altdorf', 'Einsiedeln', 'Rapperswil', 'Wil', 'Frauenfeld', 'Schaffhausen', 'Winterthur', 'Uster', 'Wetzikon', 'Wohlen',
  'Lenzburg', 'Zofingen', 'Burgdorf', 'Spiez', 'Interlaken', 'Frutigen', 'Murten', 'Bulle', 'Sitten', 'Visp', 'Chur', 'Davos',
];
const COMPANIES = ['Nordstern', 'Bergkristall', 'Talblick', 'Sonnenhang', 'Waldrand', 'Seeblick', 'Flussau', 'Felsenegg', 'Morgenrot', 'Lindenhof'];
const BRANCHES = ['Informatik AG', 'Treuhand GmbH', 'Bau AG', 'Logistik AG', 'Druck GmbH', 'Elektro AG', 'Velo GmbH', 'Garten AG'];
const COLORS: TagColor[] = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];

/** Kleiner Zufallsgenerator mit Startwert, damit eine Variante wiederholbar ist. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
  return { next, int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)), pick: <T>(list: readonly T[]) => list[Math.floor(next() * list.length)]! };
}

/** Neue Variante aus einem Startwert: verschiedene Präfixe (/17 bis /27), private Adressen, keine Überschneidungen. */
export function randomExam(seed: number, id = 'Z'): ExamSpec {
  const r = rng(seed);
  for (let attempt = 0; attempt < 50; attempt++) {
    const towns = new Set<string>();
    while (towns.size < 3) towns.add(r.pick(TOWNS));
    const colors = new Set<TagColor>();
    while (colors.size < 4) colors.add(r.pick(COLORS));
    const [c0, c1, c2, c3] = [...colors] as [TagColor, TagColor, TagColor, TagColor];
    const company = `${r.pick(COMPANIES)} ${r.pick(BRANCHES)}`;
    // Hauptsitz gross (/17–/22), Filialen klein (/24–/27).
    const prefixes = [r.int(17, 22), r.int(24, 27), r.int(23, 25)];
    const bases = [
      (10 << 24) | (r.int(1, 254) << 16),
      (172 << 24) | (r.int(16, 31) << 16) | (r.int(0, 255) << 8),
      (10 << 24) | (r.int(1, 254) << 16) | (r.int(0, 255) << 8),
    ];
    const sites = prefixes.map((prefix, i): ExamSite => {
      const net = networkOf(bases[i]! >>> 0, prefix) >>> 0;
      const hosts = size(prefix);
      const startOff = Math.max(20, Math.floor(hosts / 4));
      const endOff = Math.min(hosts - 30, startOff + Math.max(20, Math.floor(hosts / 4)));
      const fixedCount = r.int(1, 3);
      const fixed = Array.from({ length: fixedCount }, (_, k) => formatIp(net + Math.min(hosts - 3, endOff + 5 + k)));
      return {
        name: [...towns][i]!,
        network: `${formatIp(net)}/${prefix}`,
        dhcpStart: formatIp(net + startOff),
        dhcpEnd: formatIp(net + endOff),
        dynamic: r.int(1, 3),
        fixed,
        color: [c0, c1, c2][i]!,
      };
    }) as [ExamSite, ExamSite, ExamSite];
    const transferBase = ((172 << 24) | (r.int(16, 31) << 16) | (r.int(0, 255) << 8)) >>> 0;
    const transfers = [0, 4, 8].map((o) => `${formatIp(transferBase + o)}/30`) as [string, string, string];
    const third = r.int(0, 255);
    const slug = company.split(' ')[0]!.toLowerCase();
    const spec: ExamSpec = {
      id,
      company,
      sites,
      transfers,
      intranet: { network: `192.168.${third}.0/24`, web: `192.168.${third}.10`, domain: `intranet.${slug}.example`, color: c3 },
    };
    if (!checkExamSpec(spec)) return spec;
  }
  throw new Error('Keine gültige Variante gefunden');
}

// --- Aufgabenblatt -------------------------------------------------------------------

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Aufgabenblatt als eigenständige HTML-Seite (im Browser öffnen und als PDF drucken). */
export function examSheetHtml(spec: ExamSpec): string {
  return examSheetsHtml([spec]);
}

/** Aufgabenblätter mehrerer Varianten in einer Seite, jede auf einer eigenen Druckseite. */
export function examSheetsHtml(specs: readonly ExamSpec[]): string {
  const pages = specs.map((spec) => examPageHtml(spec)).join('\n<div class="break"></div>\n');
  const title = specs.length === 1 ? buildExamTasks(specs[0]!).title : t('exam.sheet.many', { n: specs.length });
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>
body{font:11pt/1.45 system-ui,sans-serif;max-width:46em;margin:2em auto;padding:0 1em;color:#111}
h1{font-size:16pt;margin:0 0 .2em}p{margin:.15em 0}
table{border-collapse:collapse;width:100%;margin:.6em 0}td,th{border:1px solid #999;padding:.3em .5em;text-align:left}
.fields td{height:1.8em}.num{text-align:right;width:7em}.muted{color:#555;font-size:9pt}
.break{break-after:page;height:2em}
@media print{body{margin:0}}
</style></head><body>
${pages}
</body></html>
`;
}

function examPageHtml(spec: ExamSpec): string {
  const tasks = buildExamTasks(spec);
  const sections = [
    ...spec.sites.map((s) => ({ label: s.name, points: EXAM_POINTS.site })),
    { label: t('exam.services'), points: EXAM_POINTS.services },
  ];
  const description = escape(examDescription(spec))
    .split('\n')
    .map((l) => (l.trim() ? `<p>${l}</p>` : ''))
    .join('');
  return `<h1>${escape(tasks.title)}</h1>
<table class="fields"><tr><th>${escape(t('exam.sheet.name'))}</th><td></td><th>${escape(t('exam.sheet.class'))}</th><td></td><th>${escape(t('exam.sheet.date'))}</th><td></td></tr></table>
<table><tr><th>${escape(t('exam.sheet.duration'))}</th><td>80 min</td></tr>
<tr><th>${escape(t('exam.sheet.points'))}</th><td>${EXAM_POINTS.total}</td></tr>
<tr><th>${escape(t('exam.sheet.aids'))}</th><td>${escape(t('exam.sheet.aidsText'))}</td></tr>
<tr><th>${escape(t('exam.sheet.grade'))}</th><td>${escape(t('tasks.gradeFormula'))}</td></tr></table>
${description}
<h2>${escape(t('exam.sheet.raster'))}</h2>
<table><tr><th>${escape(t('exam.sheet.part'))}</th><th class="num">${escape(t('exam.sheet.possible'))}</th><th class="num">${escape(t('exam.sheet.reached'))}</th></tr>
${sections.map((s) => `<tr><td>${escape(s.label)}</td><td class="num">${s.points}</td><td></td></tr>`).join('')}
<tr><th>Total</th><th class="num">${EXAM_POINTS.total}</th><td></td></tr></table>
<p class="muted">${escape(t('exam.sheet.footer'))}</p>`;
}

/** Hilfsfunktion für den Dialog: Feste Adressen aus Text («10.0.0.5, 10.0.0.6»). */
export const parseFixed = (text: string) =>
  text
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

