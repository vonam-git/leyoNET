export type DeviceType =
  | 'notebook'
  | 'pc'
  | 'server'
  | 'clientgroup'
  | 'switch'
  | 'l3switch'
  | 'router'
  | 'firewall'
  | 'accesspoint'
  | 'modem'
  | 'cpe'
  | 'internet';

/**
 * Übertragungsmedium einer Verbindung.
 * tp: Twisted-Pair (RJ45), fiber: Glasfaser, wireless: WLAN,
 * serial: serielle WAN-Leitung zwischen Routern, coax: Koaxialkabel (Kabelnetz/DOCSIS),
 * dsl: Telefon-Kupferleitung (ADSL/VDSL), cellular: Mobilfunk (LTE/5G).
 */
export type Medium = 'tp' | 'fiber' | 'wireless' | 'serial' | 'coax' | 'dsl' | 'cellular';
export const MEDIA: readonly Medium[] = ['tp', 'fiber', 'wireless', 'serial', 'coax', 'dsl', 'cellular'];

/** Zugangstechnik eines Modems; bestimmt das Medium des WAN-Anschlusses und die Simulation. */
/** «ipv4»: nur IPv4, «dual»: IPv4 und IPv6 (Dual Stack), «ipv6»: nur IPv6. */
export type IpMode = 'ipv4' | 'dual' | 'ipv6';
export const IP_MODES: readonly IpMode[] = ['ipv4', 'dual', 'ipv6'];

/** Statische IPv6-Route: Zielnetz mit Präfix und nächster Router (oft eine Link-Local-Adresse mit Anschluss). */
export interface StaticRoute6 {
  network: string;
  gateway?: string;
  iface?: number;
}

import type { AccessList, FirewallConfig, VpnTunnel } from './security';
export type { FirewallConfig, FirewallRule, FirewallAction, FirewallProtocol, VpnTunnel } from './security';

export type RoutingMode = 'auto' | 'static' | 'dynamic';
export const ROUTING_MODES: readonly RoutingMode[] = ['auto', 'static', 'dynamic'];

export type ModemKind = 'cable' | 'fiber' | 'mobile' | 'adsl' | 'vdsl';
export const MODEM_KINDS: readonly ModemKind[] = ['cable', 'fiber', 'mobile', 'adsl', 'vdsl'];

export interface ModemConfig {
  kind: ModemKind;
}

/** Kapselung einer seriellen Leitung: Cisco-HDLC oder PPP (RFC 1661). Beide Enden müssen gleich sein. */
export type SerialEncapsulation = 'hdlc' | 'ppp';

/** Farbmarkierung für Anschlüsse und Bereiche (Dokumentationsmodus). */
export type ChannelMode = 'active' | 'passive' | 'on';
export const CHANNEL_MODES: readonly ChannelMode[] = ['active', 'passive', 'on'];
export const MAX_CHANNEL = 64;

export type TagColor = 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'pink' | 'gray';

/** Rolle eines Geräts, bestimmt u.a. die Farbe in der Oberfläche. */
export type DeviceRole = 'endpoint' | 'distribution' | 'routing';

export interface Point {
  x: number;
  y: number;
}

