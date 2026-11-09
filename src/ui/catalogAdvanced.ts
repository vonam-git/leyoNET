/**
 * Übungen zu den neueren Funktionen: Loopbacks mit OSPF, Zugriffsliste am
 * Switch, VRFs beim Provider und ein Rechenzentrum mit BGP und VXLAN.
 */
import {
  addVrf,
  configureHost,
  connect,
  setAccessList,
  setInterfaceAddress,
  setInterfaceCount,
  setInterfaceVrf,
  setLoopback,
  setOspf,
  setPortAccessList,
  type Topology,
} from '../core';
import { Start, goal, task, unwrap, type CatalogEntry } from './catalogKit';
import { datacenterBgp, datacenterUnderlay, datacenterVxlan } from './datacenter';

const id = (t: Topology, name: string) => t.devices.find((d) => d.name === name)!.id;
const ALL = [{ network: '0.0.0.0', mask: '0.0.0.0', area: 0 }];

// --- Loopbacks und OSPF -----------------------------------------------------------------------

function loopbackStart(): Topology {
  return new Start()
    .router('R1', -200, 0, ['192.168.1.1/24', '10.0.12.1/30'])
    .router('R2', 200, 0, ['192.168.2.1/24', '10.0.12.2/30'])
    .add('pc', 'PC 1', -450, 0)
    .add('pc', 'PC 2', 450, 0)
    .host('PC 1', '192.168.1.10', '24', '192.168.1.1')
    .host('PC 2', '192.168.2.10', '24', '192.168.2.1')
    .apply((t, n) => unwrap(connect(t, n('PC 1'), n('R1'), 'tp', { b: 0 })).topology)
    .apply((t, n) => unwrap(connect(t, n('PC 2'), n('R2'), 'tp', { b: 0 })).topology)
    .apply((t, n) => unwrap(connect(t, n('R1'), n('R2'), 'tp', { a: 1, b: 1 })).topology).topology;
}

export function solveLoopback(topology: Topology): Topology {
  let t = topology;
  for (const [r, ip] of [
    ['R1', '10.255.0.1'],
    ['R2', '10.255.0.2'],
  ] as const) {
    t = unwrap(setLoopback(t, id(t, r), 0, ip, '32'));
    t = unwrap(setOspf(t, id(t, r), { routerId: ip, networks: ALL }));
  }
  return t;
}

// --- Zugriffsliste für den Gast-Port -----------------------------------------------------------

function guestStart(): Topology {
  return new Start()
    .add('switch', 'Switch Büro', 0, 0)
    .add('pc', 'PC Büro', -320, -120)
    .add('notebook', 'Notebook Gast', -320, 140)
    .add('server', 'Webserver', 320, 0)
    .link('PC Büro', 'Switch Büro')
    .link('Notebook Gast', 'Switch Büro')
    .link('Webserver', 'Switch Büro')
    .host('PC Büro', '192.168.1.10', '24')
    .host('Notebook Gast', '192.168.1.50', '24')
    .host('Webserver', '192.168.1.80', '24')
    .web('Webserver', '<h1>Willkommen im Gäste-Portal</h1>').topology;
}

export function solveGuest(topology: Topology): Topology {
  let t = unwrap(setAccessList(topology, id(topology, 'Switch Büro'), 'GAST', [{ action: 'allow', protocol: 'tcp', src: 'any', dst: '192.168.1.80', port: 80 }]));
  return unwrap(setPortAccessList(t, id(t, 'Switch Büro'), 1, 'GAST'));
}

// --- VRF beim Provider -------------------------------------------------------------------------

const SITES = [
  { pc: 'PC A Basel', port: 0, vrf: 'KUNDE-A', net: '10.1.1' },
  { pc: 'PC A Genf', port: 1, vrf: 'KUNDE-A', net: '10.1.2' },
  { pc: 'PC B Basel', port: 2, vrf: 'KUNDE-B', net: '10.1.1' },
  { pc: 'PC B Genf', port: 3, vrf: 'KUNDE-B', net: '10.1.2' },
] as const;

