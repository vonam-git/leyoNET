import { checkDhcpScope, checkDhcpServer, normalizeDhcpServer, normalizeScope } from '../net/dhcp';
import { checkDnsRecord, isValidName, normalizeName, normalizeRecord } from '../net/dns';
import { isValidPath } from '../net/http';
import { checkMailAccount, checkMailbox } from '../net/mail';
import { checkHostConfig, formatIp, maskToText, parseIp, parseMask, type HostConfigInput } from '../net/ipv4';
import { MAX_LOOPBACK, MAX_VRFS, VRF_NAME, checkStaticRoute, decodeIface, logicalInterfaces, normalizeRoute } from '../net/routing';
import { DEFAULT_GROUP_SIZE, DEVICE_SPECS, MAX_GROUP_SIZE, isRouterLike, canAutoRoute, canHostServices, canRouteDynamically, hasRoutingTable, isRackable, isSwitchType, isWifiCapable } from './devices';
import { MIN_SIGNAL, portMedium, signalBetween } from './links';
import { macFor, normalizeMac } from './mac';
import { MAX_ACLS, MAX_VPN_TUNNELS, checkAccessList, checkFirewall, checkVpnTunnel, type AccessList, type FirewallConfig, type VpnTunnel } from './security';
import { formatCidr6, formatIp6, isLinkLocal6, isLoopback6, isMulticast6, isUnspecified6, networkOf6, parseCidr6, parseIp6 } from '../net/ipv6';
import type {
  Cable,
  Device,
  DeviceType,
  DocArea,
  Medium,
  ModemKind,
  SfpModule,
  TagColor,
  CliConfig,
  WifiClient,
  WlanConfig,
  DhcpScope,
  DhcpReservation,
  DhcpServerConfig,
  DnsRecord,
  Endpoint,
  MailAccount,
  Mailbox,
  NetInterface,
  Point,
  PortForward,
  StaticRoute,
  SubInterface,
  ChannelMode,
  VxlanConfig,
  Loopback,
  Svi,
  Topology,
  WebFile,
  BgpConfig,
  OspfConfig,
  Ospf6Config,
  RipngConfig,
  RipConfig,
  RoutingMode,
  IpMode,
  StaticRoute6,
  SerialEncapsulation,
  StaticNat,
  VlanDef,
} from './types';
import { CHANNEL_MODES, MAX_CHANNEL, MAX_VNI } from './types';
import { checkBgp, checkOspf, checkOspf6, checkRip, checkRipng, normalizeBgp, normalizeOspf, normalizeOspf6, normalizeRip, normalizeRipng } from '../net/dynamic';

export const MAX_NAME_LENGTH = 32;
/** Grösse einer Webserver-Datei in Zeichen (Bilder als data:-URL, also etwa 4/3 der Bytes). */
export const MAX_WEB_FILE = 160_000;
export const MAX_WEB_TOTAL = 300_000;

export type ErrorCode =
  | 'notEditable'
  | 'unknownDevice'
  | 'unknownCable'
  | 'sameDevice'
  | 'noFreeInterface'
  | 'alreadyConnected'
  | 'nameEmpty'
  | 'nameTooLong'
  | 'nameTaken'
  | 'interfaceCountOutOfRange'
  | 'interfaceConnected'
  | 'interfaceInUse'
  | 'invalidLoss'
  | 'invalidPort'
  | 'duplicateForward'
  | 'notASwitch'
  | 'invalidVlan'
  | 'invalidChannel'
  | 'invalidVrfName'
  | 'notAVtep'
  | 'invalidVni'
  | 'unknownVni'
  | 'vlanHasVni'
  | 'unknownVrf'
  | 'defaultVlan'
  | 'stpNeededForLoop'
  | 'invalidPriority'
  | 'notAnEndpoint'
  | 'unknownInterface'
  | 'invalidIp'
  | 'invalidMask'
  | 'maskRequired'
  | 'gatewayWithoutAddress'
  | 'switchLoop'
  | 'notARouter'
  | 'invalidIp6'
  | 'invalidFirewallRule'
  | 'firewallPortNeedsProtocol'
  | 'invalidNetwork'
  | 'tooMany'
  | 'vpnKeyLength'
  | 'notFirewallCapable'
  | 'invalidAclName'
  | 'notAclCapable'
  | 'unknownAcl'
  | 'ipv6Link'
  | 'unknownRoute'
  | 'networkHasHostBits'
  | 'routeNeedsTarget'
  | 'duplicateRoute'
  | 'dhcpServerNeedsStatic'
  | 'notAServer'
  | 'dhcpServerNeedsAddress'
  | 'dhcpRangeOutsideSubnet'
  | 'dhcpRangeOrder'
  | 'dhcpRangeReserved'
  | 'invalidMac'
  | 'dhcpReservationIsServer'
  | 'dhcpReservationDuplicateMac'
  | 'dhcpReservationDuplicateIp'
  | 'dhcpLeaseTime'
  | 'invalidDnsName'
  | 'dnsTtl'
  | 'duplicateRecord'
  | 'unknownRecord'
  | 'invalidPath'
  | 'duplicatePath'
  | 'unknownFile'
  | 'serviceDisabled'
  | 'invalidMailUser'
  | 'passwordRequired'
  | 'duplicateMailbox'
  | 'unknownMailbox'
  | 'invalidMailAddress'
  | 'invalidHost'
  | 'duplicateSubinterface'
  | 'unknownSubinterface'
  | 'wirelessNeedsAccessPoint'
  | 'radioPortNeedsWireless'
  | 'invalidSsid'
  | 'invalidChannel'
  | 'invalidPassword'
  | 'unknownArea'
  | 'unknownFloor'
  | 'lastFloor'
  | 'invalidUser'
  | 'textTooLong'
  | 'invalidMac'
  | 'macGroup'
  | 'macZero'
  | 'dnsForwarderSelf'
  | 'invalidAaaa'
  | 'dnsTxt'
  | 'dnsPriority'
  | 'dnsType'
  | 'cnameConflict'
  | 'cnameLoop'
  | 'noSfpModule'
  | 'notAnSfpSlot'
  | 'noFreeSfpSlot'
  | 'fiberNeedsSfp'
  | 'copperNeedsRj45'
  | 'notRackable'
  | 'notARack'
  | 'mediumNotSupported'
  | 'accessLineNeedsModem'
  | 'notSerialCapable'
  | 'invalidGroupSize'
  | 'notAModem'
  | 'invalidAsn'
  | 'duplicateNeighbor'
  | 'duplicateNetwork'
  | 'invalidArea'
  | 'invalidCost'
  | 'duplicateNat'
  | 'fileTooLarge'
  | 'invalidVlanColor';

/** Fehler tragen nur Code und Parameter; die Oberfläche übersetzt sie. */
export interface TopologyError {
  code: ErrorCode;
  params?: Record<string, string | number>;
  /** Betroffenes Eingabefeld, damit die Oberfläche den Fehler dort anzeigen kann. */
  field?: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: TopologyError };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(code: ErrorCode, params?: TopologyError['params']): Result<T> => ({
  ok: false,
  error: { code, params },
});

export const MAX_TITLE_LENGTH = 80;

/** Projektname setzen; leer = ohne Namen. */
export function setProjectTitle(t: Topology, title: string): Result<Topology> {
  const clean = title.trim().replace(/\s+/g, ' ');
  if (clean.length > MAX_TITLE_LENGTH) return fail('textTooLong', { max: MAX_TITLE_LENGTH });
  if ((t.title ?? '') === clean) return ok(t);
  const { title: _old, ...rest } = t;
  return ok(clean ? { title: clean, ...rest } : rest);
}

export function emptyTopology(): Topology {
  return { devices: [], cables: [], nextId: 1 };
}

export function getDevice(t: Topology, id: string): Device | undefined {
  return t.devices.find((d) => d.id === id);
}

export function getCable(t: Topology, id: string): Cable | undefined {
  return t.cables.find((c) => c.id === id);
}

export function cablesOf(t: Topology, deviceId: string): Cable[] {
  return t.cables.filter((c) => c.a.device === deviceId || c.b.device === deviceId);
}

export function cableAt(t: Topology, endpoint: Endpoint): Cable | undefined {
  const same = (e: Endpoint) => e.device === endpoint.device && e.iface === endpoint.iface;
  return t.cables.find((c) => same(c.a) || same(c.b));
}

/** Die Gegenseite eines Kabels aus Sicht von `deviceId`. */
export function otherEnd(cable: Cable, deviceId: string): Endpoint {
  return cable.a.device === deviceId ? cable.b : cable.a;
}

/** Erster freier RJ45-Anschluss (SFP-Einschübe sind für Glasfaser reserviert). */
export function freeInterface(t: Topology, device: Device): NetInterface | undefined {
  return device.interfaces.find((i) => !i.sfpSlot && !cableAt(t, { device: device.id, iface: i.index }));
}

/** RJ45-Anschlüsse eines Geräts (ohne SFP-Einschübe). */
export function copperPorts(device: Device): NetInterface[] {
  return device.interfaces.filter((i) => !i.sfpSlot);
}

export function deviceSeq(id: string): number {
  return Number(id.slice(1));
}

/** Kleinster freier Name der Form "<base> <n>". */
export function suggestName(t: Topology, base: string): string {
  const taken = new Set(t.devices.map((d) => d.name.toLowerCase()));
  let n = 1;
  while (taken.has(`${base} ${n}`.toLowerCase())) n++;
  return `${base} ${n}`;
}

function checkName(t: Topology, name: string, selfId?: string): Result<string> {
  const trimmed = name.trim();
  if (!trimmed) return fail('nameEmpty');
  if (trimmed.length > MAX_NAME_LENGTH) return fail('nameTooLong', { max: MAX_NAME_LENGTH });
  const clash = t.devices.find((d) => d.id !== selfId && d.name.toLowerCase() === trimmed.toLowerCase());
  if (clash) return fail('nameTaken', { name: trimmed });
  return ok(trimmed);
}

function makeInterfaces(seq: number, from: number, to: number): NetInterface[] {
  const list: NetInterface[] = [];
  for (let i = from; i < to; i++) list.push({ index: i, mac: macFor(seq, i) });
  return list;
}

function updateDevice(t: Topology, id: string, change: (d: Device) => Device): Topology {
  return { ...t, devices: t.devices.map((d) => (d.id === id ? change(d) : d)) };
}

/** Ausstattung eines neuen Geräts, wie sie im Shop gewählt wird. */
export interface DeviceOptions {
  /** Anzahl RJ45-Anschlüsse statt des Standards. */
  ports?: number;
  /** Zusätzliche serielle Anschlüsse (nur Router). */
  serialPorts?: number;
  /** SFP-Einschübe statt des Standards. */
  sfpSlots?: number;
  modem?: ModemKind;
  groupSize?: number;
  variant?: string;
}

/** Router und CPE können Adressen übersetzen (NAT, Portweiterleitung). */
export function natCapable(device: Device): boolean {
  return isRouterLike(device.type) || device.type === 'cpe';
}

/**
 * Werkseinstellung einer CPE (Internet-Box), wie bei echten Geräten:
 * LAN 192.168.1.1/24, DHCP-Server für .100–.199, NAT am WAN-Anschluss.
 * Die WAN-Adresse und das Gateway des Providers trägt man selbst ein.
 */
function cpeDefaults(device: Device): Partial<Device> {
  return {
    interfaces: device.interfaces.map((i) => (i.index === 0 ? { ...i, nat: true } : i.index === 1 ? { ...i, ip: '192.168.1.1', mask: '255.255.255.0' } : i)),
    dhcpServer: { start: '192.168.1.100', end: '192.168.1.199', gateway: '192.168.1.1', dns: '192.168.1.1', leaseTime: 3600 },
  };
}

/**
 * Firewall ab Werk: zustandsbehaftet, von innen (LAN, DMZ, OPT) nach aussen
 * erlaubt, alles andere gesperrt. Antworten kommen dank Zustand zurück; neue
 * Verbindungen vom WAN brauchen eine eigene Regel.
 */
export function firewallDefaults(device: Pick<Device, 'interfaces'>): FirewallConfig {
  const inside = device.interfaces.filter((i) => i.index > 0 && !i.sfpSlot && !i.serial);
  return { rules: inside.map((i) => ({ action: 'allow', protocol: 'any', src: 'any', dst: 'any', iface: i.index })), defaultAction: 'deny' };
}

/** Zone eines Firewall-Anschlusses: 0 WAN, 1 LAN, 2 DMZ, weitere OPT1, OPT2 … */
export function firewallZone(index: number): string {
  return index === 0 ? 'WAN' : index === 1 ? 'LAN' : index === 2 ? 'DMZ' : `OPT${index - 2}`;
}

/**
 * Standardgateway eines Vermittlungsgeräts (z.B. das Gateway des Providers an
 * der CPE): ersetzt die Route 0.0.0.0/0; leer entfernt sie.
 */
export function setDefaultGateway(t: Topology, id: string, gateway: string): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (DEVICE_SPECS[device.type].role === 'endpoint' || device.type === 'accesspoint' || device.type === 'modem') return fail('notARouter');
  const value = gateway.trim();
  if (value && parseIp(value) === null) return { ok: false, error: { code: 'invalidIp', params: { value }, field: 'gateway' } };
  const others = (device.routes ?? []).filter((r) => parseMask(r.mask) !== 0);
  const routes = value ? [...others, { network: '0.0.0.0', mask: '0.0.0.0', gateway: value }] : others;
  return ok(updateDevice(t, id, (d) => (routes.length ? { ...d, routes } : without(d, 'routes'))));
}

export function addDevice(
  t: Topology,
  type: DeviceType,
  name: string,
  position: Point,
  options: DeviceOptions = {},
): Result<{ topology: Topology; id: string }> {
  const checked = checkName(t, name);
  if (!checked.ok) return checked;
  const spec = DEVICE_SPECS[type];
  const seq = t.nextId;
  const copperCount = Math.min(spec.maxInterfaces, Math.max(spec.minInterfaces, options.ports ?? spec.defaultInterfaces));
  const serialCount = type === 'router' ? Math.max(0, Math.min(4, spec.maxInterfaces - copperCount, options.serialPorts ?? 0)) : 0;
  const slotCount = Math.max(0, Math.min(8, options.sfpSlots ?? spec.sfpSlots ?? 0));
  // Reihenfolge: Ethernet-Buchsen, serielle Anschlüsse, SFP-Einschübe.
  const ethernet = makeInterfaces(seq, 0, copperCount);
  const serial = makeInterfaces(seq, copperCount, copperCount + serialCount).map((i) => ({ ...i, serial: true }));
  const slots = makeInterfaces(seq, copperCount + serialCount, copperCount + serialCount + slotCount).map((i) => ({ ...i, sfpSlot: true }));
  const device: Device = {
    id: `d${seq}`,
    type,
    name: checked.value,
    position: { ...position },
    interfaces: [...ethernet, ...serial, ...slots],
    ...(options.variant ? { variant: options.variant } : {}),
  };
  if (type === 'clientgroup') {
    device.dhcp = true;
    device.groupSize = Math.min(MAX_GROUP_SIZE, Math.max(2, options.groupSize ?? DEFAULT_GROUP_SIZE));
  }
  if ((type === 'modem' || type === 'cpe') && options.modem) device.modem = { kind: options.modem };
  if (type === 'cpe') Object.assign(device, cpeDefaults(device));
  if (type === 'firewall') device.firewall = firewallDefaults(device);
  // Neue Switches führen eine VLAN-Datenbank: Weitergeleitet wird nur, was angelegt ist.
  if (isSwitchType(type)) device.vlanDb = [];
  return ok({ topology: { ...t, devices: [...t.devices, device], nextId: seq + 1 }, id: device.id });
}

