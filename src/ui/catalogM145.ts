/**
 * Übungen zum Modul 145 (Netzwerk betreiben und erweitern): VLANs, Trunks,
 * Inter-VLAN-Routing (Router-on-a-Stick, Layer-3-Switch), ACLs, DHCP auf dem
 * Switch und mit zentralem Server, Netzwerkdesign (Three-Tier, Collapsed Core)
 * sowie Zusatzübungen. Zu jeder UE gibt es ein Arbeitsblatt (PDF).
 *
 * Firmennetz mit vier Abteilungen: ENTWICKLUNG VLAN 10, VERWALTUNG VLAN 20,
 * SALES VLAN 30, ITMGMT VLAN 40, je 192.168.<VLAN>.0/24, Gateway .1.
 * Öffentliche Adressen nur aus RFC 5737.
 */
import {
  addDhcpScope,
  configureHost,
  connect,
  createVlan,
  deleteVlan,
  setAccessList,
  setDhcpExcluded,
  setDhcpPool,
  setDhcpServer,
  setInterfaceAddress,
  setInterfaceCount,
  setInterfaceRelay,
  setIpRouting,
  setOspf,
  setPortChannel,
  setPortTrunk,
  setPortVlan,
  setStp,
  setStpPriority,
  setSubinterface,
  setSvi,
  setSviAccessList,
  setTrunkAllowed,
  setTrunkNative,
  setVlanDef,
  setDefaultGateway,
  sviId,
  type DeviceType,
  type FirewallRule,
  type Topology,
} from '../core';
import { Start, goal, task, unwrap, type CatalogEntry } from './catalogKit';

const id = (t: Topology, name: string) => {
  const device = t.devices.find((d) => d.name === name);
  if (!device) throw new Error(`Gerät fehlt: ${name}`);
  return device.id;
};
const host = (t: Topology, name: string, ip: string, gateway?: string, dns?: string) => unwrap(configureHost(t, id(t, name), { ip, mask: '24', ...(gateway ? { gateway } : {}), ...(dns ? { dns } : {}) }));
const dhcp = (t: Topology, name: string) => unwrap(configureHost(t, id(t, name), { ip: '', mask: '', dhcp: true }));
const vlans = (t: Topology, sw: string, list: number[]) => list.reduce((acc, v) => unwrap(createVlan(acc, id(acc, sw), v)), t);
const access = (t: Topology, sw: string, port: number, vlan: number) => unwrap(setPortVlan(t, id(t, sw), port, vlan));
const trunk = (t: Topology, sw: string, port: number) => unwrap(setPortTrunk(t, id(t, sw), port, true));
const link = (t: Topology, a: string, b: string, ports: { a?: number; b?: number } = {}) => unwrap(connect(t, id(t, a), id(t, b), 'tp', ports)).topology;

/** Abteilungen: VLAN, Netz und Farbe wie in den Unterlagen. */
export const DEPTS = [
  { vlan: 10, name: 'ENTWICKLUNG', color: 'red' },
  { vlan: 20, name: 'VERWALTUNG', color: 'blue' },
  { vlan: 30, name: 'SALES', color: 'green' },
  { vlan: 40, name: 'ITMGMT', color: 'purple' },
] as const;
const gw = (vlan: number) => `192.168.${vlan}.1`;
/** Öffentlicher DNS-Server im Beispiel (Dokumentationsadresse, RFC 5737). */
export const M145_DNS = '198.51.100.53';

/** PCs mit Port, VLAN und Adresse. 1. OG: Entwicklung und Verwaltung, 2. OG: Verwaltung, Sales, ITMGMT. */
const PCS_1OG = [
  { name: 'PC Entwicklung 1', port: 0, vlan: 10, ip: '192.168.10.10' },
  { name: 'PC Entwicklung 2', port: 1, vlan: 10, ip: '192.168.10.11' },
  { name: 'PC Verwaltung 1', port: 2, vlan: 20, ip: '192.168.20.10' },
  { name: 'PC Verwaltung 2', port: 3, vlan: 20, ip: '192.168.20.11' },
] as const;
const PCS_2OG = [
  { name: 'PC Verwaltung 3', port: 0, vlan: 20, ip: '192.168.20.12' },
  { name: 'PC Verwaltung 4', port: 1, vlan: 20, ip: '192.168.20.13' },
  { name: 'PC Sales 1', port: 2, vlan: 30, ip: '192.168.30.10' },
  { name: 'PC ITMGMT 1', port: 3, vlan: 40, ip: '192.168.40.10' },
] as const;
const ALL_PCS = [...PCS_1OG, ...PCS_2OG];
const UPLINK = 7;

/** VLANs mit Namen und Farbe dokumentieren (Legende der Zeichenfläche). */
function documentVlans(t: Topology, list: readonly number[] = [10, 20, 30, 40]): Topology {
  return DEPTS.filter((d) => list.includes(d.vlan)).reduce((acc, d) => unwrap(setVlanDef(acc, { id: d.vlan, name: d.name, color: d.color })), t);
}

// --- UE02 Netzwerk «OldSchool» -------------------------------------------------------------

function ue02Start(): Topology {
  return new Start()
    .add('router', 'Router', 0, -40)
    .add('switch', 'Switch Entwicklung', -300, 120)
    .add('switch', 'Switch Verwaltung', 300, 120)
    .add('pc', 'PC Entwicklung 1', -420, 300)
    .add('pc', 'PC Entwicklung 2', -180, 300)
    .add('pc', 'PC Verwaltung 1', 180, 300)
    .add('pc', 'PC Verwaltung 2', 420, 300)
    .link('Router', 'Switch Entwicklung')
    .link('Router', 'Switch Verwaltung')
    .link('PC Entwicklung 1', 'Switch Entwicklung')
    .link('PC Entwicklung 2', 'Switch Entwicklung')
    .link('PC Verwaltung 1', 'Switch Verwaltung')
    .link('PC Verwaltung 2', 'Switch Verwaltung')
    .area('ENTWICKLUNG', 'red', -540, 60, 480, 330)
    .area('VERWALTUNG', 'blue', 60, 60, 480, 330).topology;
}