export interface NetInterface {
  index: number;
  mac: string;
  /** IPv4-Adresse als Text, z.B. "192.168.0.10"; fehlt, solange nicht konfiguriert. */
  ip?: string;
  /** Subnetzmaske in Punktschreibweise, z.B. "255.255.255.0". */
  mask?: string;
  /** Nur Router: DHCP-Anfragen aus diesem Netz an diesen Server weiterleiten (DHCP-Relay). */
  dhcpRelay?: string;
  /** Nur Router: Interface zeigt ins Internet; ausgehende Pakete erhalten dessen Adresse (NAT). */
  nat?: boolean;
  /** Nur Switch: VLAN eines Access-Ports (fehlt = VLAN 1). */
  vlan?: number;
  /** Nur Switch: Trunk-Port, überträgt alle VLANs mit 802.1Q-Tag (VLAN 1 ohne Tag). */
  trunk?: boolean;
  /** Router, Firewall: VRF, zu dem der Anschluss gehört («vrf forwarding KUNDE-A»); fehlt = globale Tabelle. */
  vrf?: string;
  /** Nur Switch, Trunk: erlaubte VLANs («switchport trunk allowed vlan»); fehlt = alle. */
  allowedVlans?: number[];
  /** Nur Switch, Trunk: VLAN ohne Tag («switchport trunk native vlan»); fehlt = 1. */
  nativeVlan?: number;
  /** Nur Switch: Port-Channel (Link Aggregation), dem der Port angehört («channel-group 1»). */
  channel?: number;
  /** Nur Switch: Aushandlung im Port-Channel: LACP aktiv, passiv oder fest ohne LACP («on»). Fehlt = aktiv. */
  channelMode?: ChannelMode;
  /** Nur Switch: Name der Zugriffsliste für eingehende Pakete («ip access-group NAME in»). */
  aclIn?: string;
  /** Administrativ abgeschaltet («shutdown»): Link ist aus, nichts wird gesendet oder empfangen. */
  shutdown?: boolean;
  /** Farbmarkierung des Anschlusses (z.B. für Patchfelder und Dokumentation). */
  color?: TagColor;
  /** Beschreibung, z.B. «Uplink Stock 2» («description» in der CLI). */
  description?: string;
  /** SFP-Einschub (für Glasfaser) statt RJ45-Buchse. */
  sfpSlot?: boolean;
  /** Eingestecktes SFP-Modul; ohne Modul funktioniert der Einschub nicht. */
  sfp?: SfpModule;
  /** Nur Router: serieller WAN-Anschluss statt Ethernet (kein ARP, Punkt-zu-Punkt). */
  serial?: boolean;
  /** Serielle Anschlüsse: Kapselung; fehlt = HDLC. */
  encapsulation?: SerialEncapsulation;
  /** OSPF-Kosten dieses Anschlusses; fehlt = 10. */
  ospfCost?: number;
  /** Nur Internet (Provider): Kunden an diesem Anschluss erhalten CGNAT (100.64.0.0/10 wird übersetzt). */
  cgnat?: boolean;
  /** IPv6-Adresse mit Präfix, z.B. "2001:db8:1::1/64" (RFC 5952). Link-Local entsteht automatisch. */
  ipv6?: string;
  /** Nur Router/Internet-Box: in diesem Netz Adressen per DHCPv6 vergeben (Router Advertisement mit M-Flag). */
  dhcp6?: boolean;
  /** Nur Router/Internet-Box: IPv6-DNS-Server, den dieses Netz im Router Advertisement (RDNSS) und per DHCPv6 erhält. */
  dns6?: string;
}

/**
 * SFP-Module: Beide Enden einer Glasfaserverbindung brauchen denselben Typ
 * (Multimode SX/SR auf kurze, Singlemode LX/LR auf lange Distanzen).
 */
export type SfpModule = '1G-SX' | '1G-LX' | '10G-SR' | '10G-LR';
export const SFP_MODULES: readonly SfpModule[] = ['1G-SX', '1G-LX', '10G-SR', '10G-LR'];

/**
 * Router: logisches Interface auf einem physischen Anschluss für ein VLAN
 * (802.1Q-Subinterface, z.B. eth0.10). Grundlage für Router-on-a-Stick.
 */
export interface SubInterface {
  /** Physischer Anschluss (Index). */
  parent: number;
  vlan: number;
  ip?: string;
  mask?: string;
  dhcpRelay?: string;
  vrf?: string;
}

/** Loopback-Interface eines Routers oder Layer-3-Switches («interface loopback0»): immer aktiv, z.B. für die Router-ID. */
export interface Loopback {
  /** Nummer 0–99. */
  id: number;
  ip?: string;
  mask?: string;
  vrf?: string;
}

