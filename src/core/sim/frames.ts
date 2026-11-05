import type { DnsRecord, DnsType } from '../model/types';

export type { DnsRecord, DnsType };

// Pakete sind verschachtelte, unveränderliche Objekte statt Bytefolgen:
// Ethernet-Rahmen enthält ARP oder IPv4, IPv4 enthält ICMP oder UDP,
// UDP enthält Anwendungsdaten (DHCP, später DNS).

export const BROADCAST_MAC = 'FF:FF:FF:FF:FF:FF';
export const ZERO_MAC = '00:00:00:00:00:00';

export interface ArpPacket {
  kind: 'arp';
  op: 'request' | 'reply';
  senderMac: string;
  senderIp: string;
  targetMac: string;
  targetIp: string;
}

export type IcmpType = 'echoRequest' | 'echoReply' | 'destUnreachable' | 'timeExceeded';

export interface IcmpMessage {
  kind: 'icmp';
  type: IcmpType;
  id: number;
  seq: number;
  /** Nutzdaten in Byte (nur die Länge wird simuliert). */
  size: number;
  /** Bei "destUnreachable": Netz oder einzelner Host nicht erreichbar. */
  code?: 'net' | 'host';
  /** Bei Fehlermeldungen: Kopfdaten des auslösenden Pakets. */
  original?: { src: string; dst: string; id: number; seq: number };
}

export type DhcpOp = 'discover' | 'offer' | 'request' | 'ack' | 'nak' | 'release';

export interface DhcpMessage {
  kind: 'dhcp';
  op: DhcpOp;
  /** Transaktionsnummer: ordnet Antworten der Anfrage zu. */
  xid: number;
  clientMac: string;
  /** Angebotene bzw. zugewiesene Adresse ("yiaddr"). */
  yourIp?: string;
  /** Vom Client gewünschte Adresse (Request). */
  requestedIp?: string;
  /** Adresse des DHCP-Servers ("Server Identifier"). */
  serverIp?: string;
  mask?: string;
  gateway?: string;
  dns?: string;
  /** Lease-Dauer in Sekunden. */
  leaseTime?: number;
  /** Adresse des DHCP-Relays, über das die Anfrage kam ("giaddr"); fehlt bei direkter Anfrage. */
  giaddr?: string;
}

export interface DnsMessage {
  kind: 'dns';
  id: number;
  response: boolean;
  question: { name: string; type: DnsType };
  answers: DnsRecord[];
  /** "nxdomain": Name unbekannt; "servfail": Server konnte nicht antworten (z.B. Weiterleitung ohne Antwort). */
  rcode: 'ok' | 'nxdomain' | 'servfail';
  /** Antwort aus der eigenen Zone (AA-Bit); sonst weitergeleitet («nicht autorisierend»). */
  authoritative?: boolean;
}

/** RIP Version 2 (RFC 2453), UDP-Port 520. */
export interface RipMessage {
  kind: 'rip';
  command: 'request' | 'response';
  entries: { network: string; mask: string; nextHop: string; metric: number }[];
}

/**
 * DHCPv6 (RFC 9915): Solicit → Advertise → Request → Reply, UDP 546/547.
 * Client und Server werden über ihre DUID erkannt (hier aus der MAC, DUID-LL).
 */
export interface Dhcpv6Message {
  kind: 'dhcpv6';
  type: 'solicit' | 'advertise' | 'request' | 'reply';
  xid: number;
  clientMac: string;
  serverMac?: string;
  /** Vergebene Adresse (IA_NA). */
  address?: string;
  /** Gültigkeit in Sekunden. */
  lifetime?: number;
  dns?: string;
}

/**
 * IKEv2 (RFC 7296), UDP 500: zwei Router handeln den IPsec-Tunnel aus.
 * IKE_SA_INIT legt Verfahren und Schlüsselmaterial fest, IKE_AUTH beweist
 * den gemeinsamen Schlüssel (hier ein Prüfwert statt echter Kryptografie)
 * und vereinbart, welche Netze durch den Tunnel dürfen (Traffic Selectors).
 */
export interface IkeMessage {
  kind: 'ike';
  exchange: 'IKE_SA_INIT' | 'IKE_AUTH';
  response: boolean;
  /** SPI des Initiators und des Responders (identifizieren die Aushandlung). */
  ispi: number;
  rspi: number;
  msgId: number;
  /** IKE_AUTH: Beweis, dass man den Schlüssel kennt (Prüfwert, nie der Schlüssel selbst). */
  proof?: string;
  /** Traffic Selectors: eigenes und entferntes Netz. */
  tsi?: string;
  tsr?: string;
  /** Fehler der Gegenseite. */
  notify?: 'AUTHENTICATION_FAILED' | 'TS_UNACCEPTABLE';
}