export function moveDevice(t: Topology, id: string, position: Point): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (device.position.x === position.x && device.position.y === position.y) return ok(t);
  return ok(updateDevice(t, id, (d) => ({ ...d, position: { ...position } })));
}

export function renameDevice(t: Topology, id: string, name: string): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  const checked = checkName(t, name, id);
  if (!checked.ok) return checked;
  if (checked.value === device.name) return ok(t);
  return ok(updateDevice(t, id, (d) => ({ ...d, name: checked.value })));
}

export function removeDevice(t: Topology, id: string): Result<Topology> {
  if (!getDevice(t, id)) return fail('unknownDevice');
  return ok({
    ...t,
    devices: t.devices.filter((d) => d.id !== id),
    cables: t.cables.filter((c) => c.a.device !== id && c.b.device !== id),
  });
}

/**
 * Passt ein Medium an einen Anschluss? Feste Anschlüsse (SFP-Einschub, serieller
 * Port, Funkplatz des Access Points, WAN des Modems) verlangen ihr Medium;
 * normale Buchsen nehmen TP-Kabel. Das Internet (Provider) nimmt jede Zugangsleitung.
 */
export function portAccepts(device: Device, iface: number, medium: Medium): boolean {
  const port = device.interfaces[iface];
  if (!port) return false;
  const fixed = portMedium(device, iface);
  if (fixed) return fixed === medium && (!port.sfpSlot || !!port.sfp);
  if (device.type === 'internet') return medium !== 'wireless';
  return medium === 'tp' || (medium === 'wireless' && isWifiCapable(device.type));
}

/** Passender freier Anschluss für ein Medium. */
export function freeInterfaceFor(t: Topology, device: Device, medium: Medium): NetInterface | undefined {
  return device.interfaces.find((i) => !cableAt(t, { device: device.id, iface: i.index }) && portAccepts(device, i.index, medium));
}

/** Warum kein Anschluss frei ist: Medium passt nirgends, SFP-Modul fehlt oder alles belegt. */
export function noPortError(t: Topology, device: Device, medium: Medium): ErrorCode {
  if (medium === 'fiber' && (device.interfaces.some((i) => i.sfpSlot && !i.sfp) || canHaveSfp(device.type))) return 'noSfpModule';
  const anyPort = device.interfaces.some((i) => {
    if (portAccepts(device, i.index, medium)) return true;
    return medium === 'fiber' && !!i.sfpSlot;
  });
  return anyPort ? 'noFreeInterface' : 'mediumNotSupported';
}

function checkMedium(a: Device, b: Device, medium: Medium): ErrorCode | null {
  if (medium === 'wireless') {
    const wifiCapable = (d: Device) => d.type === 'accesspoint' || isWifiCapable(d.type);
    if (!(a.type === 'accesspoint' || b.type === 'accesspoint') || !wifiCapable(a) || !wifiCapable(b)) return 'wirelessNeedsAccessPoint';
  }
  if (medium === 'coax' || medium === 'dsl' || medium === 'cellular') {
    const modem = a.type === 'modem' || a.type === 'cpe' ? a : b.type === 'modem' || b.type === 'cpe' ? b : null;
    const other = modem === a ? b : a;
    if (!modem || other.type !== 'internet') return 'accessLineNeedsModem';
  }
  return null;
}

/** Verbindet zwei Geräte über deren jeweils ersten freien (zum Medium passenden) Anschluss. */
/** CPE: zum Provider (Internet, Modem) der WAN-Anschluss, sonst zuerst die LAN-Buchsen. */
function freeCpePort(t: Topology, device: Device, medium: Medium, peer: Device): NetInterface | undefined {
  const free = freeInterfacesFor(t, device, medium);
  const towardsProvider = peer.type === 'internet' || peer.type === 'modem';
  return free.find((i) => (i.index === 0) === towardsProvider) ?? free[0];
}

/** Freie Anschlüsse eines Geräts, die das Medium annehmen (für die Auswahl beim Verbinden). */
export function freeInterfacesFor(t: Topology, device: Device, medium: Medium): NetInterface[] {
  return device.interfaces.filter((i) => !cableAt(t, { device: device.id, iface: i.index }) && portAccepts(device, i.index, medium));
}

/**
 * Verbindet zwei Geräte. Ohne `ports` nimmt es je den ersten freien passenden
 * Anschluss; mit `ports` die gewählten (müssen frei sein und passen).
 */
export function connect(t: Topology, aId: string, bId: string, medium: Medium = 'tp', ports: { a?: number; b?: number } = {}): Result<{ topology: Topology; id: string }> {
  const a = getDevice(t, aId);
  const b = getDevice(t, bId);
  if (!a || !b) return fail('unknownDevice');
  if (a.id === b.id) return fail('sameDevice');
  // Mehrere Kabel zwischen denselben Geräten sind erlaubt: Port-Channel (Link Aggregation) oder Schleifen.
  const mediumIssue = checkMedium(a, b, medium);
  if (mediumIssue) return fail(mediumIssue);
  // Schleifen zwischen Switches sind erlaubt: Ohne Spanning Tree zeigt die Simulation den Broadcast-Sturm.
  const pick = (d: Device, wanted: number | undefined, peer: Device): Result<NetInterface> => {
    if (wanted === undefined) {
      const free = d.type === 'cpe' ? freeCpePort(t, d, medium, peer) : freeInterfaceFor(t, d, medium);
      return free ? ok(free) : fail(noPortError(t, d, medium), { device: d.name });
    }
    const port = d.interfaces[wanted];
    if (!port) return fail('unknownInterface');
    if (cableAt(t, { device: d.id, iface: wanted })) return fail('interfaceInUse', { device: d.name, index: wanted });
    if (!portAccepts(d, wanted, medium)) return fail('mediumNotSupported', { device: d.name });
    return ok(port);
  };
  const pa = pick(a, ports.a, b);
  if (!pa.ok) return pa;
  const pb = pick(b, ports.b, a);
  if (!pb.ok) return pb;
  const ia = pa.value;
  const ib = pb.value;
  const cable: Cable = {
    id: `c${t.nextId}`,
    a: { device: a.id, iface: ia.index },
    b: { device: b.id, iface: ib.index },
    ...(medium !== 'tp' ? { medium } : {}),
  };
  return ok({ topology: { ...t, cables: [...t.cables, cable], nextId: t.nextId + 1 }, id: cable.id });
}

/** Würde eine Verbindung eine Schleife zwischen Switches ohne Spanning Tree schliessen? (für Warnungen) */
export function wouldLoopWithoutStp(t: Topology, aId: string, bId: string): boolean {
  const a = getDevice(t, aId);
  const b = getDevice(t, bId);
  return !!a && !!b && isBridge(a) && isBridge(b) && bridged(t, a.id, b.id) && !stpProtects(t, a.id);
}

/** Medium einer bestehenden Verbindung ändern, sofern beide Anschlüsse es annehmen. */
export function setCableMedium(t: Topology, id: string, medium: Medium): Result<Topology> {
  const cable = getCable(t, id);
  if (!cable) return fail('unknownCable');
  const a = getDevice(t, cable.a.device);
  const b = getDevice(t, cable.b.device);
  if (!a || !b) return fail('unknownDevice');
  const issue = checkMedium(a, b, medium);
  if (issue) return fail(issue);
  for (const [d, iface] of [[a, cable.a.iface], [b, cable.b.iface]] as const) {
    const port = d.interfaces[iface];
    if (portAccepts(d, iface, medium)) continue;
    if (medium === 'fiber' && !port?.sfpSlot && d.type !== 'internet') return fail('fiberNeedsSfp', { device: d.name });
    if (medium === 'fiber' && port?.sfpSlot && !port.sfp) return fail('noSfpModule', { device: d.name });
    if (medium !== 'fiber' && port?.sfpSlot) return fail('copperNeedsRj45', { device: d.name });
    if (d.type === 'accesspoint') return fail('radioPortNeedsWireless');
    return fail('mediumNotSupported', { device: d.name });
  }
  return ok({
    ...t,
    cables: t.cables.map((c) => {
      if (c.id !== id) return c;
      const { medium: _m, ...rest } = c;
      return medium === 'tp' ? rest : { ...rest, medium };
    }),
  });
}

/**
 * Switches und Modems leiten Broadcasts an alle Ports weiter. Ohne Spanning
 * Tree würde eine Schleife zwischen ihnen einen endlosen Broadcast-Sturm
 * auslösen, darum erlaubt der Editor Schleifen nur, wenn alle beteiligten
 * Switches Spanning Tree aktiv haben.
 */
export function isBridge(device: Device): boolean {
  return isSwitchType(device.type) || device.type === 'modem' || device.type === 'accesspoint';
}