/** VXLAN-Segment: VNI, zugeordnetes VLAN und die anderen VTEPs (statische Liste, Ingress Replication). */
export interface VxlanVni {
  vni: number;
  /** VLAN dieses Switches, das über die VNI verlängert wird («vn-segment» im VLAN). */
  vlan?: number;
  /** Adressen der anderen VTEPs («peer-ip»). */
  peers: string[];
}

/** Layer-3-Switch als VTEP («interface nve1»). */
export interface VxlanConfig {
  /** Logisches Interface mit der Absenderadresse, meist ein Loopback («source-interface loopback0»). */
  source?: number;
  vnis: VxlanVni[];
}

export const MAX_VNI = 16_777_215;

/**
 * VRF (Virtual Routing and Forwarding): eigene Routingtabelle auf demselben
 * Gerät, z.B. für zwei Kunden mit überlappenden Adressen. Anschlüsse werden
 * per `vrf` zugeordnet; Pakete bleiben in ihrer VRF.
 */
export interface Vrf {
  /** Name, z.B. «KUNDE-A» (Buchstaben, Ziffern, «-», «_»). */
  name: string;
  /** Statische Routen dieser VRF. */
  routes?: StaticRoute[];
}

/** Layer-3-Switch: virtuelles Interface eines VLANs (SVI, «interface vlan 10»). */
export interface Svi {
  vlan: number;
  vrf?: string;
  /** Zugriffsliste für Pakete aus dem VLAN («ip access-group NAME in»), auch an den Switch selbst. */
  aclIn?: string;
  /** Zugriffsliste für Pakete, die ins VLAN geroutet werden («ip access-group NAME out»). */
  aclOut?: string;
  ip?: string;
  mask?: string;
  dhcpRelay?: string;
  /** IPv6-Adresse mit Präfix, z.B. "2001:db8:10::1/64"; der Switch kündigt das Präfix im VLAN an. */
  ipv6?: string;
  /** In diesem VLAN IPv6-Adressen per DHCPv6 vergeben. */
  dhcp6?: boolean;
  /** IPv6-DNS-Server für dieses VLAN (RDNSS, DHCPv6). */
  dns6?: string;
}

export interface PortForward {
  protocol: 'tcp' | 'udp';
  /** Port auf der Internet-Adresse des Routers. */
  port: number;
  /** Interner Rechner und Port, an den weitergeleitet wird. */
  to: string;
  toPort: number;
}

