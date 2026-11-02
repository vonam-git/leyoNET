/**
 * Übungen zum Modul 117 (Informatik- und Netzinfrastruktur für ein kleines
 * Unternehmen realisieren): Block 6 «IP und Router» und Block 7
 * «Netzwerkdienste». Zu jeder Übung gibt es ein ausfüllbares Arbeitsblatt
 * (PDF) mit demselben Namen in docs/arbeitsblaetter/.
 *
 * Adressen aus den ursprünglichen Unterlagen, die im öffentlichen Internet
 * liegen, sind durch private ersetzt (RFC 1918), Domains enden auf .example.
 */
import {
  addArea,
  addDevice,
  addDhcpReservation,
  addDnsRecord,
  configureHost,
  connect,
  getDevice,
  saveWebFile,
  setDhcpServer,
  setDnsServerEnabled,
  setInterfaceAddress,
  setInterfaceCount,
  setRoutingMode,
  setWebServerEnabled,
  updateArea,
  type DeviceType,
  type Topology,
} from '../core';
import { t } from '../i18n';
import { Start, goal, task, unwrap, type CatalogEntry } from './catalogKit';
import { buildExamSolution, buildExamTasks, examDescription, type ExamSpec } from './exam';

// --- Hilfen für Lösungen (auch im Test verwendet) -----------------------------------------

const id = (t: Topology, name: string) => {
  const device = t.devices.find((d) => d.name === name);
  if (!device) throw new Error(`Gerät fehlt: ${name}`);
  return device.id;
};
const link = (t: Topology, a: string, b: string, ports: { a?: number; b?: number } = {}) => unwrap(connect(t, id(t, a), id(t, b), 'tp', ports)).topology;
const host = (t: Topology, name: string, ip: string, mask: string, gateway?: string, dns?: string) =>
  unwrap(configureHost(t, id(t, name), { ip, mask, ...(gateway ? { gateway } : {}), ...(dns ? { dns } : {}) }));
const dhcpClient = (t: Topology, name: string) => unwrap(configureHost(t, id(t, name), { ip: '', mask: '', dhcp: true }));
const add = (t: Topology, type: DeviceType, name: string, x: number, y: number) => unwrap(addDevice(t, type, name, { x, y })).topology;

// --- UE03 Router01: ein Netz, zwei Switches ------------------------------------------------

const PCS = ['PC01', 'PC02', 'PC03', 'PC04', 'PC05', 'PC06'] as const;
const UE03_LAST = ['110', '120', '130', '140', '150', '160'] as const;

function ue03Start(): Start {
  const s = new Start().add('switch', 'Switch 1', -150, 0).add('switch', 'Switch 2', 150, 0);
  PCS.forEach((name, i) => s.add('notebook', name, i < 3 ? -420 : 420, -160 + (i % 3) * 160));
  return s;
}

/** Auftrag 1 gelöst: verkabelt, alle sechs im Netz 192.168.0.0/24. */
export function solveUe03a1(topology: Topology): Topology {
  let t = link(topology, 'Switch 1', 'Switch 2');
  PCS.forEach((name, i) => {
    t = link(t, name, i < 3 ? 'Switch 1' : 'Switch 2');
    t = host(t, name, `192.168.0.${UE03_LAST[i]}`, '24');
  });
  return t;
}

/** Adressen mit einer anderen Maske bzw. einem anderen dritten Byte setzen. */
export function readdressUe03(topology: Topology, prefix: string, lan2: readonly string[] = []): Topology {
  let t = topology;
  PCS.forEach((name, i) => {
    t = host(t, name, `192.168.${lan2.includes(name) ? 1 : 0}.${UE03_LAST[i]}`, prefix);
  });
  return t;
}

// --- UE04 Router02: Router zwischen zwei Standorten ----------------------------------------

const SURSEE = ['PC01 Sursee', 'PC02 Sursee'] as const;
const ZUERICH = ['PC01 Zürich', 'PC02 Zürich'] as const;