/** Alle Switches und Modems, die über Switch-/Modem-Verbindungen mit `from` zusammenhängen. */
function bridgeComponent(t: Topology, from: string): Device[] {
  const seen = new Set([from]);
  const queue = [from];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const cable of cablesOf(t, id)) {
      const next = otherEnd(cable, id).device;
      const device = getDevice(t, next);
      if (device && isBridge(device) && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return [...seen].flatMap((id) => getDevice(t, id) ?? []);
}

/** Schleifen sind sicher, wenn jeder Switch im Verbund Spanning Tree spricht (Modems können das nicht). */
function stpProtects(t: Topology, from: string): boolean {
  return bridgeComponent(t, from).every((d) => isSwitchType(d.type) && d.stp);
}

function bridged(t: Topology, from: string, to: string): boolean {
  const seen = new Set([from]);
  const queue = [from];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    if (id === to) return true;
    for (const cable of cablesOf(t, id)) {
      const next = otherEnd(cable, id).device;
      const device = getDevice(t, next);
      if (device && isBridge(device) && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/** Erstes Kabel, das eine Schleife zwischen Switches/Modems schliesst (für geladene Dateien). */
export function findSwitchLoop(t: Topology): Cable | undefined {
  const parent = new Map<string, string>();
  const root = (id: string): string => {
    let r = id;
    while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (const cable of t.cables) {
    const a = getDevice(t, cable.a.device);
    const b = getDevice(t, cable.b.device);
    if (!a || !b || !isBridge(a) || !isBridge(b)) continue;
    const ra = root(a.id);
    const rb = root(b.id);
    if (ra === rb) {
      if (stpProtects(t, a.id)) continue;
      return cable;
    }
    parent.set(ra, rb);
  }
  return undefined;
}

// --- VLAN und Spanning Tree --------------------------------------------------

function switchDevice(t: Topology, id: string): Result<Device> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!isSwitchType(device.type)) return fail('notASwitch');
  return ok(device);
}

function updatePort(t: Topology, id: string, index: number, change: (i: NetInterface) => NetInterface): Topology {
  return updateDevice(t, id, (d) => ({ ...d, interfaces: d.interfaces.map((i) => (i.index === index ? change(i) : i)) }));
}

// --- VLAN-Datenbank ----------------------------------------------------------------

/** Kennt der Switch das VLAN? VLAN 1 immer; ohne Datenbank (ältere Dateien) jedes. */
export function vlanExists(device: Pick<Device, 'vlanDb'>, vlan: number): boolean {
  return vlan === 1 || !device.vlanDb || device.vlanDb.includes(vlan);
}

/** VLANs, die ein Switch verwendet (Ports, Trunks, SVIs, Namen) – Grundlage für die Datenbank älterer Dateien. */
export function usedVlans(device: Device): number[] {
  const set = new Set<number>();
  for (const p of device.interfaces) {
    if (!p.trunk && p.vlan) set.add(p.vlan);
    for (const v of p.allowedVlans ?? []) set.add(v);
    if (p.nativeVlan) set.add(p.nativeVlan);
  }
  for (const s of device.svis ?? []) set.add(s.vlan);
  for (const n of device.vlanNames ?? []) set.add(n.vlan);
  set.delete(1);
  return [...set].sort((a, b) => a - b);
}

const validVlanId = (vlan: number) => Number.isInteger(vlan) && vlan >= 1 && vlan <= 4094;

/** Datenbank mit diesen VLANs ergänzen; eine ältere Datei ohne Datenbank bekommt dabei alle verwendeten. */
function withVlans(device: Device, add: number[]): Device {
  const base = device.vlanDb ?? usedVlans(device);
  const next = [...new Set([...base, ...add.filter((v) => v !== 1)])].sort((a, b) => a - b);
  return { ...device, vlanDb: next };
}

/** VLAN anlegen («vlan 20»). */
export function createVlan(t: Topology, id: string, vlan: number): Result<Topology> {
  const device = switchDevice(t, id);
  if (!device.ok) return device;
  if (!validVlanId(vlan)) return fail('invalidVlan');
  return ok(updateDevice(t, id, (d) => withVlans(d, [vlan])));
}

/**
 * VLAN löschen («no vlan 20»): Name und Eintrag verschwinden. Ports bleiben im
 * VLAN, sind aber inaktiv, bis es wieder angelegt wird (wie bei Cisco).
 */
export function deleteVlan(t: Topology, id: string, vlan: number): Result<Topology> {
  const device = switchDevice(t, id);
  if (!device.ok) return device;
  if (vlan === 1) return fail('defaultVlan');
  if (!validVlanId(vlan)) return fail('invalidVlan');
  return ok(
    updateDevice(t, id, (d) => {
      const names = (d.vlanNames ?? []).filter((n) => n.vlan !== vlan);
      const { vlanNames: _n, ...rest } = withVlans(d, []);
      return { ...rest, vlanDb: (rest.vlanDb ?? []).filter((v) => v !== vlan), ...(names.length ? { vlanNames: names } : {}) };
    }),
  );
}

/** VLAN eines Access-Ports (1–4094); VLAN 1 wird nicht gespeichert. Ein unbekanntes VLAN wird angelegt (wie Cisco). */
export function setPortVlan(t: Topology, id: string, index: number, vlan: number): Result<Topology> {
  const device = switchDevice(t, id);
  if (!device.ok) return device;
  if (!device.value.interfaces[index]) return fail('unknownInterface');
  if (!validVlanId(vlan)) return fail('invalidVlan');
  const next = updatePort(t, id, index, (i) => {
    const { vlan: _v, ...base } = i;
    return vlan === 1 ? base : { ...base, vlan };
  });
  return ok(vlanExists(device.value, vlan) ? next : updateDevice(next, id, (d) => withVlans(d, [vlan])));
}

/** Erlaubte VLANs eines Trunks; null = alle. */
export function setTrunkAllowed(t: Topology, id: string, index: number, vlans: number[] | null): Result<Topology> {
  const device = switchDevice(t, id);
  if (!device.ok) return device;
  if (!device.value.interfaces[index]) return fail('unknownInterface');
  if (vlans && !vlans.every(validVlanId)) return fail('invalidVlan');
  const list = vlans ? [...new Set(vlans)].sort((a, b) => a - b) : null;
  return ok(updatePort(t, id, index, (i) => (list === null ? without(i, 'allowedVlans') : { ...i, allowedVlans: list })));
}

/** VLAN ohne Tag auf einem Trunk (Native VLAN); 1 = Standard. */
export function setTrunkNative(t: Topology, id: string, index: number, vlan: number): Result<Topology> {
  const device = switchDevice(t, id);
  if (!device.ok) return device;
  if (!device.value.interfaces[index]) return fail('unknownInterface');
  if (!validVlanId(vlan)) return fail('invalidVlan');
  return ok(updatePort(t, id, index, (i) => (vlan === 1 ? without(i, 'nativeVlan') : { ...i, nativeVlan: vlan })));
}

/**
 * Port einem Port-Channel zuweisen («channel-group 1 mode active») oder ihn
 * herauslösen (null). Alle Ports eines Channels sollten gleich eingestellt sein
 * (VLAN bzw. Trunk); sonst stellt die Simulation abweichende Ports aus.
 */
export function setPortChannel(t: Topology, id: string, index: number, channel: number | null, mode: ChannelMode = 'active'): Result<Topology> {
  const device = switchDevice(t, id);
  if (!device.ok) return device;
  if (device.value.type === 'accesspoint') return fail('notASwitch');
  if (!device.value.interfaces[index]) return fail('unknownInterface');
  if (channel !== null && (!Number.isInteger(channel) || channel < 1 || channel > MAX_CHANNEL)) return fail('invalidChannel', { max: MAX_CHANNEL });
  if (!CHANNEL_MODES.includes(mode)) return fail('invalidChannel', { max: MAX_CHANNEL });
  return ok(
    updatePort(t, id, index, (i) => {
      const { channel: _c, channelMode: _m, ...base } = i;
      return channel === null ? base : { ...base, channel, ...(mode !== 'active' ? { channelMode: mode } : {}) };
    }),
  );
}

/** Ports eines Port-Channels (Index aufsteigend). */
export function channelMembers(device: Device, channel: number): number[] {
  return device.interfaces.filter((i) => i.channel === channel).map((i) => i.index);
}

/** Darf ein Trunk dieses VLAN übertragen? */
export function trunkAllows(iface: Pick<NetInterface, 'allowedVlans'>, vlan: number): boolean {
  return !iface.allowedVlans || iface.allowedVlans.includes(vlan);
}

export function setPortTrunk(t: Topology, id: string, index: number, trunk: boolean): Result<Topology> {
  const device = switchDevice(t, id);
  if (!device.ok) return device;
  if (!device.value.interfaces[index]) return fail('unknownInterface');
  return ok(
    updatePort(t, id, index, (i) => {
      const { trunk: _t, ...base } = i;
      return trunk ? { ...base, trunk: true } : base;
    }),
  );
}

/** Spanning Tree ein- oder ausschalten; ausschalten nur, wenn dadurch keine ungeschützte Schleife entsteht. */
export function setStp(t: Topology, id: string, enabled: boolean): Result<Topology> {
  const device = switchDevice(t, id);
  if (!device.ok) return device;
  const next = updateDevice(t, id, (d) => {
    const { stp: _s, ...rest } = d;
    return enabled ? { ...rest, stp: true } : rest;
  });
  // Ohne STP bleibt eine Schleife erlaubt; die Simulation zeigt dann den Broadcast-Sturm.
  return ok(next);
}

/** STP-Priorität in Schritten von 4096 (0–61440); die kleinste wird Root-Bridge. */
export function setStpPriority(t: Topology, id: string, priority: number): Result<Topology> {
  const device = switchDevice(t, id);
  if (!device.ok) return device;
  if (!Number.isInteger(priority) || priority < 0 || priority > 61440 || priority % 4096 !== 0) return fail('invalidPriority');
  return ok(
    updateDevice(t, id, (d) => {
      const { stpPriority: _p, ...rest } = d;
      return priority === 32768 ? rest : { ...rest, stpPriority: priority };
    }),
  );
}

/** Beschädigung eines Kabels in Prozent verlorener Rahmen (0 = intakt). */
export function setCableLoss(t: Topology, id: string, percent: number): Result<Topology> {
  if (!getCable(t, id)) return fail('unknownCable');
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) return fail('invalidLoss');
  return ok({
    ...t,
    cables: t.cables.map((c) => {
      if (c.id !== id) return c;
      const { loss: _l, ...rest } = c;
      return percent > 0 ? { ...rest, loss: percent } : rest;
    }),
  });
}

/** Steckt ein Kabelende am selben Gerät auf einen anderen, freien Anschluss um. */
export function replugCable(t: Topology, id: string, end: 'a' | 'b', iface: number): Result<Topology> {
  const cable = getCable(t, id);
  if (!cable) return fail('unknownCable');
  const device = getDevice(t, cable[end].device);
  if (!device) return fail('unknownDevice');
  if (!device.interfaces[iface]) return fail('unknownInterface');
  if (cable[end].iface === iface) return ok(t);
  // Access Point: Funk nur an Funk-Ports, Kabel nur an der LAN-Buchse.
  if (device.type === 'accesspoint' && (iface > 0) !== (cable.medium === 'wireless')) return fail('radioPortNeedsWireless');
  // Glasfaser gehört in einen SFP-Einschub, Kupfer in eine RJ45-Buchse.
  const slot = !!device.interfaces[iface]?.sfpSlot;
  if (cable.medium === 'fiber' && !slot) return fail('fiberNeedsSfp', { device: device.name });
  if (cable.medium !== 'fiber' && slot) return fail('copperNeedsRj45', { device: device.name });
  const occupied = cableAt(t, { device: device.id, iface });
  if (occupied) return fail('interfaceInUse', { device: device.name, index: iface });
  return ok({
    ...t,
    cables: t.cables.map((c) => (c.id === id ? { ...c, [end]: { device: device.id, iface } } : c)),
  });
}

export function removeCable(t: Topology, id: string): Result<Topology> {
  if (!getCable(t, id)) return fail('unknownCable');
  return ok({ ...t, cables: t.cables.filter((c) => c.id !== id) });
}

/**
 * Ändert die Anzahl RJ45-Ports; entfernt werden immer die höchsten, und nur
 * wenn sie frei sind. SFP-Einschübe bleiben erhalten und rücken ans Ende;
 * Kabel, Subinterfaces und Routen auf ihnen ziehen mit.
 */
export function setInterfaceCount(t: Topology, id: string, count: number): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  const spec = DEVICE_SPECS[device.type];
  if (!Number.isInteger(count) || count < spec.minInterfaces || count > spec.maxInterfaces) {
    return fail('interfaceCountOutOfRange', { min: spec.minInterfaces, max: spec.maxInterfaces });
  }
  const copper = copperPorts(device);
  const slots = device.interfaces.filter((i) => i.sfpSlot);
  if (count === copper.length) return ok(t);
  if (count < copper.length) {
    const busy = copper.slice(count).find((i) => cableAt(t, { device: id, iface: i.index }));
    if (busy) return fail('interfaceConnected', { device: device.name, index: busy.index });
  }
  // Neue Ports erhalten MAC-Adressen, die das Gerät noch nicht verwendet.
  const used = new Set(device.interfaces.map((i) => i.mac));
  const seq = deviceSeq(id);
  let next = 0;
  const fresh = () => {
    while (used.has(macFor(seq, next))) next++;
    const mac = macFor(seq, next);
    used.add(mac);
    return mac;
  };
  const keptCopper = copper.slice(0, count);
  const addedCopper = Array.from({ length: Math.max(0, count - copper.length) }, () => ({ mac: fresh() }));
  const ordered: Omit<NetInterface, 'index'>[] = [...keptCopper, ...addedCopper, ...slots];
  const mapping = new Map<number, number>();
  const interfaces = ordered.map((iface, index) => {
    if ('index' in iface && typeof iface.index === 'number') mapping.set(iface.index, index);
    return { ...iface, index } as NetInterface;
  });
  return ok(remapPorts({ ...t }, id, interfaces, mapping));
}

/** Setzt neue Anschlüsse und passt alle Verweise (Kabel, Subinterfaces, Routen) an. */
function remapPorts(t: Topology, id: string, interfaces: NetInterface[], mapping: Map<number, number>): Topology {
  const map = (index: number) => mapping.get(index) ?? index;
  return {
    ...t,
    devices: t.devices.map((d) => {
      if (d.id !== id) return d;
      const next: Device = { ...d, interfaces };
      if (d.subinterfaces) next.subinterfaces = d.subinterfaces.map((si) => ({ ...si, parent: map(si.parent) }));
      if (d.routes) next.routes = d.routes.map((r) => (r.iface !== undefined && decodeIface(r.iface).kind === 'port' ? { ...r, iface: map(r.iface) } : r));
      // Firewall-Regeln für einen Anschluss folgen ihm; fällt er weg, fällt auch die Regel weg.
      if (d.firewall) {
        const rules = d.firewall.rules.filter((r) => r.iface === undefined || mapping.has(r.iface)).map((r) => (r.iface === undefined ? r : { ...r, iface: map(r.iface) }));
        next.firewall = { ...d.firewall, rules };
      }
      return next;
    }),
    cables: t.cables.map((c) => ({
      ...c,
      a: c.a.device === id ? { ...c.a, iface: map(c.a.iface) } : c.a,
      b: c.b.device === id ? { ...c.b, iface: map(c.b.iface) } : c.b,
    })),
  };
}

/** Leere Felder entfernen den Eintrag; Masken werden in Punktschreibweise gespeichert. */
function normalized(ip: string, mask: string): Pick<NetInterface, 'ip' | 'mask'> {
  const prefix = mask.trim() ? parseMask(mask) : null;
  return {
    ...(ip.trim() ? { ip: ip.trim() } : {}),
    ...(prefix !== null ? { mask: maskToText(prefix) } : {}),
  };
}

/**
 * Setzt IP, Maske, Gateway und DNS eines Endgeräts in einem Schritt.
 * Nur unlesbare Eingaben werden abgelehnt; fachliche Warnungen liefert
 * `checkHostConfig` getrennt.
 */
export function configureHost(t: Topology, id: string, input: HostConfigInput): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (DEVICE_SPECS[device.type].role !== 'endpoint') return fail('notAnEndpoint');
  if (input.dhcp && device.dhcpServer) return fail('dhcpServerNeedsStatic');
  const { errors } = checkHostConfig(input);
  const first = errors[0];
  if (first) return { ok: false, error: { code: first.code as ErrorCode, params: first.params, field: first.field } };

  // Per DHCP kommen Adresse, Maske, Gateway und DNS vom Server: statische Werte entfallen.
  const gateway = input.dhcp ? '' : (input.gateway?.trim() ?? '');
  const dns = input.dhcp ? '' : (input.dns?.trim() ?? '');
  return ok(
    updateDevice(t, id, (d) => {
      const { gateway: _g, dns: _d, dhcp: _dhcp, ...rest } = d;
      return {
        ...rest,
        interfaces: d.interfaces.map((i, n) => {
          if (n !== 0) return i;
          const { ip: _ip, mask: _mask, ...base } = i;
          return input.dhcp ? base : { ...base, ...normalized(input.ip, input.mask) };
        }),
        ...(gateway ? { gateway } : {}),
        ...(dns ? { dns } : {}),
        ...(input.dhcp ? { dhcp: true } : {}),
      };
    }),
  );
}

/** Richtet den DHCP-Server-Dienst eines Rechners ein oder entfernt ihn (`null`). */
export function setDhcpServer(t: Topology, id: string, config: DhcpServerConfig | null): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (config) {
    const issue = checkDhcpServer(device, config);
    if (issue) return { ok: false, error: { code: issue.code as ErrorCode, params: issue.params, field: issue.field } };
  }
  return ok(
    updateDevice(t, id, (d) => {
      const { dhcpServer: existing, ...rest } = d;
      // Zusätzliche Bereiche und Reservierungen bleiben erhalten, wenn nur der Hauptbereich geändert wird.
      const scopes = config?.scopes ?? existing?.scopes;
      const reservations = config?.reservations ?? existing?.reservations;
      return config ? { ...rest, dhcpServer: normalizeDhcpServer({ ...config, ...(scopes ? { scopes } : {}), ...(reservations ? { reservations } : {}) }) } : rest;
    }),
  );
}

/** Feste Zuweisung im DHCP-Server: Das Gerät mit dieser MAC bekommt immer diese Adresse. */
export function addDhcpReservation(t: Topology, id: string, reservation: DhcpReservation): Result<Topology> {
  const device = getDevice(t, id);
  const config = device?.dhcpServer;
  if (!device || !config) return fail('serviceDisabled');
  const next = { ...config, reservations: [...(config.reservations ?? []), reservation] };
  const issue = checkDhcpServer(device, next);
  if (issue) return { ok: false, error: { code: issue.code as ErrorCode, params: issue.params, field: issue.field } };
  return ok(updateDevice(t, id, (d) => ({ ...d, dhcpServer: normalizeDhcpServer(next) })));
}

export function removeDhcpReservation(t: Topology, id: string, index: number): Result<Topology> {
  const config = getDevice(t, id)?.dhcpServer;
  if (!config?.reservations?.[index]) return fail('unknownRoute');
  const reservations = config.reservations.filter((_, i) => i !== index);
  return ok(
    updateDevice(t, id, (d) => {
      const { reservations: _r, ...rest } = config;
      return { ...d, dhcpServer: reservations.length ? { ...rest, reservations } : rest };
    }),
  );
}

export function addDhcpScope(t: Topology, id: string, scope: DhcpScope): Result<Topology> {
  const config = getDevice(t, id)?.dhcpServer;
  if (!config) return fail('serviceDisabled');
  const issue = checkDhcpScope(scope);
  if (issue) return { ok: false, error: { code: issue.code as ErrorCode, params: issue.params, field: issue.field } };
  const scopes = [...(config.scopes ?? []), normalizeScope(scope)];
  return ok(updateDevice(t, id, (d) => ({ ...d, dhcpServer: { ...config, scopes } })));
}