export interface Device {
  /** Form "d<n>"; n bestimmt die MAC-Adressen des Geräts. */
  id: string;
  type: DeviceType;
  name: string;
  position: Point;
  interfaces: NetInterface[];
  /** Nur Endgeräte: Standardgateway und DNS-Server. */
  gateway?: string;
  dns?: string;
  /** Nur Endgeräte: Adresse per DHCP beziehen statt statisch. */
  dhcp?: boolean;
  /** Nur Rechner: DHCP-Server-Dienst. */
  dhcpServer?: DhcpServerConfig;
  /** Router, Firewall, Layer-3-Switch: DHCP-Pools je Netz (Cisco-Stil). */
  dhcpPools?: DhcpPool[];
  /** Router, Firewall, Layer-3-Switch: von den Pools ausgeschlossene Adressen. */
  dhcpExcluded?: DhcpExcluded[];
  /** Nur Rechner: DNS-Server-Dienst mit seiner Zone. */
  dnsServer?: DnsServerConfig;
  /** Nur Rechner: Webserver mit seinen Seiten. */
  webServer?: WebServerConfig;
  /** Nur Rechner: Mailserver (SMTP, POP3, IMAP) mit Postfächern. */
  mailServer?: MailServerConfig;
  /** Endgeräte: E-Mail-Konto für die Anwendung "E-Mail". */
  mailAccount?: MailAccount;
  /** Nur Vermittlungsrechner: statische Routen. */
  routes?: StaticRoute[];
  /** Nur Router mit NAT: Portweiterleitungen von aussen an interne Rechner. */
  portForwards?: PortForward[];
  /** Nur Switch: Spanning Tree aktiv; erst dann sind Schleifen zwischen Switches erlaubt. */
  stp?: boolean;
  /** Nur Switch: STP-Priorität (Standard 32768); kleiner = eher Root-Bridge. */
  stpPriority?: number;
  /** Nur Router: 802.1Q-Subinterfaces (Router-on-a-Stick). */
  subinterfaces?: SubInterface[];
  /** Router, Firewall, Layer-3-Switch: Loopback-Interfaces. */
  loopbacks?: Loopback[];
  /** Router, Firewall, Layer-3-Switch: VRFs (eigene Routingtabellen). */
  vrfs?: Vrf[];
  /** Layer-3-Switch: VXLAN-Tunnelendpunkt (VTEP). */
  vxlan?: VxlanConfig;
  /** Nur Layer-3-Switch: VLAN-Interfaces mit Adresse. */
  svis?: Svi[];
  /** Nur Layer-3-Switch: false = Routing zwischen VLANs ausgeschaltet («no ip routing»). */
  ipRouting?: boolean;
  /** Nur Access Point: Funknetz, das er ausstrahlt (und Mesh-Verbund). */
  wlan?: WlanConfig;
  /** Endgeräte: Funknetz, mit dem sie sich verbinden. */
  wifi?: WifiClient;
  /** Stockwerk (Index in `Topology.floors`); fehlt = Stockwerk 0. */
  floor?: number;
  /** Zugang zur Befehlszeile (Router und Switches). */
  cli?: CliConfig;
  /** Nur Switches: Namen der VLANs («vlan 10» / «name Verwaltung»). */
  vlanNames?: VlanName[];
  /**
   * Nur Switches: angelegte VLANs ausser VLAN 1 («vlan 10»). Ein Switch leitet
   * nur VLANs weiter, die er kennt. Fehlt das Feld (Dateien vor Version 1.2),
   * gelten alle verwendeten VLANs als angelegt.
   */
  vlanDb?: number[];
  /** In diesem Rack (Bereich der Art «rack») eingebaut. */
  rack?: string;
  /** Nur Client-Gruppe: Anzahl Rechner, die sich den Anschluss teilen (alle per DHCP). */
  groupSize?: number;
  /** Nur Modem: Zugangstechnik. */
  modem?: ModemConfig;
  /** Nur Router: statisches NAT 1:1 (Source-NAT mit Rückweg). */
  staticNat?: StaticNat[];
  /** Router, Internet-Box, Endgeräte: Paketfilter (Router: weitergeleitete Pakete, Endgerät: eingehende). */
  firewall?: FirewallConfig;
  /** Nur Switches: benannte Zugriffslisten (ACL), zugewiesen über `aclIn` am Port. */
  acls?: AccessList[];
  /** Nur Router: IPsec-Tunnel zu anderen Standorten (Site-to-Site-VPN). */
  vpn?: VpnTunnel[];
  /** Nur Internet (Provider): öffentliche Adresse, hinter der CGNAT-Kunden erscheinen. */
  cgnatAddress?: string;
  /**
   * Routing-Art (Router und Layer-3-Switches): «auto» berechnet die Routen
   * selbst aus dem Netzplan (für Einsteiger), «static» nur eigene statische
   * Routen, «dynamic» zusätzlich OSPF/RIP/BGP. Fehlt = wie bisher: statisch,
   * mit eingerichtetem Protokoll dynamisch.
   */
  routingMode?: RoutingMode;
  /** Endgeräte: IPv6 automatisch beziehen (SLAAC oder DHCPv6, je nach Router Advertisement). */
  ipv6Auto?: boolean;
  /** Endgeräte: IPv6-Standardgateway bei fester Adresse (globale oder Link-Local-Adresse des Routers). */
  gateway6?: string;
  /** Endgeräte: IPv6-DNS-Server bei fester Adresse (bei automatischer Konfiguration vom Router). */
  dns6?: string;
  /** Router, Internet-Box, Internet: statische IPv6-Routen. */
  routes6?: StaticRoute6[];
  /** Internet-Box: DS-Lite (RFC 6333). IPv4 aus dem Heimnetz geht im IPv6-Tunnel zum AFTR des Providers. */
  dsLite?: { aftr: string };
  /** Internet (Provider): arbeitet als AFTR für DS-Lite und übersetzt die getunnelten IPv4-Pakete per CGNAT. */
  aftr?: boolean;
  /** IPv6: OSPFv3 und RIPng (Router und Layer-3-Switches). */
  ospf6?: Ospf6Config;
  ripng?: RipngConfig;
  /** Dynamisches Routing (Router und Layer-3-Switches). */
  ospf?: OspfConfig;
  bgp?: BgpConfig;
  rip?: RipConfig;
  /** Shop-Variante, z.B. «rack» beim Server; bestimmt Preis und Symbol. */
  variant?: string;
}