function ue04Start(routers: string[]): Start {
  const s = new Start()
    .area('Sursee 192.168.0.0/24', 'yellow', -620, -230, 460, 460, '192.168.0.0/24')
    .area('Zürich 192.168.1.0/24', 'gray', routers.length === 1 ? 160 : 260, -230, 460, 460, '192.168.1.0/24')
    .add('notebook', SURSEE[0], -540, -110)
    .add('notebook', SURSEE[1], -540, 120)
    .add('switch', 'Switch Sursee', -280, 0)
    .add('switch', 'Switch Zürich', routers.length === 1 ? 280 : 380, 0)
    .add('notebook', ZUERICH[0], routers.length === 1 ? 540 : 640, -110)
    .add('notebook', ZUERICH[1], routers.length === 1 ? 540 : 640, 120);
  routers.forEach((name, i) => s.add('router', name, routers.length === 1 ? 0 : -80 + i * 220, routers.length === 1 ? 0 : 120));
  return s;
}

function ue04Hosts(topology: Topology): Topology {
  let t = topology;
  SURSEE.forEach((name, i) => {
    t = link(t, name, 'Switch Sursee');
    t = host(t, name, `192.168.0.1${i + 1}`, '24', '192.168.0.1');
  });
  ZUERICH.forEach((name, i) => {
    t = link(t, name, 'Switch Zürich');
    t = host(t, name, `192.168.1.1${i + 1}`, '24', '192.168.1.1');
  });
  return t;
}

export function solveUe04a1(topology: Topology): Topology {
  let t = ue04Hosts(topology);
  t = link(t, 'Router', 'Switch Sursee', { a: 0 });
  t = link(t, 'Router', 'Switch Zürich', { a: 1 });
  t = unwrap(setInterfaceAddress(t, id(t, 'Router'), 0, '192.168.0.1', '24'));
  return unwrap(setInterfaceAddress(t, id(t, 'Router'), 1, '192.168.1.1', '24'));
}

export function solveUe04a2(topology: Topology): Topology {
  let t = ue04Hosts(topology);
  t = link(t, 'Router 01', 'Switch Sursee', { a: 0 });
  t = link(t, 'Router 02', 'Switch Zürich', { a: 0 });
  t = link(t, 'Router 01', 'Router 02', { a: 1, b: 1 });
  t = unwrap(setInterfaceAddress(t, id(t, 'Router 01'), 0, '192.168.0.1', '24'));
  t = unwrap(setInterfaceAddress(t, id(t, 'Router 01'), 1, '172.16.0.1', '30'));
  t = unwrap(setInterfaceAddress(t, id(t, 'Router 02'), 0, '192.168.1.1', '24'));
  t = unwrap(setInterfaceAddress(t, id(t, 'Router 02'), 1, '172.16.0.2', '30'));
  t = unwrap(setRoutingMode(t, id(t, 'Router 01'), 'auto'));
  return unwrap(setRoutingMode(t, id(t, 'Router 02'), 'auto'));
}

// --- UE05 Router03: drei Standorte ----------------------------------------------------------

interface Ue05Site {
  name: string;
  network: string;
  prefix: string;
  router: string;
  hosts: [string, string, string];
  color: 'green' | 'blue' | 'orange';
}

