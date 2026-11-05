/**
 * Übungen zum Modul 129 (LAN-Komponenten in Betrieb nehmen): IP-Subnetting,
 * statisches Routing mit drei Routern und Protokollanalyse. Zu jeder Gruppe
 * gibt es ein ausfüllbares Arbeitsblatt (PDF) in docs/arbeitsblaetter/.
 *
 * Alles läuft in leyoNET. Adressen im «Internet» stammen aus den
 * Dokumentationsbereichen (RFC 5737), Namen enden auf .example.
 */
import {
  addDnsRecord,
  configureHost,
  connect,
  setCliConfig,
  setDhcpServer,
  setDnsForwarder,
  setDnsServerEnabled,
  setInterfaceAddress,
  setInterfaceNat,
  setInterfaceCount,
  setRoutingMode,
  addStaticRoute,
  type Topology,
} from '../core';
import { Start, goal, task, unwrap, type CatalogEntry } from './catalogKit';

const id = (t: Topology, name: string) => {
  const device = t.devices.find((d) => d.name === name);
  if (!device) throw new Error(`Gerät fehlt: ${name}`);
  return device.id;
};
const host = (t: Topology, name: string, ip: string, mask: string, gateway?: string, dns?: string) =>
  unwrap(configureHost(t, id(t, name), { ip, mask, ...(gateway ? { gateway } : {}), ...(dns ? { dns } : {}) }));
const port = (t: Topology, name: string, index: number, cidr: string) => {
  const [ip, prefix] = cidr.split('/');
  return unwrap(setInterfaceAddress(t, id(t, name), index, ip!, prefix!));
};
const route = (t: Topology, name: string, network: string, mask: string, gateway: string) => unwrap(addStaticRoute(t, id(t, name), { network, mask, gateway }));
const link = (t: Topology, a: string, b: string, ports: { a?: number; b?: number } = {}) => unwrap(connect(t, id(t, a), id(t, b), 'tp', ports)).topology;

// --- UE01 Subnetting ------------------------------------------------------------------------

/** Auftrag 1: 192.168.40.0/24 in vier gleich grosse Subnetze (/26). Router .1, PCs .10 und .11 im Subnetz. */
export const SUB_DEPTS = [
  { name: 'Verwaltung', net: '192.168.40.0', base: 0, color: 'blue' },
  { name: 'Produktion', net: '192.168.40.64', base: 64, color: 'orange' },
  { name: 'Verkauf', net: '192.168.40.128', base: 128, color: 'green' },
  { name: 'Lager', net: '192.168.40.192', base: 192, color: 'purple' },
] as const;
const subIp = (base: number, n: number) => `192.168.40.${base + n}`;

function sub1Start(): Start {
  const s = new Start().router('Router Firma', 0, 0, []);
  s.apply((t, n) => unwrap(setInterfaceCount(t, n('Router Firma'), 4)));
  const pos = [
    [-420, -220],
    [420, -220],
    [-420, 220],
    [420, 220],
  ] as const;
  SUB_DEPTS.forEach((d, i) => {
    const [x, y] = pos[i]!;
    s.add('switch', `Switch ${d.name}`, x * 0.55, y * 0.55)
      .add('pc', `PC ${d.name} 1`, x, y - 70)
      .add('pc', `PC ${d.name} 2`, x, y + 70)
      .link(`PC ${d.name} 1`, `Switch ${d.name}`)
      .link(`PC ${d.name} 2`, `Switch ${d.name}`);
    s.apply((t, n) => unwrap(connect(t, n('Router Firma'), n(`Switch ${d.name}`), 'tp', { a: i })).topology);
  });
  return s;
}

export function solveSub1(topology: Topology): Topology {
  let t = topology;
  SUB_DEPTS.forEach((d, i) => {
    t = port(t, 'Router Firma', i, `${subIp(d.base, 1)}/26`);
    t = host(t, `PC ${d.name} 1`, subIp(d.base, 10), '26', subIp(d.base, 1));
    t = host(t, `PC ${d.name} 2`, subIp(d.base, 11), '26', subIp(d.base, 1));
  });
  return t;
}