function vrfStart(): Topology {
  const s = new Start().add('router', 'PE Provider', 0, 0);
  s.apply((t, n) => unwrap(setInterfaceCount(t, n('PE Provider'), 4)));
  SITES.forEach((site, i) => {
    s.add('pc', site.pc, i % 2 === 0 ? -360 : 360, i < 2 ? -160 : 160);
    s.apply((t, n) => unwrap(connect(t, n(site.pc), n('PE Provider'), 'tp', { b: site.port })).topology);
  });
  s.area('Kunde A', 'blue', -520, -260, 1040, 200).area('Kunde B', 'orange', -520, 60, 1040, 200);
  let t = s.topology;
  for (const site of SITES) t = unwrap(configureHost(t, id(t, site.pc), { ip: `${site.net}.10`, mask: '24', gateway: `${site.net}.1` }));
  // Kunde A ist schon angeschlossen (globale Tabelle); Kunde B nutzt dieselben Netze.
  for (const site of SITES.slice(0, 2)) t = unwrap(setInterfaceAddress(t, id(t, 'PE Provider'), site.port, `${site.net}.1`, '24'));
  return t;
}

export function solveVrf(topology: Topology): Topology {
  let t = unwrap(addVrf(topology, id(topology, 'PE Provider'), 'KUNDE-A'));
  t = unwrap(addVrf(t, id(t, 'PE Provider'), 'KUNDE-B'));
  for (const site of SITES) {
    t = unwrap(setInterfaceVrf(t, id(t, 'PE Provider'), site.port, site.vrf));
    t = unwrap(setInterfaceAddress(t, id(t, 'PE Provider'), site.port, `${site.net}.1`, '24'));
  }
  return t;
}

// --- Katalog ----------------------------------------------------------------------------------

export const ADVANCED_ANSWERS: Record<string, Record<string, string>> = {
  'vrf-customers': { 'ziel-3': 'Jede VRF hat ihre eigene Routingtabelle' },
};

export const ADVANCED: CatalogEntry[] = [
  {
    id: 'loopback-ospf',
    features: ['net.loopback', 'routing.ospf', 'net.cli'],
    stars: 3,
    level: 4,
    build: () => ({
      topology: loopbackStart(),
      tasks: task('loopbackOspf', 3, [
        goal('loopbackOspf', 1, { type: 'routeLearned', device: 'R1', network: '10.255.0.2/32', protocol: 'ospf' }),
        goal('loopbackOspf', 2, { type: 'ping', from: 'PC 1', to: '10.255.0.2' }),
        goal('loopbackOspf', 3, { type: 'ping', from: 'PC 2', to: 'PC 1' }),
      ]),
    }),
  },
  {
    id: 'acl-guest',
    features: ['net.acl', 'service.web', 'net.cli'],
    stars: 3,
    level: 4,
    build: () => ({
      topology: guestStart(),
      tasks: task('aclGuest', 3, [
        goal('aclGuest', 1, { type: 'http', from: 'Notebook Gast', url: 'http://192.168.1.80/' }),
        goal('aclGuest', 2, { type: 'noPing', from: 'Notebook Gast', to: 'PC Büro' }),
        goal('aclGuest', 3, { type: 'ping', from: 'PC Büro', to: 'Webserver' }),
      ]),
    }),
  },
  {
    id: 'vrf-customers',
    features: ['net.vrf', 'net.cli'],
    stars: 4,
    level: 4,
    build: () => ({
      topology: vrfStart(),
      tasks: task('vrfCustomers', 4, [
        goal('vrfCustomers', 1, { type: 'ping', from: 'PC A Basel', to: 'PC A Genf' }),
        goal('vrfCustomers', 2, { type: 'ping', from: 'PC B Basel', to: 'PC B Genf' }),
        goal('vrfCustomers', 3, { type: 'answer', kind: 'choice', options: ['Jede VRF hat ihre eigene Routingtabelle', 'Der Router übersetzt die Adressen (NAT)', 'Die Kunden nutzen verschiedene VLANs', 'Der zweite Kunde bekommt IPv6'], accept: ['Jede VRF hat ihre eigene Routingtabelle'] }),
      ]),
    }),
  },
  {
    id: 'datacenter',
    features: ['device.l3switch', 'routing.bgp', 'net.loopback', 'net.vxlan', 'net.cli'],
    stars: 5,
    level: 5,
    build: () => ({
      topology: datacenterUnderlay(),
      tasks: task('datacenter', 5, [
        goal('datacenter', 1, { type: 'neighbors', device: 'Leaf 1', protocol: 'bgp', min: 2 }),
        goal('datacenter', 2, { type: 'routeLearned', device: 'Leaf 1', network: '10.255.0.13/32', protocol: 'bgp' }),
        goal('datacenter', 3, { type: 'ping', from: 'Web 1', to: 'Web 2' }),
        goal('datacenter', 4, { type: 'ping', from: 'DB 1', to: 'DB 2' }),
        goal('datacenter', 5, { type: 'noPing', from: 'Web 1', to: 'DB 1' }),
      ]),
    }),
  },
];

export const solveDatacenter = (t: Topology) => datacenterVxlan(datacenterBgp(t));