/** Sursee 192.168.1.44/25, Luzern 10.125.113.13/28, Zürich 172.20.13.57/24 (statt 11.128.13.57). */
export const UE05_SITES: readonly Ue05Site[] = [
  { name: 'Sursee', network: '192.168.1.0/25', prefix: '25', router: '192.168.1.1', hosts: ['192.168.1.44', '192.168.1.45', '192.168.1.46'], color: 'green' },
  { name: 'Luzern', network: '10.125.113.0/28', prefix: '28', router: '10.125.113.1', hosts: ['10.125.113.13', '10.125.113.12', '10.125.113.11'], color: 'blue' },
  { name: 'Zürich', network: '172.20.13.0/24', prefix: '24', router: '172.20.13.1', hosts: ['172.20.13.57', '172.20.13.58', '172.20.13.59'], color: 'orange' },
];
/** Standleitungen (statt 1.0.0.0/30 …): erster Router .1, zweiter .2. */
export const UE05_LINKS: readonly [number, number, string][] = [
  [0, 1, '172.31.0.0'],
  [0, 2, '172.31.0.4'],
  [1, 2, '172.31.0.8'],
];
const plus = (ip: string, n: number) => ip.replace(/\d+$/, (last) => String(Number(last) + n));

export function solveUe05(topology: Topology): Topology {
  let t = topology;
  const origins: [number, number][] = [
    [-600, -300],
    [600, -300],
    [0, 350],
  ];
  UE05_SITES.forEach((site, i) => {
    const [ox, oy] = origins[i]!;
    t = add(t, 'router', `Router ${site.name}`, ox, oy + 60);
    t = unwrap(setInterfaceCount(t, id(t, `Router ${site.name}`), 3));
    t = add(t, 'switch', `Switch ${site.name}`, ox, oy + 180);
    t = link(t, `Router ${site.name}`, `Switch ${site.name}`, { a: 0 });
    t = unwrap(setInterfaceAddress(t, id(t, `Router ${site.name}`), 0, site.router, site.prefix));
    t = unwrap(setRoutingMode(t, id(t, `Router ${site.name}`), 'auto'));
    site.hosts.forEach((ip, k) => {
      const name = `Notebook ${site.name} ${k + 1}`;
      t = add(t, 'notebook', name, ox - 160 + k * 160, oy + 320);
      t = link(t, name, `Switch ${site.name}`);
      t = host(t, name, ip, site.prefix, site.router);
    });
    t = unwrap(addArea(t, { title: site.name, color: site.color, x: ox - 260, y: oy, width: 520, height: 400, network: site.network })).topology;
  });
  const nextPort = [1, 1, 1];
  for (const [a, b, net] of UE05_LINKS) {
    const ra = `Router ${UE05_SITES[a]!.name}`;
    const rb = `Router ${UE05_SITES[b]!.name}`;
    const pa = nextPort[a]!++;
    const pb = nextPort[b]!++;
    t = link(t, ra, rb, { a: pa, b: pb });
    t = unwrap(setInterfaceAddress(t, id(t, ra), pa, plus(net, 1), '30'));
    t = unwrap(setInterfaceAddress(t, id(t, rb), pb, plus(net, 2), '30'));
  }
  return t;
}

// --- M07A/B: Firmennetz Watch SA --------------------------------------------------------------

interface WatchSite {
  name: string;
  short: string;
  third: number;
  x: number;
  y: number;
}
const WATCH: readonly WatchSite[] = [
  { name: 'Bern', short: 'BE', third: 10, x: -460, y: 160 },
  { name: 'Basel', short: 'BS', third: 20, x: 0, y: -330 },
  { name: 'Locarno', short: 'LO', third: 30, x: 460, y: 160 },
];
/** Standleitungen: Bern–Basel 172.16.50.0/30, Bern–Locarno 172.16.51.0/30, Basel–Locarno 172.16.52.0/30. */
const WATCH_LINKS: readonly [number, number, number, number, string][] = [
  [0, 1, 1, 1, '172.16.50'],
  [0, 2, 2, 2, '172.16.51'],
  [1, 2, 2, 1, '172.16.52'],
];
export const WATCH_DOMAIN = 'watch-sa.example';