/** Auftrag 2 (VLSM): 10.20.0.0/24 nach Bedarf aufteilen. */
export const VLSM = [
  { name: 'Schulung', need: 100, net: '10.20.0.0', prefix: 25, router: 'Router A', port: 0, pc: '10.20.0.10' },
  { name: 'Büro', need: 50, net: '10.20.0.128', prefix: 26, router: 'Router A', port: 1, pc: '10.20.0.138' },
  { name: 'Labor', need: 20, net: '10.20.0.192', prefix: 27, router: 'Router B', port: 0, pc: '10.20.0.202' },
] as const;
const plus = (ip: string, n: number) => ip.replace(/\d+$/, (last) => String(Number(last) + n));

function sub2Start(): Start {
  const s = new Start()
    .add('router', 'Router A', -120, 0)
    .add('router', 'Router B', 260, 0)
    .add('switch', 'Switch Schulung', -420, -170)
    .add('switch', 'Switch Büro', -420, 170)
    .add('switch', 'Switch Labor', 520, 0)
    .add('pc', 'PC Schulung', -660, -170)
    .add('pc', 'PC Büro', -660, 170)
    .add('pc', 'PC Labor', 760, 0)
    .link('PC Schulung', 'Switch Schulung')
    .link('PC Büro', 'Switch Büro')
    .link('PC Labor', 'Switch Labor');
  s.apply((t, n) => {
    let next = unwrap(setInterfaceCount(t, n('Router A'), 3));
    next = unwrap(connect(next, n('Router A'), n('Switch Schulung'), 'tp', { a: 0 })).topology;
    next = unwrap(connect(next, n('Router A'), n('Switch Büro'), 'tp', { a: 1 })).topology;
    next = unwrap(connect(next, n('Router A'), n('Router B'), 'tp', { a: 2, b: 1 })).topology;
    return unwrap(connect(next, n('Router B'), n('Switch Labor'), 'tp', { a: 0 })).topology;
  });
  return s;
}

export function solveSub2(topology: Topology): Topology {
  let t = topology;
  for (const v of VLSM) {
    t = port(t, v.router, v.port, `${plus(v.net, 1)}/${v.prefix}`);
    t = host(t, `PC ${v.name}`, v.pc, String(v.prefix), plus(v.net, 1));
  }
  t = port(t, 'Router A', 2, '10.20.0.225/30');
  t = port(t, 'Router B', 1, '10.20.0.226/30');
  t = unwrap(setRoutingMode(t, id(t, 'Router A'), 'auto'));
  return unwrap(setRoutingMode(t, id(t, 'Router B'), 'auto'));
}

/**
 * Auftrag 3 (Fehlersuche): das Netz aus Auftrag 1 mit vier Fehlern.
 * PC Produktion 2: Maske /24; PC Verkauf 1: Gateway aus einem anderen Netz;
 * PC Lager 2: Adresse im Netz der Verwaltung; PC Verwaltung 2: Adresse doppelt (wie PC Verwaltung 1).
 */
export function sub3Broken(): Topology {
  let t = solveSub1(sub1Start().topology);
  t = host(t, 'PC Produktion 2', '192.168.40.75', '24', '192.168.40.65');
  t = host(t, 'PC Verkauf 1', '192.168.40.138', '26', '192.168.40.1');
  t = host(t, 'PC Lager 2', '192.168.40.50', '26', '192.168.40.193');
  t = host(t, 'PC Verwaltung 2', '192.168.40.10', '26', '192.168.40.1');
  return t;
}

export const solveSub3 = (_t: Topology): Topology => solveSub1(sub1Start().topology);

// --- UE02 Statisches Routing mit drei Routern ----------------------------------------------

/**
 * LAN1 192.168.1.0/24, Transfer 192.168.2.0/30, LAN3 192.168.3.0/24,
 * Transfer 172.16.12.80/28, Router3 am Provider 203.0.113.0/24 (Provider .2),
 * Verwaltungsnetz 192.168.56.0/24.
 * «Internet»: Webserver 198.51.100.10.
 */
export const R129 = {
  r1: { lan: '192.168.1.254/24', transfer: '192.168.2.1/30', mgmt: '192.168.56.101/24' },
  r2: { lan: '192.168.3.254/24', transfer: '192.168.2.2/30', transfer2: '172.16.12.94/28', mgmt: '192.168.56.102/24' },
  r3: { transfer2: '172.16.12.81/28', wan: '203.0.113.1/24', mgmt: '192.168.56.103/24' },
} as const;