export function solveUe02(topology: Topology): Topology {
  let t = unwrap(setInterfaceAddress(topology, id(topology, 'Router'), 0, '192.168.1.1', '24'));
  t = unwrap(setInterfaceAddress(t, id(t, 'Router'), 1, '192.168.2.1', '24'));
  t = host(t, 'PC Entwicklung 1', '192.168.1.10', '192.168.1.1');
  t = host(t, 'PC Entwicklung 2', '192.168.1.11', '192.168.1.1');
  t = host(t, 'PC Verwaltung 1', '192.168.2.10', '192.168.2.1');
  return host(t, 'PC Verwaltung 2', '192.168.2.11', '192.168.2.1');
}

// --- Firmennetz mit einem oder zwei Stockwerken -----------------------------------------------

/**
 * Switch im 1. OG (Layer 2 oder Layer 3) mit vier PCs, auf Wunsch der Switch im 2. OG
 * mit vier weiteren PCs und dem Uplink (Port 8 – Port 8). PCs mit fester Adresse,
 * auf Wunsch mit Gateway.
 */
function office(opts: { floors: 1 | 2; core?: DeviceType; coreName?: string; gateways?: boolean }): Topology {
  const core = opts.coreName ?? 'Switch 1OG';
  const s = new Start().add(opts.core ?? 'switch', core, 0, 0);
  PCS_1OG.forEach((p, i) => s.add('pc', p.name, -450 + i * 160, -220));
  for (const p of PCS_1OG) s.apply((t, n) => unwrap(connect(t, n(p.name), n(core), 'tp', { b: p.port })).topology);
  if (opts.floors === 2) {
    s.add('switch', 'Switch 2OG', 0, 300);
    PCS_2OG.forEach((p, i) => s.add('pc', p.name, -450 + i * 160, 520));
    for (const p of PCS_2OG) s.apply((t, n) => unwrap(connect(t, n(p.name), n('Switch 2OG'), 'tp', { b: p.port })).topology);
    s.apply((t, n) => unwrap(connect(t, n(core), n('Switch 2OG'), 'tp', { a: UPLINK, b: UPLINK })).topology);
  }
  let t = documentVlans(s.topology, opts.floors === 2 ? [10, 20, 30, 40] : [10, 20]);
  for (const p of opts.floors === 2 ? ALL_PCS : PCS_1OG) t = host(t, p.name, p.ip, opts.gateways ? gw(p.vlan) : undefined);
  return t;
}

/** UE03: VLAN 10 und 20 auf dem Switch im 1. OG, Access-Ports. */
function vlans1og(t: Topology, sw = 'Switch 1OG', list = [10, 20]): Topology {
  let next = vlans(t, sw, list);
  for (const p of PCS_1OG) next = access(next, sw, p.port, p.vlan);
  return next;
}

export const solveUe03 = (t: Topology) => vlans1og(t);

/** UE04: Switch 2OG mit VLAN 20, 30, 40, Uplink als Trunk auf beiden Seiten. */
function vlans2og(t: Topology, core = 'Switch 1OG'): Topology {
  let next = vlans(t, 'Switch 2OG', [20, 30, 40]);
  for (const p of PCS_2OG) next = access(next, 'Switch 2OG', p.port, p.vlan);
  next = trunk(next, core, UPLINK);
  return trunk(next, 'Switch 2OG', UPLINK);
}

export const solveUe04 = (t: Topology) => vlans2og(t.devices.find((d) => d.name === 'Switch 1OG')?.vlanDb?.includes(10) ? t : vlans1og(t));

// --- UE05 VLAN Theorie-Check (Rätsel mit Native-VLAN-Fehlern) -------------------------------

/**
 * Vier Switches in einer Kette. Fehler: Zwischen B und C sind die Access-Ports in
 * verschiedenen VLANs (10 und 20), zwischen C und D ist das native VLAN verschieden
 * (20 und 10). Ein Broadcast von A (VLAN 10) erreicht darum C, E und G.
 */
export const PUZZLE = {
  switches: ['Switch A', 'Switch B', 'Switch C', 'Switch D'],
  hosts: [
    { name: 'A', sw: 'Switch A', port: 0, vlan: 10 },
    { name: 'B', sw: 'Switch A', port: 1, vlan: 20 },
    { name: 'C', sw: 'Switch B', port: 0, vlan: 10 },
    { name: 'D', sw: 'Switch B', port: 1, vlan: 30 },
    { name: 'E', sw: 'Switch C', port: 0, vlan: 20 },
    { name: 'F', sw: 'Switch C', port: 1, vlan: 10 },
    { name: 'G', sw: 'Switch D', port: 0, vlan: 10 },
    { name: 'H', sw: 'Switch D', port: 1, vlan: 20 },
  ],
  answer: 'C, E und G',
  options: ['nur C', 'C und F', 'C, E und G', 'C, F und G', 'alle ausser B'],
} as const;

