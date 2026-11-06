/**
 * Befehlszeile für Router und Switches, angelehnt an die Syntax von
 * FRRouting (vtysh) mit den aus dem Unterricht bekannten Modi
 * (user → enable → configure terminal → interface …).
 *
 * Eigene, vereinfachte Nachbildung: Die Befehle ändern die Topologie über
 * dieselben Operationen wie die Formulare der Oberfläche. Ausgaben sind
 * englisch wie auf echten Geräten. Befehle dürfen abgekürzt werden
 * («conf t», «sh ip ro»), «?» zeigt Hilfe, «do» führt im
 * Konfigurationsmodus Anzeigebefehle aus.
 */
import { linkUpAt } from '../model/links';
import {
  addStaticRoute,
  getDevice,
  removeStaticRoute,
  renameDevice,
  setCliConfig,
  setInterfaceAddress,
  setInterfaceDescription,
  setInterfaceNat,
  setInterfaceRelay,
  setInterfaceShutdown,
  setIpRouting,
  setPortTrunk,
  setPortVlan,
  setStp,
  setStpPriority,
  setSubinterface,
  removeSubinterface,
  setSvi,
  removeSvi,
  setVlanName,
  createVlan,
  deleteVlan,
  setTrunkAllowed,
  setTrunkNative,
  trunkAllows,
  usedVlans,
  vlanExists,
  setDefaultGateway,
  setLoopback,
  removeLoopback,
  addStaticNat,
  removeStaticNat,
  setBgp,
  setEncapsulation,
  setOspf,
  setOspfCost,
  setRip,
  type Result,
  type TopologyError,
  addStaticRoute6,
  removeStaticRoute6,
  setInterfaceDhcp6,
  setInterfaceDns6,
  setInterfaceIpv6,
  setOspf6,
  setRipng,
  setAccessList,
  setPortAccessList,
  setFirewall,
  firewallZone,
} from '../model/topology';
import { formatAclRule, formatFirewallRule, parseRule } from './rules';
import type { FirewallConfig } from '../model/security';
import { ipv6Links } from '../sim/ip6';
import type { BgpConfig, CliConfig, Device, DeviceType, Ospf6Config, RipngConfig, OspfConfig, RedistributeSource, RipConfig, RoutedNetwork, Topology } from '../model/types';
import { formatIp, maskToText, networkOf, parseIp, parseMask } from '../net/ipv4';
import { formatCidr6, formatIp6, parseCidr6, parseIp6 } from '../net/ipv6';
import { buildRoutes, decodeIface, logicalInterfaces, type Route } from '../net/routing';
import type { DeviceState } from '../sim/simulation';
import { cliIfaceName, ifaceIdOf, parseIfaceName, usesPortNames } from './names';

export type CliMode = 'user' | 'enable' | 'config' | 'if' | 'vlan' | 'line' | 'router-ospf' | 'router-rip' | 'router-bgp' | 'router-ospf6' | 'router-ripng' | 'acl';

export interface CliSession {
  device: string;
  mode: CliMode;
  /** Ziele im Interface-Modus (logische Interfaces); bei «interface range» mehrere. */
  targets?: number[];
  /** VLAN im VLAN-Modus. */
  vlan?: number;
  /** Name der Zugriffsliste im ACL-Modus. */
  acl?: string;
  /** Nächste Eingabe ist ein Passwort (verdeckt eingeben). */
  awaiting?: 'enable-password';
  /** Über SSH angemeldet (sonst Konsole). */
  remote?: boolean;
}

export interface CliEnv {
  topology: Topology;
  /** Zustand aus der laufenden Simulation (ARP, MAC-Tabelle …); fehlt im Entwurfsmodus. */
  state?: DeviceState;
  /** Virtuelle Zeit der Simulation (für Timer in Anzeigen). */
  now?: number;
}

export interface CliOutput {
  session: CliSession;
  lines: string[];
  /** Geänderte Topologie, falls der Befehl die Konfiguration verändert hat. */
  topology?: Topology;
  /** Sitzung beendet («exit» im obersten Modus). */
  close?: boolean;
  /** Etwas, das die Simulation ausführen soll (z.B. ping). */
  action?: { kind: 'ping'; target: string };
}

/** Gerätetypen mit Befehlszeile. */
export function hasCli(type: DeviceType): boolean {
  return type === 'router' || type === 'firewall' || type === 'switch' || type === 'l3switch';
}

export function startSession(device: Device, remote = false): { session: CliSession; lines: string[] } {
  const lines = [] as string[];
  if (device.cli?.banner) lines.push(...device.cli.banner.split('\n'), '');
  return { session: { device: device.id, mode: 'user', ...(remote ? { remote: true } : {}) }, lines };
}

export function hostname(device: Device): string {
  return device.name.replace(/\s+/g, '-');
}

export function prompt(topology: Topology, session: CliSession): string {
  const device = getDevice(topology, session.device);
  const name = device ? hostname(device) : '?';
  if (session.awaiting) return 'Password: ';
  switch (session.mode) {
    case 'user':
      return `${name}>`;
    case 'enable':
      return `${name}#`;
    case 'config':
      return `${name}(config)#`;
    case 'if':
      return (session.targets?.length ?? 0) > 1 ? `${name}(config-if-range)#` : `${name}(config-if)#`;
    case 'vlan':
      return `${name}(config-vlan)#`;
    case 'line':
      return `${name}(config-line)#`;
    case 'router-ospf':
    case 'router-rip':
    case 'router-bgp':
      return `${name}(config-router)#`;
    case 'router-ospf6':
      return `${name}(config-ospf6)#`;
    case 'router-ripng':
      return `${name}(config-router)#`;
    case 'acl':
      return `${name}(config-ext-nacl)#`;
  }
}

// --- Befehlstabelle -------------------------------------------------------------

type Param = 'ip' | 'cidr' | 'mask' | 'iface' | 'vlan' | 'num' | 'word' | 'text' | 'ip6' | 'cidr6';

interface Call {
  args: string[];
  device: Device;
  session: CliSession;
  env: CliEnv;
}

type Handler = (call: Call) => Partial<CliOutput> | string[] | void;

interface Command {
  modes: CliMode[];
  /** Gerätetypen; fehlt = alle mit Befehlszeile. */
  types?: DeviceType[];
  syntax: string;
  help: string;
  run: Handler;
}

const ROUTERS: DeviceType[] = ['router', 'firewall'];
/** IPv6-Befehle: Router und Layer-3-Switch (dort auf den VLAN-Interfaces). */
const ROUTERS6: DeviceType[] = ['router', 'firewall', 'l3switch'];
const SWITCHES: DeviceType[] = ['switch', 'l3switch'];
const L3: DeviceType[] = ['router', 'firewall', 'l3switch'];
const L3_AND_SWITCH: DeviceType[] = [...L3, 'switch'];
const EXEC: CliMode[] = ['user', 'enable'];
const ROUTER_MODES: CliMode[] = ['router-ospf', 'router-rip', 'router-bgp', 'router-ospf6', 'router-ripng'];
const CONFIG_ALL: CliMode[] = ['config', 'if', 'vlan', 'line', 'acl', ...ROUTER_MODES];

/** Kurze Erklärungen für Schlüsselwörter mitten in einem Befehl (für «?»). */
const KEYWORD_HELP: Record<string, string> = {
  show: 'Show running system information',
  ip: 'IP information',
  route: 'IP routing table / static route',
  interface: 'Interface information / configuration',
  brief: 'Brief summary',
  arp: 'ARP table',
  'running-config': 'Current operating configuration',
  mac: 'MAC address information',
  'address-table': 'MAC forwarding table',
  vlan: 'VLAN information / configuration',
  'spanning-tree': 'Spanning tree information / configuration',
  interfaces: 'Interface status',
  status: 'Port status',
  nat: 'NAT information / configuration',
  translations: 'Active NAT translations',
  no: 'Negate a command or set its defaults',
  switchport: 'Layer 2 port configuration',
  mode: 'Port mode',
  access: 'Access port / access VLAN',
  trunk: 'Trunk port (802.1Q)',
  address: 'Set the IP address',
  'helper-address': 'Forward DHCP requests to this server (DHCP relay)',
  inside: 'Inside (local) network',
  outside: 'Outside network (translated to this address)',
  encapsulation: 'Encapsulation type',
  dot1q: 'IEEE 802.1Q VLAN tag',
  range: 'Configure several ports at once',
  priority: 'Bridge priority',
  configure: 'Enter configuration mode',
  terminal: 'Configure from the terminal',
  write: 'Save the configuration',
  memory: 'Save to startup configuration',
  copy: 'Copy configuration',
  'startup-config': 'Startup configuration',
  transport: 'Allowed connection protocols',
  input: 'Incoming connections',
  ssh: 'Secure Shell',
  none: 'No incoming connections',
  login: 'Login settings',
  local: 'Use the local user database',
  enable: 'Privileged mode / password',
  secret: 'Password for privileged mode',
  username: 'Local user account',
  password: 'Password',
  banner: 'Login banner',
  motd: 'Message of the day',
  routing: 'Routing between VLANs',
  version: 'Software version',
  name: 'Name',
  vty: 'Remote (SSH) lines',
  ospf: 'Open Shortest Path First (OSPFv2)',
  rip: 'Routing Information Protocol (RIPv2)',
  bgp: 'Border Gateway Protocol (BGP-4)',
  router: 'Enable a routing process',
  network: 'Network to include / announce',
  area: 'OSPF area',
  neighbor: 'Neighbour / peer',
  'remote-as': 'AS number of the neighbour',
  'router-id': 'Router ID',
  'passive-interface': 'Do not send updates on this interface',
  'default-information': 'Distribute a default route',
  originate: 'Announce 0.0.0.0/0',
  redistribute: 'Import routes from another source',
  cost: 'Interface cost',
  summary: 'Summary of neighbours',
  database: 'Link-state database',
  source: 'Source address translation',
  static: 'Static (1:1) translation',
  ppp: 'Point-to-Point Protocol (RFC 1661)',
  hdlc: 'Cisco HDLC',
  'address-family': 'Address family configuration',
  'exit-address-family': 'Leave the address family',
  'access-list': 'Access list (ACL)',
  'access-lists': 'Access lists (ACL) with hit counters',
  'access-group': 'Apply an access list to this port',
  extended: 'Extended access list (protocol, source, destination, port)',
  permit: 'Let matching packets through',
  deny: 'Drop matching packets',
  remark: 'Comment',
  firewall: 'Packet filter (firewall)',
  rule: 'Firewall rule',
  default: 'Action when no rule matches',
  stateful: 'Let replies to allowed connections back in',
};

function ok(lines: string[] = []): Partial<CliOutput> {
  return { lines };
}

/** Englische Fehlermeldung wie auf echten Geräten. */
function errorLine(error: TopologyError): string {
  const p = error.params ?? {};
  switch (error.code) {
    case 'invalidIp':
      return `% Invalid IP address: ${p.value ?? ''}`;
    case 'invalidMask':
      return `% Invalid netmask: ${p.value ?? ''}`;
    case 'maskRequired':
      return '% Netmask or prefix length required';
    case 'invalidVlan':
      return '% VLAN must be between 1 and 4094';
    case 'nameTaken':
      return `% Hostname already used by another device: ${p.name ?? ''}`;
    case 'nameTooLong':
      return `% Name too long (max. ${p.max ?? ''} characters)`;
    case 'nameEmpty':
      return '% Name must not be empty';
    case 'stpNeededForLoop':
      return '% Spanning tree cannot be disabled: the switches form a loop';
    case 'invalidPriority':
      return '% Priority must be a multiple of 4096 between 0 and 61440';
    case 'duplicateRoute':
      return `% Route already exists: ${p.net ?? ''}`;
    case 'networkHasHostBits':
      return `% Network address has host bits set (did you mean ${p.suggestion ?? ''}?)`;
    case 'unknownInterface':
      return '% Unknown interface';
    case 'invalidUser':
      return `% Invalid user name: ${p.name ?? ''}`;
    case 'passwordRequired':
      return '% Password required';
    case 'invalidAclName':
      return `% Invalid access list name: ${p.value ?? ''} (letters, digits, - and _)`;
    case 'unknownAcl':
      return `% Access list ${p.name ?? ''} not found`;
    case 'tooMany':
      return `% Too many entries (max. ${p.max ?? ''})`;
    default:
      return `% Error: ${error.code}`;
  }
}

function apply(result: Result<Topology>, lines: string[] = []): Partial<CliOutput> {
  return result.ok ? { topology: result.value, lines } : { lines: [errorLine(result.error)] };
}

/** Änderungen nacheinander anwenden (z.B. für «interface range»); beim ersten Fehler abbrechen. */
function applyAll(topology: Topology, steps: ((t: Topology) => Result<Topology>)[]): Partial<CliOutput> {
  let current = topology;
  for (const step of steps) {
    const result = step(current);
    if (!result.ok) return { lines: [errorLine(result.error)], ...(current !== topology ? { topology: current } : {}) };
    current = result.value;
  }
  return { topology: current, lines: [] };
}

function parseAddress(a: string, b?: string): { ip: string; mask: string } | null {
  if (b !== undefined) return parseIp(a) !== null && parseMask(b) !== null ? { ip: a, mask: b } : null;
  const [ip, prefix] = a.split('/');
  if (!ip || prefix === undefined || parseIp(ip) === null || parseMask(prefix) === null) return null;
  return { ip, mask: prefix };
}

function updateCli(call: Call, change: (cli: CliConfig) => CliConfig): Partial<CliOutput> {
  return apply(setCliConfig(call.env.topology, call.device.id, change({ ...(call.device.cli ?? {}) })));
}

const isPortTarget = (id: number) => decodeIface(id).kind === 'port';

function addressOn(call: Call, ip: string, mask: string): Partial<CliOutput> {
  const { topology } = call.env;
  return applyAll(
    topology,
    (call.session.targets ?? []).map((id) => (t: Topology) => {
      const ref = decodeIface(id);
      if (ref.kind === 'sub') return setSubinterface(t, call.device.id, ref.port, ref.vlan, ip, mask);
      if (ref.kind === 'svi') return setSvi(t, call.device.id, ref.vlan, ip, mask);
      if (ref.kind === 'loopback') return setLoopback(t, call.device.id, ref.id, ip, mask);
      if (usesPortNames(call.device)) return { ok: false, error: { code: 'unknownInterface' } };
      return setInterfaceAddress(t, call.device.id, ref.port, ip, mask);
    }),
  );
}