/** Statisches NAT: Der interne Rechner erscheint aussen unter einer eigenen öffentlichen Adresse. */
export interface StaticNat {
  inside: string;
  outside: string;
  /**
   * Richtung: «snat» ersetzt nur die Quelladresse ausgehender Verbindungen
   * (Antworten kommen zurück, neue Verbindungen von aussen nicht), «dnat» nur
   * die Zieladresse eingehender (Antworten gehen mit der äusseren Adresse
   * hinaus). Fehlt = 1:1-NAT in beide Richtungen (SNAT und DNAT).
   */
  kind?: 'snat' | 'dnat';
}

export interface RoutedNetwork {
  network: string;
  /** Maske in Punktschreibweise. */
  mask: string;
}

export type RedistributeSource = 'connected' | 'static' | 'ospf' | 'bgp' | 'rip';

export interface OspfConfig {
  /** Router-ID; fehlt = höchste Interface-Adresse. */
  routerId?: string;
  /** Interfaces in diesen Netzen nehmen an OSPF teil (Area). */
  networks: (RoutedNetwork & { area: number })[];
  /** Diese Anschlüsse senden keine Hellos (Netz wird trotzdem bekanntgegeben). */
  passive?: number[];
  /** Standardroute an alle OSPF-Nachbarn verteilen («default-information originate»). */
  defaultOriginate?: boolean;
  redistribute?: RedistributeSource[];
}

/**
 * OSPFv3 (RFC 5340) für IPv6: anders als bei OSPFv2 nimmt man Anschlüsse auf,
 * nicht Netze («ipv6 ospf6 area 0» am Interface in FRRouting).
 */
export interface Ospf6Config {
  /** Router-ID (32 Bit, als IPv4-Adresse geschrieben); fehlt = höchste IPv4-Adresse, sonst aus der MAC. */
  routerId?: string;
  /** Anschlüsse (bei Layer-3-Switches VLAN-Interfaces) mit OSPFv3 und ihre Area. */
  interfaces: { iface: number; area: number }[];
  passive?: number[];
  defaultOriginate?: boolean;
  /** «ospf»/«rip» meinen hier die IPv6-Protokolle (OSPFv3, RIPng). */
  redistribute?: RedistributeSource[];
}

/** RIPng (RFC 2080) für IPv6: Anschlüsse mit RIPng. */
export interface RipngConfig {
  interfaces: number[];
  passive?: number[];
  defaultOriginate?: boolean;
  redistribute?: RedistributeSource[];
}

export interface BgpNeighbor {
  ip: string;
  remoteAs: number;
}

export interface BgpConfig {
  /** Autonomes System (1–4294967295; privat 64512–65534). */
  asn: number;
  routerId?: string;
  neighbors: BgpNeighbor[];
  /** Diese Netze werden angekündigt, sofern sie in der Routingtabelle stehen. */
  networks: RoutedNetwork[];
  redistribute?: RedistributeSource[];
}

export interface RipConfig {
  networks: RoutedNetwork[];
  passive?: number[];
  defaultOriginate?: boolean;
  redistribute?: RedistributeSource[];
}