export function removeDhcpScope(t: Topology, id: string, index: number): Result<Topology> {
  const config = getDevice(t, id)?.dhcpServer;
  if (!config?.scopes?.[index]) return fail('unknownRoute');
  const scopes = config.scopes.filter((_, i) => i !== index);
  return ok(
    updateDevice(t, id, (d) => {
      const { scopes: _s, ...rest } = config;
      return { ...d, dhcpServer: scopes.length ? { ...rest, scopes } : rest };
    }),
  );
}

/** DHCP-Relay eines Router-Interfaces (auch Subinterface oder SVI) setzen (Server-IP) oder entfernen (""). */
export function setInterfaceRelay(t: Topology, id: string, index: number, server: string): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!hasRoutingTable(device.type)) return fail('notARouter');
  const value = server.trim();
  if (value && parseIp(value) === null) return { ok: false, error: { code: 'invalidIp', params: { value }, field: 'relay' } };
  const withRelay = <T extends { dhcpRelay?: string }>(item: T): T => {
    const { dhcpRelay: _r, ...base } = item;
    return (value ? { ...base, dhcpRelay: value } : base) as T;
  };
  const ref = decodeIface(index);
  if (ref.kind === 'sub') {
    if (!device.subinterfaces?.some((s) => s.parent === ref.port && s.vlan === ref.vlan)) return fail('unknownSubinterface');
    return ok(
      updateDevice(t, id, (d) => ({
        ...d,
        subinterfaces: (d.subinterfaces ?? []).map((s) => (s.parent === ref.port && s.vlan === ref.vlan ? withRelay(s) : s)),
      })),
    );
  }
  if (ref.kind === 'svi') {
    if (!device.svis?.some((s) => s.vlan === ref.vlan)) return fail('unknownSubinterface');
    return ok(updateDevice(t, id, (d) => ({ ...d, svis: (d.svis ?? []).map((s) => (s.vlan === ref.vlan ? withRelay(s) : s)) })));
  }
  if (!device.interfaces[index]) return fail('unknownInterface');
  return ok(updateDevice(t, id, (d) => ({ ...d, interfaces: d.interfaces.map((i) => (i.index === index ? withRelay(i) : i)) })));
}

// --- Router-on-a-Stick und Layer-3-Switch --------------------------------------

function checkAddress(ip: string, mask: string): TopologyError | null {
  if (ip.trim() && parseIp(ip) === null) return { code: 'invalidIp', params: { value: ip.trim() }, field: 'ip' };
  if (mask.trim() && parseMask(mask) === null) return { code: 'invalidMask', params: { value: mask.trim() }, field: 'mask' };
  if (ip.trim() && !mask.trim()) return { code: 'maskRequired', field: 'mask' };
  return null;
}

const validVlan = (vlan: number) => Number.isInteger(vlan) && vlan >= 1 && vlan <= 4094;

/** Subinterface eines Router-Anschlusses anlegen oder seine Adresse ändern (z.B. eth0.10). */
export function setSubinterface(t: Topology, id: string, parent: number, vlan: number, ip: string, mask: string): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!isRouterLike(device.type)) return fail('notARouter');
  if (!device.interfaces[parent]) return fail('unknownInterface');
  if (!validVlan(vlan)) return { ok: false, error: { code: 'invalidVlan', field: 'vlan' } };
  const issue = checkAddress(ip, mask);
  if (issue) return { ok: false, error: issue };
  const existing = device.subinterfaces ?? [];
  const old = existing.find((s) => s.parent === parent && s.vlan === vlan);
  const { ip: _ip, mask: _mask, ...rest } = old ?? { parent, vlan };
  const next: SubInterface = { ...rest, ...normalized(ip, mask) };
  const list = old
    ? existing.map((s) => (s === old ? next : s))
    : [...existing, next].sort((a, b) => a.parent - b.parent || a.vlan - b.vlan);
  return ok(updateDevice(t, id, (d) => ({ ...d, subinterfaces: list })));
}

// --- VXLAN ------------------------------------------------------------------------

export const MAX_VNIS = 32;
export const MAX_VTEP_PEERS = 16;

function vtepDevice(t: Topology, id: string): Result<Device> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (device.type !== 'l3switch') return fail('notAVtep');
  return ok(device);
}

const validVni = (vni: number) => Number.isInteger(vni) && vni >= 1 && vni <= MAX_VNI;

function withVxlan(d: Device, change: (c: VxlanConfig) => VxlanConfig): Device {
  const next = change(d.vxlan ?? { vnis: [] });
  const vnis = next.vnis.filter((v) => v.vlan !== undefined || v.peers.length).sort((a, b) => a.vni - b.vni);
  return vnis.length || next.source !== undefined ? { ...d, vxlan: { ...next, vnis } } : without(d, 'vxlan');
}

/** Absender der Tunnel («source-interface loopback0»); null entfernt. */
export function setVxlanSource(t: Topology, id: string, iface: number | null): Result<Topology> {
  const device = vtepDevice(t, id);
  if (!device.ok) return device;
  if (iface !== null && !logicalInterfaces(device.value).includes(iface)) return fail('unknownInterface');
  return ok(updateDevice(t, id, (d) => withVxlan(d, (c) => (iface === null ? without(c, 'source') : { ...c, source: iface }))));
}

/** VLAN einer VNI zuordnen («vn-segment 10010» im VLAN); null löst die Zuordnung. */
export function setVniVlan(t: Topology, id: string, vni: number, vlan: number | null): Result<Topology> {
  const device = vtepDevice(t, id);
  if (!device.ok) return device;
  if (!validVni(vni)) return fail('invalidVni', { max: MAX_VNI });
  if (vlan !== null && !validVlanId(vlan)) return fail('invalidVlan');
  const vnis = device.value.vxlan?.vnis ?? [];
  if (vlan !== null && vnis.some((v) => v.vlan === vlan && v.vni !== vni)) return fail('vlanHasVni', { vlan });
  if (!vnis.some((v) => v.vni === vni) && vnis.length >= MAX_VNIS) return fail('tooMany', { max: MAX_VNIS });
  return ok(
    updateDevice(t, id, (d) =>
      withVxlan(d, (c) => {
        const existing = c.vnis.find((v) => v.vni === vni) ?? { vni, peers: [] };
        const next = vlan === null ? without(existing, 'vlan') : { ...existing, vlan };
        return { ...c, vnis: [...c.vnis.filter((v) => v.vni !== vni), next] };
      }),
    ),
  );
}

/** Anderen VTEP für eine VNI eintragen («member vni 10010» / «peer-ip 10.255.0.2»). */
export function addVniPeer(t: Topology, id: string, vni: number, peer: string): Result<Topology> {
  const device = vtepDevice(t, id);
  if (!device.ok) return device;
  if (!validVni(vni)) return fail('invalidVni', { max: MAX_VNI });
  const ip = parseIp(peer.trim());
  if (ip === null) return { ok: false, error: { code: 'invalidIp', params: { value: peer }, field: 'peer' } };
  const vnis = device.value.vxlan?.vnis ?? [];
  const existing = vnis.find((v) => v.vni === vni);
  if (!existing && vnis.length >= MAX_VNIS) return fail('tooMany', { max: MAX_VNIS });
  if (existing?.peers.includes(formatIp(ip))) return ok(t);
  if ((existing?.peers.length ?? 0) >= MAX_VTEP_PEERS) return fail('tooMany', { max: MAX_VTEP_PEERS });
  return ok(
    updateDevice(t, id, (d) =>
      withVxlan(d, (c) => {
        const base = c.vnis.find((v) => v.vni === vni) ?? { vni, peers: [] };
        return { ...c, vnis: [...c.vnis.filter((v) => v.vni !== vni), { ...base, peers: [...base.peers, formatIp(ip)] }] };
      }),
    ),
  );
}

/** VTEP aus einer VNI entfernen; ohne Adresse alle («no member vni 10010»). */
export function removeVniPeer(t: Topology, id: string, vni: number, peer?: string): Result<Topology> {
  const device = vtepDevice(t, id);
  if (!device.ok) return device;
  const existing = device.value.vxlan?.vnis.find((v) => v.vni === vni);
  if (!existing) return fail('unknownVni', { vni });
  return ok(
    updateDevice(t, id, (d) =>
      withVxlan(d, (c) => ({ ...c, vnis: c.vnis.map((v) => (v.vni === vni ? { ...v, peers: peer === undefined ? [] : v.peers.filter((p) => p !== peer) } : v)) })),
    ),
  );
}

// --- VRF ----------------------------------------------------------------------------

/** Geräte mit VRFs (eigenen Routingtabellen). */
export function canVrf(type: DeviceType): boolean {
  return isRouterLike(type) || type === 'l3switch';
}

function vrfDevice(t: Topology, id: string): Result<Device> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!canVrf(device.type)) return fail('notARouter');
  return ok(device);
}

/** VRF anlegen («vrf definition KUNDE-A»); vorhandene bleibt unverändert. */
export function addVrf(t: Topology, id: string, name: string): Result<Topology> {
  const device = vrfDevice(t, id);
  if (!device.ok) return device;
  if (!VRF_NAME.test(name)) return fail('invalidVrfName', { value: name.slice(0, 40) });
  if (device.value.vrfs?.some((v) => v.name === name)) return ok(t);
  if ((device.value.vrfs?.length ?? 0) >= MAX_VRFS) return fail('tooMany', { max: MAX_VRFS });
  return ok(updateDevice(t, id, (d) => ({ ...d, vrfs: [...(d.vrfs ?? []), { name }] })));
}

/** VRF löschen: Ihre Anschlüsse fallen in die globale Tabelle zurück, ihre Routen verschwinden. */
export function removeVrf(t: Topology, id: string, name: string): Result<Topology> {
  const device = vrfDevice(t, id);
  if (!device.ok) return device;
  if (!device.value.vrfs?.some((v) => v.name === name)) return fail('unknownVrf', { name });
  const strip = <T extends { vrf?: string }>(x: T): T => (x.vrf === name ? (without(x, 'vrf') as T) : x);
  return ok(
    updateDevice(t, id, (d) => {
      const vrfs = (d.vrfs ?? []).filter((v) => v.name !== name);
      const next: Device = {
        ...d,
        interfaces: d.interfaces.map(strip),
        ...(d.subinterfaces ? { subinterfaces: d.subinterfaces.map(strip) } : {}),
        ...(d.svis ? { svis: d.svis.map(strip) } : {}),
        ...(d.loopbacks ? { loopbacks: d.loopbacks.map(strip) } : {}),
      };
      return vrfs.length ? { ...next, vrfs } : without(next, 'vrfs');
    }),
  );
}

/** Logisches Interface einer VRF zuordnen («vrf forwarding KUNDE-A»); null = globale Tabelle. */
export function setInterfaceVrf(t: Topology, id: string, index: number, name: string | null): Result<Topology> {
  const device = vrfDevice(t, id);
  if (!device.ok) return device;
  if (name !== null && !device.value.vrfs?.some((v) => v.name === name)) return fail('unknownVrf', { name });
  const ref = decodeIface(index);
  const apply = <T extends { vrf?: string }>(x: T): T => (name === null ? (without(x, 'vrf') as T) : { ...x, vrf: name });
  if (ref.kind === 'port') {
    if (!device.value.interfaces[ref.port]) return fail('unknownInterface');
    return ok(updateDevice(t, id, (d) => ({ ...d, interfaces: d.interfaces.map((i) => (i.index === ref.port ? apply(i) : i)) })));
  }
  if (ref.kind === 'sub') {
    if (!device.value.subinterfaces?.some((s) => s.parent === ref.port && s.vlan === ref.vlan)) return fail('unknownInterface');
    return ok(updateDevice(t, id, (d) => ({ ...d, subinterfaces: d.subinterfaces!.map((s) => (s.parent === ref.port && s.vlan === ref.vlan ? apply(s) : s)) })));
  }
  if (ref.kind === 'svi') {
    if (!device.value.svis?.some((s) => s.vlan === ref.vlan)) return fail('unknownInterface');
    return ok(updateDevice(t, id, (d) => ({ ...d, svis: d.svis!.map((s) => (s.vlan === ref.vlan ? apply(s) : s)) })));
  }
  if (!device.value.loopbacks?.some((l) => l.id === ref.id)) return fail('unknownInterface');
  return ok(updateDevice(t, id, (d) => ({ ...d, loopbacks: d.loopbacks!.map((l) => (l.id === ref.id ? apply(l) : l)) })));
}

/** Statische Route in einer VRF («ip route vrf KUNDE-A 0.0.0.0/0 10.1.1.2»). */
export function addVrfRoute(t: Topology, id: string, name: string, route: StaticRoute): Result<Topology> {
  const device = vrfDevice(t, id);
  if (!device.ok) return device;
  if (!device.value.vrfs?.some((v) => v.name === name)) return fail('unknownVrf', { name });
  const issue = checkStaticRoute(device.value, route, name);
  if (issue) return { ok: false, error: { code: issue.code as ErrorCode, params: issue.params, field: issue.field } };
  return ok(updateDevice(t, id, (d) => ({ ...d, vrfs: d.vrfs!.map((v) => (v.name === name ? { ...v, routes: [...(v.routes ?? []), normalizeRoute(route)] } : v)) })));
}

export function removeVrfRoute(t: Topology, id: string, name: string, index: number): Result<Topology> {
  const device = vrfDevice(t, id);
  if (!device.ok) return device;
  const vrf = device.value.vrfs?.find((v) => v.name === name);
  if (!vrf) return fail('unknownVrf', { name });
  if (!vrf.routes?.[index]) return fail('unknownRoute');
  return ok(
    updateDevice(t, id, (d) => ({
      ...d,
      vrfs: d.vrfs!.map((v) => {
        if (v.name !== name) return v;
        const routes = (v.routes ?? []).filter((_, i) => i !== index);
        return routes.length ? { ...v, routes } : without(v, 'routes');
      }),
    })),
  );
}

/** Geräte mit Loopback-Interfaces. */
export function canLoopback(type: DeviceType): boolean {
  return isRouterLike(type) || type === 'l3switch';
}

/** Loopback anlegen oder seine Adresse ändern («interface loopback0», «ip address 10.255.0.1/32»). */
export function setLoopback(t: Topology, id: string, n: number, ip: string, mask: string): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!canLoopback(device.type)) return fail('notARouter');
  if (!Number.isInteger(n) || n < 0 || n > MAX_LOOPBACK) return fail('unknownInterface');
  const issue = checkAddress(ip, mask);
  if (issue) return { ok: false, error: issue };
  const existing = device.loopbacks ?? [];
  const old = existing.find((l) => l.id === n);
  const { ip: _ip, mask: _mask, ...rest } = old ?? { id: n };
  const next: Loopback = { ...rest, ...normalized(ip, mask) };
  const list = old ? existing.map((l) => (l === old ? next : l)) : [...existing, next].sort((a, b) => a.id - b.id);
  return ok(updateDevice(t, id, (d) => ({ ...d, loopbacks: list })));
}