/** Nur VLAN-Interfaces gewählt? («no shutdown» auf «interface vlan 1» ist dann ohne Wirkung, aber kein Fehler.) */
function onlySvis(call: Call): boolean {
  const targets = call.session.targets ?? [];
  return targets.length > 0 && targets.every((id) => decodeIface(id).kind === 'svi');
}

function forPorts(call: Call, step: (t: Topology, port: number) => Result<Topology>): Partial<CliOutput> {
  const targets = call.session.targets ?? [];
  if (!targets.every(isPortTarget)) return ok(['% Not supported on this interface']);
  return applyAll(
    call.env.topology,
    targets.map((id) => (t: Topology) => step(t, decodeIface(id).kind === 'port' ? id : 0)),
  );
}

/** IPv6 auf Ports (Router) und VLAN-Interfaces (Layer-3-Switch); Subinterfaces sprechen nur IPv4. */
function forLinks6(call: Call, step: (t: Topology, id: number) => Result<Topology>): Partial<CliOutput> {
  const targets = call.session.targets ?? [];
  if (targets.some((id) => decodeIface(id).kind === 'sub')) return ok(['% IPv6 is not supported on subinterfaces']);
  return applyAll(
    call.env.topology,
    targets.map((id) => (t: Topology) => step(t, id)),
  );
}

function exitMode(session: CliSession): Partial<CliOutput> {
  switch (session.mode) {
    case 'if':
    case 'vlan':
    case 'line':
    case 'router-ospf':
    case 'router-rip':
    case 'router-bgp':
    case 'router-ospf6':
    case 'router-ripng':
    case 'acl':
      return { session: { device: session.device, mode: 'config', ...(session.remote ? { remote: true } : {}) } };
    case 'config':
      return { session: { device: session.device, mode: 'enable', ...(session.remote ? { remote: true } : {}) } };
    default:
      return { close: true, lines: session.remote ? ['Connection closed.'] : [] };
  }
}