/** Dokumentiertes VLAN mit Farbe; Switch-Anschlüsse im VLAN erscheinen in dieser Farbe. */
export interface VlanDef {
  id: number;
  name?: string;
  color: TagColor;
}

export interface VlanName {
  vlan: number;
  name: string;
}

export type WlanBand = '2.4' | '5';

export interface WlanConfig {
  ssid: string;
  /** WPA2-Passwort; leer = offenes Netz. Nur für die Simulation, Klartext. */
  password?: string;
  band: WlanBand;
  channel: number;
  /** Mesh: verbindet sich drahtlos mit anderen Mesh-Access-Points derselben SSID. */
  mesh?: boolean;
}

export interface WifiClient {
  ssid: string;
  password?: string;
}

export interface CliUser {
  name: string;
  /** Nur für die Simulation, Klartext. */
  password: string;
}

export interface CliConfig {
  /** SSH-Zugang aktiv («ip ssh» / «line vty … transport input ssh»). */
  ssh?: boolean;
  users?: CliUser[];
  /** Passwort für den privilegierten Modus («enable secret»). */
  enableSecret?: string;
  /** Banner, das beim Anmelden erscheint. */
  banner?: string;
}

/** Eintragstypen nach RFC 1035 (A, NS, CNAME, PTR, MX, TXT) und RFC 3596 (AAAA). */
export type DnsType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'PTR';
export const DNS_TYPES: readonly DnsType[] = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR'];

export interface DnsRecord {
  /** Name in Kleinbuchstaben, z.B. "webserver1" oder "www.schule.example"; bei PTR z.B. "10.1.168.192.in-addr.arpa". */
  name: string;
  type: DnsType;
  /**
   * A: IPv4-Adresse, AAAA: IPv6-Adresse, CNAME/NS/PTR/MX: ein Name,
   * TXT: freier Text (höchstens 255 Zeichen).
   */
  value: string;
  /** Nur MX: Vorrang, kleiner = bevorzugt (Standard 10). */
  priority?: number;
  /** Gültigkeit im Cache der Clients in Sekunden. */
  ttl: number;
}

export interface DnsServerConfig {
  records: DnsRecord[];
  /**
   * Weiterleitung: Namen, die nicht in der eigenen Zone stehen, fragt der Server
   * bei diesem DNS-Server nach (rekursive Auflösung, z.B. Schul-DNS → Provider).
   */
  forwarder?: string;
}

export interface WebFile {
  /** Pfad mit führendem Schrägstrich, z.B. "/index.html". */
  path: string;
  /** Text (HTML, CSS …) oder bei Bildern eine data:-URL (image/jpeg, image/png, image/svg+xml, image/gif, image/webp). */
  content: string;
}

export interface WebServerConfig {
  files: WebFile[];
}

export interface Mailbox {
  /** Teil vor dem @, z.B. "anna". */
  user: string;
  /** Nur für die Simulation, im Klartext gespeichert: keine echten Passwörter verwenden. */
  password: string;
}

export interface MailServerConfig {
  /** Domain, für die der Server Post annimmt, z.B. "schule.example". */
  domain: string;
  mailboxes: Mailbox[];
}

export type MailProtocol = 'pop3' | 'imap';

export interface MailAccount {
  address: string;
  password: string;
  /** Name oder IP des Servers für ausgehende Post (SMTP). */
  smtpServer: string;
  /** Name oder IP des Servers für eingehende Post (POP3 oder IMAP). */
  incomingServer: string;
  protocol: MailProtocol;
}

export interface DhcpServerConfig {
  /** Erste und letzte vergebene Adresse; die Maske ist die des Servers. */
  start: string;
  end: string;
  gateway?: string;
  dns?: string;
  /** Lease-Dauer in Sekunden. */
  leaseTime: number;
  /** Weitere Bereiche für entfernte Netze, die über ein DHCP-Relay angefragt werden. */
  scopes?: DhcpScope[];
  /** Feste Zuweisungen: Dieses Gerät (MAC) bekommt immer diese Adresse, auch ausserhalb des Bereichs. */
  reservations?: DhcpReservation[];
}