function routingStart(withMgmt = false): Start {
  const s = new Start()
    .area('LAN1 192.168.1.0/24', 'red', -900, -360, 380, 260, '192.168.1.0/24')
    .area('LAN2 192.168.2.0/30', 'green', -470, -360, 300, 200, '192.168.2.0/30')
    .area('LAN3 192.168.3.0/24', 'purple', -470, 40, 300, 300, '192.168.3.0/24')
    .area('LAN4 172.16.12.80/28', 'yellow', -100, 40, 300, 300, '172.16.12.80/28')
    .add('pc', 'PC LAN1', -800, -230)
    .add('switch', 'Switch LAN1', -620, -230)
    .add('router', 'Router1', -420, -230)
    .add('router', 'Router2', -220, -60)
    .add('switch', 'Switch LAN3', -340, 190)
    .add('pc', 'PC LAN3', -380, 290)
    .add('router', 'Router3', 120, 190)
    .router('Internet', 420, 190, ['203.0.113.2/24', '198.51.100.1/24'], 'internet')
    .add('server', 'Webserver Internet', 680, 190)
    .link('PC LAN1', 'Switch LAN1')
    .link('PC LAN3', 'Switch LAN3')
    .host('Webserver Internet', '198.51.100.10', '24', '198.51.100.1')
    .web('Webserver Internet', '<h1>Hallo aus dem Internet</h1><p>Diese Seite liegt auf 198.51.100.10.</p>');
  s.apply((t, n) => {
    let next = unwrap(setInterfaceCount(t, n('Router1'), withMgmt ? 3 : 2));
    next = unwrap(setInterfaceCount(next, n('Router2'), withMgmt ? 4 : 3));
    next = unwrap(setInterfaceCount(next, n('Router3'), withMgmt ? 3 : 2));
    const c = (a: string, b: string, pa?: number, pb?: number) => {
      next = unwrap(connect(next, n(a), n(b), 'tp', { ...(pa !== undefined ? { a: pa } : {}), ...(pb !== undefined ? { b: pb } : {}) })).topology;
    };
    c('Router1', 'Switch LAN1', 0);
    c('Router1', 'Router2', 1, 1);
    c('Router2', 'Switch LAN3', 0);
    c('Router2', 'Router3', 2, 0);
    c('Router3', 'Internet', 1, 0);
    c('Internet', 'Webserver Internet', 1);
    return next;
  });
  if (withMgmt) {
    s.area('Verwaltung 192.168.56.0/24', 'blue', -900, -720, 1300, 220, '192.168.56.0/24')
      .add('switch', 'Switch Verwaltung', -220, -600)
      .add('notebook', 'Admin-Notebook', -560, -600)
      .link('Admin-Notebook', 'Switch Verwaltung');
  }
  return s;
}

/** Auftrag 1: Adressen und statische Routen, LAN1 und LAN3 erreichen sich. */
export function solveRouting1(topology: Topology): Topology {
  let t = topology;
  t = host(t, 'PC LAN1', '192.168.1.10', '24', '192.168.1.254');
  t = host(t, 'PC LAN3', '192.168.3.10', '24', '192.168.3.254');
  t = port(t, 'Router1', 0, R129.r1.lan);
  t = port(t, 'Router1', 1, R129.r1.transfer);
  t = port(t, 'Router2', 0, R129.r2.lan);
  t = port(t, 'Router2', 1, R129.r2.transfer);
  t = port(t, 'Router2', 2, R129.r2.transfer2);
  t = port(t, 'Router3', 0, R129.r3.transfer2);
  t = port(t, 'Router3', 1, R129.r3.wan);
  t = route(t, 'Router1', '0.0.0.0', '0', '192.168.2.2');
  t = route(t, 'Router2', '192.168.1.0', '24', '192.168.2.1');
  t = route(t, 'Router2', '0.0.0.0', '0', '172.16.12.81');
  t = route(t, 'Router3', '192.168.1.0', '24', '172.16.12.94');
  t = route(t, 'Router3', '192.168.2.0', '30', '172.16.12.94');
  t = route(t, 'Router3', '192.168.3.0', '24', '172.16.12.94');
  return t;
}