const COMMANDS: Command[] = [
  // --- Ausführen (user / enable) -------------------------------------------
  {
    modes: ['user'],
    syntax: 'enable',
    help: 'Turn on privileged commands',
    run: ({ device, session }) => {
      if (device.cli?.enableSecret) return { session: { ...session, awaiting: 'enable-password' } };
      return { session: { ...session, mode: 'enable' } };
    },
  },
  { modes: ['enable'], syntax: 'disable', help: 'Turn off privileged commands', run: ({ session }) => ({ session: { ...session, mode: 'user' } }) },
  { modes: ['enable'], syntax: 'configure terminal', help: 'Enter configuration mode', run: ({ session }) => ({ session: { ...session, mode: 'config' } }) },
  { modes: ['enable'], syntax: 'configure', help: 'Enter configuration mode', run: ({ session }) => ({ session: { ...session, mode: 'config' } }) },
  { modes: [...EXEC, ...CONFIG_ALL], syntax: 'exit', help: 'Exit current mode / close the session', run: ({ session }) => exitMode(session) },
  { modes: EXEC, syntax: 'logout', help: 'Close the session', run: ({ session }) => ({ close: true, lines: session.remote ? ['Connection closed.'] : [] }) },
  { modes: CONFIG_ALL, syntax: 'end', help: 'Return to privileged mode', run: ({ session }) => ({ session: { device: session.device, mode: 'enable', ...(session.remote ? { remote: true } : {}) } }) },
  { modes: ['enable'], syntax: 'write memory', help: 'Save the running configuration', run: () => ok(['Building configuration...', '[OK]']) },
  { modes: ['enable'], syntax: 'write', help: 'Save the running configuration', run: () => ok(['Building configuration...', '[OK]']) },
  { modes: ['enable'], syntax: 'copy running-config startup-config', help: 'Save the running configuration', run: () => ok(['Building configuration...', '[OK]']) },
  {
    modes: EXEC,
    types: L3,
    syntax: 'ping <ip>',
    help: 'Send ICMP echo requests',
    run: ({ args }) => ({ lines: [`Sending 4 ICMP echos to ${args[0]}:`], action: { kind: 'ping', target: args[0]! } }),
  },
  { modes: EXEC, syntax: 'show version', help: 'Software version', run: ({ device }) => ok(showVersion(device)) },
  { modes: ['enable'], syntax: 'show running-config', help: 'Current operating configuration', run: ({ device }) => ok(runningConfig(device)) },
  { modes: EXEC, types: L3, syntax: 'show ip route', help: 'IP routing table', run: ({ device, env }) => ok(showIpRoute(device, env)) },
  { modes: EXEC, types: ROUTERS6, syntax: 'show ipv6 route', help: 'IPv6 routing table', run: ({ device, env }) => ok(showIpv6Route(device, env)) },
  { modes: EXEC, types: ROUTERS6, syntax: 'show ipv6 neighbors', help: 'IPv6 neighbour cache (Neighbor Discovery)', run: ({ device, env }) => ok(showIpv6Neighbors(device, env)) },
  { modes: EXEC, types: ROUTERS6, syntax: 'show ipv6 interface brief', help: 'IPv6 addresses per interface', run: ({ device, env }) => ok(showIpv6Brief(device, env)) },
  { modes: EXEC, types: L3, syntax: 'show ip ospf neighbor', help: 'OSPF neighbours', run: ({ device, env }) => ok(showOspfNeighbors(device, env)) },
  { modes: EXEC, types: L3, syntax: 'show ip ospf database', help: 'OSPF link-state database', run: ({ device, env }) => ok(showOspfDatabase(device, env)) },
  { modes: EXEC, types: L3, syntax: 'show ip bgp summary', help: 'BGP neighbours', run: ({ device, env }) => ok(showBgpSummary(device, env)) },
  { modes: EXEC, types: L3, syntax: 'show ip bgp', help: 'BGP routes', run: ({ device, env }) => ok(showBgpRoutes(device, env)) },
  { modes: EXEC, types: L3, syntax: 'show ip rip', help: 'RIP routes', run: ({ device, env }) => ok(showProtocolRoutes(device, env, 'rip')) },
  { modes: EXEC, types: L3, syntax: 'show ipv6 ospf6 neighbor', help: 'OSPFv3 neighbours', run: ({ device, env }) => ok(showOspf6Neighbors(device, env)) },
  { modes: EXEC, types: L3, syntax: 'show ipv6 ospf6 database', help: 'OSPFv3 link-state database', run: ({ device, env }) => ok(showOspf6Database(device, env)) },
  { modes: EXEC, types: L3, syntax: 'show ipv6 ripng', help: 'RIPng routes', run: ({ device, env }) => ok(showRipng(device, env)) },
  { modes: EXEC, types: L3, syntax: 'show ip protocols', help: 'Active routing protocols', run: ({ device }) => ok(showProtocols(device)) },
  { modes: EXEC, types: L3, syntax: 'show ip interface brief', help: 'Interface addresses and status', run: ({ device, env }) => ok(showIpInterfaceBrief(device, env)) },
  { modes: EXEC, syntax: 'show interface brief', help: 'Interface status summary', run: ({ device, env }) => ok(usesPortNames(device) ? showInterfacesStatus(device, env) : showIpInterfaceBrief(device, env)) },
  { modes: EXEC, types: L3, syntax: 'show ip arp', help: 'ARP table', run: ({ device, env }) => ok(showArp(device, env)) },
  { modes: EXEC, types: L3, syntax: 'show arp', help: 'ARP table', run: ({ device, env }) => ok(showArp(device, env)) },
  { modes: EXEC, types: ROUTERS, syntax: 'show ip nat translations', help: 'Active NAT translations', run: ({ env }) => ok(showNat(env)) },
  { modes: EXEC, types: SWITCHES, syntax: 'show mac address-table', help: 'MAC forwarding table', run: ({ device, env }) => ok(showMacTable(device, env)) },
  { modes: EXEC, types: SWITCHES, syntax: 'show vlan brief', help: 'VLAN summary', run: ({ device }) => ok(showVlanBrief(device)) },
  { modes: EXEC, types: SWITCHES, syntax: 'show vlan', help: 'VLAN summary', run: ({ device }) => ok(showVlanBrief(device)) },
  { modes: EXEC, types: SWITCHES, syntax: 'show interfaces trunk', help: 'Trunk ports with allowed and native VLANs', run: ({ device, env }) => ok(showTrunks(device, env)) },
  { modes: EXEC, types: SWITCHES, syntax: 'show interfaces status', help: 'Port status', run: ({ device, env }) => ok(showInterfacesStatus(device, env)) },
  { modes: EXEC, types: SWITCHES, syntax: 'show spanning-tree', help: 'Spanning tree state', run: ({ device, env }) => ok(showSpanningTree(device, env)) },

  // --- Konfiguration (global) ------------------------------------------------
  {
    modes: ['config'],
    syntax: 'hostname <word>',
    help: 'Set the device name',
    run: ({ args, device, env }) => apply(renameDevice(env.topology, device.id, args[0]!)),
  },
  {
    modes: ['config'],
    syntax: 'interface <iface>',
    help: 'Select an interface to configure',
    run: (call) => enterInterface(call, call.args[0]!),
  },
  {
    modes: ['config'],
    types: SWITCHES,
    syntax: 'interface vlan <vlan>',
    help: 'Select or create a VLAN interface (SVI; on a layer-2 switch the management address)',
    run: (call) => enterInterface(call, `vlan${call.args[0]}`),
  },
  {
    modes: ['config'],
    types: SWITCHES,
    syntax: 'interface range <word>',
    help: 'Configure several ports at once, e.g. port1-4',
    run: (call) => enterRange(call, call.args[0]!),
  },
  {
    modes: ['config'],
    types: L3,
    syntax: 'no interface <iface>',
    help: 'Delete a subinterface or loopback',
    run: ({ args, device, env }) => {
      const ref = parseIfaceName(device, args[0]!);
      if (ref?.kind === 'loopback') return apply(removeLoopback(env.topology, device.id, ref.id));
      if (ref?.kind !== 'sub') return ok(['% Only subinterfaces (e.g. eth0.10) and loopbacks can be deleted']);
      return apply(removeSubinterface(env.topology, device.id, ref.port, ref.vlan));
    },
  },
  {
    modes: ['config'],
    types: ['switch'],
    syntax: 'ip default-gateway <ip>',
    help: 'Gateway for the management address',
    run: ({ args, device, env }) => apply(setDefaultGateway(env.topology, device.id, args[0]!)),
  },
  { modes: ['config'], types: ['switch'], syntax: 'no ip default-gateway', help: 'Remove the gateway', run: ({ device, env }) => apply(setDefaultGateway(env.topology, device.id, '')) },
  {
    modes: ['config'],
    types: SWITCHES,
    syntax: 'no interface vlan <vlan>',
    help: 'Delete a VLAN interface',
    run: ({ args, device, env }) => apply(removeSvi(env.topology, device.id, Number(args[0]))),
  },
  { modes: ['config'], types: ROUTERS6, syntax: 'ipv6 route <cidr6> <word>', help: 'Static IPv6 route: prefix, next hop or interface', run: (call) => addRoute6(call, call.args[0]!, call.args[1]!) },
  { modes: ['config'], types: ROUTERS6, syntax: 'ipv6 route <cidr6> <ip6> <iface>', help: 'Static IPv6 route via a link-local next hop', run: (call) => addRoute6(call, call.args[0]!, call.args[1]!, call.args[2]) },
  { modes: ['config'], types: ROUTERS6, syntax: 'no ipv6 route <cidr6>', help: 'Remove a static IPv6 route', run: (call) => removeRoute6(call, call.args[0]!) },
  { modes: ['config'], types: L3, syntax: 'ip route <cidr> <word>', help: 'Static route: prefix, next hop or interface', run: (call) => addRoute(call, call.args[0]!, call.args[1]!) },
  { modes: ['config'], types: L3, syntax: 'ip route <ip> <mask> <word>', help: 'Static route: network, mask, next hop or interface', run: (call) => addRoute(call, `${call.args[0]}/${call.args[1]}`, call.args[2]!) },
  { modes: ['config'], types: L3, syntax: 'no ip route <cidr> <word>', help: 'Remove a static route', run: (call) => removeRoute(call, call.args[0]!) },
  { modes: ['config'], types: L3, syntax: 'no ip route <ip> <mask> <word>', help: 'Remove a static route', run: (call) => removeRoute(call, `${call.args[0]}/${call.args[1]}`) },
  { modes: ['config'], types: L3, syntax: 'no ip route <cidr>', help: 'Remove a static route', run: (call) => removeRoute(call, call.args[0]!) },
  { modes: ['config'], types: ['l3switch'], syntax: 'ip routing', help: 'Route between VLANs', run: ({ device, env }) => apply(setIpRouting(env.topology, device.id, true)) },
  { modes: ['config'], types: ['l3switch'], syntax: 'no ip routing', help: 'Stop routing between VLANs', run: ({ device, env }) => apply(setIpRouting(env.topology, device.id, false)) },
  { modes: ['config'], types: SWITCHES, syntax: 'spanning-tree', help: 'Enable spanning tree', run: ({ device, env }) => apply(setStp(env.topology, device.id, true)) },
  { modes: ['config'], types: SWITCHES, syntax: 'no spanning-tree', help: 'Disable spanning tree', run: ({ device, env }) => apply(setStp(env.topology, device.id, false)) },
  {
    modes: ['config'],
    types: SWITCHES,
    syntax: 'spanning-tree priority <num>',
    help: 'Bridge priority (0–61440, steps of 4096)',
    run: ({ args, device, env }) => apply(setStpPriority(env.topology, device.id, Number(args[0]))),
  },
  {
    modes: ['config'],
    types: SWITCHES,
    syntax: 'vlan <word>',
    help: 'Create or select a VLAN (several at once: 10,20,30-35)',
    run: ({ args, device, env, session }) => {
      const list = parseVlanList(args[0]!);
      if (!list) return ok([`% Invalid VLAN list: ${args[0]}`]);
      if (list.length > 1) return applyAll(env.topology, list.map((v) => (t: Topology) => createVlan(t, device.id, v)));
      const vlan = list[0]!;
      const next: CliSession = { device: session.device, mode: 'vlan', vlan, ...(session.remote ? { remote: true } : {}) };
      if (vlanExists(device, vlan) && device.vlanDb) return { session: next };
      const created = createVlan(env.topology, device.id, vlan);
      return created.ok ? { topology: created.value, session: next } : { lines: [errorLine(created.error)] };
    },
  },
  {
    modes: ['config'],
    types: SWITCHES,
    syntax: 'no vlan <vlan>',
    help: 'Delete the VLAN (its ports become inactive)',
    run: ({ args, device, env }) => apply(deleteVlan(env.topology, device.id, Number(args[0]))),
  },
  {
    modes: ['config'],
    syntax: 'username <word> password <word>',
    help: 'Create a local user for SSH logins',
    run: (call) => updateCli(call, (cli) => ({ ...cli, users: [...(cli.users ?? []).filter((u) => u.name !== call.args[0]), { name: call.args[0]!, password: call.args[1]! }] })),
  },
  {
    modes: ['config'],
    syntax: 'no username <word>',
    help: 'Delete a local user',
    run: (call) => updateCli(call, (cli) => ({ ...cli, users: (cli.users ?? []).filter((u) => u.name !== call.args[0]) })),
  },
  {
    modes: ['config'],
    syntax: 'enable secret <word>',
    help: 'Password for privileged mode',
    run: (call) => updateCli(call, (cli) => ({ ...cli, enableSecret: call.args[0]! })),
  },
  {
    modes: ['config'],
    syntax: 'no enable secret',
    help: 'Remove the enable password',
    run: (call) => updateCli(call, ({ enableSecret: _e, ...cli }) => cli),
  },
  { modes: ['config'], syntax: 'banner motd <text>', help: 'Text shown at login', run: (call) => updateCli(call, (cli) => ({ ...cli, banner: call.args[0]! })) },
  { modes: ['config'], syntax: 'no banner motd', help: 'Remove the login banner', run: (call) => updateCli(call, ({ banner: _b, ...cli }) => cli) },
  { modes: ['config'], types: L3, syntax: 'ip ssh', help: 'Enable the SSH server', run: (call) => updateCli(call, (cli) => ({ ...cli, ssh: true })) },
  { modes: ['config'], types: L3, syntax: 'no ip ssh', help: 'Disable the SSH server', run: (call) => updateCli(call, ({ ssh: _s, ...cli }) => cli) },
  { modes: ['config'], syntax: 'line vty', help: 'Configure remote (SSH) access', run: ({ session }) => ({ session: { ...session, mode: 'line' } }) },
  { modes: ['config'], syntax: 'line vty <num> <num>', help: 'Configure remote (SSH) access', run: ({ session }) => ({ session: { ...session, mode: 'line' } }) },

  // --- Dynamisches Routing und NAT ----------------------------------------------
  { modes: ['config'], types: L3, syntax: 'router ospf', help: 'Enable OSPF', run: (call) => routerMode(call, 'router-ospf') },
  { modes: ['config'], types: L3, syntax: 'no router ospf', help: 'Disable OSPF', run: ({ device, env }) => apply(setOspf(env.topology, device.id, null)) },
  { modes: ['config'], types: L3, syntax: 'router rip', help: 'Enable RIP', run: (call) => routerMode(call, 'router-rip') },
  { modes: ['config'], types: L3, syntax: 'no router rip', help: 'Disable RIP', run: ({ device, env }) => apply(setRip(env.topology, device.id, null)) },
  { modes: ['config'], types: L3, syntax: 'router ospf6', help: 'Enable OSPFv3 (IPv6)', run: (call) => routerMode6(call, 'router-ospf6') },
  { modes: ['config'], types: L3, syntax: 'no router ospf6', help: 'Disable OSPFv3', run: ({ device, env }) => apply(setOspf6(env.topology, device.id, null)) },
  { modes: ['config'], types: L3, syntax: 'router ripng', help: 'Enable RIPng (IPv6)', run: (call) => routerMode6(call, 'router-ripng') },
  { modes: ['config'], types: L3, syntax: 'no router ripng', help: 'Disable RIPng', run: ({ device, env }) => apply(setRipng(env.topology, device.id, null)) },
  { modes: ['config'], types: L3, syntax: 'router bgp <num>', help: 'Enable BGP with this AS number', run: (call) => routerMode(call, 'router-bgp', Number(call.args[0])) },
  { modes: ['config'], types: L3, syntax: 'no router bgp', help: 'Disable BGP', run: ({ device, env }) => apply(setBgp(env.topology, device.id, null)) },
  { modes: ['config'], types: L3, syntax: 'no router bgp <num>', help: 'Disable BGP', run: ({ device, env }) => apply(setBgp(env.topology, device.id, null)) },
  {
    modes: ['config'],
    types: ROUTERS,
    syntax: 'ip nat inside source static <ip> <ip>',
    help: 'Static NAT: inside address, outside address',
    run: ({ args, device, env }) => apply(addStaticNat(env.topology, device.id, { inside: args[0]!, outside: args[1]! })),
  },
  {
    modes: ['config'],
    types: ROUTERS,
    syntax: 'no ip nat inside source static <ip> <ip>',
    help: 'Remove a static NAT entry',
    run: ({ args, device, env }) => {
      const index = (device.staticNat ?? []).findIndex((r) => r.inside === args[0] && r.outside === args[1]);
      return index < 0 ? ok(['% No such translation']) : apply(removeStaticNat(env.topology, device.id, index));
    },
  },

  // --- router ospf / rip / bgp ----------------------------------------------
  { modes: ['router-ospf'], syntax: 'ospf router-id <ip>', help: 'Router ID', run: (call) => editOspf(call, (c) => ({ ...c, routerId: call.args[0]! })) },
  { modes: ['router-ospf'], syntax: 'router-id <ip>', help: 'Router ID', run: (call) => editOspf(call, (c) => ({ ...c, routerId: call.args[0]! })) },
  { modes: ['router-ospf'], syntax: 'no ospf router-id', help: 'Router ID from the highest address', run: (call) => editOspf(call, ({ routerId: _r, ...c }) => c) },
  {
    modes: ['router-ospf'],
    syntax: 'network <cidr> area <num>',
    help: 'Interfaces in this network take part, e.g. 10.0.0.0/24 area 0',
    run: (call) => editOspf(call, (c) => ({ ...c, networks: [...c.networks.filter((n) => !sameNet(n, call.args[0]!)), { ...netOf(call.args[0]!), area: Number(call.args[1]) }] })),
  },
  {
    modes: ['router-ospf'],
    syntax: 'network <ip> <ip> area <num>',
    help: 'Network with wildcard mask (Cisco style), e.g. 10.0.0.0 0.0.0.255 area 0',
    run: (call) => {
      const cidr = fromWildcard(call.args[0]!, call.args[1]!);
      if (!cidr) return ok(['% Invalid wildcard mask']);
      return editOspf(call, (c) => ({ ...c, networks: [...c.networks.filter((n) => !sameNet(n, cidr)), { ...netOf(cidr), area: Number(call.args[2]) }] }));
    },
  },
  { modes: ['router-ospf'], syntax: 'no network <cidr> area <num>', help: 'Remove a network', run: (call) => editOspf(call, (c) => ({ ...c, networks: c.networks.filter((n) => !sameNet(n, call.args[0]!)) })) },
  { modes: ['router-ospf'], syntax: 'passive-interface <iface>', help: 'No hellos on this interface', run: (call) => passive(call, true, 'ospf') },
  { modes: ['router-ospf'], syntax: 'no passive-interface <iface>', help: 'Send hellos again', run: (call) => passive(call, false, 'ospf') },
  { modes: ['router-ospf'], syntax: 'default-information originate', help: 'Announce a default route', run: (call) => editOspf(call, (c) => ({ ...c, defaultOriginate: true })) },
  { modes: ['router-ospf'], syntax: 'no default-information originate', help: 'Stop announcing a default route', run: (call) => editOspf(call, ({ defaultOriginate: _d, ...c }) => c) },
  { modes: ['router-ospf'], syntax: 'redistribute <word>', help: 'connected | static | rip | bgp', run: (call) => redistribute(call, 'ospf', true) },
  { modes: ['router-ospf'], syntax: 'no redistribute <word>', help: 'Stop importing routes', run: (call) => redistribute(call, 'ospf', false) },

  { modes: ['router-rip'], syntax: 'version 2', help: 'RIP version 2 (the only one simulated)', run: () => ok() },
  { modes: ['router-rip'], syntax: 'network <cidr>', help: 'Interfaces in this network take part', run: (call) => editRip(call, (c) => ({ ...c, networks: [...c.networks.filter((n) => !sameNet(n, call.args[0]!)), netOf(call.args[0]!)] })) },
  { modes: ['router-rip'], syntax: 'no network <cidr>', help: 'Remove a network', run: (call) => editRip(call, (c) => ({ ...c, networks: c.networks.filter((n) => !sameNet(n, call.args[0]!)) })) },
  { modes: ['router-rip'], syntax: 'passive-interface <iface>', help: 'No updates on this interface', run: (call) => passive(call, true, 'rip') },
  { modes: ['router-rip'], syntax: 'no passive-interface <iface>', help: 'Send updates again', run: (call) => passive(call, false, 'rip') },
  { modes: ['router-rip'], syntax: 'default-information originate', help: 'Announce a default route', run: (call) => editRip(call, (c) => ({ ...c, defaultOriginate: true })) },
  { modes: ['router-rip'], syntax: 'no default-information originate', help: 'Stop announcing a default route', run: (call) => editRip(call, ({ defaultOriginate: _d, ...c }) => c) },
  { modes: ['router-rip'], syntax: 'redistribute <word>', help: 'connected | static | ospf | bgp', run: (call) => redistribute(call, 'rip', true) },
  { modes: ['router-rip'], syntax: 'no redistribute <word>', help: 'Stop importing routes', run: (call) => redistribute(call, 'rip', false) },
  { modes: ['router-ospf6'], syntax: 'ospf6 router-id <ip>', help: 'Router ID (32 bits, written like an IPv4 address)', run: (call) => editOspf6(call, (c) => ({ ...c, routerId: call.args[0]! })) },
  { modes: ['router-ospf6'], syntax: 'router-id <ip>', help: 'Router ID', run: (call) => editOspf6(call, (c) => ({ ...c, routerId: call.args[0]! })) },
  { modes: ['router-ospf6'], syntax: 'no ospf6 router-id', help: 'Router ID from the highest IPv4 address or the MAC', run: (call) => editOspf6(call, ({ routerId: _r, ...c }) => c) },
  { modes: ['router-ospf6'], syntax: 'interface <iface> area <num>', help: 'This interface takes part in area …', run: (call) => ospf6Interface(call, call.args[0]!, Number(call.args[1])) },
  { modes: ['router-ospf6'], syntax: 'no interface <iface>', help: 'Interface no longer takes part', run: (call) => ospf6Interface(call, call.args[0]!, null) },
  { modes: ['router-ospf6'], syntax: 'passive-interface <iface>', help: 'No hellos on this interface', run: (call) => passive6(call, true, 'ospf6') },
  { modes: ['router-ospf6'], syntax: 'no passive-interface <iface>', help: 'Send hellos again', run: (call) => passive6(call, false, 'ospf6') },
  { modes: ['router-ospf6'], syntax: 'default-information originate', help: 'Announce a default route', run: (call) => editOspf6(call, (c) => ({ ...c, defaultOriginate: true })) },
  { modes: ['router-ospf6'], syntax: 'no default-information originate', help: 'Stop announcing a default route', run: (call) => editOspf6(call, ({ defaultOriginate: _d, ...c }) => c) },
  { modes: ['router-ospf6'], syntax: 'redistribute <word>', help: 'connected | static | ripng', run: (call) => redistribute6(call, 'ospf6', true) },
  { modes: ['router-ospf6'], syntax: 'no redistribute <word>', help: 'Stop importing routes', run: (call) => redistribute6(call, 'ospf6', false) },
  { modes: ['router-ripng'], syntax: 'network <iface>', help: 'RIPng on this interface', run: (call) => ripngInterface(call, call.args[0]!, true) },
  { modes: ['router-ripng'], syntax: 'no network <iface>', help: 'No RIPng on this interface', run: (call) => ripngInterface(call, call.args[0]!, false) },
  { modes: ['router-ripng'], syntax: 'passive-interface <iface>', help: 'No updates on this interface', run: (call) => passive6(call, true, 'ripng') },
  { modes: ['router-ripng'], syntax: 'no passive-interface <iface>', help: 'Send updates again', run: (call) => passive6(call, false, 'ripng') },
  { modes: ['router-ripng'], syntax: 'default-information originate', help: 'Announce a default route', run: (call) => editRipng(call, (c) => ({ ...c, defaultOriginate: true })) },
  { modes: ['router-ripng'], syntax: 'no default-information originate', help: 'Stop announcing a default route', run: (call) => editRipng(call, ({ defaultOriginate: _d, ...c }) => c) },
  { modes: ['router-ripng'], syntax: 'redistribute <word>', help: 'connected | static | ospf6', run: (call) => redistribute6(call, 'ripng', true) },
  { modes: ['router-ripng'], syntax: 'no redistribute <word>', help: 'Stop importing routes', run: (call) => redistribute6(call, 'ripng', false) },
  { modes: ['if'], types: L3, syntax: 'ipv6 ospf6 area <num>', help: 'OSPFv3 on this interface (FRRouting)', run: (call) => forLinks6Edit(call, (c, id) => ospf6Interface(c, id, Number(call.args[0]))) },
  { modes: ['if'], types: L3, syntax: 'no ipv6 ospf6 area', help: 'No OSPFv3 on this interface', run: (call) => forLinks6Edit(call, (c, id) => ospf6Interface(c, id, null)) },

  { modes: ['router-bgp'], syntax: 'bgp router-id <ip>', help: 'Router ID', run: (call) => editBgp(call, (c) => ({ ...c, routerId: call.args[0]! })) },
  {
    modes: ['router-bgp'],
    syntax: 'neighbor <ip> remote-as <num>',
    help: 'Peer address and its AS number',
    run: (call) => editBgp(call, (c) => ({ ...c, neighbors: [...c.neighbors.filter((n) => n.ip !== call.args[0]), { ip: call.args[0]!, remoteAs: Number(call.args[1]) }] })),
  },
  { modes: ['router-bgp'], syntax: 'no neighbor <ip>', help: 'Remove a peer', run: (call) => editBgp(call, (c) => ({ ...c, neighbors: c.neighbors.filter((n) => n.ip !== call.args[0]) })) },
  { modes: ['router-bgp'], syntax: 'network <cidr>', help: 'Announce this network (must be in the routing table)', run: (call) => editBgp(call, (c) => ({ ...c, networks: [...c.networks.filter((n) => !sameNet(n, call.args[0]!)), netOf(call.args[0]!)] })) },
  {
    modes: ['router-bgp'],
    syntax: 'network <ip> mask <mask>',
    help: 'Announce this network (Cisco style)',
    run: (call) => {
      const cidr = `${call.args[0]}/${parseMask(call.args[1]!)}`;
      return editBgp(call, (c) => ({ ...c, networks: [...c.networks.filter((n) => !sameNet(n, cidr)), netOf(cidr)] }));
    },
  },
  { modes: ['router-bgp'], syntax: 'no network <cidr>', help: 'Stop announcing', run: (call) => editBgp(call, (c) => ({ ...c, networks: c.networks.filter((n) => !sameNet(n, call.args[0]!)) })) },
  { modes: ['router-bgp'], syntax: 'redistribute <word>', help: 'connected | static | ospf | rip', run: (call) => redistribute(call, 'bgp', true) },
  { modes: ['router-bgp'], syntax: 'no redistribute <word>', help: 'Stop importing routes', run: (call) => redistribute(call, 'bgp', false) },
  { modes: ['router-bgp'], syntax: 'address-family ipv4 unicast', help: 'IPv4 settings (the only family simulated)', run: () => ok() },
  { modes: ['router-bgp'], syntax: 'exit-address-family', help: 'Leave the address family', run: () => ok() },

  // --- line vty ------------------------------------------------------------
  { modes: ['line'], types: L3, syntax: 'transport input ssh', help: 'Allow SSH logins', run: (call) => updateCli(call, (cli) => ({ ...cli, ssh: true })) },
  { modes: ['line'], syntax: 'transport input none', help: 'Allow no remote logins', run: (call) => updateCli(call, ({ ssh: _s, ...cli }) => cli) },
  {
    modes: ['line'],
    syntax: 'login local',
    help: 'Check logins against the local users',
    run: ({ device }) => ok(device.cli?.users?.length ? [] : ['% Warning: no local users yet – add one with "username NAME password PASSWORD"']),
  },

  // --- vlan ------------------------------------------------------------------
  {
    modes: ['vlan'],
    syntax: 'name <word>',
    help: 'Name of the VLAN',
    run: ({ args, device, env, session }) => apply(setVlanName(env.topology, device.id, session.vlan ?? 1, args[0]!)),
  },

  // --- interface -------------------------------------------------------------
  { modes: ['if'], types: ROUTERS6, syntax: 'ipv6 address <cidr6>', help: 'IPv6 address with prefix, e.g. 2001:db8:1::1/64', run: (call) => forLinks6(call, (t, id) => setInterfaceIpv6(t, call.device.id, id, call.args[0]!)) },
  { modes: ['if'], types: ROUTERS6, syntax: 'no ipv6 address', help: 'Remove the IPv6 address', run: (call) => forLinks6(call, (t, id) => setInterfaceIpv6(t, call.device.id, id, '')) },
  { modes: ['if'], types: ROUTERS6, syntax: 'ipv6 nd managed-config-flag', help: 'Hand out addresses by DHCPv6 (M flag in router advertisements)', run: (call) => forLinks6(call, (t, id) => setInterfaceDhcp6(t, call.device.id, id, true)) },
  { modes: ['if'], types: ROUTERS6, syntax: 'no ipv6 nd managed-config-flag', help: 'Addresses by SLAAC (no M flag)', run: (call) => forLinks6(call, (t, id) => setInterfaceDhcp6(t, call.device.id, id, false)) },
  { modes: ['if'], types: ROUTERS6, syntax: 'ipv6 nd ra dns server <ip6>', help: 'DNS server in router advertisements (RDNSS) and DHCPv6', run: (call) => forLinks6(call, (t, id) => setInterfaceDns6(t, call.device.id, id, call.args[0]!)) },
  { modes: ['if'], types: ROUTERS6, syntax: 'no ipv6 nd ra dns server', help: 'No DNS server in router advertisements', run: (call) => forLinks6(call, (t, id) => setInterfaceDns6(t, call.device.id, id, '')) },
  { modes: ['if'], types: L3_AND_SWITCH, syntax: 'ip address <cidr>', help: 'Address with prefix length, e.g. 192.168.1.1/24', run: (call) => addressOn(call, ...splitCidr(call.args[0]!)) },
  { modes: ['if'], types: L3_AND_SWITCH, syntax: 'ip address <ip> <mask>', help: 'Address and netmask', run: (call) => addressOn(call, call.args[0]!, call.args[1]!) },
  { modes: ['if'], types: L3_AND_SWITCH, syntax: 'no ip address', help: 'Remove the IP address', run: (call) => addressOn(call, '', '') },
  {
    modes: ['if'],
    types: L3,
    syntax: 'ip helper-address <ip>',
    help: 'Forward DHCP requests to this server (DHCP relay)',
    run: (call) => applyAll(call.env.topology, (call.session.targets ?? []).map((id) => (t: Topology) => setInterfaceRelay(t, call.device.id, id, call.args[0]!))),
  },
  {
    modes: ['if'],
    types: L3,
    syntax: 'no ip helper-address',
    help: 'Remove the DHCP relay',
    run: (call) => applyAll(call.env.topology, (call.session.targets ?? []).map((id) => (t: Topology) => setInterfaceRelay(t, call.device.id, id, ''))),
  },
  { modes: ['if'], types: ROUTERS, syntax: 'ip nat outside', help: 'Translate outgoing traffic to this address', run: (call) => forPorts(call, (t, p) => setInterfaceNat(t, call.device.id, p, true)) },
  { modes: ['if'], types: ROUTERS, syntax: 'no ip nat outside', help: 'No address translation', run: (call) => forPorts(call, (t, p) => setInterfaceNat(t, call.device.id, p, false)) },
  { modes: ['if'], types: ROUTERS, syntax: 'ip nat inside', help: 'Inside network (nothing to configure)', run: () => ok() },
  {
    modes: ['if'],
    types: ROUTERS,
    syntax: 'encapsulation dot1q <vlan>',
    help: '802.1Q tag of this subinterface',
    run: ({ args, session }) => {
      const ref = decodeIface(session.targets?.[0] ?? 0);
      if (ref.kind !== 'sub') return ok(['% Use a subinterface, e.g. "interface eth0.10"']);
      if (ref.vlan !== Number(args[0])) return ok([`% The VLAN is given by the name: eth${ref.port}.${ref.vlan} uses VLAN ${ref.vlan}`]);
      return ok();
    },
  },
  {
    modes: ['if'],
    types: ROUTERS,
    syntax: 'encapsulation ppp',
    help: 'PPP on a serial line (RFC 1661)',
    run: (call) => forPorts(call, (t, p) => setEncapsulation(t, call.device.id, p, 'ppp')),
  },
  {
    modes: ['if'],
    types: ROUTERS,
    syntax: 'encapsulation hdlc',
    help: 'Cisco HDLC on a serial line',
    run: (call) => forPorts(call, (t, p) => setEncapsulation(t, call.device.id, p, 'hdlc')),
  },
  { modes: ['if'], types: L3, syntax: 'ip ospf cost <num>', help: 'OSPF cost of this interface (1–65535)', run: (call) => forPorts(call, (t, p) => setOspfCost(t, call.device.id, p, Number(call.args[0]))) },
  { modes: ['if'], types: L3, syntax: 'no ip ospf cost', help: 'Default OSPF cost (10)', run: (call) => forPorts(call, (t, p) => setOspfCost(t, call.device.id, p, null)) },
  { modes: ['if'], syntax: 'shutdown', help: 'Disable the interface', run: (call) => (onlySvis(call) ? ok(['% VLAN interfaces stay up here']) : forPorts(call, (t, p) => setInterfaceShutdown(t, call.device.id, p, true))) },
  { modes: ['if'], syntax: 'no shutdown', help: 'Enable the interface', run: (call) => (onlySvis(call) ? ok() : forPorts(call, (t, p) => setInterfaceShutdown(t, call.device.id, p, false))) },
  { modes: ['if'], syntax: 'description <text>', help: 'Interface description', run: (call) => forPorts(call, (t, p) => setInterfaceDescription(t, call.device.id, p, call.args[0]!)) },
  { modes: ['if'], syntax: 'no description', help: 'Remove the description', run: (call) => forPorts(call, (t, p) => setInterfaceDescription(t, call.device.id, p, '')) },
  { modes: ['if'], types: SWITCHES, syntax: 'switchport mode access', help: 'Access port (one VLAN, untagged)', run: (call) => forPorts(call, (t, p) => setPortTrunk(t, call.device.id, p, false)) },
  { modes: ['if'], types: SWITCHES, syntax: 'switchport mode trunk', help: 'Trunk port (all VLANs, 802.1Q)', run: (call) => forPorts(call, (t, p) => setPortTrunk(t, call.device.id, p, true)) },
  {
    modes: ['if'],
    types: SWITCHES,
    syntax: 'switchport access vlan <vlan>',
    help: 'VLAN of this access port',
    run: (call) => {
      const vlan = Number(call.args[0]);
      const out = forPorts(call, (t, p) => setPortVlan(t, call.device.id, p, vlan));
      // Wie Cisco: Ein unbekanntes VLAN wird beim Zuweisen angelegt.
      return !vlanExists(call.device, vlan) && out.topology ? { ...out, lines: [`% Access VLAN does not exist. Creating vlan ${vlan}`, ...(out.lines ?? [])] } : out;
    },
  },
  {
    modes: ['if'],
    types: SWITCHES,
    syntax: 'switchport trunk allowed vlan <text>',
    help: 'VLANs on this trunk: list (10,20,30-35), add …, remove …, except …, all, none',
    run: (call) => forPorts(call, (t, p) => {
      const current = getDevice(t, call.device.id)?.interfaces[p]?.allowedVlans ?? null;
      const next = allowedVlans(call.args[0]!, current);
      return next === undefined ? { ok: false, error: { code: 'invalidVlan' } } : setTrunkAllowed(t, call.device.id, p, next);
    }),
  },
  { modes: ['if'], types: SWITCHES, syntax: 'no switchport trunk allowed vlan', help: 'All VLANs on this trunk', run: (call) => forPorts(call, (t, p) => setTrunkAllowed(t, call.device.id, p, null)) },
  { modes: ['if'], types: SWITCHES, syntax: 'switchport trunk native vlan <vlan>', help: 'VLAN sent without a tag on this trunk', run: (call) => forPorts(call, (t, p) => setTrunkNative(t, call.device.id, p, Number(call.args[0]))) },
  { modes: ['if'], types: SWITCHES, syntax: 'no switchport trunk native vlan', help: 'Native VLAN 1', run: (call) => forPorts(call, (t, p) => setTrunkNative(t, call.device.id, p, 1)) },
  { modes: ['if'], types: SWITCHES, syntax: 'no switchport access vlan', help: 'Back to VLAN 1', run: (call) => forPorts(call, (t, p) => setPortVlan(t, call.device.id, p, 1)) },
  { modes: ['if'], types: SWITCHES, syntax: 'spanning-tree portfast', help: 'Ports with end devices forward at once (always on here)', run: () => ok() },
  // --- Zugriffslisten (Switches) ---------------------------------------------
  { modes: EXEC, types: SWITCHES, syntax: 'show access-lists', help: 'Access lists with hit counters', run: ({ device, env }) => ok(showAccessLists(device, env)) },
  { modes: EXEC, types: SWITCHES, syntax: 'show ip access-lists', help: 'Access lists with hit counters', run: ({ device, env }) => ok(showAccessLists(device, env)) },
  { modes: ['config', 'acl'], types: SWITCHES, syntax: 'ip access-list extended <word>', help: 'Create or edit a named access list', run: (call) => enterAcl(call, call.args[0]!) },
  {
    modes: ['config'],
    types: SWITCHES,
    syntax: 'no ip access-list extended <word>',
    help: 'Delete an access list',
    run: ({ device, env, args }) => apply(setAccessList(env.topology, device.id, args[0]!, null)),
  },
  { modes: ['acl'], syntax: 'permit <text>', help: 'permit <ip|tcp|udp|icmp> <src> <dst> [eq <port>]', run: (call) => aclRule(call, `permit ${call.args[0]!}`) },
  { modes: ['acl'], syntax: 'deny <text>', help: 'deny <ip|tcp|udp|icmp> <src> <dst> [eq <port>]', run: (call) => aclRule(call, `deny ${call.args[0]!}`) },
  { modes: ['acl'], syntax: 'no <num>', help: 'Remove the entry with this sequence number', run: (call) => removeAclRule(call, Number(call.args[0])) },
  { modes: ['acl'], syntax: 'remark <text>', help: 'Comment (not stored)', run: () => ok() },
  { modes: ['if'], types: SWITCHES, syntax: 'ip access-group <word> in', help: 'Filter incoming packets on this port', run: (call) => forPorts(call, (t, p) => setPortAccessList(t, call.device.id, p, call.args[0]!)) },
  { modes: ['if'], types: SWITCHES, syntax: 'no ip access-group <word> in', help: 'No access list on this port', run: (call) => forPorts(call, (t, p) => setPortAccessList(t, call.device.id, p, null)) },
  { modes: ['if'], types: SWITCHES, syntax: 'no ip access-group', help: 'No access list on this port', run: (call) => forPorts(call, (t, p) => setPortAccessList(t, call.device.id, p, null)) },
  // --- Firewall (Router und Firewall) -----------------------------------------
  { modes: EXEC, types: ROUTERS, syntax: 'show firewall', help: 'Firewall rules with hit counters', run: ({ device, env }) => ok(showFirewall(device, env)) },
  { modes: ['config'], types: ROUTERS, syntax: 'firewall default <word>', help: 'allow | deny when no rule matches', run: (call) => firewallDefault(call, call.args[0]!) },
  { modes: ['config'], types: ROUTERS, syntax: 'firewall stateful', help: 'Replies to allowed connections come back by themselves', run: (call) => editFirewall(call, ({ stateful: _s, ...c }) => c) },
  { modes: ['config'], types: ROUTERS, syntax: 'no firewall stateful', help: 'Stateless: replies need their own rule', run: (call) => editFirewall(call, (c) => ({ ...c, stateful: false })) },
  {
    modes: ['config'],
    types: ROUTERS,
    syntax: 'firewall rule <text>',
    help: 'firewall rule [<pos>] allow|deny <ip|tcp|udp|icmp> <src> <dst> [port <n>] [in <iface>]',
    run: (call) => firewallRule(call, call.args[0]!),
  },
  { modes: ['config'], types: ROUTERS, syntax: 'no firewall rule <num>', help: 'Remove rule number …', run: (call) => removeFirewallRule(call, Number(call.args[0])) },
  { modes: ['config'], types: ROUTERS, syntax: 'no firewall', help: 'Remove the firewall (let everything through)', run: ({ device, env }) => apply(setFirewall(env.topology, device.id, null)) },
];