export type AppMessage = DhcpMessage | DnsMessage | RipMessage | Dhcpv6Message | IkeMessage;

export interface UdpDatagram {
  kind: 'udp';
  srcPort: number;
  dstPort: number;
  payload: AppMessage;
}

export type TcpFlag = 'SYN' | 'ACK' | 'FIN' | 'RST' | 'PSH';

/**
 * TCP-Segment. Die Nutzdaten sind Text (z.B. eine HTTP-Anfrage); Sequenz-
 * nummern zählen Zeichen statt Bytes.
 */
export interface TcpSegment {
  kind: 'tcp';
  srcPort: number;
  dstPort: number;
  seq: number;
  ack: number;
  flags: TcpFlag[];
  data: string;
}

/** Link-State-Advertisement eines Routers (OSPF Typ 1, Router-LSA), vereinfacht. */
export interface OspfLsa {
  type: 'router' | 'external';
  /** Router-ID des Erzeugers. */
  advertisingRouter: string;
  seq: number;
  /** Router-LSA: Verbindungen zu Nachbarn und Netzen; external: per Redistribution importierte Netze. */
  links: { kind: 'transit' | 'stub' | 'p2p'; id: string; data: string; cost: number }[];
}

/** OSPFv2 (RFC 2328), IP-Protokoll 89, an 224.0.0.5 (alle OSPF-Router). */
export interface OspfPacket {
  kind: 'ospf';
  type: 'hello' | 'dbd' | 'lsr' | 'lsu' | 'lsack';
  routerId: string;
  area: number;
  /** Hello: Netzmaske, Intervalle und gesehene Nachbarn. */
  hello?: { mask: string; helloInterval: number; deadInterval: number; neighbors: string[]; dr?: string };
  /** DBD/LSR/LSAck: Kopf der LSAs; LSU: vollständige LSAs. */
  headers?: { advertisingRouter: string; seq: number; type: OspfLsa['type'] }[];
  lsas?: OspfLsa[];
}

export interface Ipv4Packet {
  kind: 'ipv4';
  src: string;
  dst: string;
  ttl: number;
  id: number;
  payload: IcmpMessage | UdpDatagram | TcpSegment | OspfPacket | EspPacket;
}

/**
 * ESP (RFC 4303), IP-Protokoll 50: das ganze innere IPv4-Paket verschlüsselt
 * im Tunnel. `inner` dient der Simulation; auf der Leitung (und im
 * Mitschnitt) sind nur SPI, Sequenznummer und verwürfelte Bytes zu sehen.
 */
export interface EspPacket {
  kind: 'esp';
  spi: number;
  seq: number;
  inner: Ipv4Packet;
  /** Aus dem gemeinsamen Schlüssel abgeleitet; bestimmt die (simulierte) Verschlüsselung. */
  keyHash: number;
}

export type Icmpv6Type =
  | IcmpType
  | 'routerSolicitation'
  | 'routerAdvertisement'
  | 'neighborSolicitation'
  | 'neighborAdvertisement';

/**
 * ICMPv6 (RFC 4443) mit Neighbor Discovery (RFC 4861). Echo und Fehler wie
 * bei ICMP; dazu Router- und Nachbar-Anfragen/-Ankündigungen, die ARP und
 * DHCP-Gateway-Angaben ersetzen.
 */
export interface Icmpv6Message {
  kind: 'icmpv6';
  type: Icmpv6Type;
  id: number;
  seq: number;
  size: number;
  /** Fehler: «net» = keine Route (Code 0), «host» = Adresse nicht erreichbar (Code 3). */
  code?: 'net' | 'host';
  original?: { src: string; dst: string; id: number; seq: number };
  /** NS/NA: gesuchte bzw. angekündigte Adresse. */
  target?: string;
  /** Option «Source/Target Link-Layer Address»: MAC des Absenders bzw. Ziels. */
  linkAddr?: string;
  /** NA: R = Router, S = auf Anfrage, O = überschreiben; RA: M = Adressen per DHCPv6, O = weitere Angaben per DHCPv6. */
  flags?: { router?: boolean; solicited?: boolean; override?: boolean; managed?: boolean; other?: boolean };
  /** RA: Präfix für SLAAC (Option «Prefix Information»). */
  prefix?: { network: string; length: number; autonomous: boolean; valid: number; preferred: number };
  /** RA: Gültigkeit als Standardrouter in Sekunden (0 = kein Standardrouter). */
  routerLifetime?: number;
  mtu?: number;
}