export function removeLoopback(t: Topology, id: string, n: number): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!device.loopbacks?.some((l) => l.id === n)) return fail('unknownInterface');
  const list = device.loopbacks.filter((l) => l.id !== n);
  return ok(updateDevice(t, id, (d) => (list.length ? { ...d, loopbacks: list } : without(d, 'loopbacks'))));
}

export function removeSubinterface(t: Topology, id: string, parent: number, vlan: number): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!device.subinterfaces?.some((s) => s.parent === parent && s.vlan === vlan)) return fail('unknownSubinterface');
  const list = device.subinterfaces.filter((s) => !(s.parent === parent && s.vlan === vlan));
  return ok(
    updateDevice(t, id, (d) => {
      const { subinterfaces: _s, ...rest } = d;
      return list.length ? { ...rest, subinterfaces: list } : rest;
    }),
  );
}

/**
 * VLAN-Interface anlegen oder seine Adresse ändern («interface vlan 10»): am
 * Layer-3-Switch als Gateway der VLANs, am Layer-2-Switch als Verwaltungsadresse (ohne Routing).
 */
export function setSvi(t: Topology, id: string, vlan: number, ip: string, mask: string): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (device.type !== 'l3switch' && device.type !== 'switch') return fail('notASwitch');
  if (!validVlan(vlan)) return { ok: false, error: { code: 'invalidVlan', field: 'vlan' } };
  const issue = checkAddress(ip, mask);
  if (issue) return { ok: false, error: issue };
  const existing = device.svis ?? [];
  const old = existing.find((s) => s.vlan === vlan);
  const { ip: _ip, mask: _mask, ...rest } = old ?? { vlan };
  const next: Svi = { ...rest, ...normalized(ip, mask) };
  const list = old ? existing.map((s) => (s === old ? next : s)) : [...existing, next].sort((a, b) => a.vlan - b.vlan);
  // Eine SVI legt ihr VLAN mit an, sonst bliebe sie stumm.
  return ok(updateDevice(t, id, (d) => ({ ...(vlanExists(d, vlan) ? d : withVlans(d, [vlan])), svis: list })));
}

export function removeSvi(t: Topology, id: string, vlan: number): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!device.svis?.some((s) => s.vlan === vlan)) return fail('unknownSubinterface');
  const list = device.svis.filter((s) => s.vlan !== vlan);
  return ok(
    updateDevice(t, id, (d) => {
      const { svis: _s, ...rest } = d;
      return list.length ? { ...rest, svis: list } : rest;
    }),
  );
}

/** Routing zwischen VLANs am Layer-3-Switch ein- oder ausschalten. */
/** Routing-Art eines Routers oder Layer-3-Switches setzen (auto, statisch, dynamisch). */
export function setRoutingMode(t: Topology, id: string, mode: RoutingMode): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!canAutoRoute(device.type)) return fail('notARouter');
  if (device.routingMode === mode) return ok(t);
  return ok(updateDevice(t, id, (d) => ({ ...d, routingMode: mode })));
}

export function setIpRouting(t: Topology, id: string, enabled: boolean): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (device.type !== 'l3switch') return fail('notASwitch');
  return ok(
    updateDevice(t, id, (d) => {
      const { ipRouting: _r, ...rest } = d;
      return enabled ? rest : { ...rest, ipRouting: false };
    }),
  );
}

// --- NAT ---------------------------------------------------------------------

/** Markiert ein Router-Interface als Internet-Seite: Ausgehendes erhält dessen Adresse (NAT). */
export function setInterfaceNat(t: Topology, id: string, index: number, nat: boolean): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!natCapable(device)) return fail('notARouter');
  if (!device.interfaces[index]) return fail('unknownInterface');
  return ok(
    updateDevice(t, id, (d) => ({
      ...d,
      interfaces: d.interfaces.map((i) => {
        if (i.index !== index) return i;
        const { nat: _n, ...base } = i;
        return nat ? { ...base, nat: true } : base;
      }),
    })),
  );
}

export function addPortForward(t: Topology, id: string, forward: PortForward): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!natCapable(device)) return fail('notARouter');
  const validPort = (p: number) => Number.isInteger(p) && p >= 1 && p <= 65535;
  if (!validPort(forward.port)) return { ok: false, error: { code: 'invalidPort', field: 'port' } };
  if (!validPort(forward.toPort)) return { ok: false, error: { code: 'invalidPort', field: 'toPort' } };
  if (parseIp(forward.to.trim()) === null) return { ok: false, error: { code: 'invalidIp', params: { value: forward.to }, field: 'to' } };
  const existing = device.portForwards ?? [];
  if (existing.some((f) => f.protocol === forward.protocol && f.port === forward.port)) {
    return { ok: false, error: { code: 'duplicateForward', params: { port: forward.port }, field: 'port' } };
  }
  const entry: PortForward = { protocol: forward.protocol, port: forward.port, to: forward.to.trim(), toPort: forward.toPort };
  return ok(updateDevice(t, id, (d) => ({ ...d, portForwards: [...existing, entry] })));
}

export function removePortForward(t: Topology, id: string, index: number): Result<Topology> {
  const device = getDevice(t, id);
  if (!device?.portForwards?.[index]) return fail('unknownRoute');
  const forwards = device.portForwards.filter((_, i) => i !== index);
  return ok(
    updateDevice(t, id, (d) => {
      const { portForwards: _p, ...rest } = d;
      return forwards.length ? { ...rest, portForwards: forwards } : rest;
    }),
  );
}

// --- DNS- und Webserver ------------------------------------------------------

function serverDevice(t: Topology, id: string): Result<Device> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!canHostServices(device.type)) return fail('notAServer');
  return ok(device);
}

export function setDnsServerEnabled(t: Topology, id: string, enabled: boolean): Result<Topology> {
  const device = serverDevice(t, id);
  if (!device.ok) return device;
  if (enabled === !!device.value.dnsServer) return ok(t);
  return ok(
    updateDevice(t, id, (d) => {
      const { dnsServer: _s, ...rest } = d;
      return enabled ? { ...rest, dnsServer: { records: [] } } : rest;
    }),
  );
}

export function addDnsRecord(t: Topology, id: string, record: DnsRecord): Result<Topology> {
  const device = serverDevice(t, id);
  if (!device.ok) return device;
  const config = device.value.dnsServer;
  if (!config) return fail('serviceDisabled');
  const issue = checkDnsRecord(config, record);
  if (issue) return { ok: false, error: { code: issue.code as ErrorCode, params: issue.params, field: issue.field } };
  return ok(updateDevice(t, id, (d) => ({ ...d, dnsServer: { ...config, records: [...config.records, normalizeRecord(record)] } })));
}

export function removeDnsRecord(t: Topology, id: string, index: number): Result<Topology> {
  const device = getDevice(t, id);
  if (!device?.dnsServer?.records[index]) return fail('unknownRecord');
  const records = device.dnsServer.records.filter((_, i) => i !== index);
  return ok(updateDevice(t, id, (d) => ({ ...d, dnsServer: { ...device.dnsServer!, records } })));
}

/** Weiterleitung für Namen ausserhalb der eigenen Zone (leer = keine). */
export function setDnsForwarder(t: Topology, id: string, address: string): Result<Topology> {
  const device = serverDevice(t, id);
  if (!device.ok) return device;
  const config = device.value.dnsServer;
  if (!config) return fail('serviceDisabled');
  const value = address.trim();
  if (value && parseIp(value) === null && parseIp6(value) === null) return { ok: false, error: { code: 'invalidIp', params: { value }, field: 'forwarder' } };
  const own = device.value.interfaces.some((i) => i.ip === value) || device.value.interfaces.some((i) => i.ipv6?.split('/')[0] === value);
  if (value && own) return { ok: false, error: { code: 'dnsForwarderSelf', field: 'forwarder' } };
  return ok(
    updateDevice(t, id, (d) => {
      const { forwarder: _f, ...rest } = config;
      return { ...d, dnsServer: value ? { ...rest, forwarder: value } : rest };
    }),
  );
}

/** Beim Einschalten erhält der Webserver eine Startseite, damit sofort etwas abrufbar ist. */
export function setWebServerEnabled(t: Topology, id: string, enabled: boolean, initial: WebFile[] = []): Result<Topology> {
  const device = serverDevice(t, id);
  if (!device.ok) return device;
  if (enabled === !!device.value.webServer) return ok(t);
  return ok(
    updateDevice(t, id, (d) => {
      const { webServer: _w, ...rest } = d;
      return enabled ? { ...rest, webServer: { files: initial.map((f) => ({ ...f })) } } : rest;
    }),
  );
}

/** Legt eine Seite an oder ersetzt sie; `previousPath` erlaubt das Umbenennen. */
export function saveWebFile(t: Topology, id: string, file: WebFile, previousPath?: string): Result<Topology> {
  const device = serverDevice(t, id);
  if (!device.ok) return device;
  const config = device.value.webServer;
  if (!config) return fail('serviceDisabled');
  const path = file.path.trim();
  if (!isValidPath(path)) return { ok: false, error: { code: 'invalidPath', params: { path }, field: 'path' } };
  if (path !== previousPath && config.files.some((f) => f.path === path)) {
    return { ok: false, error: { code: 'duplicatePath', params: { path }, field: 'path' } };
  }
  const others = config.files.filter((f) => f.path !== (previousPath ?? path));
  // Projektdateien bleiben klein: pro Datei und pro Webserver gibt es eine Obergrenze.
  const total = others.reduce((sum, f) => sum + f.content.length, 0) + file.content.length;
  if (file.content.length > MAX_WEB_FILE || total > MAX_WEB_TOTAL) {
    return { ok: false, error: { code: 'fileTooLarge', params: { max: Math.round(MAX_WEB_FILE / 1000) }, field: 'content' } };
  }
  const files = [...others, { path, content: file.content }].sort((a, b) => a.path.localeCompare(b.path));
  return ok(updateDevice(t, id, (d) => ({ ...d, webServer: { files } })));
}

export function removeWebFile(t: Topology, id: string, path: string): Result<Topology> {
  const device = getDevice(t, id);
  if (!device?.webServer?.files.some((f) => f.path === path)) return fail('unknownFile');
  const files = device.webServer.files.filter((f) => f.path !== path);
  return ok(updateDevice(t, id, (d) => ({ ...d, webServer: { files } })));
}

// --- E-Mail ------------------------------------------------------------------

export function setMailServerEnabled(t: Topology, id: string, enabled: boolean, domain = 'schule.example'): Result<Topology> {
  const device = serverDevice(t, id);
  if (!device.ok) return device;
  if (enabled === !!device.value.mailServer) return ok(t);
  return ok(
    updateDevice(t, id, (d) => {
      const { mailServer: _m, ...rest } = d;
      return enabled ? { ...rest, mailServer: { domain: normalizeName(domain), mailboxes: [] } } : rest;
    }),
  );
}

export function setMailDomain(t: Topology, id: string, domain: string): Result<Topology> {
  const device = getDevice(t, id);
  const config = device?.mailServer;
  if (!config) return fail('serviceDisabled');
  if (!isValidName(domain)) return { ok: false, error: { code: 'invalidDnsName', params: { value: domain }, field: 'domain' } };
  return ok(updateDevice(t, id, (d) => ({ ...d, mailServer: { ...config, domain: normalizeName(domain) } })));
}

export function addMailbox(t: Topology, id: string, mailbox: Mailbox): Result<Topology> {
  const config = getDevice(t, id)?.mailServer;
  if (!config) return fail('serviceDisabled');
  const issue = checkMailbox(config, mailbox);
  if (issue) return { ok: false, error: { code: issue.code as ErrorCode, params: issue.params, field: issue.field } };
  const entry = { user: mailbox.user.trim().toLowerCase(), password: mailbox.password };
  return ok(updateDevice(t, id, (d) => ({ ...d, mailServer: { ...config, mailboxes: [...config.mailboxes, entry] } })));
}

export function removeMailbox(t: Topology, id: string, user: string): Result<Topology> {
  const config = getDevice(t, id)?.mailServer;
  if (!config?.mailboxes.some((m) => m.user === user)) return fail('unknownMailbox');
  const mailboxes = config.mailboxes.filter((m) => m.user !== user);
  return ok(updateDevice(t, id, (d) => ({ ...d, mailServer: { ...config, mailboxes } })));
}

/** E-Mail-Konto eines Endgeräts einrichten oder entfernen (`null`). */
export function setMailAccount(t: Topology, id: string, account: MailAccount | null): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (DEVICE_SPECS[device.type].role !== 'endpoint') return fail('notAnEndpoint');
  if (account) {
    const issue = checkMailAccount(account);
    if (issue) return { ok: false, error: { code: issue.code as ErrorCode, params: issue.params, field: issue.field } };
  }
  return ok(
    updateDevice(t, id, (d) => {
      const { mailAccount: _a, ...rest } = d;
      if (!account) return rest;
      return {
        ...rest,
        mailAccount: {
          ...account,
          address: account.address.trim().toLowerCase(),
          smtpServer: account.smtpServer.trim().toLowerCase(),
          incomingServer: account.incomingServer.trim().toLowerCase(),
        },
      };
    }),
  );
}

export function addStaticRoute(t: Topology, id: string, route: StaticRoute): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!hasRoutingTable(device.type)) return fail('notARouter');
  const issue = checkStaticRoute(device, route);
  if (issue) return { ok: false, error: { code: issue.code as ErrorCode, params: issue.params, field: issue.field } };
  return ok(updateDevice(t, id, (d) => ({ ...d, routes: [...(d.routes ?? []), normalizeRoute(route)] })));
}

export function removeStaticRoute(t: Topology, id: string, index: number): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!device.routes?.[index]) return fail('unknownRoute');
  return ok(
    updateDevice(t, id, (d) => {
      const routes = (d.routes ?? []).filter((_, i) => i !== index);
      const { routes: _r, ...rest } = d;
      return routes.length ? { ...rest, routes } : rest;
    }),
  );
}

/** IP und Maske eines einzelnen Anschlusses, z.B. eines Router-Interfaces. */
export function setInterfaceAddress(t: Topology, id: string, index: number, ip: string, mask: string): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!device.interfaces[index]) return fail('unknownInterface');
  if (ip.trim() && parseIp(ip) === null) return { ok: false, error: { code: 'invalidIp', params: { value: ip.trim() }, field: 'ip' } };
  if (mask.trim() && parseMask(mask) === null) {
    return { ok: false, error: { code: 'invalidMask', params: { value: mask.trim() }, field: 'mask' } };
  }
  if (ip.trim() && !mask.trim()) return { ok: false, error: { code: 'maskRequired', field: 'mask' } };
  return ok(
    updateDevice(t, id, (d) => ({
      ...d,
      interfaces: d.interfaces.map((i) => {
        if (i.index !== index) return i;
        const { ip: _ip, mask: _mask, ...base } = i;
        return { ...base, ...normalized(ip, mask) };
      }),
    })),
  );
}