// --- Zugriffslisten und Firewall ---------------------------------------------------

function enterAcl(call: Call, name: string): Partial<CliOutput> {
  const { device, env, session } = call;
  const next: CliSession = { device: session.device, mode: 'acl', acl: name, ...(session.remote ? { remote: true } : {}) };
  if (device.acls?.some((a) => a.name === name)) return { session: next };
  const created = setAccessList(env.topology, device.id, name, []);
  return created.ok ? { topology: created.value, session: next } : { lines: [errorLine(created.error)] };
}

function aclRule(call: Call, text: string): Partial<CliOutput> {
  const { device, env, session } = call;
  const acl = device.acls?.find((a) => a.name === session.acl);
  if (!acl) return ok(['% Access list no longer exists']);
  const parsed = parseRule(tokenize(text));
  if (!parsed.ok) return ok([parsed.error]);
  return apply(setAccessList(env.topology, device.id, acl.name, [...acl.rules, parsed.rule]));
}

function removeAclRule(call: Call, sequence: number): Partial<CliOutput> {
  const { device, env, session } = call;
  const acl = device.acls?.find((a) => a.name === session.acl);
  if (!acl) return ok(['% Access list no longer exists']);
  const index = sequence / 10 - 1;
  if (!Number.isInteger(index) || !acl.rules[index]) return ok([`% No entry with sequence number ${sequence}`]);
  return apply(setAccessList(env.topology, device.id, acl.name, acl.rules.filter((_, i) => i !== index)));
}