export interface DhcpReservation {
  /** MAC-Adresse in Grossbuchstaben, z.B. "02:00:00:00:05:00". */
  mac: string;
  ip: string;
}

/** DHCP-Pool auf einem Router oder Layer-3-Switch («ip dhcp pool NAME»). Vergeben wird das ganze Netz ohne ausgeschlossene Adressen. */
export interface DhcpPool {
  name: string;
  /** Netz, z.B. "192.168.10.0", und Maske in Punktschreibweise. Fehlt, solange «network» noch nicht gesetzt ist. */
  network?: string;
  mask?: string;
  gateway?: string;
  dns?: string;
  /** Gültigkeit in Sekunden; fehlt = 1 Tag wie auf Cisco-Geräten. */
  leaseTime?: number;
}

/** Ausgeschlossener Adressbereich («ip dhcp excluded-address A [B]»). */
export interface DhcpExcluded {
  start: string;
  end?: string;
}

export interface DhcpScope {
  start: string;
  end: string;
  mask: string;
  gateway?: string;
  dns?: string;
}

export interface StaticRoute {
  /** Zielnetz, z.B. "10.1.0.0". */
  network: string;
  /** Maske in Punktschreibweise. */
  mask: string;
  /** Nächster Router; fehlt, wenn das Ziel über `iface` direkt erreichbar ist. */
  gateway?: string;
  /** Ausgangsanschluss; fehlt er, ergibt er sich aus dem Gateway. */
  iface?: number;
}

export interface Endpoint {
  device: string;
  iface: number;
}

export interface Cable {
  /** Form "c<n>". */
  id: string;
  a: Endpoint;
  b: Endpoint;
  /** Beschädigtes Kabel: so viele Prozent der Rahmen gehen verloren (für Fehlersuche-Übungen). */
  loss?: number;
  /** Medium; fehlt = Twisted-Pair-Kabel. */
  medium?: Medium;
}

/** Dokumentationsmodus: farbiger Bereich auf der Zeichenfläche, z.B. ein Subnetz oder ein Raum. */
export interface DocArea {
  /** Form "a<n>". */
  id: string;
  /**
   * «rack»: 19-Zoll-Schrank, in den Netzwerkgeräte eingebaut werden; «note»: Textfeld
   * mit Titel und frei formatiertem Text (Absätze, Listen, **fett**); sonst ein farbiger Bereich.
   */
  kind?: 'rack' | 'note';
  title: string;
  color: TagColor;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Netzadresse mit Präfix, z.B. "192.168.10.0/24"; die Oberfläche berechnet daraus die Netzinfos. */
  network?: string;
  /** VLAN-Nummer, falls der Bereich ein VLAN darstellt. */
  vlan?: number;
  /** Freitext, z.B. Zweck, Gateway, Verantwortliche. */
  note?: string;
  /** Öffentliches Netz (im Internet geroutete Adressen) statt privates Firmennetz. */
  public?: boolean;
  /** Stockwerk, auf dem der Bereich liegt; fehlt = auf allen sichtbar. */
  floor?: number;
}

export interface Floor {
  name: string;
}

/** Unveränderlich: Jede Operation liefert eine neue Topologie. */
export interface Topology {
  /** Name des Projekts, z.B. «Übung 02»; wird auch zum Dateinamen beim Speichern. */
  title?: string;
  /** IP-Version des Projekts; fehlt = nur IPv4 (wie alle älteren Projekte). */
  ipMode?: IpMode;
  devices: Device[];
  cables: Cable[];
  /** Nächste freie Nummer für Geräte- und Kabel-IDs, wird nie wiederverwendet. */
  nextId: number;
  /** Dokumentationsmodus: Bereiche mit Farbe, Titel und Netzinfos. */
  areas?: DocArea[];
  /** Stockwerke; fehlt = nur ein Stockwerk. */
  floors?: Floor[];
  /** Dokumentierte VLANs mit Farbe. */
  vlans?: VlanDef[];
}