// --- Anschlüsse: Abschalten, Farbe, Beschreibung -------------------------------

export function setInterfaceShutdown(t: Topology, id: string, index: number, shutdown: boolean): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!device.interfaces[index]) return fail('unknownInterface');
  return ok(
    updatePort(t, id, index, (i) => {
      const { shutdown: _s, ...base } = i;
      return shutdown ? { ...base, shutdown: true } : base;
    }),
  );
}

export function setInterfaceColor(t: Topology, id: string, index: number, color: TagColor | null): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!device.interfaces[index]) return fail('unknownInterface');
  return ok(
    updatePort(t, id, index, (i) => {
      const { color: _c, ...base } = i;
      return color ? { ...base, color } : base;
    }),
  );
}

export function setInterfaceDescription(t: Topology, id: string, index: number, description: string): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!device.interfaces[index]) return fail('unknownInterface');
  const value = description.trim();
  if (value.length > 80) return fail('textTooLong', { max: 80 });
  return ok(
    updatePort(t, id, index, (i) => {
      const { description: _d, ...base } = i;
      return value ? { ...base, description: value } : base;
    }),
  );
}

/**
 * MAC-Adresse eines Anschlusses von Hand setzen (z.B. um eine doppelte MAC
 * vorzuführen). Leer = wieder die ab Werk vergebene Adresse. Gruppenadressen
 * (Multicast, Broadcast) und 00:00:00:00:00:00 sind als Absender ungültig.
 */
export function setInterfaceMac(t: Topology, id: string, index: number, raw: string): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!device.interfaces[index]) return fail('unknownInterface');
  const mac = raw.trim() ? normalizeMac(raw) : macFor(deviceSeq(id), index);
  if (!mac) return fail('invalidMac', { value: raw.trim() });
  if (mac === '00:00:00:00:00:00') return fail('macZero');
  if (parseInt(mac.slice(0, 2), 16) & 1) return fail('macGroup', { value: mac });
  return ok(updatePort(t, id, index, (i) => ({ ...i, mac })));
}

// --- WLAN ----------------------------------------------------------------------

export const CHANNELS: Record<'2.4' | '5', number[]> = {
  '2.4': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  '5': [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140],
};

function checkSsid(ssid: string): ErrorCode | null {
  const value = ssid.trim();
  return value.length < 1 || value.length > 32 ? 'invalidSsid' : null;
}

/** WPA2: leer (offen) oder 8–63 Zeichen. */
function checkWifiPassword(password: string | undefined): ErrorCode | null {
  if (!password) return null;
  return password.length < 8 || password.length > 63 ? 'invalidPassword' : null;
}

/** Funknetz eines Access Points einrichten oder ausschalten (`null`). */
export function setWlan(t: Topology, id: string, config: WlanConfig | null): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (device.type !== 'accesspoint') return fail('wirelessNeedsAccessPoint');
  if (config) {
    const ssid = checkSsid(config.ssid);
    if (ssid) return { ok: false, error: { code: ssid, field: 'ssid' } };
    const pw = checkWifiPassword(config.password);
    if (pw) return { ok: false, error: { code: pw, field: 'password' } };
    if (!CHANNELS[config.band]?.includes(config.channel)) return { ok: false, error: { code: 'invalidChannel', field: 'channel' } };
  }
  return ok(
    updateDevice(t, id, (d) => {
      const { wlan: _w, ...rest } = d;
      if (!config) return rest;
      const wlan: WlanConfig = { ssid: config.ssid.trim(), band: config.band, channel: config.channel };
      if (config.password) wlan.password = config.password;
      if (config.mesh) wlan.mesh = true;
      return { ...rest, wlan };
    }),
  );
}

/** WLAN-Profil eines Endgeräts (SSID und Passwort) setzen oder entfernen. */
export function setWifiClient(t: Topology, id: string, client: WifiClient | null): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (DEVICE_SPECS[device.type].role !== 'endpoint') return fail('notAnEndpoint');
  if (client) {
    const ssid = checkSsid(client.ssid);
    if (ssid) return { ok: false, error: { code: ssid, field: 'ssid' } };
  }
  return ok(
    updateDevice(t, id, (d) => {
      const { wifi: _w, ...rest } = d;
      if (!client) return rest;
      return { ...rest, wifi: { ssid: client.ssid.trim(), ...(client.password ? { password: client.password } : {}) } };
    }),
  );
}

// --- Stockwerke --------------------------------------------------------------

export function floorsOf(t: Topology): { name: string }[] {
  return t.floors?.length ? t.floors : [{ name: '' }];
}

export function addFloor(t: Topology, name: string): Result<Topology> {
  const value = name.trim();
  if (!value) return fail('nameEmpty');
  if (value.length > 40) return fail('nameTooLong', { max: 40 });
  const existing = t.floors?.length ? t.floors : [{ name: value === 'EG' ? 'UG' : 'EG' }];
  return ok({ ...t, floors: [...existing, { name: value }] });
}

export function renameFloor(t: Topology, index: number, name: string): Result<Topology> {
  const floors = floorsOf(t);
  if (!floors[index]) return fail('unknownFloor');
  const value = name.trim();
  if (!value) return fail('nameEmpty');
  if (value.length > 40) return fail('nameTooLong', { max: 40 });
  return ok({ ...t, floors: floors.map((f, i) => (i === index ? { name: value } : f)) });
}

/** Entfernt ein Stockwerk; Geräte und Bereiche darauf rutschen ins darunterliegende. */
export function removeFloor(t: Topology, index: number): Result<Topology> {
  const floors = floorsOf(t);
  if (!floors[index]) return fail('unknownFloor');
  if (floors.length <= 1) return fail('lastFloor');
  const shift = (floor: number | undefined) => {
    const f = floor ?? 0;
    return f > index ? f - 1 : f === index ? Math.max(0, index - 1) : f;
  };
  const rest = floors.filter((_, i) => i !== index);
  return ok({
    ...t,
    floors: rest,
    devices: t.devices.map((d) => {
      const { floor: _f, ...base } = d;
      const f = shift(d.floor);
      return f ? { ...base, floor: f } : base;
    }),
    areas: t.areas?.map((a) => (a.floor === undefined ? a : { ...a, floor: shift(a.floor) })),
  });
}

export function setDeviceFloor(t: Topology, id: string, floor: number): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!floorsOf(t)[floor]) return fail('unknownFloor');
  return ok(
    updateDevice(t, id, (d) => {
      const { floor: _f, ...rest } = d;
      return floor ? { ...rest, floor } : rest;
    }),
  );
}

// --- Dokumentationsmodus: Bereiche ---------------------------------------------

/** Höchstlänge des Texts eines Bereichs bzw. Textfelds. */
export const MAX_NOTE = 4000;

export function addArea(t: Topology, area: Omit<DocArea, 'id'>): Result<{ topology: Topology; id: string }> {
  const id = `a${t.nextId}`;
  const checked = checkArea({ ...area, id });
  if (!checked.ok) return checked;
  return ok({ topology: { ...t, areas: [...(t.areas ?? []), checked.value], nextId: t.nextId + 1 }, id });
}

function checkArea(area: DocArea): Result<DocArea> {
  if (area.title.length > 80) return fail('textTooLong', { max: 80 });
  if ((area.note ?? '').length > MAX_NOTE) return fail('textTooLong', { max: MAX_NOTE });
  if (area.vlan !== undefined && (!Number.isInteger(area.vlan) || area.vlan < 1 || area.vlan > 4094)) return fail('invalidVlan');
  const clean: DocArea = {
    id: area.id,
    ...(area.kind === 'rack' || area.kind === 'note' ? { kind: area.kind } : {}),
    title: area.title,
    color: area.color,
    x: Math.round(area.x),
    y: Math.round(area.y),
    width: Math.max(40, Math.round(area.width)),
    height: Math.max(40, Math.round(area.height)),
  };
  if (area.network?.trim()) clean.network = area.network.trim();
  if (area.vlan !== undefined) clean.vlan = area.vlan;
  if (area.note?.trim()) clean.note = area.note;
  if (area.floor !== undefined) clean.floor = area.floor;
  if (area.public) clean.public = true;
  return ok(clean);
}

export function updateArea(t: Topology, id: string, change: Partial<Omit<DocArea, 'id'>>): Result<Topology> {
  const area = t.areas?.find((a) => a.id === id);
  if (!area) return fail('unknownArea');
  const merged: DocArea = { ...area, ...change, id };
  for (const key of Object.keys(change) as (keyof DocArea)[]) {
    if (change[key as keyof typeof change] === undefined) delete merged[key];
  }
  const checked = checkArea(merged);
  if (!checked.ok) return checked;
  const next = { ...t, areas: t.areas!.map((a) => (a.id === id ? checked.value : a)) };
  // Ein verschobenes Rack nimmt seine Geräte mit.
  return ok(area.kind === 'rack' ? arrangeRack(next, id) : next);
}

export function removeArea(t: Topology, id: string): Result<Topology> {
  if (!t.areas?.some((a) => a.id === id)) return fail('unknownArea');
  const areas = t.areas.filter((a) => a.id !== id);
  const { areas: _a, ...rest } = t;
  // Geräte eines entfernten Racks bleiben an ihrem Platz, sind aber nicht mehr eingebaut.
  const devices = t.devices.map((d) => {
    if (d.rack !== id) return d;
    const { rack: _r, ...base } = d;
    return base;
  });
  return ok(areas.length ? { ...rest, devices, areas } : { ...rest, devices });
}

// --- Befehlszeile ---------------------------------------------------------------

export function setCliConfig(t: Topology, id: string, cli: CliConfig): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  for (const user of cli.users ?? []) {
    if (!/^[A-Za-z0-9._-]{1,32}$/.test(user.name)) return fail('invalidUser', { name: user.name });
    if (!user.password || user.password.length > 64) return fail('passwordRequired');
  }
  if ((cli.banner ?? '').length > 500) return fail('textTooLong', { max: 500 });
  const clean: CliConfig = {};
  if (cli.ssh) clean.ssh = true;
  if (cli.users?.length) clean.users = cli.users.map((u) => ({ name: u.name, password: u.password }));
  if (cli.enableSecret) clean.enableSecret = cli.enableSecret;
  if (cli.banner) clean.banner = cli.banner;
  return ok(
    updateDevice(t, id, (d) => {
      const { cli: _c, ...rest } = d;
      return Object.keys(clean).length ? { ...rest, cli: clean } : rest;
    }),
  );
}

/** Name eines VLANs am Switch setzen oder entfernen (""). */
export function setVlanName(t: Topology, id: string, vlan: number, name: string): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!isSwitchType(device.type)) return fail('notASwitch');
  if (!Number.isInteger(vlan) || vlan < 1 || vlan > 4094) return fail('invalidVlan');
  const value = name.trim();
  if (value.length > 32) return fail('textTooLong', { max: 32 });
  const list = (device.vlanNames ?? []).filter((v) => v.vlan !== vlan);
  if (value) list.push({ vlan, name: value });
  list.sort((a, b) => a.vlan - b.vlan);
  return ok(
    updateDevice(t, id, (d) => {
      const { vlanNames: _v, ...rest } = value && !vlanExists(d, vlan) ? withVlans(d, [vlan]) : d;
      return list.length ? { ...rest, vlanNames: list } : rest;
    }),
  );
}

// --- SFP-Module ------------------------------------------------------------------

/** Modul in einen bestimmten SFP-Einschub stecken oder entfernen (`null`). */
export function setSfpModule(t: Topology, id: string, index: number, module: SfpModule | null): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  const iface = device.interfaces[index];
  if (!iface) return fail('unknownInterface');
  if (!iface.sfpSlot) return fail('notAnSfpSlot');
  return ok(
    updatePort(t, id, index, (i) => {
      const { sfp: _s, ...base } = i;
      return module ? { ...base, sfp: module } : base;
    }),
  );
}

export const MAX_SFP_SLOTS = 8;

/** Geräte, die SFP-Einschübe haben können (Switches, Router, Firewall). */
export function canHaveSfp(type: DeviceType): boolean {
  return type === 'switch' || type === 'l3switch' || type === 'router' || type === 'firewall';
}

/**
 * Anzahl SFP-Einschübe ändern (0 bis 8). Neue Einschübe kommen hinten dazu;
 * entfernt werden nur leere, nicht verkabelte Einschübe von hinten.
 */
export function setSfpSlotCount(t: Topology, id: string, count: number): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!canHaveSfp(device.type)) return fail('notAnSfpSlot');
  if (!Number.isInteger(count) || count < 0 || count > MAX_SFP_SLOTS) return fail('interfaceCountOutOfRange', { min: 0, max: MAX_SFP_SLOTS });
  const slots = device.interfaces.filter((i) => i.sfpSlot);
  if (count === slots.length) return ok(t);
  if (count > slots.length) {
    const used = new Set(device.interfaces.map((i) => i.mac));
    const seq = deviceSeq(id);
    let n = 0;
    const added: NetInterface[] = [];
    for (let k = slots.length; k < count; k++) {
      while (used.has(macFor(seq, n))) n++;
      used.add(macFor(seq, n));
      added.push({ index: device.interfaces.length + added.length, mac: macFor(seq, n), sfpSlot: true });
    }
    return ok(updateDevice(t, id, (d) => ({ ...d, interfaces: [...d.interfaces, ...added] })));
  }
  // Nur von hinten entfernen, damit die Nummern der anderen Anschlüsse bleiben.
  const last = device.interfaces.length - 1;
  const remove = slots.slice(count);
  const trailing = remove.every((s, k) => s.index === last - (remove.length - 1 - k));
  const busy = remove.find((s) => s.sfp || cableAt(t, { device: id, iface: s.index }));
  if (busy || !trailing) return fail('interfaceConnected', { device: device.name, index: (busy ?? remove[0]!).index });
  const gone = new Set(remove.map((s) => s.index));
  return ok(updateDevice(t, id, (d) => ({ ...d, interfaces: d.interfaces.filter((i) => !gone.has(i.index)) })));
}

/** Modul in den ersten leeren SFP-Einschub stecken (aus der Palette); fehlt einer, wird ein Einschub ergänzt. */
export function insertSfpModule(t: Topology, id: string, module: SfpModule): Result<{ topology: Topology; index: number }> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  let slot = device.interfaces.find((i) => i.sfpSlot && !i.sfp);
  if (!slot && canHaveSfp(device.type)) {
    const grown = setSfpSlotCount(t, id, device.interfaces.filter((i) => i.sfpSlot).length + 1);
    if (grown.ok) {
      t = grown.value;
      slot = getDevice(t, id)!.interfaces.find((i) => i.sfpSlot && !i.sfp);
    }
  }
  if (!slot) return fail('noFreeSfpSlot', { device: device.name });
  const next = setSfpModule(t, id, slot.index, module);
  return next.ok ? ok({ topology: next.value, index: slot.index }) : next;
}

// --- Racks -----------------------------------------------------------------------