function showAccessLists(device: Device, env: CliEnv): string[] {
  const acls = device.acls ?? [];
  if (acls.length === 0) return ['(no access lists)'];
  const lines: string[] = [];
  for (const acl of acls) {
    const live = env.state?.acls?.find((a) => a.name === acl.name);
    const ports = device.interfaces.filter((i) => i.aclIn === acl.name).map((i) => cliIfaceName(device, i.index));
    lines.push(`Extended IP access list ${acl.name}${ports.length ? `  (in: ${ports.join(', ')})` : ''}`);
    acl.rules.forEach((rule, i) => lines.push(`    ${(i + 1) * 10} ${formatAclRule(rule)}${live ? ` (${live.hits[i] ?? 0} matches)` : ''}`));
    lines.push(`    (implicit deny ip any any${live ? `, ${live.implicitDeny} matches` : ''})`);
  }
  const dangling = [...new Set(device.interfaces.map((i) => i.aclIn).filter((n): n is string => !!n && !acls.some((a) => a.name === n)))];
  for (const name of dangling) lines.push(`% Access list ${name} is applied but does not exist (everything passes)`);
  return lines;
}

/** Name nach «in»: Anschlussname (eth0, port1) oder bei der Firewall auch die Zone (wan, lan, dmz, opt1). */
function ruleIface(device: Device) {
  return (name: string): number | null => {
    if (device.type === 'firewall') {
      const zone = device.interfaces.find((i) => !i.sfpSlot && firewallZone(i.index).toLowerCase() === name.toLowerCase());
      if (zone) return zone.index;
    }
    const ref = parseIfaceName(device, name);
    return ref?.kind === 'port' ? ref.port : null;
  };
}

function editFirewall(call: Call, change: (config: FirewallConfig) => FirewallConfig): Partial<CliOutput> {
  const current = call.device.firewall ?? { rules: [], defaultAction: 'allow' as const };
  return apply(setFirewall(call.env.topology, call.device.id, change(current)));
}

function firewallDefault(call: Call, word: string): Partial<CliOutput> {
  const action = word.toLowerCase();
  if (action !== 'allow' && action !== 'deny' && action !== 'permit') return ok(['% Expected allow or deny']);
  return editFirewall(call, (c) => ({ ...c, defaultAction: action === 'deny' ? 'deny' : 'allow' }));
}

function firewallRule(call: Call, text: string): Partial<CliOutput> {
  const tokens = tokenize(text);
  // Optional zuerst die Position, an der die Regel eingefügt wird (1 = zuoberst).
  const position = /^\d+$/.test(tokens[0] ?? '') ? Number(tokens.shift()) : null;
  const parsed = parseRule(tokens, ruleIface(call.device));
  if (!parsed.ok) return ok([parsed.error]);
  return editFirewall(call, (c) => {
    const at = position === null ? c.rules.length : Math.max(0, Math.min(c.rules.length, position - 1));
    return { ...c, rules: [...c.rules.slice(0, at), parsed.rule, ...c.rules.slice(at)] };
  });
}

function removeFirewallRule(call: Call, number: number): Partial<CliOutput> {
  const rules = call.device.firewall?.rules ?? [];
  if (!rules[number - 1]) return ok([`% No firewall rule ${number}`]);
  return editFirewall(call, (c) => ({ ...c, rules: c.rules.filter((_, i) => i !== number - 1) }));
}

function firewallIfaceName(device: Device) {
  return (index: number) => (device.type === 'firewall' ? `${cliIfaceName(device, index)} (${firewallZone(index)})` : cliIfaceName(device, index));
}

function showFirewall(device: Device, env: CliEnv): string[] {
  const fw = device.firewall;
  if (!fw) return ['Firewall: off (everything passes)'];
  const live = env.state?.firewall;
  const lines = [`Firewall: ${fw.stateful === false ? 'stateless' : 'stateful'}, default ${fw.defaultAction}`];
  const name = firewallIfaceName(device);
  lines.push(
    ...table(
      ['No', 'Action', 'Proto', 'Source', 'Destination', 'Port', 'In', ...(live ? ['Hits'] : [])],
      fw.rules.map((r, i) => [String(i + 1), r.action, r.protocol, r.src, r.dst, r.port !== undefined ? String(r.port) : '-', r.iface !== undefined ? name(r.iface) : 'any', ...(live ? [String(live.hits[i] ?? 0)] : [])]),
    ),
  );
  if (live) lines.push(`Default hits: ${live.defaultHits}  Blocked: ${live.blocked}  Connections: ${live.connections}`);
  return lines;
}

// --- Hilfen für Routingprotokolle ------------------------------------------------

function netOf(cidr: string): RoutedNetwork {
  const [network = '', prefix = '0'] = cidr.split('/');
  const ip = parseIp(network) ?? 0;
  const len = parseMask(prefix) ?? 0;
  return { network: formatIp(networkOf(ip, len)), mask: maskToText(len) };
}

function sameNet(n: RoutedNetwork, cidr: string): boolean {
  const other = netOf(cidr);
  return n.network === other.network && n.mask === other.mask;
}

/** Cisco-Wildcard (0.0.0.255) in Präfix umrechnen. */
function fromWildcard(ip: string, wildcard: string): string | null {
  const w = parseIp(wildcard);
  if (w === null) return null;
  const prefix = parseMask(formatIp(~w >>> 0));
  return prefix === null ? null : `${ip}/${prefix}`;
}

function routerMode(call: Call, mode: 'router-ospf' | 'router-rip' | 'router-bgp', asn?: number): Partial<CliOutput> {
  const { device, env, session } = call;
  const next = { ...session, mode };
  if (mode === 'router-ospf' && !device.ospf) return { ...apply(setOspf(env.topology, device.id, { networks: [] })), session: next };
  if (mode === 'router-rip' && !device.rip) return { ...apply(setRip(env.topology, device.id, { networks: [] })), session: next };
  if (mode === 'router-bgp') {
    if (device.bgp && device.bgp.asn !== asn) return ok([`% BGP is already running; AS is ${device.bgp.asn}`]);
    if (!device.bgp) {
      const result = apply(setBgp(env.topology, device.id, { asn: asn ?? 0, neighbors: [], networks: [] }));
      return result.topology ? { ...result, session: next } : result;
    }
  }
  return { session: next };
}

function routerMode6(call: Call, mode: 'router-ospf6' | 'router-ripng'): Partial<CliOutput> {
  const { device, env, session } = call;
  const next = { ...session, mode };
  if (mode === 'router-ospf6' && !device.ospf6) return { ...apply(setOspf6(env.topology, device.id, { interfaces: [] })), session: next };
  if (mode === 'router-ripng' && !device.ripng) return { ...apply(setRipng(env.topology, device.id, { interfaces: [] })), session: next };
  return { session: next };
}

function editOspf6(call: Call, change: (c: Ospf6Config) => Ospf6Config): Partial<CliOutput> {
  return apply(setOspf6(call.env.topology, call.device.id, change(call.device.ospf6 ?? { interfaces: [] })));
}

function editRipng(call: Call, change: (c: RipngConfig) => RipngConfig): Partial<CliOutput> {
  return apply(setRipng(call.env.topology, call.device.id, change(call.device.ripng ?? { interfaces: [] })));
}

/** Anschluss als Name (eth0, vlan10) oder schon als Kennung (aus dem Interface-Modus). */
function ifaceArg(device: Device, name: string | number): number | null {
  if (typeof name === 'number') return name;
  const ref = parseIfaceName(device, name);
  return ref ? ifaceIdOf(ref) : null;
}

function ospf6Interface(call: Call, name: string | number, area: number | null): Partial<CliOutput> {
  const id = ifaceArg(call.device, name);
  if (id === null) return ok(['% Unknown interface']);
  if (area !== null && (!Number.isInteger(area) || area < 0)) return ok(['% Invalid area']);
  return editOspf6(call, (c) => ({ ...c, interfaces: [...c.interfaces.filter((e) => e.iface !== id), ...(area === null ? [] : [{ iface: id, area }])] }));
}

function ripngInterface(call: Call, name: string, on: boolean): Partial<CliOutput> {
  const id = ifaceArg(call.device, name);
  if (id === null) return ok(['% Unknown interface']);
  return editRipng(call, (c) => ({ ...c, interfaces: on ? [...c.interfaces.filter((i) => i !== id), id] : c.interfaces.filter((i) => i !== id) }));
}

/** Im Interface-Modus: für jedes gewählte Interface (Ports, VLAN-Interfaces) nacheinander. */
function forLinks6Edit(call: Call, step: (call: Call, id: number) => Partial<CliOutput>): Partial<CliOutput> {
  let current = call;
  let changed = false;
  for (const id of call.session.targets ?? []) {
    const result = step(current, id);
    if (!result.topology) return result;
    changed = true;
    current = { ...current, env: { ...current.env, topology: result.topology }, device: getDevice(result.topology, call.device.id)! };
  }
  return changed ? { topology: current.env.topology } : {};
}

function passive6(call: Call, on: boolean, protocol: 'ospf6' | 'ripng'): Partial<CliOutput> {
  const id = ifaceArg(call.device, call.args[0]!);
  if (id === null) return ok(['% Unknown interface']);
  const update = <T extends { passive?: number[] }>(c: T): T => {
    const list = new Set(c.passive ?? []);
    if (on) list.add(id);
    else list.delete(id);
    return { ...c, passive: [...list] };
  };
  return protocol === 'ospf6' ? editOspf6(call, update) : editRipng(call, update);
}

/** IPv6: «ospf6» und «ripng» heissen im Modell «ospf» und «rip». */
function redistribute6(call: Call, protocol: 'ospf6' | 'ripng', on: boolean): Partial<CliOutput> {
  const word = call.args[0]!.toLowerCase();
  const source = ({ connected: 'connected', static: 'static', ospf6: 'ospf', ripng: 'rip' } as Record<string, RedistributeSource>)[word];
  if (!source || (protocol === 'ospf6' && source === 'ospf') || (protocol === 'ripng' && source === 'rip')) return ok([`% Use connected, static or ${protocol === 'ospf6' ? 'ripng' : 'ospf6'}`]);
  const update = <T extends { redistribute?: RedistributeSource[] }>(c: T): T => {
    const list = new Set(c.redistribute ?? []);
    if (on) list.add(source);
    else list.delete(source);
    return { ...c, redistribute: [...list] };
  };
  return protocol === 'ospf6' ? editOspf6(call, update) : editRipng(call, update);
}

function editOspf(call: Call, change: (c: OspfConfig) => OspfConfig): Partial<CliOutput> {
  return apply(setOspf(call.env.topology, call.device.id, change(call.device.ospf ?? { networks: [] })));
}

function editRip(call: Call, change: (c: RipConfig) => RipConfig): Partial<CliOutput> {
  return apply(setRip(call.env.topology, call.device.id, change(call.device.rip ?? { networks: [] })));
}

function editBgp(call: Call, change: (c: BgpConfig) => BgpConfig): Partial<CliOutput> {
  if (!call.device.bgp) return ok(['% BGP is not running']);
  return apply(setBgp(call.env.topology, call.device.id, change(call.device.bgp)));
}

function passive(call: Call, on: boolean, protocol: 'ospf' | 'rip'): Partial<CliOutput> {
  const ref = parseIfaceName(call.device, call.args[0]!);
  if (!ref) return ok(['% Unknown interface']);
  const id = ifaceIdOf(ref);
  const update = <T extends { passive?: number[] }>(c: T): T => {
    const list = new Set(c.passive ?? []);
    if (on) list.add(id);
    else list.delete(id);
    return { ...c, passive: [...list] };
  };
  return protocol === 'ospf' ? editOspf(call, update) : editRip(call, update);
}