function ue05Start(): Topology {
  const s = new Start();
  PUZZLE.switches.forEach((name, i) => s.add('switch', name, 0, i * 170));
  PUZZLE.hosts.forEach((h, i) => s.add('pc', `PC ${h.name}`, i % 2 === 0 ? -320 : 320, Math.floor(i / 2) * 170));
  for (const h of PUZZLE.hosts) s.apply((t, n) => unwrap(connect(t, n(`PC ${h.name}`), n(h.sw), 'tp', { b: h.port })).topology);
  // Verbindungen: A–B Trunk (native 1), B–C Access (10 / 20), C–D Trunk (native 20 / 10).
  s.apply((t, n) => unwrap(connect(t, n('Switch A'), n('Switch B'), 'tp', { a: 7, b: 6 })).topology);
  s.apply((t, n) => unwrap(connect(t, n('Switch B'), n('Switch C'), 'tp', { a: 7, b: 6 })).topology);
  s.apply((t, n) => unwrap(connect(t, n('Switch C'), n('Switch D'), 'tp', { a: 7, b: 6 })).topology);
  let t = s.topology;
  for (const sw of PUZZLE.switches) t = vlans(t, sw, [10, 20, 30]);
  PUZZLE.hosts.forEach((h, i) => {
    t = access(t, h.sw, h.port, h.vlan);
    t = unwrap(configureHost(t, id(t, `PC ${h.name}`), { ip: `192.168.99.${11 + i}`, mask: '24' }));
  });
  t = trunk(trunk(t, 'Switch A', 7), 'Switch B', 6);
  t = access(access(t, 'Switch B', 7, 10), 'Switch C', 6, 20);
  t = trunk(trunk(t, 'Switch C', 7), 'Switch D', 6);
  t = unwrap(setTrunkNative(t, id(t, 'Switch C'), 7, 20));
  t = unwrap(setTrunkNative(t, id(t, 'Switch D'), 6, 10));
  return documentVlans(t, [10, 20]);
}

// --- UE06 Router-on-a-Stick ------------------------------------------------------------------

const ROUTER_PORT = 6;

function ue06Start(): Topology {
  let t = solveUe04(office({ floors: 2 }));
  t = new Start().apply(() => t).add('router', 'Router 1OG', 520, 0).topology;
  return t;
}

export function solveUe06(topology: Topology): Topology {
  let t = topology;
  if (!t.cables.some((c) => [c.a.device, c.b.device].includes(id(t, 'Router 1OG')))) t = link(t, 'Router 1OG', 'Switch 1OG', { a: 0, b: ROUTER_PORT });
  t = vlans(t, 'Switch 1OG', [30, 40]);
  t = trunk(t, 'Switch 1OG', ROUTER_PORT);
  for (const d of DEPTS) t = unwrap(setSubinterface(t, id(t, 'Router 1OG'), 0, d.vlan, gw(d.vlan), '24'));
  for (const p of ALL_PCS) t = host(t, p.name, p.ip, gw(p.vlan));
  return t;
}

// --- UE07 Layer-3-Switch ----------------------------------------------------------------------

const L3 = 'L3-Switch 1OG';

function ue07Start(): Topology {
  let t = office({ floors: 2, core: 'l3switch', coreName: L3, gateways: true });
  t = vlans1og(t, L3, [10, 20, 30, 40]);
  return vlans2og(t, L3);
}

export function solveUe07(topology: Topology): Topology {
  let t = topology;
  for (const d of DEPTS) t = unwrap(setSvi(t, id(t, L3), d.vlan, gw(d.vlan), '24'));
  return unwrap(setIpRouting(t, id(t, L3), true));
}

// --- UE07b Layer-3-Switch mit ACL -------------------------------------------------------------

const net = (vlan: number) => `192.168.${vlan}.0/24`;
const allow = (protocol: FirewallRule['protocol'], src: string, dst: string): FirewallRule => ({ action: 'allow', protocol, src, dst });

/** Je VLAN eine Liste für eingehende Pakete am VLAN-Interface («ip access-group VLANxx-IN in»). */
export const ACLS: Record<number, FirewallRule[]> = {
  10: [allow('icmp', net(10), net(40))],
  20: [allow('any', net(20), net(30)), allow('icmp', net(20), net(40))],
  30: [allow('any', net(30), net(20)), allow('icmp', net(30), net(40))],
  40: [allow('icmp', net(40), 'any')],
};

export function solveUe07b(topology: Topology): Topology {
  let t = topology;
  for (const d of DEPTS) {
    const name = `VLAN${d.vlan}-IN`;
    t = unwrap(setAccessList(t, id(t, L3), name, ACLS[d.vlan]!));
    t = unwrap(setSviAcl(t, d.vlan, name));
  }
  return t;
}

const setSviAcl = (t: Topology, vlan: number, name: string) => setSviAccessList(t, id(t, L3), vlan, 'in', name);

// --- UE08 DHCP auf dem Layer-3-Switch ---------------------------------------------------------

export function solveUe08(topology: Topology): Topology {
  let t = unwrap(setDhcpExcluded(topology, id(topology, L3), '192.168.10.1', '192.168.10.9'));
  for (const d of DEPTS) {
    if (d.vlan !== 10) t = unwrap(setDhcpExcluded(t, id(t, L3), `192.168.${d.vlan}.1`, `192.168.${d.vlan}.9`));
    t = unwrap(setDhcpPool(t, id(t, L3), `VLAN${d.vlan}`, { name: `VLAN${d.vlan}`, network: `192.168.${d.vlan}.0`, mask: '255.255.255.0', gateway: gw(d.vlan), dns: M145_DNS }));
  }
  for (const p of ALL_PCS) t = dhcp(t, p.name);
  return t;
}

// --- UE09 DHCP extern (zentraler Server, Relay) ----------------------------------------------

const SERVER = 'DHCP-Server';
const SERVER_PORT = 4;
export const SERVER_IP = '192.168.20.200';

function ue09Start(): Topology {
  const base = solveUe08(solveUe07(ue07Start()));
  return new Start()
    .apply(() => base)
    .add('server', SERVER, 380, -220)
    .apply((t, n) => unwrap(connect(t, n(SERVER), id(t, L3), 'tp', { b: SERVER_PORT })).topology).topology;
}