/** Höhe einer Höheneinheit auf der Zeichenfläche und Kopfzeile des Racks. */
export const RACK_UNIT = 74;
export const RACK_HEADER = 44;

/** Geräte eines Racks von oben nach unten anordnen; das Rack wächst bei Bedarf mit. */
export function arrangeRack(t: Topology, rackId: string): Topology {
  const rack = t.areas?.find((a) => a.id === rackId && a.kind === 'rack');
  if (!rack) return t;
  const members = t.devices.filter((d) => d.rack === rackId).sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  const height = Math.max(rack.height, RACK_HEADER + members.length * RACK_UNIT + 20);
  const slot = new Map(members.map((d, i) => [d.id, i]));
  return {
    ...t,
    areas: t.areas!.map((a) => (a.id === rackId ? { ...a, height } : a)),
    devices: t.devices.map((d) => {
      const i = slot.get(d.id);
      if (i === undefined) return d;
      const position = { x: Math.round(rack.x + rack.width / 2), y: Math.round(rack.y + RACK_HEADER + i * RACK_UNIT + RACK_UNIT / 2) };
      return { ...d, position, ...(rack.floor !== undefined && rack.floor > 0 ? { floor: rack.floor } : {}) };
    }),
  };
}

/**
 * Gerät in ein Rack einbauen oder ausbauen (`null`). Ohne `keepOrder` kommt es
 * zuunterst; mit `keepOrder` (beim Ablegen per Maus) zählt seine Höhe.
 */
export function setDeviceRack(t: Topology, id: string, rackId: string | null, keepOrder = false): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (rackId === null) {
    if (!device.rack) return ok(t);
    const previous = device.rack;
    const without = updateDevice(t, id, (d) => {
      const { rack: _r, ...rest } = d;
      return rest;
    });
    return ok(arrangeRack(without, previous));
  }
  if (!isRackable(device.type)) return fail('notRackable');
  const rack = t.areas?.find((a) => a.id === rackId);
  if (!rack || rack.kind !== 'rack') return fail('notARack');
  const bottom = { x: device.position.x, y: rack.y + rack.height + 10_000 };
  let next = updateDevice(t, id, (d) => ({ ...d, rack: rackId, ...(keepOrder || d.rack === rackId ? {} : { position: bottom }) }));
  if (device.rack && device.rack !== rackId) next = arrangeRack(next, device.rack);
  return ok(arrangeRack(next, rackId));
}

/** Rack, dessen Fläche den Punkt enthält (für Ziehen und Ablegen). */
export function rackAt(t: Topology, x: number, y: number, floor?: number): DocArea | undefined {
  return t.areas?.find(
    (a) =>
      a.kind === 'rack' &&
      (floor === undefined || a.floor === undefined || a.floor === floor) &&
      x >= a.x && x <= a.x + a.width && y >= a.y && y <= a.y + a.height,
  );
}

// --- Neue Gerätefunktionen (v0.4) ----------------------------------------------

function changePort(t: Topology, id: string, index: number, change: (i: NetInterface) => NetInterface): Topology {
  return updateDevice(t, id, (d) => ({ ...d, interfaces: d.interfaces.map((i) => (i.index === index ? change(i) : i)) }));
}

// --- IPv6 ------------------------------------------------------------------------

/** IP-Version des Projekts (nur IPv4, beides, nur IPv6). */
export function setIpMode(t: Topology, mode: IpMode): Result<Topology> {
  if ((t.ipMode ?? 'ipv4') === mode) return ok(t);
  if (mode === 'ipv4') return ok(without(t, 'ipMode'));
  return ok({ ...t, ipMode: mode });
}

/** Unicast-Adresse, die man einem Anschluss geben darf (nicht ::, ::1, Multicast, Link-Local). */
function checkUnicast6(text: string, field: string): Result<{ address: bigint; prefix: number }> {
  const parsed = parseCidr6(text);
  const bad = { ok: false as const, error: { code: 'invalidIp6' as ErrorCode, params: { value: text.trim() }, field } };
  if (!parsed) return bad;
  const { address } = parsed;
  if (isUnspecified6(address) || isLoopback6(address) || isMulticast6(address) || isLinkLocal6(address)) return bad;
  return ok(parsed);
}

/** IPv6-Adresse eines Anschlusses («2001:db8:1::1/64»); leer = keine. */
export function setInterfaceIpv6(t: Topology, id: string, index: number, text: string): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!hasLink6(device, index)) return fail('unknownInterface');
  let value = '';
  if (text.trim()) {
    const checked = checkUnicast6(text, 'ipv6');
    if (!checked.ok) return checked;
    value = formatCidr6(checked.value.address, checked.value.prefix);
  }
  return ok(updateLink6(t, id, index, 'ipv6', value || undefined));
}

/** Gibt es diesen IPv6-Anschluss? Physischer Port oder (Layer-3-Switch) VLAN-Interface. */
function hasLink6(device: Device, index: number): boolean {
  const ref = decodeIface(index);
  if (ref.kind === 'svi') return device.type === 'l3switch' && !!device.svis?.some((s) => s.vlan === ref.vlan);
  return ref.kind === 'port' && !!device.interfaces[index];
}

/** Ein IPv6-Feld eines Ports oder SVIs setzen (undefined = entfernen). */
function updateLink6<K extends 'ipv6' | 'dhcp6' | 'dns6'>(t: Topology, id: string, index: number, key: K, value: (K extends 'dhcp6' ? true : string) | undefined): Topology {
  const ref = decodeIface(index);
  const apply = <T extends Partial<Record<'ipv6' | 'dhcp6' | 'dns6', unknown>>>(item: T): T => (value === undefined ? (without(item, key) as T) : { ...item, [key]: value });
  return updateDevice(t, id, (d) =>
    ref.kind === 'svi' ? { ...d, svis: (d.svis ?? []).map((s) => (s.vlan === ref.vlan ? apply(s) : s)) } : { ...d, interfaces: d.interfaces.map((i) => (i.index === index ? apply(i) : i)) },
  );
}

/** Router/Internet-Box: in diesem Netz IPv6-Adressen per DHCPv6 vergeben. */
export function setInterfaceDhcp6(t: Topology, id: string, index: number, enabled: boolean): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!hasRoutingTable(device.type)) return fail('notARouter');
  if (!hasLink6(device, index)) return fail('unknownInterface');
  return ok(updateLink6(t, id, index, 'dhcp6', enabled ? true : undefined));
}

export interface Host6Input {
  /** Automatisch (SLAAC oder DHCPv6). */
  auto: boolean;
  address?: string;
  gateway?: string;
  /** DNS-Server über IPv6 (nur bei fester Adresse; automatisch kommt er vom Router). */
  dns?: string;
}

/** Unicast-Adresse eines DNS-Servers (IPv6), vereinheitlicht; null bei leerer Eingabe. */
function checkDns6(text: string | undefined, field: string): Result<string | null> {
  if (!text?.trim()) return ok(null);
  const value = parseIp6(text);
  if (value === null || isMulticast6(value) || isUnspecified6(value)) return { ok: false, error: { code: 'invalidIp6', params: { value: text.trim() }, field } };
  return ok(formatIp6(value));
}

/** Router: IPv6-DNS-Server, den ein Netz im Router Advertisement (RDNSS) und per DHCPv6 erhält. */
export function setInterfaceDns6(t: Topology, id: string, index: number, dns: string): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!hasRoutingTable(device.type)) return fail('notARouter');
  if (!hasLink6(device, index)) return fail('unknownInterface');
  const checked = checkDns6(dns, 'dns6');
  if (!checked.ok) return checked;
  return ok(updateLink6(t, id, index, 'dns6', checked.value ?? undefined));
}

/** IPv6 eines Endgeräts: automatisch oder feste Adresse mit Standardgateway. */
export function configureHost6(t: Topology, id: string, input: Host6Input): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (DEVICE_SPECS[device.type].role !== 'endpoint') return fail('notAnEndpoint');
  let address = '';
  let gateway = '';
  let dns = '';
  if (!input.auto) {
    const checkedDns = checkDns6(input.dns, 'dns6');
    if (!checkedDns.ok) return checkedDns;
    dns = checkedDns.value ?? '';
    if (input.address?.trim()) {
      const checked = checkUnicast6(input.address, 'ipv6');
      if (!checked.ok) return checked;
      address = formatCidr6(checked.value.address, checked.value.prefix);
    }
    if (input.gateway?.trim()) {
      const g = parseIp6(input.gateway);
      if (g === null || isMulticast6(g) || isUnspecified6(g)) return { ok: false, error: { code: 'invalidIp6', params: { value: input.gateway.trim() }, field: 'gateway6' } };
      gateway = formatIp6(g);
    }
  }
  return ok(
    updateDevice(t, id, (d) => {
      const { ipv6Auto: _a, gateway6: _g, dns6: _d, ...rest } = d;
      return {
        ...rest,
        interfaces: d.interfaces.map((i, n) => (n !== 0 ? i : address ? { ...i, ipv6: address } : without(i, 'ipv6'))),
        ...(input.auto ? { ipv6Auto: true } : {}),
        ...(gateway ? { gateway6: gateway } : {}),
        ...(dns ? { dns6: dns } : {}),
      };
    }),
  );
}

/** Prüft eine statische IPv6-Route und bringt sie in die Normalform. */
export function checkStaticRoute6(device: Device, route: StaticRoute6): Result<StaticRoute6> {
  const net = parseCidr6(route.network);
  if (!net || isMulticast6(net.address)) return { ok: false, error: { code: 'invalidIp6', params: { value: route.network.trim() }, field: 'network' } };
  if (networkOf6(net.address, net.prefix) !== net.address) return { ok: false, error: { code: 'networkHasHostBits', params: { value: formatCidr6(net.address, net.prefix), suggestion: formatCidr6(networkOf6(net.address, net.prefix), net.prefix) }, field: 'network' } };
  let gateway: string | undefined;
  if (route.gateway?.trim()) {
    const g = parseIp6(route.gateway);
    if (g === null || isMulticast6(g) || isUnspecified6(g)) return { ok: false, error: { code: 'invalidIp6', params: { value: route.gateway.trim() }, field: 'gateway' } };
    if (isLinkLocal6(g) && route.iface === undefined) return { ok: false, error: { code: 'ipv6Link', field: 'iface' } };
    gateway = formatIp6(g);
  }
  if (!gateway && route.iface === undefined) return { ok: false, error: { code: 'routeNeedsTarget', field: 'gateway' } };
  if (route.iface !== undefined && !hasLink6(device, route.iface)) return fail('unknownInterface');
  const network = formatCidr6(net.address, net.prefix);
  if ((device.routes6 ?? []).some((r) => r.network === network)) return { ok: false, error: { code: 'duplicateRoute', params: { net: network }, field: 'network' } };
  return ok({ network, ...(gateway ? { gateway } : {}), ...(route.iface !== undefined ? { iface: route.iface } : {}) });
}

export function addStaticRoute6(t: Topology, id: string, route: StaticRoute6): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!hasRoutingTable(device.type)) return fail('notARouter');
  const checked = checkStaticRoute6(device, route);
  if (!checked.ok) return checked;
  return ok(updateDevice(t, id, (d) => ({ ...d, routes6: [...(d.routes6 ?? []), checked.value] })));
}

export function removeStaticRoute6(t: Topology, id: string, index: number): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!device.routes6?.[index]) return fail('unknownRoute');
  return ok(
    updateDevice(t, id, (d) => {
      const routes6 = (d.routes6 ?? []).filter((_, i) => i !== index);
      return routes6.length ? { ...d, routes6 } : without(d, 'routes6');
    }),
  );
}

/** Internet-Box: DS-Lite mit der IPv6-Adresse des AFTR beim Provider; null = aus. */
export function setDsLite(t: Topology, id: string, aftr: string | null): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (device.type !== 'cpe') return fail('notARouter');
  if (aftr === null) return ok(updateDevice(t, id, (d) => without(d, 'dsLite')));
  const a = parseIp6(aftr);
  if (a === null || isMulticast6(a) || isLinkLocal6(a) || isUnspecified6(a)) return { ok: false, error: { code: 'invalidIp6', params: { value: aftr.trim() }, field: 'aftr' } };
  return ok(updateDevice(t, id, (d) => ({ ...d, dsLite: { aftr: formatIp6(a) } })));
}

/** Internet (Provider): als AFTR für DS-Lite arbeiten. */
export function setAftr(t: Topology, id: string, enabled: boolean): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (device.type !== 'internet') return fail('notARouter');
  return ok(updateDevice(t, id, (d) => (enabled ? { ...d, aftr: true } : without(d, 'aftr'))));
}

// --- Firewall und VPN -------------------------------------------------------------

/** Geräte mit Firewall: Router, Internet-Box und Endgeräte (ausser Client-Gruppen). */
export function canFirewall(type: DeviceType): boolean {
  return isRouterLike(type) || type === 'cpe' || (DEVICE_SPECS[type].role === 'endpoint' && type !== 'clientgroup');
}

/** Firewall eines Geräts setzen (ganze Konfiguration); null = keine Firewall. */
export function setFirewall(t: Topology, id: string, config: FirewallConfig | null): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!canFirewall(device.type)) return fail('notFirewallCapable');
  if (config === null) return ok(updateDevice(t, id, (d) => without(d, 'firewall')));
  const checked = checkFirewall(config, device.interfaces.length);
  if (!checked.ok) return { ok: false, error: checked.error };
  return ok(updateDevice(t, id, (d) => ({ ...d, firewall: checked.value })));
}

/** Geräte mit Zugriffslisten (ACL) an den Ports: Switches. */
export function canAccessList(type: DeviceType): boolean {
  return isSwitchType(type);
}

/** Zugriffsliste anlegen oder ersetzen (gleicher Name); `rules: null` löscht sie. Zuweisungen an Ports bleiben stehen. */
export function setAccessList(t: Topology, id: string, name: string, rules: AccessList['rules'] | null): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!canAccessList(device.type)) return fail('notAclCapable');
  const others = (device.acls ?? []).filter((a) => a.name !== name);
  if (rules === null) {
    if (others.length === (device.acls ?? []).length) return fail('unknownAcl', { name });
    return ok(updateDevice(t, id, (d) => (others.length ? { ...d, acls: others } : without(d, 'acls'))));
  }
  const checked = checkAccessList({ name, rules });
  if (!checked.ok) return { ok: false, error: checked.error };
  const exists = others.length !== (device.acls ?? []).length;
  if (!exists && others.length >= MAX_ACLS) return fail('tooMany', { max: MAX_ACLS });
  const acls = exists ? (device.acls ?? []).map((a) => (a.name === name ? checked.value : a)) : [...others, checked.value];
  return ok(updateDevice(t, id, (d) => ({ ...d, acls })));
}