function redistribute(call: Call, protocol: 'ospf' | 'rip' | 'bgp', on: boolean): Partial<CliOutput> {
  const source = call.args[0]!.toLowerCase() as RedistributeSource;
  if (!['connected', 'static', 'ospf', 'rip', 'bgp'].includes(source) || source === protocol) return ok(['% Use connected, static, ospf, rip or bgp']);
  const update = <T extends { redistribute?: RedistributeSource[] }>(c: T): T => {
    const list = new Set(c.redistribute ?? []);
    if (on) list.add(source);
    else list.delete(source);
    return { ...c, redistribute: [...list] };
  };
  if (protocol === 'ospf') return editOspf(call, update);
  if (protocol === 'rip') return editRip(call, update);
  return editBgp(call, update);
}

function splitCidr(cidr: string): [string, string] {
  const [ip = '', prefix = ''] = cidr.split('/');
  return [ip, prefix];
}

function enterInterface(call: Call, name: string): Partial<CliOutput> {
  const { device, env, session } = call;
  const ref = parseIfaceName(device, name);
  if (!ref) return ok([`% Unknown interface: ${name}`]);
  let topology: Topology | undefined;
  // Subinterfaces und SVIs entstehen beim ersten Aufruf, wie auf echten Geräten.
  if (ref.kind === 'sub' && !device.subinterfaces?.some((s) => s.parent === ref.port && s.vlan === ref.vlan)) {
    const created = setSubinterface(env.topology, device.id, ref.port, ref.vlan, '', '');
    if (!created.ok) return ok([errorLine(created.error)]);
    topology = created.value;
  }
  if (ref.kind === 'loopback' && !device.loopbacks?.some((l) => l.id === ref.id)) {
    const created = setLoopback(env.topology, device.id, ref.id, '', '');
    if (!created.ok) return ok([errorLine(created.error)]);
    topology = created.value;
  }
  if (ref.kind === 'svi' && !device.svis?.some((s) => s.vlan === ref.vlan)) {
    const created = setSvi(env.topology, device.id, ref.vlan, '', '');
    if (!created.ok) return ok([errorLine(created.error)]);
    topology = created.value;
  }
  return { session: { ...session, mode: 'if', targets: [ifaceIdOf(ref)] }, ...(topology ? { topology } : {}) };
}

/** «interface range port1-4» oder «port1-4,port7». */
function enterRange(call: Call, spec: string): Partial<CliOutput> {
  const targets: number[] = [];
  for (const part of spec.split(',')) {
    const m = /^(.*?)(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) return ok([`% Invalid range: ${part}`]);
    const [, prefix = 'port', fromText, toText] = m;
    const from = Number(fromText);
    const to = toText === undefined ? from : Number(toText);
    if (to < from) return ok([`% Invalid range: ${part}`]);
    for (let n = from; n <= to; n++) {
      const ref = parseIfaceName(call.device, `${prefix || 'port'}${n}`);
      if (ref?.kind !== 'port') return ok([`% Unknown interface: ${prefix}${n}`]);
      targets.push(ref.port);
    }
  }
  return { session: { ...call.session, mode: 'if', targets: [...new Set(targets)] } };
}

/** Nächster Hop: IP-Adresse oder Interface-Name. */
function addRoute(call: Call, prefixText: string, via: string): Partial<CliOutput> {
  const { device, env } = call;
  const [network, prefix] = splitCidr(prefixText);
  if (parseIp(via) !== null) return apply(addStaticRoute(env.topology, device.id, { network, mask: prefix, gateway: via }));
  const ref = parseIfaceName(device, via);
  if (!ref) return ok([`% Invalid next hop: ${via}`]);
  return apply(addStaticRoute(env.topology, device.id, { network, mask: prefix, iface: ifaceIdOf(ref) }));
}

function addRoute6(call: Call, prefixText: string, via: string, ifaceName?: string): Partial<CliOutput> {
  const { device, env } = call;
  const iface = ifaceName ? parseIfaceName(device, ifaceName) : null;
  if (ifaceName && !iface) return ok([`% Invalid interface: ${ifaceName}`]);
  if (parseIp6(via) !== null) return apply(addStaticRoute6(env.topology, device.id, { network: prefixText, gateway: via, ...(iface ? { iface: ifaceIdOf(iface) } : {}) }));
  const ref = parseIfaceName(device, via);
  if (!ref) return ok([`% Invalid next hop: ${via}`]);
  return apply(addStaticRoute6(env.topology, device.id, { network: prefixText, iface: ifaceIdOf(ref) }));
}

function removeRoute6(call: Call, prefixText: string): Partial<CliOutput> {
  const { device, env } = call;
  const c = parseCidr6(prefixText);
  const index = c ? (device.routes6 ?? []).findIndex((r) => r.network === formatCidr6(c.address, c.prefix)) : -1;
  if (index < 0) return ok(['% No such route']);
  return apply(removeStaticRoute6(env.topology, device.id, index));
}

function showIpv6Route(device: Device, env: CliEnv): string[] {
  const routes = env.state?.ipv6?.routes6;
  if (!routes) return [env.topology.ipMode === 'dual' || env.topology.ipMode === 'ipv6' ? '% IPv6 routes appear while the simulation runs' : '% IPv6 is off in this project (IP version: IPv4 only)'];
  const codes: Record<string, string> = { connected: 'C', static: 'S', default: 'S', auto: 'A', ospf: 'O', rip: 'R' };
  const lines = ['Codes: C - connected, S - static, O - OSPFv3, R - RIPng, A - automatic (leyoNET)', ''];
  for (const r of [...routes].sort((a, b) => (a.network < b.network ? -1 : a.network > b.network ? 1 : a.prefix - b.prefix))) {
    const net = `${formatIp6(r.network)}/${r.prefix}`;
    const name = cliIfaceName(device, r.iface);
    lines.push(r.via === null ? `C>* ${net} is directly connected, ${name}` : `${codes[r.kind] ?? 'S'}>* ${net} [${r.distance ?? 1}/${r.metric ?? 0}] via ${formatIp6(r.via)}, ${name}`);
  }
  if (routes.length === 0) lines.push('(no routes)');
  return lines;
}

function showIpv6Neighbors(device: Device, env: CliEnv): string[] {
  const neighbors = env.state?.ipv6?.neighbors;
  if (!neighbors) return ['% The neighbour cache is only available while the simulation runs'];
  if (neighbors.length === 0) return ['(no IPv6 neighbours)'];
  return table(['IPv6 Address', 'Hardware Addr', 'Interface', 'Router'], neighbors.map((n) => [n.ip, n.mac.toLowerCase(), cliIfaceName(device, n.iface), n.router ? 'yes' : '']));
}

function showIpv6Brief(device: Device, env: CliEnv): string[] {
  const live = env.state?.ipv6?.addresses;
  const rows = live
    ? live.map((a) => [cliIfaceName(device, a.iface), `${a.address}/${a.prefix}`, a.origin])
    : ipv6Links(device)
        .filter((i) => i.ipv6)
        .map((i) => [cliIfaceName(device, i.index), i.ipv6!, 'manual']);
  if (rows.length === 0) return ['(no IPv6 addresses)'];
  return table(['Interface', 'IPv6-Address', 'Origin'], rows);
}

function removeRoute(call: Call, prefixText: string): Partial<CliOutput> {
  const { device, env } = call;
  const [network, prefixRaw] = splitCidr(prefixText);
  const prefix = parseMask(prefixRaw);
  const index = (device.routes ?? []).findIndex((r) => r.network === network && parseMask(r.mask) === prefix);
  if (index < 0) return ok(['% No such route']);
  return apply(removeStaticRoute(env.topology, device.id, index));
}

// --- Ausführen ------------------------------------------------------------------

const PARAM_PATTERN = /^<(\w+)>$/;

function paramOk(param: Param, token: string): boolean {
  switch (param) {
    case 'ip':
      return parseIp(token) !== null;
    case 'cidr':
      return /^\d+\.\d+\.\d+\.\d+\/\d{1,2}$/.test(token) && parseAddress(token) !== null;
    case 'ip6':
      return parseIp6(token) !== null;
    case 'cidr6':
      return token.includes('/') && parseCidr6(token) !== null;
    case 'mask':
      return parseMask(token) !== null;
    case 'vlan':
      return /^\d+$/.test(token) && Number(token) >= 1 && Number(token) <= 4094;
    case 'num':
      return /^\d+$/.test(token);
    default:
      return token.length > 0;
  }
}

interface Match {
  command: Command;
  args: string[];
  exact: number;
  keywords: string;
}

function available(device: Device, mode: CliMode): Command[] {
  return COMMANDS.filter((c) => c.modes.includes(mode) && (!c.types || c.types.includes(device.type)));
}

/** Passt `tokens` vollständig auf den Befehl? Sonst die Position des ersten Fehlers. */
function matchCommand(command: Command, tokens: string[], raw: string): { match?: Match; failedAt: number; incomplete: boolean } {
  const parts = command.syntax.split(' ');
  const args: string[] = [];
  const keywords: string[] = [];
  let exact = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const token = tokens[i];
    if (token === undefined) return { failedAt: i, incomplete: true };
    const param = PARAM_PATTERN.exec(part)?.[1] as Param | undefined;
    if (param === 'text') {
      // Rest der Zeile im Original (Gross-/Kleinschreibung, Leerzeichen bleiben).
      args.push(restOfLine(raw, i));
      return { match: { command, args, exact, keywords: keywords.join(' ') }, failedAt: -1, incomplete: false };
    }
    if (param) {
      if (!paramOk(param, token)) return { failedAt: i, incomplete: false };
      args.push(token);
      keywords.push(`<${param}>`);
      continue;
    }
    const lower = token.toLowerCase();
    if (!part.startsWith(lower)) return { failedAt: i, incomplete: false };
    if (part === lower) exact++;
    keywords.push(part);
  }
  if (tokens.length > parts.length) return { failedAt: parts.length, incomplete: false };
  return { match: { command, args, exact, keywords: keywords.join(' ') }, failedAt: -1, incomplete: false };
}

function restOfLine(raw: string, skip: number): string {
  let rest = raw.trim();
  for (let i = 0; i < skip; i++) rest = rest.replace(/^\S+\s*/, '');
  return rest;
}

function tokenize(line: string): string[] {
  return line.trim().split(/\s+/).filter(Boolean);
}

/** Spalte, an der das Token `index` beginnt (für das «^» unter dem Fehler). */
function columnOf(line: string, index: number): number {
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(line))) {
    if (n === index) return m.index;
    n++;
  }
  return line.length;
}

export function execute(session: CliSession, line: string, env: CliEnv): CliOutput {
  const device = getDevice(env.topology, session.device);
  if (!device) return { session, lines: ['% Device no longer exists'], close: true };

  if (session.awaiting === 'enable-password') {
    const { awaiting: _a, ...rest } = session;
    if (line === device.cli?.enableSecret) return { session: { ...rest, mode: 'enable' }, lines: [] };
    return { session: rest, lines: ['% Access denied'] };
  }

  // Kommentare: ganze Zeile mit «!» oder angehängt mit « ! …» (wie in Konfigurationsdateien).
  const trimmed = line.replace(/\s+!\s.*$/, '').trim();
  if (!trimmed || trimmed.startsWith('!')) return { session, lines: [] };
  if (trimmed.endsWith('?')) return { session, lines: help(device, session, trimmed.slice(0, -1), line.slice(0, line.lastIndexOf('?'))) };

  const tokens = tokenize(trimmed);
  // «do show …» im Konfigurationsmodus.
  if (CONFIG_ALL.includes(session.mode) && tokens[0]?.toLowerCase() === 'do' && tokens.length > 1) {
    const inner = execute({ ...session, mode: 'enable' }, trimmed.replace(/^\S+\s+/, ''), env);
    return { ...inner, session, close: false };
  }

  const candidates = available(device, session.mode);
  const results = candidates.map((c) => matchCommand(c, tokens, trimmed));
  const matches = results.flatMap((r) => (r.match ? [r.match] : []));
  // Wie bei Cisco: Ein globaler Befehl in einem Untermodus (z.B. «vlan 20» im VLAN-Modus,
  // «interface port2» im Interface-Modus) verlässt den Untermodus und wird global ausgeführt.
  if (matches.length === 0 && CONFIG_ALL.includes(session.mode) && session.mode !== 'config') {
    const global: CliSession = { device: session.device, mode: 'config', ...(session.remote ? { remote: true } : {}) };
    if (available(device, 'config').some((c) => matchCommand(c, tokens, trimmed).match)) return execute(global, line, env);
  }
  if (matches.length === 0) {
    const promptText = prompt(env.topology, session);
    if (results.some((r) => r.incomplete && r.failedAt === tokens.length)) return { session, lines: ['% Incomplete command.'] };
    const furthest = Math.max(0, ...results.map((r) => r.failedAt));
    const col = columnOf(trimmed, furthest);
    return { session, lines: [`${' '.repeat(promptText.length + col)}^`, "% Invalid input detected at '^' marker."] };
  }
  const best = Math.max(...matches.map((m) => m.exact));
  const top = matches.filter((m) => m.exact === best);
  const distinct = new Set(top.map((m) => m.keywords));
  if (distinct.size > 1) return { session, lines: [`% Ambiguous command: "${trimmed}"`] };
  const chosen = top[0]!;
  const out = chosen.command.run({ args: chosen.args, device, session, env });
  const result: Partial<CliOutput> = Array.isArray(out) ? { lines: out } : (out ?? {});
  return {
    session: result.session ?? session,
    lines: result.lines ?? [],
    ...(result.topology ? { topology: result.topology } : {}),
    ...(result.close ? { close: true } : {}),
    ...(result.action ? { action: result.action } : {}),
  };
}