function watchStart(): Start {
  const s = new Start();
  for (const site of WATCH) {
    const { x, y } = site;
    s.area(`Standort ${site.name}`, site.name === 'Basel' ? 'blue' : 'gray', x - 220, y - 130, 440, 300)
      .add('router', `Router ${site.name}`, site.name === 'Basel' ? x : site.name === 'Bern' ? x + 160 : x - 160, site.name === 'Basel' ? y + 110 : y)
      .add('switch', `SW${site.short}01`, site.name === 'Basel' ? x : site.name === 'Bern' ? x - 40 : x + 40, site.name === 'Basel' ? y - 10 : y)
      .add('server', `Server ${site.name}`, site.name === 'Locarno' ? x + 150 : x - 150, y - 80)
      .add('notebook', `WS${site.short}01`, site.name === 'Locarno' ? x + 150 : x - 150, y + 20)
      .add('notebook', `WS${site.short}02`, site.name === 'Locarno' ? x + 150 : x - 150, y + 110);
  }
  return s;
}

/** M07A gelöst: verkabelt, Router mit drei Anschlüssen und automatischem Routing, DHCP je Standort. */
export function solveWatch1(topology: Topology): Topology {
  let t = topology;
  for (const site of WATCH) {
    const router = `Router ${site.name}`;
    const sw = `SW${site.short}01`;
    const server = `Server ${site.name}`;
    const net = `192.168.${site.third}`;
    t = unwrap(setInterfaceCount(t, id(t, router), 3));
    t = link(t, router, sw, { a: 0 });
    t = unwrap(setInterfaceAddress(t, id(t, router), 0, `${net}.1`, '24'));
    t = unwrap(setRoutingMode(t, id(t, router), 'auto'));
    t = link(t, server, sw);
    t = host(t, server, `${net}.10`, '24', `${net}.1`);
    t = unwrap(setDhcpServer(t, id(t, server), { start: `${net}.100`, end: `${net}.199`, gateway: `${net}.1`, leaseTime: 3600 }));
    for (const n of ['01', '02']) {
      t = link(t, `WS${site.short}${n}`, sw);
      t = dhcpClient(t, `WS${site.short}${n}`);
    }
  }
  for (const [a, b, pa, pb, net] of WATCH_LINKS) {
    const ra = `Router ${WATCH[a]!.name}`;
    const rb = `Router ${WATCH[b]!.name}`;
    t = link(t, ra, rb, { a: pa, b: pb });
    t = unwrap(setInterfaceAddress(t, id(t, ra), pa, `${net}.1`, '30'));
    t = unwrap(setInterfaceAddress(t, id(t, rb), pb, `${net}.2`, '30'));
  }
  return t;
}

const WATCH_COLORS = { Bern: 'green', Basel: 'red', Locarno: 'yellow' } as const;

/** M07B gelöst: Intranet mit Webserver, DNS auf den Servern, DNS per DHCP, dritte Workstation mit fester Zuweisung, Farben. */
export function solveWatch2(topology: Topology): Topology {
  let t = topology;
  const bern = id(t, 'Router Bern');
  t = unwrap(setInterfaceCount(t, bern, 4));
  t = add(t, 'server', 'Webserver', -760, -260);
  t = link(t, 'Router Bern', 'Webserver', { a: 3 });
  t = unwrap(setInterfaceAddress(t, bern, 3, '10.10.10.1', '24'));
  t = host(t, 'Webserver', '10.10.10.10', '24', '10.10.10.1');
  t = unwrap(setWebServerEnabled(t, id(t, 'Webserver'), true));
  t = unwrap(saveWebFile(t, id(t, 'Webserver'), { path: '/index.html', content: '<h1>Watch SA</h1><p>Intranet</p>' }));
  t = unwrap(addArea(t, { title: 'Intranet', color: 'purple', x: -880, y: -360, width: 240, height: 200, network: '10.10.10.0/24' })).topology;
  for (const site of WATCH) {
    const net = `192.168.${site.third}`;
    const server = id(t, `Server ${site.name}`);
    t = host(t, `Server ${site.name}`, `${net}.10`, '24', `${net}.1`, `${net}.10`);
    t = unwrap(setDnsServerEnabled(t, server, true));
    t = unwrap(addDnsRecord(t, server, { name: WATCH_DOMAIN, type: 'A', value: '10.10.10.10', ttl: 300 }));
    t = unwrap(setDhcpServer(t, server, { start: `${net}.100`, end: `${net}.199`, gateway: `${net}.1`, dns: `${net}.10`, leaseTime: 3600 }));
    const ws = `WS${site.short}03`;
    t = add(t, 'notebook', ws, site.x + (site.name === 'Locarno' ? 60 : -60), site.y + 140);
    t = link(t, ws, `SW${site.short}01`);
    t = dhcpClient(t, ws);
    t = unwrap(addDhcpReservation(t, server, { mac: getDevice(t, id(t, ws))!.interfaces[0]!.mac, ip: `${net}.200` }));
    const area = t.areas?.find((a) => a.title === `Standort ${site.name}`);
    if (area) t = unwrap(updateArea(t, area.id, { color: WATCH_COLORS[site.name as keyof typeof WATCH_COLORS], network: `${net}.0/24` }));
  }
  return t;
}