/** Auftrag 2: Standardroute zum Provider und NAT (Masquerade) auf Router3. */
export function solveRouting2(topology: Topology): Topology {
  let t = topology;
  t = route(t, 'Router3', '0.0.0.0', '0', '203.0.113.2');
  return unwrap(setInterfaceNat(t, id(t, 'Router3'), 1, true));
}

/** Auftrag 3: Verwaltungsnetz und SSH. */
export function solveRouting3(topology: Topology): Topology {
  let t = topology;
  t = host(t, 'Admin-Notebook', '192.168.56.10', '24');
  t = port(t, 'Router1', 2, R129.r1.mgmt);
  t = port(t, 'Router2', 3, R129.r2.mgmt);
  t = port(t, 'Router3', 2, R129.r3.mgmt);
  t = link(t, 'Router1', 'Switch Verwaltung', { a: 2 });
  t = link(t, 'Router2', 'Switch Verwaltung', { a: 3 });
  t = link(t, 'Router3', 'Switch Verwaltung', { a: 2 });
  for (const r of ['Router1', 'Router2', 'Router3']) t = unwrap(setCliConfig(t, id(t, r), { ssh: true, users: [{ name: 'admin', password: 'Netz2026' }] }));
  return t;
}

// --- UE03 Protokollanalyse ------------------------------------------------------------------

/**
 * Labornetz: Intranet 192.168.1.0/24 (PC W11 .11, Server Intranet .2
 * mit DHCP und DNS), Firewall 192.168.1.1 / 10.10.1.1, DMZ 10.10.1.0/24 mit Webserver
 * .20, WAN mit NAT zum Provider; im «Internet» www.news.example
 * und der DNS des Providers.
 */
export const LAB_DOMAIN = 'labor.example';
export const LAB_WEB = `web.${LAB_DOMAIN}`;
export const LAB_NEWS = 'www.news.example';

function labStart(): Start {
  const s = new Start()
    .area('Intranet 192.168.1.0/24', 'green', -760, -360, 520, 560, '192.168.1.0/24')
    .area('DMZ 10.10.1.0/24', 'orange', 160, -360, 420, 300, '10.10.1.0/24')
    .area('Internet', 'gray', 160, 60, 640, 300)
    .add('pc', 'PC W11', -640, -230)
    .add('server', 'Server Intranet', -640, -60)
    .add('notebook', 'Notebook Gast', -640, 110)
    .add('switch', 'Switch Intranet', -400, -60)
    .router('Firewall', -60, -60, ['192.168.1.1/24', '10.10.1.1/24', '203.0.113.2/30'])
    .add('switch', 'Switch DMZ', 260, -230)
    .add('server', 'Webserver DMZ', 460, -230)
    .router('Internet', 280, 200, ['203.0.113.1/30', '198.51.100.1/24'], 'internet')
    .add('switch', 'Switch Provider', 480, 200)
    .add('server', 'Webserver News', 680, 130)
    .add('server', 'DNS Provider', 680, 280)
    .link('PC W11', 'Switch Intranet')
    .link('Server Intranet', 'Switch Intranet')
    .link('Notebook Gast', 'Switch Intranet')
    .link('Webserver DMZ', 'Switch DMZ')
    .link('Webserver News', 'Switch Provider')
    .link('DNS Provider', 'Switch Provider')
    .host('PC W11', '192.168.1.11', '24', '192.168.1.1', '192.168.1.2')
    .host('Server Intranet', '192.168.1.2', '24', '192.168.1.1')
    .host('Webserver DMZ', '10.10.1.20', '24', '10.10.1.1')
    .host('Webserver News', '198.51.100.10', '24', '198.51.100.1')
    .host('DNS Provider', '198.51.100.53', '24', '198.51.100.1')
    .web('Webserver DMZ', '<h1>Labor-Webserver</h1><p>Diese Seite kommt aus der DMZ (10.10.1.20).</p>')
    .web('Webserver News', '<h1>News</h1><p>Eine Seite im Internet (198.51.100.10).</p>')
    .route('Firewall', '0.0.0.0', '0', '203.0.113.1')
    .nat('Firewall', 2);
  s.apply((t, n) => {
    let next = unwrap(connect(t, n('Firewall'), n('Switch Intranet'), 'tp', { a: 0 })).topology;
    next = unwrap(connect(next, n('Firewall'), n('Switch DMZ'), 'tp', { a: 1 })).topology;
    next = unwrap(connect(next, n('Firewall'), n('Internet'), 'tp', { a: 2, b: 0 })).topology;
    next = unwrap(connect(next, n('Internet'), n('Switch Provider'), 'tp', { a: 1 })).topology;
    // DNS des Providers kennt www.news.example; der Intranet-Server kennt das Labor und leitet den Rest weiter.
    next = unwrap(setDnsServerEnabled(next, n('DNS Provider'), true));
    next = unwrap(addDnsRecord(next, n('DNS Provider'), { name: LAB_NEWS, type: 'A', value: '198.51.100.10', ttl: 300 }));
    next = unwrap(setDnsServerEnabled(next, n('Server Intranet'), true));
    next = unwrap(addDnsRecord(next, n('Server Intranet'), { name: LAB_WEB, type: 'A', value: '10.10.1.20', ttl: 300 }));
    next = unwrap(addDnsRecord(next, n('Server Intranet'), { name: `w11.${LAB_DOMAIN}`, type: 'A', value: '192.168.1.11', ttl: 300 }));
    next = unwrap(setDnsForwarder(next, n('Server Intranet'), '198.51.100.53'));
    next = unwrap(setDhcpServer(next, n('Server Intranet'), { start: '192.168.1.100', end: '192.168.1.150', gateway: '192.168.1.1', dns: '192.168.1.2', leaseTime: 3600 }));
    return next;
  });
  return s;
}