/** Antwort auf «?»: mögliche nächste Wörter mit kurzer Erklärung. */
function help(device: Device, session: CliSession, before: string, raw: string): string[] {
  const endsWithSpace = /\s$/.test(raw) || raw.trim() === '';
  const tokens = tokenize(before);
  const partial = endsWithSpace ? '' : (tokens.pop() ?? '');
  const options = new Map<string, string>();
  const commands = available(device, session.mode);
  if (CONFIG_ALL.includes(session.mode) && tokens.length === 0) options.set('do', 'Run a show/exec command');
  for (const command of commands) {
    const parts = command.syntax.split(' ');
    if (tokens.length >= parts.length) {
      if (tokens.length === parts.length && endsWithSpace && matchCommand(command, tokens, before).match) options.set('<cr>', '');
      continue;
    }
    const prefix = matchCommand({ ...command, syntax: parts.slice(0, tokens.length).join(' ') || '' }, tokens, before);
    if (tokens.length > 0 && !prefix.match) continue;
    const next = parts[tokens.length]!;
    const isParam = PARAM_PATTERN.test(next);
    if (!isParam && !next.startsWith(partial.toLowerCase())) continue;
    const last = tokens.length === parts.length - 1;
    const text = isParam || last ? command.help : (KEYWORD_HELP[next] ?? command.help);
    if (!options.has(next)) options.set(next, text);
  }
  if (options.size === 0) return ['% Unrecognized command'];
  const width = Math.max(...[...options.keys()].map((k) => k.length)) + 2;
  return [...options.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `  ${k.padEnd(width)}${v}`);
}

/** Tab-Ergänzung des letzten Worts; null, wenn nicht eindeutig. */
export function complete(session: CliSession, line: string, env: CliEnv): string | null {
  const device = getDevice(env.topology, session.device);
  if (!device || /\s$/.test(line)) return null;
  const tokens = tokenize(line);
  const partial = tokens.pop();
  if (partial === undefined) return null;
  const words = new Set<string>();
  for (const command of available(device, session.mode)) {
    const parts = command.syntax.split(' ');
    if (tokens.length >= parts.length) continue;
    const head = { ...command, syntax: parts.slice(0, tokens.length).join(' ') };
    if (tokens.length > 0 && !matchCommand(head, tokens, line).match) continue;
    const next = parts[tokens.length]!;
    if (!PARAM_PATTERN.test(next) && next.startsWith(partial.toLowerCase())) words.add(next);
  }
  if (words.size !== 1) return null;
  const word = [...words][0]!;
  return line.slice(0, line.length - partial.length) + word + ' ';
}

// --- Anzeigen ----------------------------------------------------------------

function showVersion(device: Device): string[] {
  return [
    'leyoNET – simulated network operating system',
    'Command syntax modelled on FRRouting (vtysh); not FRRouting software.',
    `Device: ${device.name} (${device.type}), ${device.interfaces.length} ports`,
  ];
}

const prefixText = (ip: number, prefix: number) => `${formatIp(networkOf(ip, prefix))}/${prefix}`;

const ROUTE_CODES: Record<Route['kind'], string> = { connected: 'C', static: 'S', default: 'S', ospf: 'O', rip: 'R', bgp: 'B', auto: 'A' };

/** Routingtabelle; in der Simulation inklusive dynamisch gelernter Routen. */
export function showIpRoute(device: Device, env?: CliEnv): string[] {
  const routes = env?.state?.routes ?? buildRoutes(device).routes;
  const lines = ['Codes: C - connected, S - static, O - OSPF, R - RIP, B - BGP, A - automatic (leyoNET)', '       > - selected route, * - FIB route', ''];
  const sorted = [...routes].sort((a, b) => (a.network >>> 0) - (b.network >>> 0) || a.prefix - b.prefix || (a.distance ?? 0) - (b.distance ?? 0));
  const selected = new Set<string>();
  for (const r of sorted) {
    const name = cliIfaceName(device, r.iface);
    const net = `${formatIp(r.network)}/${r.prefix}`;
    const best = !selected.has(net);
    selected.add(net);
    const mark = best ? '>*' : '  ';
    if (r.kind === 'connected') lines.push(`C${mark} ${net} is directly connected, ${name}`);
    else {
      const metric = `[${r.distance ?? 1}/${r.metric ?? 0}]`;
      lines.push(`${ROUTE_CODES[r.kind]}${mark} ${net} ${metric} ${r.via !== null ? `via ${formatIp(r.via)}, ${name}` : `is directly connected, ${name}`}`);
    }
  }
  if (sorted.length === 0) lines.push('(no routes)');
  if (!env?.state && device.routingMode === 'auto') lines.push('', '% Automatic routing: routes appear while the simulation runs');
  else if (!env?.state && (device.ospf || device.rip || device.bgp)) lines.push('', '% Dynamic routes appear while the simulation runs');
  return lines;
}

function needsSim(env: CliEnv): string[] | null {
  return env.state ? null : ['% Only available while the simulation runs'];
}

function showOspfNeighbors(device: Device, env: CliEnv): string[] {
  if (!device.ospf) return ['% OSPF is not enabled ("router ospf")'];
  const ospf = env.state?.ospf;
  if (!ospf) return needsSim(env) ?? [];
  const now = env.now ?? 0;
  return table(
    ['Neighbor ID', 'State', 'Dead Time', 'Address', 'Interface'],
    ospf.neighbors.map((n) => [n.routerId, { init: 'Init', '2way': '2-Way', exchange: 'Exchange', full: 'Full' }[n.state], `${Math.max(0, Math.round((n.lastHello + 8000 - now) / 1000))}s`, n.ip, cliIfaceName(device, n.iface)]),
  );
}

function showOspf6Neighbors(device: Device, env: CliEnv): string[] {
  if (!device.ospf6) return ['% OSPFv3 is not enabled ("router ospf6")'];
  const ospf = env.state?.ospf6;
  if (!ospf) return needsSim(env) ?? [];
  const now = env.now ?? 0;
  return table(
    ['Neighbor ID', 'State', 'Dead Time', 'Address', 'Interface'],
    ospf.neighbors.map((n) => [n.routerId, { init: 'Init', '2way': '2-Way', exchange: 'Exchange', full: 'Full' }[n.state], `${Math.max(0, Math.round((n.lastHello + 8000 - now) / 1000))}s`, n.ip, cliIfaceName(device, n.iface)]),
  );
}

function showOspf6Database(device: Device, env: CliEnv): string[] {
  if (!device.ospf6) return ['% OSPFv3 is not enabled ("router ospf6")'];
  const ospf = env.state?.ospf6;
  if (!ospf) return needsSim(env) ?? [];
  const names = { router: 'Router', intraAreaPrefix: 'Intra-Prefix', external: 'AS-External' };
  return [`OSPFv3 Router with ID (${ospf.routerId})`, '', ...table(['Type', 'Adv Router', 'Seq#', 'Entries'], ospf.lsdb.map((l) => [names[l.type], l.advertisingRouter, `0x${(l.seq >>> 0).toString(16)}`, String(l.links)]))];
}

function showRipng(device: Device, env: CliEnv): string[] {
  if (!device.ripng) return ['% RIPng is not enabled ("router ripng")'];
  const routes = env.state?.ipv6?.routes6;
  if (!routes) return needsSim(env) ?? [];
  const own = routes.filter((r) => r.kind === 'rip');
  if (!own.length) return ['(no routes learned yet)'];
  return table(
    ['Network', 'Next Hop', 'Metric', 'Interface'],
    own.map((r) => [`${formatIp6(r.network)}/${r.prefix}`, r.via !== null ? formatIp6(r.via) : '::', String(r.metric ?? 0), cliIfaceName(device, r.iface)]),
  );
}

function showOspfDatabase(device: Device, env: CliEnv): string[] {
  if (!device.ospf) return ['% OSPF is not enabled ("router ospf")'];
  const ospf = env.state?.ospf;
  if (!ospf) return needsSim(env) ?? [];
  return [
    `OSPF Router with ID (${ospf.routerId})`,
    '',
    ...table(
      ['Type', 'Link ID', 'ADV Router', 'Seq#', 'Links'],
      ospf.lsdb.map((l) => [l.type === 'router' ? 'Router' : 'AS-External', l.advertisingRouter, l.advertisingRouter, `0x${(l.seq >>> 0).toString(16)}`, String(l.links)]),
    ),
  ];
}

function showBgpSummary(device: Device, env: CliEnv): string[] {
  if (!device.bgp) return ['% BGP is not running ("router bgp ASN")'];
  const peers = env.state?.bgp;
  if (!peers) return needsSim(env) ?? [];
  return [
    `BGP router identifier, local AS number ${device.bgp.asn}`,
    '',
    ...table(
      ['Neighbor', 'V', 'AS', 'State/PfxRcd'],
      peers.map((p) => [p.ip, '4', String(p.remoteAs), p.state === 'established' ? String(p.received) : { idle: 'Idle', connect: 'Connect', openSent: 'OpenSent', openConfirm: 'OpenConfirm', established: '' }[p.state]]),
    ),
  ];
}

function showBgpRoutes(device: Device, env: CliEnv): string[] {
  if (!device.bgp) return ['% BGP is not running ("router bgp ASN")'];
  return showProtocolRoutes(device, env, 'bgp');
}

function showProtocolRoutes(device: Device, env: CliEnv, kind: 'bgp' | 'rip'): string[] {
  if (kind === 'rip' && !device.rip) return ['% RIP is not enabled ("router rip")'];
  const routes = env.state?.routes;
  if (!routes) return needsSim(env) ?? [];
  const own = routes.filter((r) => r.kind === kind);
  if (!own.length) return ['(no routes learned yet)'];
  return table(
    ['Network', 'Next Hop', 'Metric', 'Interface'],
    own.map((r) => [`${formatIp(r.network)}/${r.prefix}`, r.via !== null ? formatIp(r.via) : '0.0.0.0', String(r.metric ?? 0), cliIfaceName(device, r.iface)]),
  );
}

function showProtocols(device: Device): string[] {
  const lines: string[] = [];
  if (device.ospf) lines.push(`Routing Protocol is "ospf"`, ...device.ospf.networks.map((n) => `  network ${n.network}/${parseMask(n.mask)} area ${n.area}`));
  if (device.rip) lines.push(`Routing Protocol is "rip" (version 2)`, ...device.rip.networks.map((n) => `  network ${n.network}/${parseMask(n.mask)}`));
  if (device.bgp) lines.push(`Routing Protocol is "bgp ${device.bgp.asn}"`, ...device.bgp.neighbors.map((n) => `  neighbor ${n.ip} remote-as ${n.remoteAs}`));
  if (device.ospf6) lines.push('Routing Protocol is "ospf6" (IPv6)', ...device.ospf6.interfaces.map((e) => `  interface ${cliIfaceName(device, e.iface)} area ${e.area}`));
  if (device.ripng) lines.push('Routing Protocol is "ripng" (IPv6)', ...device.ripng.interfaces.map((i) => `  network ${cliIfaceName(device, i)}`));
  return lines.length ? lines : ['(no dynamic routing protocol is running)'];
}

interface IfaceRow {
  id: number;
  name: string;
  address: string;
  status: string;
  protocol: string;
}

function ifaceRows(device: Device, env: CliEnv): IfaceRow[] {
  return logicalInterfaces(device).map((id) => {
    const ref = decodeIface(id);
    const port = ref.kind === 'svi' || ref.kind === 'loopback' ? undefined : device.interfaces[ref.port];
    const config =
      ref.kind === 'port'
        ? port
        : ref.kind === 'sub'
          ? device.subinterfaces?.find((s) => s.parent === ref.port && s.vlan === ref.vlan)
          : ref.kind === 'loopback'
            ? device.loopbacks?.find((l) => l.id === ref.id)
            : device.svis?.find((s) => s.vlan === ref.vlan);
    const prefix = config?.mask ? parseMask(config.mask) : null;
    const address = config?.ip && prefix !== null ? `${config.ip}/${prefix}` : 'unassigned';
    const down = port?.shutdown;
    const up = ref.kind === 'svi' || ref.kind === 'loopback' ? true : linkUpAt(env.topology, { device: device.id, iface: ref.port });
    return {
      id,
      name: cliIfaceName(device, id),
      address,
      status: down ? 'admin down' : up ? 'up' : 'down',
      protocol: down || !up ? 'down' : 'up',
    };
  });
}

function table(header: string[], rows: string[][]): string[] {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)) + 2);
  const fmt = (cells: string[]) => cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]!))).join('').trimEnd();
  return [fmt(header), ...rows.map(fmt)];
}

export function showIpInterfaceBrief(device: Device, env: CliEnv): string[] {
  return table(
    ['Interface', 'IP-Address', 'Status', 'Protocol'],
    ifaceRows(device, env).map((r) => [r.name, r.address, r.status, r.protocol]),
  );
}

function showArp(device: Device, env: CliEnv): string[] {
  const arp = env.state?.arp;
  if (!arp) return ['% ARP table is only available while the simulation runs (action mode)'];
  if (arp.length === 0) return ['(ARP table is empty)'];
  return table(
    ['Address', 'Hardware Addr', 'Interface'],
    arp.map((e) => [e.ip, e.mac.toLowerCase(), cliIfaceName(device, e.iface)]),
  );
}

function showNat(env: CliEnv): string[] {
  const nat = env.state?.nat;
  if (!nat) return ['% NAT table is only available while the simulation runs (action mode)'];
  if (nat.length === 0) return ['(no active translations)'];
  return table(
    ['Pro', 'Inside local', 'Inside global', 'Type'],
    nat.map((e) => [e.protocol, `${e.inside}:${e.insidePort}`, `${e.outside}:${e.outsidePort}`, e.forwarded ? 'static' : 'dynamic']),
  );
}

function showMacTable(device: Device, env: CliEnv): string[] {
  const table_ = env.state?.macTable;
  if (!table_) return ['% MAC table is only available while the simulation runs (action mode)'];
  const rows = table_.map((e) => [String(e.vlan), e.mac.toLowerCase(), 'DYNAMIC', cliIfaceName(device, e.port)]);
  return [...table(['Vlan', 'Mac Address', 'Type', 'Ports'], rows), `Total Mac Addresses: ${rows.length}`];
}

/** Angelegte VLANs (Datenbank; bei älteren Dateien alle verwendeten). */
export function vlansOf(device: Device): number[] {
  return [1, ...(device.vlanDb ?? usedVlans(device))];
}