// --- M07C: Firmennetz Holzer AG (wie die Prüfung) --------------------------------------------

/** Sempach 33.14.12.0/25 → 10.14.12.0/25, Luzern 20.40.90.0/24 → 10.40.90.0/24, luzern.ch → intranet.holzer.example. */
export const HOLZER: ExamSpec = {
  id: 'UE03',
  company: 'Holzer AG',
  sites: [
    { name: 'Sarnen', network: '10.33.0.0/22', dhcpStart: '10.33.1.0', dhcpEnd: '10.33.2.255', dynamic: 3, fixed: ['10.33.0.100'], color: 'blue' },
    { name: 'Sempach', network: '10.14.12.0/25', dhcpStart: '10.14.12.50', dhcpEnd: '10.14.12.100', dynamic: 2, fixed: ['10.14.12.120', '10.14.12.121'], color: 'red' },
    { name: 'Luzern', network: '10.40.90.0/24', dhcpStart: '10.40.90.100', dhcpEnd: '10.40.90.200', dynamic: 5, fixed: ['10.40.90.250', '10.40.90.251', '10.40.90.252'], color: 'green' },
  ],
  transfers: ['10.10.10.0/30', '10.10.10.4/30', '10.10.10.8/30'],
  intranet: { network: '192.168.0.0/24', web: '192.168.0.10', domain: 'intranet.holzer.example', color: 'orange' },
};

export const solveHolzer = (): Topology => buildExamSolution(HOLZER);

// --- Katalog ----------------------------------------------------------------------------------

const ue03a1Goals = (key: string) => [
    goal(key, 1, { type: 'connected', a: 'Switch 1', b: 'Switch 2' }),
    goal(key, 2, { type: 'sameNetwork', devices: [...PCS] }),
    goal(key, 3, { type: 'inNetwork', device: 'PC01', network: '192.168.0.0/24' }),
    goal(key, 4, { type: 'ping', from: 'PC01', to: 'PC06' }),
    goal(key, 5, { type: 'ping', from: 'PC03', to: 'PC04' }),
    goal(key, 6, { type: 'noDuplicateIp' }),
];