/** Notebook Gast bezieht seine Adresse per DHCP (Auftrag 2). */
export function solveLab2(topology: Topology): Topology {
  return unwrap(configureHost(topology, id(topology, 'Notebook Gast'), { ip: '', mask: '', dhcp: true }));
}

/** Antworten für die Fragen in leyoNET (Musterlösung, auch im Test). */
export const LAB_ANSWERS: Record<string, Record<string, string>> = {
  'm129-lab-a1': { 'ziel-3': '0x0800', 'ziel-4': '1', 'ziel-5': '64', 'ziel-6': '63' },
  'm129-lab-a2': { 'ziel-3': 'UDP', 'ziel-4': '67', 'ziel-5': '68' },
  'm129-lab-a3': { 'ziel-4': '0x0806', 'ziel-5': '8', 'ziel-6': '20', 'ziel-7': '14' },
};

// --- Katalog ----------------------------------------------------------------------------------

const lab = () => labStart().topology;
const tasksWith = (key: string, stars: number, goals: ReturnType<typeof goal>[]) => task(key, stars, goals);

export const M129: CatalogEntry[] = [
  {
    id: 'm129-sub-a1',
    features: ['tool.ipCalculator'],
    stars: 2,
    level: 1,
    series: 'm129',
    sheet: 'M129_UE01_Subnetting',
    build: () => {
      const key = 'm129suba1';
      return {
        topology: sub1Start().topology,
        tasks: tasksWith(key, 2, [
          ...SUB_DEPTS.map((d, i) => goal(key, 1 + i, { type: 'address', device: 'Router Firma', address: `${subIp(d.base, 1)}/26` })),
          ...SUB_DEPTS.map((d, i) => goal(key, 5 + i, { type: 'sameNetwork', devices: [`PC ${d.name} 1`, `PC ${d.name} 2`] })),
          goal(key, 9, { type: 'inNetwork', device: 'PC Lager 2', network: '192.168.40.192/26' }),
          goal(key, 10, { type: 'gateway', device: 'PC Verkauf 1', gateway: '192.168.40.129' }),
          goal(key, 11, { type: 'pings', pairs: [['PC Verwaltung 1', 'PC Lager 2'], ['PC Produktion 2', 'PC Verkauf 1']] }),
          goal(key, 12, { type: 'noDuplicateIp' }),
        ]),
      };
    },
  },
  {
    id: 'm129-sub-a2',
    features: ['tool.ipCalculator', 'routing.auto', 'routing.static'],
    stars: 4,
    level: 2,
    series: 'm129',
    sheet: 'M129_UE01_Subnetting',
    build: () => {
      const key = 'm129suba2';
      return {
        topology: sub2Start().topology,
        tasks: tasksWith(key, 4, [
          goal(key, 1, { type: 'address', device: 'Router A', address: '10.20.0.1/25' }),
          goal(key, 2, { type: 'address', device: 'Router A', address: '10.20.0.129/26' }),
          goal(key, 3, { type: 'address', device: 'Router B', address: '10.20.0.193/27' }),
          goal(key, 4, { type: 'address', device: 'Router A', address: '10.20.0.225/30' }),
          goal(key, 5, { type: 'address', device: 'Router B', address: '10.20.0.226/30' }),
          goal(key, 6, { type: 'inNetwork', device: 'PC Büro', network: '10.20.0.128/26' }),
          goal(key, 7, { type: 'inNetwork', device: 'PC Labor', network: '10.20.0.192/27' }),
          goal(key, 8, { type: 'ping', from: 'PC Schulung', to: 'PC Büro' }),
          goal(key, 9, { type: 'ping', from: 'PC Labor', to: 'PC Schulung' }),
        ]),
      };
    },
  },
  {
    id: 'm129-sub-a3',
    stars: 3,
    level: 2,
    series: 'm129',
    sheet: 'M129_UE01_Subnetting',
    build: () => {
      const key = 'm129suba3';
      return {
        topology: sub3Broken(),
        tasks: tasksWith(key, 3, [
          goal(key, 1, { type: 'noDuplicateIp' }),
          goal(key, 2, { type: 'inNetwork', device: 'PC Produktion 2', network: '192.168.40.64/26' }),
          goal(key, 3, { type: 'gateway', device: 'PC Verkauf 1', gateway: '192.168.40.129' }),
          goal(key, 4, { type: 'inNetwork', device: 'PC Lager 2', network: '192.168.40.192/26' }),
          goal(key, 5, { type: 'pings', pairs: [['PC Verwaltung 2', 'PC Lager 2'], ['PC Produktion 2', 'PC Verkauf 1'], ['PC Verkauf 1', 'PC Verwaltung 1']] }),
        ]),
      };
    },
  },
  {
    id: 'm129-routing-a1',
    features: ['routing.static', 'net.cli'],
    stars: 3,
    level: 2,
    series: 'm129',
    sheet: 'M129_UE02_Routing',
    build: () => {
      const key = 'm129routinga1';
      return {
        topology: routingStart().topology,
        tasks: tasksWith(key, 3, [
          goal(key, 1, { type: 'address', device: 'Router1', address: R129.r1.lan }),
          goal(key, 2, { type: 'address', device: 'Router1', address: R129.r1.transfer }),
          goal(key, 3, { type: 'address', device: 'Router2', address: R129.r2.transfer }),
          goal(key, 4, { type: 'address', device: 'Router2', address: R129.r2.lan }),
          goal(key, 5, { type: 'address', device: 'Router2', address: R129.r2.transfer2 }),
          goal(key, 6, { type: 'address', device: 'Router3', address: R129.r3.transfer2 }),
          goal(key, 7, { type: 'address', device: 'Router3', address: R129.r3.wan }),
          goal(key, 8, { type: 'gateway', device: 'PC LAN1', gateway: '192.168.1.254' }),
          goal(key, 9, { type: 'ping', from: 'PC LAN1', to: 'PC LAN3' }),
          goal(key, 10, { type: 'ping', from: 'PC LAN3', to: 'Router3' }),
          goal(key, 11, { type: 'ping', from: 'PC LAN1', to: 'Router3' }),
        ]),
      };
    },
  },
  {
    id: 'm129-routing-a2',
    features: ['routing.static', 'net.nat', 'net.cli'],
    stars: 4,
    level: 2,
    series: 'm129',
    sheet: 'M129_UE02_Routing',
    build: () => {
      const key = 'm129routinga2';
      return {
        topology: solveRouting1(routingStart().topology),
        tasks: tasksWith(key, 4, [
          goal(key, 1, { type: 'ping', from: 'Router3', to: 'Webserver Internet' }),
          goal(key, 2, { type: 'ping', from: 'PC LAN1', to: 'Webserver Internet' }),
          goal(key, 3, { type: 'ping', from: 'PC LAN3', to: 'Webserver Internet' }),
          goal(key, 4, { type: 'seenAs', from: 'PC LAN1', to: 'Webserver Internet', address: '203.0.113.1' }),
          goal(key, 5, { type: 'http', from: 'PC LAN3', url: 'http://198.51.100.10/' }),
        ]),
      };
    },
  },
  {
    id: 'm129-routing-a3',
    features: ['routing.static', 'net.nat', 'net.cli', 'net.ssh'],
    stars: 3,
    level: 2,
    series: 'm129',
    sheet: 'M129_UE02_Routing',
    build: () => {
      const key = 'm129routinga3';
      const base = solveRouting2(solveRouting1(routingStart(true).topology));
      return {
        topology: base,
        tasks: {
          ...tasksWith(key, 3, [
            goal(key, 1, { type: 'address', device: 'Router1', address: R129.r1.mgmt }),
            goal(key, 2, { type: 'address', device: 'Router2', address: R129.r2.mgmt }),
            goal(key, 3, { type: 'address', device: 'Router3', address: R129.r3.mgmt }),
            goal(key, 4, { type: 'pings', pairs: [['Router1', 'Admin-Notebook'], ['Router2', 'Admin-Notebook'], ['Router3', 'Admin-Notebook']] }),
            goal(key, 5, { type: 'answer', accept: ['show ip route', 'sh ip route', 'sh ip ro', 'show ip ro'] }),
            goal(key, 6, { type: 'answer', accept: ['192.168.2.2'] }),
          ]),
        },
      };
    },
  },
  {
    id: 'm129-lab-a1',
    features: ['tool.sniffer'],
    stars: 2,
    level: 2,
    series: 'm129',
    sheet: 'M129_UE03_Protokollanalyse',
    build: () => {
      const key = 'm129laba1';
      return {
        topology: lab(),
        tasks: tasksWith(key, 2, [
          goal(key, 1, { type: 'packetSeen', protocol: 'icmp', from: 'PC W11', to: 'Switch Intranet' }),
          goal(key, 2, { type: 'packetSeen', protocol: 'icmp', from: 'Firewall', to: 'Switch DMZ' }),
          goal(key, 3, { type: 'answer', accept: ['0x0800', '0800', '800', '0x800', 'IPv4'] }),
          goal(key, 4, { type: 'answer', accept: ['1', '0x01', 'ICMP (1)', '1 (ICMP)'] }),
          goal(key, 5, { type: 'answer', accept: ['64'] }),
          goal(key, 6, { type: 'answer', accept: ['63'] }),
        ]),
      };
    },
  },
  {
    id: 'm129-lab-a2',
    features: ['tool.sniffer', 'service.dhcp'],
    stars: 3,
    level: 2,
    series: 'm129',
    sheet: 'M129_UE03_Protokollanalyse',
    build: () => {
      const key = 'm129laba2';
      return {
        topology: lab(),
        tasks: tasksWith(key, 3, [
          goal(key, 1, { type: 'dhcpLease', device: 'Notebook Gast' }),
          goal(key, 2, { type: 'packetSeen', protocol: 'dhcp', from: 'Notebook Gast' }),
          goal(key, 3, { type: 'answer', accept: ['UDP', 'User Datagram Protocol'] }),
          goal(key, 4, { type: 'answer', accept: ['67'] }),
          goal(key, 5, { type: 'answer', accept: ['68'] }),
        ]),
      };
    },
  },
  {
    id: 'm129-lab-a3',
    features: ['tool.sniffer', 'service.dns', 'service.web'],
    stars: 4,
    level: 2,
    series: 'm129',
    sheet: 'M129_UE03_Protokollanalyse',
    build: () => {
      const key = 'm129laba3';
      return {
        topology: lab(),
        tasks: tasksWith(key, 4, [
          goal(key, 1, { type: 'http', from: 'PC W11', url: `http://${LAB_WEB}/` }, { url: `http://${LAB_WEB}/` }),
          goal(key, 2, { type: 'packetSeen', protocol: 'dns', from: 'PC W11' }),
          goal(key, 3, { type: 'packetSeen', protocol: 'http', from: 'Firewall', to: 'Switch DMZ' }),
          goal(key, 4, { type: 'answer', accept: ['0x0806', '0806', '806', '0x806', 'ARP'] }),
          goal(key, 5, { type: 'answer', accept: ['8'] }),
          goal(key, 6, { type: 'answer', accept: ['20'] }),
          goal(key, 7, { type: 'answer', accept: ['14'] }),
        ]),
      };
    },
  },
];