/** «10,20,30-35» → [10, 20, 30, …, 35]; null bei Fehlern. */
export function parseVlanList(text: string): number[] | null {
  const result: number[] = [];
  for (const part of text.split(',')) {
    const m = /^\s*(\d{1,4})(?:\s*-\s*(\d{1,4}))?\s*$/.exec(part);
    if (!m) return null;
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : Number(m[2]);
    if (from < 1 || to > 4094 || to < from) return null;
    for (let v = from; v <= to; v++) result.push(v);
  }
  return [...new Set(result)].sort((a, b) => a - b);
}

/** «switchport trunk allowed vlan …»: Liste, add, remove, except, all, none. undefined = ungültig, null = alle. */
export function allowedVlans(spec: string, current: number[] | null): number[] | null | undefined {
  const [word = '', ...rest] = spec.trim().toLowerCase().split(/\s+/);
  const listText = rest.join('');
  if (word === 'all') return null;
  if (word === 'none') return [];
  const all = () => Array.from({ length: 4094 }, (_, i) => i + 1);
  if (word === 'add' || word === 'remove' || word === 'except') {
    const list = parseVlanList(listText);
    if (!list) return undefined;
    if (word === 'except') return all().filter((v) => !list.includes(v));
    const base = current ?? all();
    const next = word === 'add' ? [...new Set([...base, ...list])] : base.filter((v) => !list.includes(v));
    return next.length === 4094 ? null : next.sort((a, b) => a - b);
  }
  return parseVlanList([word, ...rest].join('')) ?? undefined;
}

/** Kurze Schreibweise einer VLAN-Liste: 10,20,30-35. */
export function formatVlanList(list: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < list.length; ) {
    let j = i;
    while (j + 1 < list.length && list[j + 1] === list[j]! + 1) j++;
    parts.push(j > i ? `${list[i]}-${list[j]}` : String(list[i]));
    i = j + 1;
  }
  return parts.join(',') || 'none';
}

function showTrunks(device: Device, env: CliEnv): string[] {
  const trunks = device.interfaces.filter((p) => p.trunk);
  if (!trunks.length) return ['(no trunk ports)'];
  const rows = trunks.map((p) => {
    const up = linkUpAt(env.topology, { device: device.id, iface: p.index });
    const allowed = p.allowedVlans ? formatVlanList(p.allowedVlans) : '1-4094';
    const active = vlansOf(device).filter((v) => trunkAllows(p, v));
    return [cliIfaceName(device, p.index), up && !p.shutdown ? 'trunking' : 'not-connected', String(p.nativeVlan ?? 1), allowed, formatVlanList(active)];
  });
  return table(['Port', 'Status', 'Native', 'Allowed', 'Allowed and active'], rows);
}

function vlanName(device: Device, vlan: number): string {
  return device.vlanNames?.find((v) => v.vlan === vlan)?.name ?? (vlan === 1 ? 'default' : `VLAN${String(vlan).padStart(4, '0')}`);
}

function showVlanBrief(device: Device): string[] {
  const rows = vlansOf(device).map((vlan) => [
    String(vlan),
    vlanName(device, vlan),
    'active',
    device.interfaces
      .filter((p) => !p.trunk && (p.vlan ?? 1) === vlan)
      .map((p) => cliIfaceName(device, p.index))
      .join(', '),
  ]);
  // Ports in einem VLAN, das nicht angelegt ist, sind inaktiv.
  const missing = [...new Set(device.interfaces.filter((p) => !p.trunk && !vlanExists(device, p.vlan ?? 1)).map((p) => p.vlan!))];
  const lines = table(['VLAN', 'Name', 'Status', 'Ports'], rows);
  for (const v of missing) {
    const ports = device.interfaces.filter((p) => !p.trunk && p.vlan === v).map((p) => cliIfaceName(device, p.index));
    lines.push(`% VLAN ${v} does not exist: ${ports.join(', ')} inactive`);
  }
  const trunks = device.interfaces.filter((p) => p.trunk).map((p) => cliIfaceName(device, p.index));
  if (trunks.length) lines.push('', `Trunk ports: ${trunks.join(', ')} (show interfaces trunk)`);
  return lines;
}

function showInterfacesStatus(device: Device, env: CliEnv): string[] {
  const rows = device.interfaces.map((p) => {
    const up = linkUpAt(env.topology, { device: device.id, iface: p.index });
    const status = p.shutdown ? 'disabled' : up ? 'connected' : 'notconnect';
    return [cliIfaceName(device, p.index), p.description ?? '', status, p.trunk ? 'trunk' : String(p.vlan ?? 1)];
  });
  return table(['Port', 'Name', 'Status', 'Vlan'], rows);
}

function showSpanningTree(device: Device, env: CliEnv): string[] {
  if (!device.stp) return ['Spanning tree is disabled. Enable it with "spanning-tree" in configuration mode.'];
  const stp = env.state?.stp;
  if (!stp) return ['% Spanning tree state is only available while the simulation runs (action mode)'];
  const isRoot = stp.rootId === stp.bridgeId;
  return [
    `Root ID     ${stp.rootId}${isRoot ? '  (this bridge is the root)' : ''}`,
    `Root cost   ${stp.rootCost}`,
    `Root port   ${stp.rootPort === null ? '-' : cliIfaceName(device, stp.rootPort)}`,
    `Bridge ID   ${stp.bridgeId}`,
    '',
    ...table(
      ['Interface', 'Role', 'State'],
      stp.ports.map((p) => [cliIfaceName(device, p.port), p.role, p.state]),
    ),
  ];
}

// --- running-config ------------------------------------------------------------

export function runningConfig(device: Device): string[] {
  const lines = ['!', '! leyoNET – running configuration', '!', `hostname ${hostname(device)}`];
  const cli = device.cli;
  for (const u of cli?.users ?? []) lines.push(`username ${u.name} password ${u.password}`);
  if (cli?.enableSecret) lines.push(`enable secret ${cli.enableSecret}`);
  if (cli?.banner) lines.push(`banner motd ${cli.banner}`);
  if (device.type === 'l3switch') lines.push(device.ipRouting === false ? 'no ip routing' : 'ip routing');
  if (device.type === 'switch' || device.type === 'l3switch') {
    if (device.stp) {
      lines.push('spanning-tree');
      if (device.stpPriority !== undefined) lines.push(`spanning-tree priority ${device.stpPriority}`);
    }
    for (const v of vlansOf(device).slice(1)) {
      const name = device.vlanNames?.find((n) => n.vlan === v)?.name;
      lines.push('!', `vlan ${v}`, ...(name ? [` name ${name}`] : []));
    }
    for (const acl of device.acls ?? []) lines.push('!', `ip access-list extended ${acl.name}`, ...acl.rules.map((r) => ` ${formatAclRule(r)}`));
  }
  lines.push('!');
  for (const p of device.interfaces) {
    lines.push(`interface ${cliIfaceName(device, p.index)}`);
    if (p.description) lines.push(` description ${p.description}`);
    if (usesPortNames(device)) {
      if (p.trunk) {
        lines.push(' switchport mode trunk');
        if (p.nativeVlan) lines.push(` switchport trunk native vlan ${p.nativeVlan}`);
        if (p.allowedVlans) lines.push(` switchport trunk allowed vlan ${formatVlanList(p.allowedVlans)}`);
      }
      else if (p.vlan && p.vlan !== 1) lines.push(' switchport mode access', ` switchport access vlan ${p.vlan}`);
      if (p.aclIn) lines.push(` ip access-group ${p.aclIn} in`);
    } else {
      if (p.ip && p.mask) lines.push(` ip address ${p.ip}/${parseMask(p.mask)}`);
      if (p.dhcpRelay) lines.push(` ip helper-address ${p.dhcpRelay}`);
      if (p.serial) lines.push(` encapsulation ${p.encapsulation ?? 'hdlc'}`);
      if (p.nat) lines.push(' ip nat outside');
      if (p.ospfCost) lines.push(` ip ospf cost ${p.ospfCost}`);
      if (p.ipv6) lines.push(` ipv6 address ${p.ipv6}`);
      if (p.dhcp6) lines.push(' ipv6 nd managed-config-flag');
      if (p.dns6) lines.push(` ipv6 nd ra dns server ${p.dns6}`);
    }
    if (p.shutdown) lines.push(' shutdown');
    lines.push('!');
  }
  for (const s of device.subinterfaces ?? []) {
    lines.push(`interface eth${s.parent}.${s.vlan}`, ` encapsulation dot1q ${s.vlan}`);
    if (s.ip && s.mask) lines.push(` ip address ${s.ip}/${parseMask(s.mask)}`);
    if (s.dhcpRelay) lines.push(` ip helper-address ${s.dhcpRelay}`);
    lines.push('!');
  }
  for (const l of device.loopbacks ?? []) {
    lines.push(`interface loopback${l.id}`);
    if (l.ip && l.mask) lines.push(` ip address ${l.ip}/${parseMask(l.mask)}`);
    lines.push('!');
  }
  for (const s of device.svis ?? []) {
    lines.push(`interface vlan${s.vlan}`);
    if (s.ip && s.mask) lines.push(` ip address ${s.ip}/${parseMask(s.mask)}`);
    if (s.dhcpRelay) lines.push(` ip helper-address ${s.dhcpRelay}`);
    if (s.ipv6) lines.push(` ipv6 address ${s.ipv6}`);
    if (s.dhcp6) lines.push(' ipv6 nd managed-config-flag');
    if (s.dns6) lines.push(` ipv6 nd ra dns server ${s.dns6}`);
    lines.push('!');
  }
  if (device.type === 'switch') {
    const gw = device.routes?.find((r) => parseMask(r.mask) === 0)?.gateway;
    if (gw) lines.push(`ip default-gateway ${gw}`, '!');
  }
  for (const r of device.type === 'switch' ? [] : (device.routes ?? [])) {
    const prefix = parseMask(r.mask);
    const via = r.gateway ?? (r.iface !== undefined ? cliIfaceName(device, r.iface) : '');
    lines.push(`ip route ${r.network}/${prefix} ${via}`);
  }
  if (device.routes?.length) lines.push('!');
  for (const r of device.routes6 ?? []) {
    const via = [r.gateway, r.iface !== undefined ? cliIfaceName(device, r.iface) : undefined].filter(Boolean).join(' ');
    lines.push(`ipv6 route ${r.network} ${via}`);
  }
  if (device.routes6?.length) lines.push('!');
  // Nur 1:1-NAT hat eine Entsprechung in der Befehlszeile; reines SNAT/DNAT wird im Formular eingestellt.
  for (const r of device.staticNat ?? []) lines.push(r.kind ? `! ${r.kind.toUpperCase()} ${r.inside} <-> ${r.outside} (Formular)` : `ip nat inside source static ${r.inside} ${r.outside}`);
  if (device.staticNat?.length) lines.push('!');
  if (device.firewall && (device.type === 'router' || device.type === 'firewall')) {
    lines.push(`firewall default ${device.firewall.defaultAction}`);
    if (device.firewall.stateful === false) lines.push('no firewall stateful');
    const name = (index: number) => cliIfaceName(device, index);
    lines.push(...device.firewall.rules.map((r) => `firewall rule ${formatFirewallRule(r, name)}`), '!');
  }
  const prefixOf = (n: RoutedNetwork) => `${n.network}/${parseMask(n.mask)}`;
  const common = (c: { passive?: number[]; defaultOriginate?: boolean; redistribute?: RedistributeSource[] }) => [
    ...(c.passive ?? []).map((i) => ` passive-interface ${cliIfaceName(device, i)}`),
    ...(c.defaultOriginate ? [' default-information originate'] : []),
    ...(c.redistribute ?? []).map((r) => ` redistribute ${r}`),
  ];
  if (device.ospf) {
    lines.push('router ospf');
    if (device.ospf.routerId) lines.push(` ospf router-id ${device.ospf.routerId}`);
    lines.push(...device.ospf.networks.map((n) => ` network ${prefixOf(n)} area ${n.area}`), ...common(device.ospf), '!');
  }
  if (device.rip) lines.push('router rip', ' version 2', ...device.rip.networks.map((n) => ` network ${prefixOf(n)}`), ...common(device.rip), '!');
  const six = (c: { passive?: number[]; defaultOriginate?: boolean; redistribute?: RedistributeSource[] }) =>
    common(c).map((l) => l.replace(/^ redistribute ospf$/, ' redistribute ospf6').replace(/^ redistribute rip$/, ' redistribute ripng'));
  if (device.ospf6) {
    lines.push('router ospf6');
    if (device.ospf6.routerId) lines.push(` ospf6 router-id ${device.ospf6.routerId}`);
    lines.push(...device.ospf6.interfaces.map((e) => ` interface ${cliIfaceName(device, e.iface)} area ${e.area}`), ...six(device.ospf6), '!');
  }
  if (device.ripng) lines.push('router ripng', ...device.ripng.interfaces.map((i) => ` network ${cliIfaceName(device, i)}`), ...six(device.ripng), '!');
  if (device.bgp) {
    lines.push(`router bgp ${device.bgp.asn}`);
    if (device.bgp.routerId) lines.push(` bgp router-id ${device.bgp.routerId}`);
    lines.push(...device.bgp.neighbors.map((n) => ` neighbor ${n.ip} remote-as ${n.remoteAs}`), ...device.bgp.networks.map((n) => ` network ${prefixOf(n)}`), ...common(device.bgp), '!');
  }
  lines.push('line vty', cli?.ssh ? ' transport input ssh' : ' transport input none');
  if (cli?.users?.length) lines.push(' login local');
  lines.push('!', 'end');
  return lines;
}

/** Netzinfo für Bereiche im Dokumentationsmodus: Netz, Broadcast, nutzbare Hosts. */
export function networkInfo(cidr: string): { network: string; broadcast: string; first: string; last: string; hosts: number; mask: string } | null {
  const parsed = parseAddress(cidr);
  if (!parsed) return null;
  const ip = parseIp(parsed.ip)!;
  const prefix = parseMask(parsed.mask)!;
  const net = networkOf(ip, prefix);
  const size = 2 ** (32 - prefix);
  const broadcast = (net + size - 1) >>> 0;
  const hosts = prefix >= 31 ? size : size - 2;
  return {
    network: prefixText(ip, prefix),
    broadcast: formatIp(broadcast),
    first: formatIp(prefix >= 31 ? net : net + 1),
    last: formatIp(prefix >= 31 ? broadcast : broadcast - 1),
    hosts,
    mask: maskToText(prefix),
  };
}