export function solveUe09(topology: Topology): Topology {
  let t = access(topology, L3, SERVER_PORT, 20);
  t = host(t, SERVER, SERVER_IP, gw(20));
  t = unwrap(setDhcpServer(t, id(t, SERVER), { start: '192.168.20.100', end: '192.168.20.199', gateway: gw(20), dns: M145_DNS, leaseTime: 86400 }));
  for (const d of DEPTS.filter((x) => x.vlan !== 20)) {
    t = unwrap(addDhcpScope(t, id(t, SERVER), { start: `192.168.${d.vlan}.100`, end: `192.168.${d.vlan}.199`, mask: '255.255.255.0', gateway: gw(d.vlan), dns: M145_DNS }));
    t = unwrap(setInterfaceRelay(t, id(t, L3), sviId(d.vlan), SERVER_IP));
  }
  for (const d of DEPTS) t = unwrap(setDhcpPool(t, id(t, L3), `VLAN${d.vlan}`, null));
  return t;
}

// --- UE10 Three-Tier (Core, Distribution, Access) ----------------------------------------------

/** Transfernetze /30: Core 1 – Core 2, Core 1 – Distribution 1, Core 2 – Distribution 2. */
export const TIER = {
  core: { net: '10.255.0.0/30', a: '10.255.0.1', b: '10.255.0.2' },
  d1: { net: '10.255.1.0/30', core: '10.255.1.1', dist: '10.255.1.2', vlan: 901 },
  d2: { net: '10.255.2.0/30', core: '10.255.2.1', dist: '10.255.2.2', vlan: 902 },
  server: { net: '10.0.100.0/24', gw: '10.0.100.1', ip: '10.0.100.10' },
  access: [
    { sw: 'Access 1', pc: 'PC Etage 1', dist: 'Distribution 1', distPort: 1, vlan: 10 },
    { sw: 'Access 2', pc: 'PC Etage 2', dist: 'Distribution 1', distPort: 2, vlan: 20 },
    { sw: 'Access 3', pc: 'PC Etage 3', dist: 'Distribution 2', distPort: 1, vlan: 30 },
    { sw: 'Access 4', pc: 'PC Etage 4', dist: 'Distribution 2', distPort: 2, vlan: 40 },
  ],
} as const;

function ue10Start(): Topology {
  const s = new Start()
    .add('router', 'Core 1', -220, -360)
    .add('router', 'Core 2', 220, -360)
    .add('server', 'Server Zentrale', -560, -360)
    .add('l3switch', 'Distribution 1', -220, -120)
    .add('l3switch', 'Distribution 2', 220, -120);
  s.apply((t, n) => unwrap(setInterfaceCount(t, n('Core 1'), 3)));
  TIER.access.forEach((a, i) => s.add('switch', a.sw, -480 + i * 320, 120).add('pc', a.pc, -480 + i * 320, 320));
  s.apply((t, n) => unwrap(connect(t, n('Core 1'), n('Core 2'), 'tp', { a: 0, b: 0 })).topology);
  s.apply((t, n) => unwrap(connect(t, n('Core 1'), n('Distribution 1'), 'tp', { a: 1, b: 0 })).topology);
  s.apply((t, n) => unwrap(connect(t, n('Core 2'), n('Distribution 2'), 'tp', { a: 1, b: 0 })).topology);
  s.apply((t, n) => unwrap(connect(t, n('Core 1'), n('Server Zentrale'), 'tp', { a: 2 })).topology);
  for (const a of TIER.access) {
    s.apply((t, n) => unwrap(connect(t, n(a.dist), n(a.sw), 'tp', { a: a.distPort, b: UPLINK })).topology);
    s.apply((t, n) => unwrap(connect(t, n(a.pc), n(a.sw), 'tp', { b: 0 })).topology);
  }
  let t = s.topology;
  // Core: Transfernetze und Servernetz; Access: VLAN, Access-Port und Trunk zur Distribution.
  t = unwrap(setInterfaceAddress(t, id(t, 'Core 1'), 0, TIER.core.a, '30'));
  t = unwrap(setInterfaceAddress(t, id(t, 'Core 2'), 0, TIER.core.b, '30'));
  t = unwrap(setInterfaceAddress(t, id(t, 'Core 1'), 1, TIER.d1.core, '30'));
  t = unwrap(setInterfaceAddress(t, id(t, 'Core 2'), 1, TIER.d2.core, '30'));
  t = unwrap(setInterfaceAddress(t, id(t, 'Core 1'), 2, TIER.server.gw, '24'));
  t = host(t, 'Server Zentrale', TIER.server.ip, TIER.server.gw);
  for (const a of TIER.access) {
    t = vlans(t, a.sw, [a.vlan]);
    t = access(t, a.sw, 0, a.vlan);
    t = trunk(t, a.sw, UPLINK);
    t = host(t, a.pc, `192.168.${a.vlan}.10`, gw(a.vlan));
  }
  t = new Start()
    .apply(() => t)
    .area('Core Layer', 'purple', -700, -440, 1160, 160)
    .area('Distribution Layer', 'blue', -700, -200, 1160, 160)
    .area('Access Layer', 'green', -700, 40, 1400, 380).topology;
  return documentVlans(t);
}