/** Zugriffsliste einem Port für eingehende Pakete zuweisen; null entfernt die Zuweisung. */
export function setPortAccessList(t: Topology, id: string, iface: number, name: string | null): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!canAccessList(device.type)) return fail('notAclCapable');
  if (!device.interfaces[iface]) return fail('unknownInterface');
  if (name !== null && !/^[A-Za-z0-9_-]{1,32}$/.test(name)) return { ok: false, error: { code: 'invalidAclName', field: 'name', params: { value: name.slice(0, 40) } } };
  return ok(
    updateDevice(t, id, (d) => ({
      ...d,
      interfaces: d.interfaces.map((i) => (i.index !== iface ? i : name === null ? without(i, 'aclIn') : { ...i, aclIn: name })),
    })),
  );
}

export function addVpnTunnel(t: Topology, id: string, tunnel: VpnTunnel): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!isRouterLike(device.type)) return fail('notARouter');
  if ((device.vpn?.length ?? 0) >= MAX_VPN_TUNNELS) return fail('tooMany', { max: MAX_VPN_TUNNELS });
  const checked = checkVpnTunnel(tunnel, device.vpn ?? []);
  if (!checked.ok) return { ok: false, error: checked.error };
  return ok(updateDevice(t, id, (d) => ({ ...d, vpn: [...(d.vpn ?? []), checked.value] })));
}

export function removeVpnTunnel(t: Topology, id: string, index: number): Result<Topology> {
  const device = getDevice(t, id);
  if (!device?.vpn?.[index]) return fail('unknownDevice');
  return ok(
    updateDevice(t, id, (d) => {
      const vpn = (d.vpn ?? []).filter((_, i) => i !== index);
      return vpn.length ? { ...d, vpn } : without(d, 'vpn');
    }),
  );
}

function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const { [key]: _removed, ...rest } = value;
  return rest;
}

/** Router: Anschluss zwischen Ethernet und seriell umstellen (nur ohne Kabel). */
export function setPortSerial(t: Topology, id: string, index: number, serial: boolean): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (device.type !== 'router') return fail('notSerialCapable');
  const port = device.interfaces[index];
  if (!port) return fail('unknownInterface');
  if (port.sfpSlot) return fail('notSerialCapable');
  if (!!port.serial === serial) return ok(t);
  if (cableAt(t, { device: id, iface: index })) return fail('interfaceConnected', { device: device.name, index });
  return ok(
    changePort(t, id, index, (i) => {
      const base = without(without(i, 'serial'), 'encapsulation');
      // Serielle Leitungen kennen kein NAT-Flag für Ethernet-Heimrouter nicht – Adresse bleibt erhalten.
      return serial ? { ...base, serial: true } : base;
    }),
  );
}

export function setEncapsulation(t: Topology, id: string, index: number, encapsulation: SerialEncapsulation): Result<Topology> {
  const device = getDevice(t, id);
  const port = device?.interfaces[index];
  if (!device || !port) return fail('unknownInterface');
  if (!port.serial) return fail('notSerialCapable');
  return ok(changePort(t, id, index, (i) => (encapsulation === 'hdlc' ? without(i, 'encapsulation') : { ...i, encapsulation })));
}

export function setOspfCost(t: Topology, id: string, index: number, cost: number | null): Result<Topology> {
  const device = getDevice(t, id);
  if (!device?.interfaces[index]) return fail('unknownInterface');
  if (cost !== null && (!Number.isInteger(cost) || cost < 1 || cost > 65535)) return fail('invalidCost');
  return ok(changePort(t, id, index, (i) => (cost === null || cost === 10 ? without(i, 'ospfCost') : { ...i, ospfCost: cost })));
}

export function setGroupSize(t: Topology, id: string, size: number): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (device.type !== 'clientgroup') return fail('invalidGroupSize');
  if (!Number.isInteger(size) || size < 2 || size > MAX_GROUP_SIZE) return fail('invalidGroupSize', { max: MAX_GROUP_SIZE });
  return ok(updateDevice(t, id, (d) => ({ ...d, groupSize: size })));
}

export function setModemKind(t: Topology, id: string, kind: ModemKind | null): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (device.type !== 'modem' && device.type !== 'cpe') return fail('notAModem');
  return ok(updateDevice(t, id, (d) => (kind ? { ...d, modem: { kind } } : without(d, 'modem'))));
}

export function addStaticNat(t: Topology, id: string, rule: StaticNat): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!natCapable(device)) return fail('notARouter');
  const inside = rule.inside.trim();
  const outside = rule.outside.trim();
  if (parseIp(inside) === null) return { ok: false, error: { code: 'invalidIp', params: { value: inside }, field: 'inside' } };
  if (parseIp(outside) === null) return { ok: false, error: { code: 'invalidIp', params: { value: outside }, field: 'outside' } };
  const list = device.staticNat ?? [];
  // Eine innere Adresse hat höchstens eine Quell-Übersetzung, eine äussere höchstens ein Ziel.
  const snat = (r: StaticNat) => r.kind !== 'dnat';
  const dnat = (r: StaticNat) => r.kind !== 'snat';
  const clash = list.some((r) => (snat(r) && snat(rule) && r.inside === inside) || (dnat(r) && dnat(rule) && r.outside === outside) || (r.inside === inside && r.outside === outside));
  if (clash) return { ok: false, error: { code: 'duplicateNat', field: 'inside' } };
  return ok(updateDevice(t, id, (d) => ({ ...d, staticNat: [...list, { inside, outside, ...(rule.kind ? { kind: rule.kind } : {}) }] })));
}

export function removeStaticNat(t: Topology, id: string, index: number): Result<Topology> {
  const device = getDevice(t, id);
  if (!device?.staticNat?.[index]) return fail('unknownRoute');
  const list = device.staticNat.filter((_, i) => i !== index);
  return ok(updateDevice(t, id, (d) => (list.length ? { ...d, staticNat: list } : without(d, 'staticNat'))));
}

/** Provider: CGNAT pro Kundenanschluss und die öffentliche Adresse dafür. */
export function setCgnat(t: Topology, id: string, index: number, enabled: boolean): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (device.type !== 'internet') return fail('notARouter');
  if (!device.interfaces[index]) return fail('unknownInterface');
  return ok(changePort(t, id, index, (i) => (enabled ? { ...i, cgnat: true } : without(i, 'cgnat'))));
}

export function setCgnatAddress(t: Topology, id: string, address: string): Result<Topology> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (device.type !== 'internet') return fail('notARouter');
  const value = address.trim();
  if (value && parseIp(value) === null) return { ok: false, error: { code: 'invalidIp', params: { value }, field: 'cgnatAddress' } };
  return ok(updateDevice(t, id, (d) => (value ? { ...d, cgnatAddress: value } : without(d, 'cgnatAddress'))));
}

function routingDevice(t: Topology, id: string): Result<Device> {
  const device = getDevice(t, id);
  if (!device) return fail('unknownDevice');
  if (!canRouteDynamically(device.type)) return fail('notARouter');
  return ok(device);
}

export function setOspf(t: Topology, id: string, config: OspfConfig | null): Result<Topology> {
  const device = routingDevice(t, id);
  if (!device.ok) return device;
  if (config) {
    const issue = checkOspf(config);
    if (issue) return { ok: false, error: issue };
  }
  return ok(updateDevice(t, id, (d) => (config ? { ...d, ospf: normalizeOspf(config) } : without(d, 'ospf'))));
}

export function setBgp(t: Topology, id: string, config: BgpConfig | null): Result<Topology> {
  const device = routingDevice(t, id);
  if (!device.ok) return device;
  if (config) {
    const issue = checkBgp(config);
    if (issue) return { ok: false, error: issue };
  }
  return ok(updateDevice(t, id, (d) => (config ? { ...d, bgp: normalizeBgp(config) } : without(d, 'bgp'))));
}

export function setRip(t: Topology, id: string, config: RipConfig | null): Result<Topology> {
  const device = routingDevice(t, id);
  if (!device.ok) return device;
  if (config) {
    const issue = checkRip(config);
    if (issue) return { ok: false, error: issue };
  }
  return ok(updateDevice(t, id, (d) => (config ? { ...d, rip: normalizeRip(config) } : without(d, 'rip'))));
}

/** OSPFv3 einrichten (null = aus). Anschlüsse: Ports oder, beim Layer-3-Switch, VLAN-Interfaces. */
export function setOspf6(t: Topology, id: string, config: Ospf6Config | null): Result<Topology> {
  const device = routingDevice(t, id);
  if (!device.ok) return device;
  if (config) {
    const issue = checkOspf6(config, (index) => hasLink6(device.value, index));
    if (issue) return { ok: false, error: issue };
  }
  return ok(updateDevice(t, id, (d) => (config ? { ...d, ospf6: normalizeOspf6(config) } : without(d, 'ospf6'))));
}

export function setRipng(t: Topology, id: string, config: RipngConfig | null): Result<Topology> {
  const device = routingDevice(t, id);
  if (!device.ok) return device;
  if (config) {
    const issue = checkRipng(config, (index) => hasLink6(device.value, index));
    if (issue) return { ok: false, error: issue };
  }
  return ok(updateDevice(t, id, (d) => (config ? { ...d, ripng: normalizeRipng(config) } : without(d, 'ripng'))));
}

/** Dokumentiertes VLAN mit Farbe anlegen oder ändern; die Farbe erscheint an allen Switch-Ports dieses VLANs. */
export function setVlanDef(t: Topology, vlan: VlanDef): Result<Topology> {
  if (!Number.isInteger(vlan.id) || vlan.id < 1 || vlan.id > 4094) return fail('invalidVlan');
  const name = vlan.name?.trim().slice(0, 32);
  const entry: VlanDef = { id: vlan.id, color: vlan.color, ...(name ? { name } : {}) };
  const list = (t.vlans ?? []).filter((v) => v.id !== vlan.id);
  return ok({ ...t, vlans: [...list, entry].sort((a, b) => a.id - b.id) });
}

export function removeVlanDef(t: Topology, id: number): Result<Topology> {
  const list = (t.vlans ?? []).filter((v) => v.id !== id);
  if (list.length === (t.vlans ?? []).length) return ok(t);
  const { vlans: _v, ...rest } = t;
  return ok(list.length ? { ...t, vlans: list } : rest);
}

/** Farbe eines VLANs: aus der VLAN-Liste, sonst vom Dokumentationsbereich mit dieser VLAN-Nummer. */
export function vlanColor(t: Topology, vlan: number): TagColor | undefined {
  return t.vlans?.find((v) => v.id === vlan)?.color ?? t.areas?.find((a) => a.vlan === vlan && a.kind !== 'rack')?.color;
}

/** Name eines VLANs aus der Dokumentation (VLAN-Liste oder Bereichstitel). */
export function vlanLabel(t: Topology, vlan: number): string | undefined {
  return t.vlans?.find((v) => v.id === vlan)?.name ?? t.areas?.find((a) => a.vlan === vlan && a.kind !== 'rack')?.title;
}

// --- WLAN-Roaming --------------------------------------------------------------

/** Signal muss um so viele Prozentpunkte besser sein, bevor ein Client wechselt (Hysterese, verhindert Hin und Her). */
export const ROAMING_MARGIN = 10;

export interface RoamingDecision {
  cable: string;
  from: string;
  to: string;
  iface: number;
  signal: number;
}

/**
 * Würde ein WLAN-Client zu einem anderen Access Point wechseln? Kandidaten
 * strahlen dieselbe SSID mit demselben Passwort aus, haben einen freien
 * Funkplatz und ein deutlich besseres Signal als der aktuelle.
 */
export function roamingTarget(t: Topology, clientId: string): RoamingDecision | null {
  const client = getDevice(t, clientId);
  if (!client?.wifi || !isWifiCapable(client.type)) return null;
  const cable = cablesOf(t, clientId).find((c) => c.medium === 'wireless');
  if (!cable) return null;
  const currentAp = getDevice(t, otherEnd(cable, clientId).device);
  if (!currentAp || currentAp.type !== 'accesspoint') return null;
  const current = signalBetween(client, currentAp);
  let best: RoamingDecision | null = null;
  for (const ap of t.devices) {
    if (ap.type !== 'accesspoint' || ap.id === currentAp.id || !ap.wlan) continue;
    if (ap.wlan.ssid !== client.wifi.ssid || (ap.wlan.password ?? '') !== (client.wifi.password ?? '')) continue;
    const signal = signalBetween(client, ap);
    if (signal < MIN_SIGNAL || signal < current + ROAMING_MARGIN) continue;
    const free = ap.interfaces.find((i) => i.index > 0 && !i.shutdown && !cableAt(t, { device: ap.id, iface: i.index }));
    if (!free) continue;
    if (!best || signal > best.signal) best = { cable: cable.id, from: currentAp.id, to: ap.id, iface: free.index, signal };
  }
  return best;
}

/** Funkverbindung des Clients auf den neuen Access Point umhängen. */
export function applyRoaming(t: Topology, decision: RoamingDecision): Result<Topology> {
  const cable = getCable(t, decision.cable);
  if (!cable) return fail('unknownCable');
  const end: 'a' | 'b' = cable.a.device === decision.from ? 'a' : 'b';
  if (cableAt(t, { device: decision.to, iface: decision.iface })) return fail('interfaceInUse', { device: decision.to, index: decision.iface });
  return ok({ ...t, cables: t.cables.map((c) => (c.id === cable.id ? { ...c, [end]: { device: decision.to, iface: decision.iface } } : c)) });
}

// --- Gerät duplizieren ---------------------------------------------------------

/**
 * Kopie eines Geräts neben dem Original: gleiche Ausstattung und Einstellungen,
 * aber neue MAC-Adressen und ohne IP-Adressen (sonst gäbe es Konflikte) und ohne Kabel.
 */
export function duplicateDevice(t: Topology, id: string, name: string, offset = 80): Result<{ topology: Topology; id: string }> {
  const original = getDevice(t, id);
  if (!original) return fail('unknownDevice');
  const checked = checkName(t, name);
  if (!checked.ok) return checked;
  const seq = t.nextId;
  const interfaces = original.interfaces.map((i) => {
    const { ip: _ip, mask: _mask, ...rest } = i;
    return { ...rest, mac: macFor(seq, i.index) };
  });
  const { rack: _rack, ...rest } = original;
  const copy: Device = {
    ...structuredCloneSafe(rest),
    id: `d${seq}`,
    name: checked.value,
    position: { x: original.position.x + offset, y: original.position.y + offset },
    interfaces,
  };
  // Dienste mit fester Adresse (DHCP-Server) brauchen eine eigene Adresse; ohne Adresse wird daraus nichts.
  if (copy.dhcpServer) delete copy.dhcpServer;
  if (copy.svis) copy.svis = copy.svis.map(({ ip: _i, mask: _m, ...s }) => s);
  if (copy.subinterfaces) copy.subinterfaces = copy.subinterfaces.map(({ ip: _i, mask: _m, ...s }) => s);
  return ok({ topology: { ...t, devices: [...t.devices, copy], nextId: seq + 1 }, id: copy.id });
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