/**
 * IPv6-Paket (RFC 8200). Nutzlast: ICMPv6, UDP oder – bei DS-Lite – ein
 * ganzes IPv4-Paket (Next Header 4, RFC 2473).
 */
export interface Ipv6Packet {
  kind: 'ipv6';
  src: string;
  dst: string;
  hopLimit: number;
  payload: Icmpv6Message | UdpDatagram | Ipv4Packet;
}

/** Bridge Protocol Data Unit des Spanning Tree (vereinfacht). */
export interface StpBpdu {
  kind: 'stp';
  /** Bridge-ID der Root-Bridge, z.B. "32768.02:00:00:00:03:00". */
  rootId: string;
  /** Pfadkosten des Absenders zur Root-Bridge. */
  cost: number;
  bridgeId: string;
  /** Port des Absenders (Index). */
  portId: number;
}

/**
 * PPP-Steuerpaket (RFC 1661/1332): LCP handelt die Verbindung aus, IPCP die
 * IP-Adressen. Erst danach fliessen IP-Pakete.
 */
export interface PppControl {
  kind: 'ppp';
  protocol: 'lcp' | 'ipcp';
  code: 'configureRequest' | 'configureAck' | 'configureNak' | 'terminateRequest' | 'terminateAck' | 'echoRequest' | 'echoReply';
  id: number;
  /** LCP: Magic-Number; IPCP: IP-Adresse. */
  magic?: number;
  ip?: string;
}

/**
 * Steuermeldungen von Zugangstechniken und WLAN, die nur zwischen zwei direkt
 * verbundenen Geräten laufen (Schicht 1/2): DOCSIS, GPON, DSL/PPPoE, LTE, 802.11.
 */
export interface LinkControl {
  kind: 'link';
  tech: 'docsis' | 'gpon' | 'dsl' | 'pppoe' | 'lte' | 'wlan';
  /** Name der Meldung, wie sie in der Norm heisst, z.B. "RNG-REQ" oder "Association Request". */
  message: string;
  /** Felder für die Detailansicht. */
  fields?: Record<string, string | number>;
}

/**
 * Rahmen auf einer Leitung. Ohne `l2` ist es Ethernet II (mit MAC-Adressen);
 * serielle Leitungen tragen Cisco-HDLC oder PPP (ohne MAC-Adressen).
 * `access` vermerkt, über welche Zugangstechnik der Rahmen auf dieser Leitung
 * transportiert wird (z.B. DOCSIS zwischen Kabelmodem und Provider).
 */
export interface EthernetFrame {
  src: string;
  dst: string;
  /** 802.1Q-Tag, nur auf Trunk-Verbindungen. */
  vlan?: number;
  l2?: 'hdlc' | 'ppp';
  access?: AccessTech;
  payload: ArpPacket | Ipv4Packet | Ipv6Packet | StpBpdu | PppControl | LinkControl;
}

export type AccessTech = 'docsis' | 'gpon' | 'adsl' | 'vdsl' | 'lte';

/** Ziel-MAC für BPDUs (Multicast, nur zwischen Switches). */
export const STP_MAC = '01:80:C2:00:00:00';

export const DHCP_SERVER_PORT = 67;
export const DHCP_CLIENT_PORT = 68;
export const DNS_PORT = 53;
export const HTTP_PORT = 80;
export const SMTP_PORT = 25;
export const POP3_PORT = 110;
export const IMAP_PORT = 143;
export const RIP_PORT = 520;
export const IKE_PORT = 500;
export const DHCP6_CLIENT_PORT = 546;
export const DHCP6_SERVER_PORT = 547;
export const BGP_PORT = 179;
export const OSPF_ALL_ROUTERS = '224.0.0.5';
export const RIP_MULTICAST = '224.0.0.9';
/** Ethernet-Multicast-Adressen zu 224.0.0.5 und 224.0.0.9 (01:00:5E + untere 23 Bit). */
export const OSPF_MAC = '01:00:5E:00:00:05';
export const RIP_MAC = '01:00:5E:00:00:09';