export function solveUe10(topology: Topology): Topology {
  let t = topology;
  for (const [dist, tr] of [
    ['Distribution 1', TIER.d1],
    ['Distribution 2', TIER.d2],
  ] as const) {
    const served = TIER.access.filter((a) => a.dist === dist);
    t = vlans(t, dist, [...served.map((a) => a.vlan), tr.vlan]);
    t = access(t, dist, 0, tr.vlan);
    t = unwrap(setSvi(t, id(t, dist), tr.vlan, tr.dist, '30'));
    for (const a of served) {
      t = trunk(t, dist, a.distPort);
      t = unwrap(setSvi(t, id(t, dist), a.vlan, gw(a.vlan), '24'));
    }
  }
  for (const r of ['Core 1', 'Core 2', 'Distribution 1', 'Distribution 2']) t = unwrap(setOspf(t, id(t, r), { networks: [{ network: '0.0.0.0', mask: '0.0.0.0', area: 0 }] }));
  return t;
}

// --- UE11 Collapsed Core ------------------------------------------------------------------------

export const COLLAPSED = {
  access: [
    { sw: 'Access 1', pc: 'PC Büro 1', vlan: 10, port: 1 },
    { sw: 'Access 2', pc: 'PC Büro 2', vlan: 20, port: 2 },
    { sw: 'Access 3', pc: 'PC Büro 3', vlan: 30, port: 3 },
  ],
  server: { name: 'Server', port: 4, vlan: 100, ip: '192.168.100.10' },
} as const;

function ue11Start(): Topology {
  const s = new Start().add('l3switch', 'Core A', -260, -200).add('l3switch', 'Core B', 260, -200).add('server', COLLAPSED.server.name, -620, -200);
  COLLAPSED.access.forEach((a, i) => s.add('switch', a.sw, -400 + i * 400, 120).add('pc', a.pc, -400 + i * 400, 320));
  s.apply((t, n) => unwrap(connect(t, n('Core A'), n('Core B'), 'tp', { a: 0, b: 0 })).topology);
  s.apply((t, n) => unwrap(connect(t, n('Core A'), n(COLLAPSED.server.name), 'tp', { a: COLLAPSED.server.port })).topology);
  for (const a of COLLAPSED.access) {
    s.apply((t, n) => unwrap(connect(t, n(a.sw), n('Core A'), 'tp', { a: 6, b: a.port })).topology);
    s.apply((t, n) => unwrap(connect(t, n(a.sw), n('Core B'), 'tp', { a: 7, b: a.port })).topology);
    s.apply((t, n) => unwrap(connect(t, n(a.pc), n(a.sw), 'tp', { b: 0 })).topology);
  }
  let t = s.topology;
  for (const a of COLLAPSED.access) t = host(t, a.pc, `192.168.${a.vlan}.10`, gw(a.vlan));
  t = host(t, COLLAPSED.server.name, COLLAPSED.server.ip, gw(COLLAPSED.server.vlan));
  t = new Start()
    .apply(() => t)
    .area('Collapsed Core (Core + Distribution)', 'blue', -760, -280, 1240, 170)
    .area('Access Layer', 'green', -560, 40, 1100, 380).topology;
  return documentVlans(t, [10, 20, 30]);
}

export function solveUe11(topology: Topology): Topology {
  let t = topology;
  const all = [...COLLAPSED.access.map((a) => a.vlan), COLLAPSED.server.vlan];
  for (const core of ['Core A', 'Core B']) {
    t = vlans(t, core, all);
    t = trunk(t, core, 0);
    for (const a of COLLAPSED.access) t = trunk(t, core, a.port);
    t = unwrap(setStp(t, id(t, core), true));
  }
  t = unwrap(setStpPriority(t, id(t, 'Core A'), 4096));
  t = access(t, 'Core A', COLLAPSED.server.port, COLLAPSED.server.vlan);
  for (const v of all) t = unwrap(setSvi(t, id(t, 'Core A'), v, gw(v), '24'));
  for (const a of COLLAPSED.access) {
    t = vlans(t, a.sw, [a.vlan]);
    t = access(t, a.sw, 0, a.vlan);
    t = trunk(trunk(t, a.sw, 6), a.sw, 7);
    t = unwrap(setStp(t, id(t, a.sw), true));
  }
  return t;
}

// --- Zusatzübungen --------------------------------------------------------------------------------

/** Fehlersuche im Netz von UE06: vier Fehler. */
export function faultyUe06(): Topology {
  let t = solveUe06(ue06Start());
  t = unwrap(deleteVlan(t, id(t, 'Switch 2OG'), 30));
  t = unwrap(setTrunkAllowed(t, id(t, 'Switch 1OG'), UPLINK, [10, 20, 30]));
  t = host(t, 'PC Verwaltung 2', '192.168.20.11', '192.168.20.254');
  // Subinterface für VLAN 40 mit falschem Tag (41) statt 40.
  const router = t.devices.find((d) => d.name === 'Router 1OG')!;
  t = { ...t, devices: t.devices.map((d) => (d.id !== router.id ? d : { ...d, subinterfaces: (d.subinterfaces ?? []).filter((s) => s.vlan !== 40) })) };
  return unwrap(setSubinterface(t, router.id, 0, 41, gw(40), '24'));
}

export function solveFaults(topology: Topology): Topology {
  let t = vlans(topology, 'Switch 2OG', [30]);
  t = access(t, 'Switch 2OG', 2, 30);
  t = unwrap(setTrunkAllowed(t, id(t, 'Switch 1OG'), UPLINK, null));
  t = host(t, 'PC Verwaltung 2', '192.168.20.11', gw(20));
  const router = t.devices.find((d) => d.name === 'Router 1OG')!;
  t = { ...t, devices: t.devices.map((d) => (d.id !== router.id ? d : { ...d, subinterfaces: (d.subinterfaces ?? []).filter((s) => s.vlan !== 41) })) };
  return unwrap(setSubinterface(t, router.id, 0, 40, gw(40), '24'));
}