export const M117: CatalogEntry[] = [
  {
    id: 'm117-ue03-a1',
    stars: 1,
    level: 1,
    series: 'm117',
    sheet: 'M06C_M117_UE03_Router01',
    build: () => ({ topology: ue03Start().topology, tasks: task('m117ue03a1', 1, ue03a1Goals('m117ue03a1')) }),
  },
  {
    id: 'm117-ue03-a2',
    stars: 1,
    level: 1,
    series: 'm117',
    sheet: 'M06C_M117_UE03_Router01',
    build: () => {
      const key = 'm117ue03a2';
      return {
        topology: solveUe03a1(ue03Start().topology),
        tasks: task(key, 1, [
          goal(key, 1, { type: 'inNetwork', device: 'PC03', network: '192.168.1.0/24' }),
          goal(key, 2, { type: 'sameNetwork', devices: ['PC03', 'PC05', 'PC06'] }),
          goal(key, 3, { type: 'ping', from: 'PC01', to: 'PC04' }),
          goal(key, 4, { type: 'ping', from: 'PC03', to: 'PC06' }),
          goal(key, 5, { type: 'noPing', from: 'PC01', to: 'PC03' }),
          goal(key, 6, { type: 'noPing', from: 'PC04', to: 'PC05' }),
        ]),
      };
    },
  },
  {
    id: 'm117-ue03-a3',
    stars: 2,
    level: 1,
    series: 'm117',
    sheet: 'M06C_M117_UE03_Router01',
    build: () => {
      const key = 'm117ue03a3';
      return {
        topology: solveUe03a1(ue03Start().topology),
        tasks: task(key, 2, [
          goal(key, 1, { type: 'inNetwork', device: 'PC01', network: '192.168.0.0/25' }),
          goal(key, 2, { type: 'inNetwork', device: 'PC06', network: '192.168.0.128/25' }),
          goal(key, 3, { type: 'sameNetwork', devices: ['PC03', 'PC04', 'PC05', 'PC06'] }),
          goal(key, 4, { type: 'ping', from: 'PC01', to: 'PC02' }),
          goal(key, 5, { type: 'ping', from: 'PC03', to: 'PC06' }),
          goal(key, 6, { type: 'noPing', from: 'PC02', to: 'PC03' }),
        ]),
      };
    },
  },
  {
    id: 'm117-ue03-a4',
    stars: 2,
    level: 2,
    series: 'm117',
    sheet: 'M06C_M117_UE03_Router01',
    build: () => {
      const key = 'm117ue03a4';
      return {
        topology: solveUe03a1(ue03Start().topology),
        tasks: task(key, 2, [
          goal(key, 1, { type: 'inNetwork', device: 'PC01', network: '192.168.0.64/26' }),
          goal(key, 2, { type: 'inNetwork', device: 'PC03', network: '192.168.0.128/26' }),
          goal(key, 3, { type: 'sameNetwork', devices: ['PC03', 'PC04', 'PC05', 'PC06'] }),
          goal(key, 4, { type: 'ping', from: 'PC02', to: 'PC01' }),
          goal(key, 5, { type: 'ping', from: 'PC06', to: 'PC03' }),
          goal(key, 6, { type: 'noPing', from: 'PC01', to: 'PC06' }),
        ]),
      };
    },
  },
  {
    id: 'm117-ue04-a1',
    stars: 2,
    level: 1,
    series: 'm117',
    sheet: 'M06D_M117_UE04_Router02',
    build: () => {
      const key = 'm117ue04a1';
      return {
        topology: ue04Start(['Router']).topology,
        tasks: task(key, 2, [
          goal(key, 1, { type: 'inNetwork', device: 'PC01 Sursee', network: '192.168.0.0/24' }),
          goal(key, 2, { type: 'inNetwork', device: 'PC01 Zürich', network: '192.168.1.0/24' }),
          goal(key, 3, { type: 'gateway', device: 'PC02 Sursee' }),
          goal(key, 4, { type: 'ping', from: 'PC01 Sursee', to: 'PC02 Sursee' }),
          goal(key, 5, { type: 'ping', from: 'PC01 Sursee', to: 'PC01 Zürich' }),
          goal(key, 6, { type: 'ping', from: 'PC02 Zürich', to: 'PC02 Sursee' }),
        ]),
      };
    },
  },
  {
    id: 'm117-ue04-a2',
    features: ['routing.auto', 'routing.static'],
    stars: 3,
    level: 2,
    series: 'm117',
    sheet: 'M06D_M117_UE04_Router02',
    build: () => {
      const key = 'm117ue04a2';
      return {
        topology: ue04Start(['Router 01', 'Router 02']).topology,
        tasks: task(key, 3, [
          goal(key, 1, { type: 'address', device: 'Router 01', address: '172.16.0.1/30' }),
          goal(key, 2, { type: 'address', device: 'Router 02', address: '172.16.0.2/30' }),
          goal(key, 3, { type: 'gateway', device: 'PC01 Zürich', gateway: '192.168.1.1' }),
          goal(key, 4, { type: 'ping', from: 'PC01 Sursee', to: 'PC02 Zürich' }),
          goal(key, 5, { type: 'ping', from: 'PC01 Zürich', to: 'PC02 Sursee' }),
        ]),
      };
    },
  },
  {
    id: 'm117-ue05',
    features: ['routing.auto', 'tool.areas', 'tool.ipCalculator'],
    stars: 4,
    level: 2,
    series: 'm117',
    sheet: 'M06E_M117_UE05_Router03',
    build: () => {
      const key = 'm117ue05';
      const [su, lu, zh] = UE05_SITES as [Ue05Site, Ue05Site, Ue05Site];
      const notebooks = UE05_SITES.flatMap((s) => [1, 2, 3].map((k) => `Notebook ${s.name} ${k}`));
      return {
        topology: new Start().topology,
        tasks: task(key, 4, [
          goal(key, 1, { type: 'device', names: UE05_SITES.map((s) => `Switch ${s.name}`), deviceType: 'switch' }),
          goal(key, 2, { type: 'device', names: UE05_SITES.map((s) => `Router ${s.name}`), deviceType: 'router' }),
          goal(key, 3, { type: 'device', names: notebooks, deviceType: 'notebook' }),
          goal(key, 4, { type: 'address', device: 'Router Sursee', address: `${su.router}/${su.prefix}` }),
          goal(key, 5, { type: 'address', device: 'Router Luzern', address: `${lu.router}/${lu.prefix}` }),
          goal(key, 6, { type: 'address', device: 'Router Zürich', address: `${zh.router}/${zh.prefix}` }),
          goal(key, 7, { type: 'address', device: 'Router Sursee', address: '172.31.0.1/30' }),
          goal(key, 8, { type: 'address', device: 'Router Luzern', address: '172.31.0.9/30' }),
          goal(key, 9, { type: 'address', device: 'Router Zürich', address: '172.31.0.10/30' }),
          goal(key, 10, { type: 'area', title: 'Sursee', color: 'green', network: su.network }),
          goal(key, 11, { type: 'area', title: 'Luzern', color: 'blue', network: lu.network }),
          goal(key, 12, { type: 'area', title: 'Zürich', color: 'orange', network: zh.network }),
          goal(key, 13, { type: 'ping', from: 'Notebook Sursee 1', to: 'Notebook Luzern 1' }),
          goal(key, 14, { type: 'ping', from: 'Notebook Luzern 2', to: 'Notebook Zürich 2' }),
          goal(key, 15, { type: 'ping', from: 'Notebook Zürich 3', to: 'Notebook Sursee 3' }),
        ]),
      };
    },
  },
  {
    id: 'm117-m07a',
    features: ['service.dhcp', 'routing.auto'],
    stars: 3,
    level: 2,
    series: 'm117',
    sheet: 'M07A_M117_UE01_Netzwerkdienste',
    build: () => {
      const key = 'm117m07a';
      const goals = [
        ...WATCH.map((s, i) => goal(key, 1 + i, { type: 'address', device: `Router ${s.name}`, address: `192.168.${s.third}.1/24` })),
        goal(key, 4, { type: 'address', device: 'Router Bern', address: '172.16.50.1/30' }),
        goal(key, 5, { type: 'address', device: 'Router Locarno', address: '172.16.51.2/30' }),
        goal(key, 6, { type: 'address', device: 'Router Basel', address: '172.16.52.1/30' }),
        ...WATCH.map((s, i) => goal(key, 7 + i, { type: 'address', device: `Server ${s.name}`, address: `192.168.${s.third}.10/24` })),
        ...WATCH.map((s, i) =>
          goal(key, 10 + i, { type: 'dhcpServer', device: `Server ${s.name}`, start: `192.168.${s.third}.100`, end: `192.168.${s.third}.199`, gateway: `192.168.${s.third}.1` }),
        ),
        ...WATCH.map((s, i) => goal(key, 13 + i, { type: 'dhcpLease', device: `WS${s.short}01` })),
        goal(key, 16, { type: 'ping', from: 'WSBE01', to: 'WSBS02' }),
        goal(key, 17, { type: 'ping', from: 'WSBS01', to: 'WSLO02' }),
        goal(key, 18, { type: 'ping', from: 'WSLO01', to: 'WSBE02' }),
      ];
      return { topology: watchStart().topology, tasks: task(key, 3, goals) };
    },
  },
  {
    id: 'm117-m07b',
    features: ['service.dhcp', 'service.dns', 'service.web', 'tool.areas'],
    stars: 4,
    level: 2,
    series: 'm117',
    sheet: 'M07B_M117_UE02_Netzwerkdienste',
    build: () => {
      const key = 'm117m07b';
      const url = `http://${WATCH_DOMAIN}/`;
      const goals = [
        goal(key, 1, { type: 'address', device: 'Router Bern', address: '10.10.10.1/24' }),
        goal(key, 2, { type: 'address', device: 'Webserver', address: '10.10.10.10/24' }),
        goal(key, 3, { type: 'gateway', device: 'Webserver', gateway: '10.10.10.1' }),
        ...WATCH.map((s, i) => goal(key, 4 + i, { type: 'dnsRecord', device: `Server ${s.name}`, name: WATCH_DOMAIN, value: '10.10.10.10' }, { domain: WATCH_DOMAIN })),
        ...WATCH.map((s, i) => goal(key, 7 + i, { type: 'dhcpLease', device: `WS${s.short}01`, dns: `192.168.${s.third}.10` })),
        ...WATCH.map((s, i) => goal(key, 10 + i, { type: 'dhcpLease', device: `WS${s.short}03`, ip: `192.168.${s.third}.200` })),
        goal(key, 13, { type: 'http', from: 'WSBE01', url: 'http://10.10.10.10/' }),
        goal(key, 14, { type: 'http', from: 'WSBS02', url }, { domain: WATCH_DOMAIN }),
        goal(key, 15, { type: 'http', from: 'WSLO03', url }, { domain: WATCH_DOMAIN }),
        goal(key, 16, { type: 'area', title: 'Bern', color: 'green', network: '192.168.10.0/24' }),
        goal(key, 17, { type: 'area', title: 'Basel', color: 'red', network: '192.168.20.0/24' }),
        goal(key, 18, { type: 'area', title: 'Locarno', color: 'yellow', network: '192.168.30.0/24' }),
        goal(key, 19, { type: 'area', title: 'Intranet', color: 'purple' }),
      ];
      return { topology: solveWatch1(watchStart().topology), tasks: task(key, 4, goals) };
    },
  },
  {
    id: 'm117-m07c',
    features: ['service.dhcp', 'service.dns', 'service.web', 'tool.areas', 'routing.auto', 'tool.ipCalculator'],
    stars: 5,
    level: 2,
    series: 'm117',
    sheet: 'M07C_M117_UE03_Netzwerkdienste',
    build: () => {
      // Wie die Prüfung (Punkte, Note), aber mit «Prüfen» für die Lernenden.
      const { noSelfCheck: _hidden, ...exam } = buildExamTasks(HOLZER);
      return {
        topology: new Start().topology,
        tasks: { ...exam, title: t('catalog.m117m07c.title'), description: `${t('catalog.m117m07c.description')}\n\n${examDescription(HOLZER)}`, difficulty: 5 },
      };
    },
  },
];