/** Management-VLAN 99 und natives VLAN 999 im Netz von UE07. */
export const MGMT = { vlan: 99, native: 999, l3: '192.168.99.1', sw2: '192.168.99.12' } as const;

export function solveMgmt(topology: Topology): Topology {
  let t = vlans(topology, L3, [MGMT.vlan, MGMT.native]);
  t = vlans(t, 'Switch 2OG', [MGMT.vlan, MGMT.native]);
  t = unwrap(setSvi(t, id(t, L3), MGMT.vlan, MGMT.l3, '24'));
  t = unwrap(setSvi(t, id(t, 'Switch 2OG'), MGMT.vlan, MGMT.sw2, '24'));
  t = unwrap(setDefaultGateway(t, id(t, 'Switch 2OG'), MGMT.l3));
  t = unwrap(setTrunkNative(t, id(t, L3), UPLINK, MGMT.native));
  return unwrap(setTrunkNative(t, id(t, 'Switch 2OG'), UPLINK, MGMT.native));
}

/** Zweites Kabel zwischen den Stockwerken (Port 7 – Port 7) ohne Bündelung: Schleife. */
function lagStart(): Topology {
  const t = link(solveUe07(ue07Start()), L3, 'Switch 2OG', { a: 6, b: 6 });
  // Beide Kabel als Trunk, aber noch nicht gebündelt: Schleife.
  return trunk(trunk(t, L3, 6), 'Switch 2OG', 6);
}

export function solveLag(topology: Topology): Topology {
  let t = topology;
  for (const sw of [L3, 'Switch 2OG']) {
    for (const p of [6, UPLINK]) t = unwrap(setPortChannel(t, id(t, sw), p, 1, 'active'));
  }
  return t;
}

// --- Katalog ---------------------------------------------------------------------------------------

const tasksWith = (key: string, stars: number, goals: ReturnType<typeof goal>[]) => task(key, stars, goals);
const pairsOf = (list: [string, string][]): [string, string][] => list;
const ALL_DEPT_PINGS = pairsOf([
  ['PC Entwicklung 1', 'PC Verwaltung 1'],
  ['PC Entwicklung 1', 'PC Sales 1'],
  ['PC Entwicklung 1', 'PC ITMGMT 1'],
  ['PC Verwaltung 1', 'PC Sales 1'],
  ['PC Verwaltung 3', 'PC ITMGMT 1'],
  ['PC Sales 1', 'PC ITMGMT 1'],
]);

export const M145_ANSWERS: Record<string, Record<string, string>> = {
  'm145-ue03': { 'ziel-6': '2' },
  'm145-ue05': { 'ziel-1': PUZZLE.answer, 'ziel-2': 'Native VLAN' },
  'm145-ue07': { 'ziel-3': 'ip routing' },
  'm145-ue10': { 'ziel-5': 'Distribution Layer' },
  'm145-ue11': { 'ziel-5': 'Core und Distribution' },
  'm145-x2': { 'ziel-4': 'VLAN-Hopping verhindern' },
};

export const M145: CatalogEntry[] = [
  {
    id: 'm145-ue02',
    features: ['routing.auto'],
    stars: 1,
    level: 1,
    series: 'm145',
    sheet: 'M145_UE02_Netzwerk_OldSchool',
    build: () => {
      const key = 'm145ue02';
      return {
        topology: ue02Start(),
        tasks: tasksWith(key, 1, [
          goal(key, 1, { type: 'address', device: 'Router', address: '192.168.1.1/24' }),
          goal(key, 2, { type: 'address', device: 'Router', address: '192.168.2.1/24' }),
          goal(key, 3, { type: 'pings', pairs: [['PC Entwicklung 1', 'PC Entwicklung 2'], ['PC Verwaltung 1', 'PC Verwaltung 2']] }),
          goal(key, 4, { type: 'gateway', device: 'PC Entwicklung 1', gateway: '192.168.1.1' }),
          goal(key, 5, { type: 'ping', from: 'PC Entwicklung 1', to: 'PC Verwaltung 1' }),
        ]),
      };
    },
  },
  {
    id: 'm145-ue03',
    features: ['net.vlan', 'net.cli'],
    stars: 2,
    level: 3,
    series: 'm145',
    sheet: 'M145_UE03_Portbasiertes_VLAN',
    build: () => {
      const key = 'm145ue03';
      return {
        topology: office({ floors: 1 }),
        tasks: tasksWith(key, 2, [
          goal(key, 1, { type: 'hostVlan', device: 'PC Entwicklung 1', vlan: 10 }),
          goal(key, 2, { type: 'hostVlan', device: 'PC Entwicklung 2', vlan: 10 }),
          goal(key, 3, { type: 'hostVlan', device: 'PC Verwaltung 1', vlan: 20 }),
          goal(key, 4, { type: 'hostVlan', device: 'PC Verwaltung 2', vlan: 20 }),
          goal(key, 5, { type: 'pings', pairs: [['PC Entwicklung 1', 'PC Entwicklung 2'], ['PC Verwaltung 1', 'PC Verwaltung 2']] }),
          goal(key, 6, { type: 'answer', accept: ['2', 'zwei', 'two'] }),
        ]),
      };
    },
  },
  {
    id: 'm145-ue04',
    features: ['net.vlan', 'net.cli'],
    stars: 3,
    level: 3,
    series: 'm145',
    sheet: 'M145_UE04_Trunk_VLAN',
    build: () => {
      const key = 'm145ue04';
      return {
        topology: solveUe03(office({ floors: 2 })),
        tasks: tasksWith(key, 3, [
          goal(key, 1, { type: 'hostVlan', device: 'PC Verwaltung 3', vlan: 20 }),
          goal(key, 2, { type: 'hostVlan', device: 'PC Sales 1', vlan: 30 }),
          goal(key, 3, { type: 'hostVlan', device: 'PC ITMGMT 1', vlan: 40 }),
          goal(key, 4, { type: 'trunk', a: 'Switch 1OG', b: 'Switch 2OG', vlans: [20] }),
          goal(key, 5, { type: 'pings', pairs: [['PC Verwaltung 1', 'PC Verwaltung 3'], ['PC Verwaltung 2', 'PC Verwaltung 4']] }),
          goal(key, 6, { type: 'noPing', from: 'PC Verwaltung 3', to: 'PC Sales 1' }),
        ]),
      };
    },
  },
  {
    id: 'm145-ue05',
    features: ['net.vlan', 'tool.sniffer'],
    stars: 3,
    level: 3,
    series: 'm145',
    sheet: 'M145_UE05_VLAN_Theorie_Check',
    build: () => {
      const key = 'm145ue05';
      return {
        topology: ue05Start(),
        tasks: tasksWith(key, 3, [
          goal(key, 1, { type: 'answer', kind: 'choice', options: [...PUZZLE.options], accept: [PUZZLE.answer] }),
          goal(key, 2, { type: 'answer', kind: 'choice', options: ['Native VLAN', 'Spanning Tree', 'MAC-Tabelle', 'Port-Security'], accept: ['Native VLAN'] }),
          goal(key, 3, { type: 'ping', from: 'PC A', to: 'PC G' }),
        ]),
      };
    },
  },
  {
    id: 'm145-ue06',
    features: ['net.vlan', 'net.subinterfaces', 'net.cli'],
    stars: 3,
    level: 4,
    series: 'm145',
    sheet: 'M145_UE06_Router_on_a_Stick',
    build: () => {
      const key = 'm145ue06';
      return {
        topology: ue06Start(),
        tasks: tasksWith(key, 3, [
          goal(key, 1, { type: 'connected', a: 'Router 1OG', b: 'Switch 1OG' }),
          goal(key, 2, { type: 'trunk', a: 'Switch 1OG', b: 'Router 1OG', vlans: [10, 20, 30, 40] }),
          goal(key, 3, { type: 'trunk', a: 'Switch 1OG', b: 'Switch 2OG', vlans: [20, 30, 40] }),
          goal(key, 4, { type: 'gateway', device: 'PC Sales 1', gateway: '192.168.30.1' }),
          goal(key, 5, { type: 'pings', pairs: ALL_DEPT_PINGS }),
        ]),
      };
    },
  },
  {
    id: 'm145-ue07',
    features: ['device.l3switch', 'net.vlan', 'net.cli'],
    stars: 3,
    level: 4,
    series: 'm145',
    sheet: 'M145_UE07_Layer_3_Switch',
    build: () => {
      const key = 'm145ue07';
      return {
        topology: ue07Start(),
        tasks: tasksWith(key, 3, [
          goal(key, 1, { type: 'ping', from: 'PC Entwicklung 1', to: L3 }),
          goal(key, 2, { type: 'pings', pairs: ALL_DEPT_PINGS }),
          goal(key, 3, { type: 'answer', accept: ['ip routing'] }),
        ]),
      };
    },
  },
  {
    id: 'm145-ue07b',
    features: ['device.l3switch', 'net.vlan', 'net.acl', 'net.cli'],
    stars: 4,
    level: 4,
    series: 'm145',
    sheet: 'M145_UE07b_Layer_3_Switch_mit_ACL',
    build: () => {
      const key = 'm145ue07b';
      return {
        topology: solveUe07(ue07Start()),
        tasks: tasksWith(key, 4, [
          goal(key, 1, { type: 'pings', pairs: [['PC ITMGMT 1', 'PC Entwicklung 1'], ['PC ITMGMT 1', 'PC Verwaltung 1'], ['PC ITMGMT 1', 'PC Sales 1']] }),
          goal(key, 2, { type: 'pings', pairs: [['PC Verwaltung 1', 'PC Sales 1'], ['PC Sales 1', 'PC Verwaltung 3']] }),
          goal(key, 3, { type: 'noPing', from: 'PC Verwaltung 1', to: 'PC Entwicklung 1' }),
          goal(key, 4, { type: 'noPing', from: 'PC Sales 1', to: 'PC Entwicklung 2' }),
          goal(key, 5, { type: 'noPing', from: 'PC Entwicklung 1', to: 'PC Sales 1' }),
        ]),
      };
    },
  },
  {
    id: 'm145-ue08',
    features: ['device.l3switch', 'service.dhcp', 'net.cli'],
    stars: 3,
    level: 4,
    series: 'm145',
    sheet: 'M145_UE08_DHCP',
    build: () => {
      const key = 'm145ue08';
      return {
        topology: solveUe07(ue07Start()),
        tasks: tasksWith(key, 3, [
          goal(key, 1, { type: 'dhcpLease', device: 'PC Entwicklung 1', dns: M145_DNS }, { dns: M145_DNS }),
          goal(key, 2, { type: 'dhcpLease', device: 'PC Verwaltung 3', dns: M145_DNS }, { dns: M145_DNS }),
          goal(key, 3, { type: 'dhcpLease', device: 'PC Sales 1' }),
          goal(key, 4, { type: 'dhcpLease', device: 'PC ITMGMT 1' }),
          goal(key, 5, { type: 'ping', from: 'PC Entwicklung 2', to: 'PC Sales 1' }),
        ]),
      };
    },
  },
  {
    id: 'm145-ue09',
    features: ['device.l3switch', 'service.dhcp', 'net.dhcpRelay', 'net.cli'],
    stars: 4,
    level: 4,
    series: 'm145',
    sheet: 'M145_UE09_DHCP_extern',
    build: () => {
      const key = 'm145ue09';
      return {
        topology: ue09Start(),
        tasks: tasksWith(key, 4, [
          goal(key, 1, { type: 'address', device: SERVER, address: `${SERVER_IP}/24` }),
          goal(key, 2, { type: 'dhcpServer', device: SERVER, start: '192.168.20.100', end: '192.168.20.199', gateway: gw(20) }),
          goal(key, 3, { type: 'dhcpLease', device: 'PC Verwaltung 1' }),
          goal(key, 4, { type: 'dhcpLease', device: 'PC Sales 1', ip: '192.168.30.100' }),
          goal(key, 5, { type: 'dhcpLease', device: 'PC ITMGMT 1', ip: '192.168.40.100' }),
          goal(key, 6, { type: 'ping', from: 'PC Entwicklung 1', to: SERVER }),
        ]),
      };
    },
  },
  {
    id: 'm145-ue10',
    features: ['device.l3switch', 'net.vlan', 'routing.ospf', 'net.cli'],
    stars: 5,
    level: 5,
    series: 'm145',
    sheet: 'M145_UE10_Three_Tier',
    build: () => {
      const key = 'm145ue10';
      return {
        topology: ue10Start(),
        tasks: tasksWith(key, 5, [
          goal(key, 1, { type: 'ping', from: 'PC Etage 1', to: 'PC Etage 2' }),
          goal(key, 2, { type: 'neighbors', device: 'Core 1', protocol: 'ospf', min: 2 }),
          goal(key, 3, { type: 'routeLearned', device: 'Core 2', network: '192.168.10.0/24', protocol: 'ospf' }),
          goal(key, 4, { type: 'pings', pairs: [['PC Etage 1', 'PC Etage 4'], ['PC Etage 3', 'Server Zentrale'], ['PC Etage 2', 'PC Etage 3']] }),
          goal(key, 5, { type: 'answer', kind: 'choice', options: ['Access Layer', 'Distribution Layer', 'Core Layer'], accept: ['Distribution Layer'] }),
        ]),
      };
    },
  },
  {
    id: 'm145-ue11',
    features: ['device.l3switch', 'net.vlan', 'net.stp', 'net.cli'],
    stars: 4,
    level: 4,
    series: 'm145',
    sheet: 'M145_UE11_Collapsed_Core',
    build: () => {
      const key = 'm145ue11';
      return {
        topology: ue11Start(),
        tasks: tasksWith(key, 4, [
          goal(key, 1, { type: 'noStorm' }),
          goal(key, 2, { type: 'trunk', a: 'Access 1', b: 'Core B', vlans: [10] }),
          goal(key, 3, { type: 'pings', pairs: [['PC Büro 1', 'PC Büro 3'], ['PC Büro 2', 'Server']] }),
          goal(key, 4, { type: 'hostVlan', device: 'Server', vlan: 100 }),
          goal(key, 5, { type: 'answer', kind: 'choice', options: ['Access und Distribution', 'Core und Distribution', 'nur Core', 'Core und Access'], accept: ['Core und Distribution'] }),
        ]),
      };
    },
  },
  {
    id: 'm145-x1',
    features: ['net.vlan', 'net.subinterfaces', 'net.cli'],
    stars: 4,
    level: 4,
    series: 'm145',
    sheet: 'M145_Zusatzuebungen',
    build: () => {
      const key = 'm145x1';
      return {
        topology: faultyUe06(),
        tasks: tasksWith(key, 4, [
          goal(key, 1, { type: 'ping', from: 'PC Sales 1', to: 'PC Entwicklung 1' }),
          goal(key, 2, { type: 'ping', from: 'PC ITMGMT 1', to: 'PC Verwaltung 1' }),
          goal(key, 3, { type: 'ping', from: 'PC Verwaltung 2', to: 'PC Entwicklung 2' }),
          goal(key, 4, { type: 'ping', from: 'PC Verwaltung 3', to: 'PC Sales 1' }),
        ]),
      };
    },
  },
  {
    id: 'm145-x2',
    features: ['device.l3switch', 'net.vlan', 'net.cli'],
    stars: 3,
    level: 4,
    series: 'm145',
    sheet: 'M145_Zusatzuebungen',
    build: () => {
      const key = 'm145x2';
      return {
        topology: solveUe07(ue07Start()),
        tasks: tasksWith(key, 3, [
          goal(key, 1, { type: 'trunk', a: L3, b: 'Switch 2OG', vlans: [MGMT.vlan] }),
          goal(key, 2, { type: 'ping', from: 'PC ITMGMT 1', to: 'Switch 2OG' }),
          goal(key, 3, { type: 'ping', from: 'PC ITMGMT 1', to: 'PC Verwaltung 1' }),
          goal(key, 4, { type: 'answer', kind: 'choice', options: ['Schneller übertragen', 'VLAN-Hopping verhindern', 'Mehr VLANs erlauben', 'Spanning Tree ersetzen'], accept: ['VLAN-Hopping verhindern'] }),
        ]),
      };
    },
  },
  {
    id: 'm145-x3',
    features: ['device.l3switch', 'net.vlan', 'net.lag', 'net.cli'],
    stars: 4,
    level: 4,
    series: 'm145',
    sheet: 'M145_Zusatzuebungen',
    build: () => {
      const key = 'm145x3';
      return {
        topology: lagStart(),
        tasks: tasksWith(key, 4, [
          goal(key, 1, { type: 'noStorm' }),
          goal(key, 2, { type: 'trunk', a: L3, b: 'Switch 2OG', vlans: [20, 30, 40] }),
          goal(key, 3, { type: 'pings', pairs: [['PC Verwaltung 1', 'PC Verwaltung 4'], ['PC Entwicklung 1', 'PC ITMGMT 1']] }),
        ]),
      };
    },
  },
];
