# Protokolle und Vereinfachungen

Der Simulator sendet Pakete, die den Standards folgen. Jeder Rahmen lässt sich in echte Bytes kodieren (`src/core/wire/encode.ts`) und als pcapng-Datei exportieren. Wireshark und Scapy lesen diese Dateien wie einen echten Mitschnitt, Prüfsummen (IPv4, ICMP, UDP, TCP, OSPF) sind korrekt berechnet. Wo der Unterricht es erfordert, sind Abläufe vereinfacht oder Zeiten verkürzt. Die Paketdetails vermerken das pro Schicht. Welche Normen zitiert werden und wie das Projekt prüft, ob sie noch aktuell sind, steht in [normen.md](normen.md).

## Übersicht

| Schicht | Protokoll | Standard | Vereinfachung |
|---|---|---|---|
| 1 | Ethernet-PHY, 802.11-Funk, DOCSIS, GPON, DSL, LTE | IEEE 802.3, 802.11, ITU-T | Nur als Beschreibung (Medium, Rate, Modulation); keine Bitfehler ausser «beschädigtes Kabel» |
| 2 | Ethernet II, 802.1Q | IEEE 802.3, 802.1Q | Mit FCS (CRC-32) und Auffüllen auf 64 Byte; Präambel, SFD und Pause nur als Angabe auf Schicht 1; kein Jumbo-Rahmen |
| 2–4 | VXLAN | RFC 7348 | Innerer Ethernet-Rahmen in UDP 4789 mit VNI; VTEPs aus fester Liste (Ingress Replication), MAC-Lernen im Datenpfad; kein EVPN, keine Multicast-Gruppen |
| 2 | LACP | IEEE 802.1AX | LACPDU (Slow Protocols, 0x8809) mit Actor/Partner, kurze Zeiten (1 s, Partner gilt 3 s); keine Prioritäten, kein Marker-Protokoll; Verteilung nach Hash der MAC-Adressen |
| 2 | STP | IEEE 802.1D | Verkürzte Zeiten; Ports zu Endgeräten leiten sofort weiter (wie PortFast) |
| 2 | ARP, Gratuitous ARP, Proxy-ARP | RFC 826, RFC 5227 | – |
| 2 | 802.11 Management, EAPOL | IEEE 802.11, 802.11i | Authentication, Association/Reassociation und 4-Way-Handshake als Ablauf; keine echte Verschlüsselung |
| 2 | PPP (LCP, IPCP), Cisco-HDLC | RFC 1661, RFC 1662, RFC 1332 | Keine Authentisierung auf seriellen Leitungen; FCS-16 im Rahmen, Flags und Bit-Stopfen nicht (pcap ohne FCS) |
| 2 | PPPoE | RFC 2516 | Discovery (PADI/PADO/PADR/PADS) und Session; Anmeldung mit PAP |
| 3 | IPv4 | RFC 791 | Keine Fragmentierung (MSS 1460 verhindert sie), keine Optionen |
| 3 | ICMP | RFC 792 | Echo, Destination Unreachable, Time Exceeded |
| 3 | IPv6 | RFC 8200, RFC 4291, RFC 5952 | Keine Erweiterungs-Header, keine Fragmentierung, keine Flow Labels; Link-Local per EUI-64 (RFC 4291), über Ethernet mit Multicast-MAC 33:33:… (RFC 2464) |
| 3 | ICMPv6, Neighbor Discovery | RFC 4443, RFC 4861 | Echo, Destination Unreachable, Time Exceeded; Neighbor und Router Solicitation/Advertisement statt ARP; kein MLD (Multicast-Gruppen ohne Anmeldung), kein Redirect; Router Advertisements alle 30 s |
| 3 | SLAAC | RFC 4862 | Adresse aus Präfix (/64) und EUI-64; Duplicate Address Detection optimistisch (Adresse sofort nutzbar, Konflikt wird gemeldet); keine Privacy-Adressen |
| 3 | DS-Lite | RFC 6333, RFC 2473 | IPv4 in IPv6 (Next Header 4) von der Internet-Box (B4) zum AFTR, dort CGNAT; Tunneladressen 192.0.0.1/192.0.0.2 nur intern |
| 3 | OSPFv2 | RFC 2328 | Router-LSAs und externe LSAs (Redistribution), keine Summary-LSAs zwischen Areas, kein DR/BDR (Nachbarn wie Punkt-zu-Punkt); Hello 2 s statt 10 s; hängt ein Datenbankabgleich (verlorenes DBD/LSR/LSU), wird er nach zwei Hello-Intervallen wiederholt; Hellos aus einem fremden Subnetz bilden keine Nachbarschaft |
| 3 | OSPFv3 | RFC 5340 | Wie OSPFv2, aber über IPv6 (Next Header 89, ff02::5, Absender Link-Local); Anschlüsse statt Netze, Router-LSAs plus Intra-Area-Prefix-LSAs, AS-External-LSAs; Prüfsumme über den IPv6-Pseudo-Header; Router-ID ohne IPv4 aus der MAC; keine Link-LSAs, kein DR/BDR |
| 3 | NAT: PAT, statisches SNAT, DNAT (Portweiterleitung, statisch), 1:1-NAT, CGNAT | RFC 3022, RFC 6598 | Endpunktunabhängige Zuordnung; keine Application Layer Gateways; SNAT und DNAT merken sich Verbindungen für die Antworten |
| 3 | Firewall (Paketfilter) | – | Regeln der Reihe nach, erste passende gilt, sonst Standardregel; zustandsbehaftet über Protokoll, Adressen und Ports (Zeitlimit 5 Minuten), zugehörige ICMP-Fehler dürfen zurück. Router filtern weitergeleitete Pakete nach DNAT und vor SNAT, Endgeräte eingehende; Broadcasts und DHCP-Antworten sind ausgenommen |
| 3 | IPsec ESP (Tunnelmodus) | RFC 4301, RFC 4303 | Ganzes IPv4-Paket in ESP (IP-Protokoll 50) zwischen den Router-Adressen; SPI, Sequenznummer und 16 Byte ICV im Mitschnitt, Nutzlast nur verwürfelt (keine echte Verschlüsselung); kein Anti-Replay-Fenster, kein NAT-Traversal; Tunnelverkehr umgeht NAT |
| 4 | UDP | RFC 768 | – |
| 4 | TCP | RFC 9293 | Drei-Wege-Handshake, Sequenznummern in Bytes, MSS 1460, Wiederholung nach 1 s (höchstens dreimal), FIN/RST; feste Fenstergrösse, keine Staukontrolle |
| 7 | DHCP | RFC 2131, RFC 2132 | Discover/Offer/Request/Ack, Relay (giaddr); ohne Antwort wiederholt der Client das Discover nach 4 s und 8 s (doppelte Wartezeit, RFC 2131 Abschnitt 4.1) und meldet nach dem dritten Versuch «kein Server»; Erneuerung nach halber Lease-Dauer; feste Zuweisungen (Reservierung nach MAC-Adresse, auch ausserhalb des Bereichs); Pools auf Router und Layer-3-Switch («ip dhcp pool», ausgeschlossene Adressen); Offer und Ack gehen als Broadcast (Client ohne Adresse) |
| 7 | DHCPv6 | RFC 9915 | Solicit/Advertise/Request/Reply mit IA_NA, DUID-LL aus der MAC; Server im Router (M-Flag im Router Advertisement), Adressen ab ::100; kein Relay, keine Präfix-Delegation |
| 7 | DNS | RFC 1034, RFC 1035, RFC 3596 | Einträge A, AAAA, CNAME (auch Ketten), MX mit Vorrang, TXT, NS, PTR (in-addr.arpa, ip6.arpa); autorisierende Antworten aus der Zone, Weiterleitung an einen anderen DNS-Server mit Cache («nicht autorisierend»), NXDOMAIN, NODATA und SERVFAIL; Client-Cache nach TTL; `nslookup -type=…`. Keine Zonenübertragung, kein DNSSEC, keine eigene Rekursion über die Root-Server |
| 7 | HTTP/1.1 | RFC 9112 | GET, Content-Length in Bytes (UTF-8), Bilder als Binärdaten; kein HTTPS |
| 7 | SMTP, POP3, IMAP | RFC 5321, RFC 1939, RFC 9051 | Kleiner Befehlsumfang, keine Authentisierung per TLS |
| 7 | SSH | RFC 4253 | Versionsaustausch im Klartext, danach nur verschlüsselte Bytes |
| 7 | RIP v2 | RFC 2453 | Update alle 5 s statt 30 s, Timeout 30 s statt 180 s; Split Horizon |
| 7 | RIPng | RFC 2080 | Wie RIP v2 über IPv6: UDP 521 an ff02::9, Absender Link-Local, Hop Limit 255; nur Updates von Link-Local-Absendern; keine Next-Hop-Einträge |
| 7 | IKEv2 | RFC 7296 | IKE_SA_INIT und IKE_AUTH mit echtem Kopf (SPIs, Austauschtyp, Flags); Diffie-Hellman nur angedeutet, Anmeldung mit gemeinsamem Schlüssel als Prüfwert; Traffic Selectors müssen gespiegelt passen (sonst TS_UNACCEPTABLE); drei Versuche à 2 s; kein Rekeying, kein CREATE_CHILD_SA |
| 7 | BGP-4 | RFC 4271 | Binär über TCP 179: OPEN, KEEPALIVE, UPDATE, NOTIFICATION; Pfadwahl nach AS-Pfad-Länge; keine Policies |

**IPv6** gibt es für Endgeräte, Router, Layer-3-Switches (auf den VLAN-Interfaces, mit Router Advertisements, DHCPv6 und RDNSS je VLAN), Internet-Box und Provider; Subinterfaces und serielle Leitungen sprechen nur IPv4. DNS (AAAA-Einträge, Anfragen über IPv6), Web, Mail und SSH laufen auch über IPv6: TCP im IPv6-Paket mit Next Header 6 und Prüfsumme über den IPv6-Pseudo-Header (RFC 8200, Abschnitt 8.1). Den DNS-Server erhalten automatisch konfigurierte Endgeräte im Router Advertisement (RDNSS, RFC 8106) oder per DHCPv6. Im Dual Stack nimmt ein Gerät mit globaler IPv6-Adresse zuerst den AAAA-, sonst den A-Eintrag (vereinfacht nach RFC 6724). In URLs steht eine IPv6-Adresse in eckigen Klammern (RFC 3986). Die Firewall prüft TCP und UDP über IPv6 mit denselben Regeln (Adressen auch als IPv6-Netz); NAT gibt es für IPv6 nicht. Beispieladressen stammen aus 2001:db8::/32 (RFC 3849), private aus fd00::/8 (RFC 4193).

**Automatisches Routing** (Häkchen beim Router oder Layer-3-Switch) ist kein Protokoll, sondern eine Abkürzung für Einsteiger: Die Simulation liest den Netzplan und trägt zu jedem Netz den Weg über die wenigsten Router ein (Code «A»). Nachbarn sind Router mit Anschlüssen im selben Netzabschnitt und Subnetz; abgeschaltete Anschlüsse zählen nicht. Führt ein Weg zum Provider oder zu einer Internet-Box, kommt eine Standardroute dazu. Es werden keine Pakete ausgetauscht, darum erscheint nichts in der Paketliste. Statische Routen und OSPF/RIP/BGP ruhen, solange das Häkchen gesetzt ist; ohne Häkchen wählt man «statisch» oder «dynamisch».

Die Routingtabelle nutzt die übliche **administrative Distanz**: direkt 0, statisch 1, eBGP 20, OSPF 110, RIP 120, iBGP 200. Gewinnt das längste Präfix, bei Gleichstand die kleinere Distanz.

## Zugangsleitungen (Modems)

Jedes Modem baut seine Verbindung nach dem passenden Standard auf. Die Schritte erscheinen in der Paketliste als eigene Rahmen. IP-Verkehr fliesst erst, wenn das Modem «online» ist.

| Art | Leitung | Ablauf im Simulator |
|---|---|---|
| Kabel (DOCSIS 3.1) | Koax | Downstream-Kanal suchen → Ranging (RNG-REQ/RSP) → DHCP und TFTP für die Konfigurationsdatei → Registration (REG-REQ/RSP) |
| Glasfaser (GPON, ITU-T G.984) | Glasfaser | Seriennummer melden → ONU-ID zuweisen (PLOAM) → Ranging → Konfiguration per OMCI → Daten in GEM-Rahmen |
| Mobilfunk (LTE) | Funk | RRC-Verbindung → Attach mit SIM (Authentisierung, Security Mode) → Default Bearer mit IP-Adresse; im pcap nur das IP-Paket |
| ADSL2+ (G.992.5), VDSL2 (G.993.2) | Telefonleitung | Training (G.994.1-Handshake) → PPPoE-Discovery → PPP LCP → PAP → IPCP |

Die **Internet-Box (CPE)** enthält dasselbe Modem: Mit Zugangstechnik baut ihr WAN-Anschluss die Leitung genauso auf, erst danach leitet ihr Router weiter. Dahinter arbeitet sie wie ein Heimrouter: Die LAN-Buchsen bilden einen internen Switch (ein Netz), der DHCP-Server vergibt Adressen im LAN, am WAN übersetzt NAT/PAT auf die öffentliche Adresse.

Nicht simuliert: Dämpfung und Distanz der Leitung, Bandbreitenbegrenzung, Funkzellenwechsel im Mobilfunk.

## Broadcast-Sturm

Ein Switch erkennt, wenn derselbe Broadcast-Rahmen mehrmals bei ihm ankommt. Das passiert nur in einer Schleife. Er drosselt dann die Weiterleitung, damit die Simulation flüssig bleibt, und meldet den Sturm. Die Oberfläche zeigt ein Banner mit den betroffenen Geräten. Ein echter Switch würde die Leitungen vollständig auslasten.

## WLAN-Roaming

Die Signalstärke hängt vom Abstand zwischen Client und Access Point und von Stockwerken ab. Wird ein Client in der Simulation verschoben, sucht er einen Access Point mit derselben SSID und demselben Passwort, der mindestens 10 Prozentpunkte stärker ist (Hysterese gegen Hin und Her). Er meldet sich dort mit Reassociation an und sendet ein Gratuitous ARP, damit die Switches den neuen Weg lernen.

## Bewusst nicht simuliert

HTTPS/TLS mit echter Verschlüsselung, QoS, Multicast-Routing, Rapid-STP, VRRP/HSRP, EVPN, MPLS, Bitfehler und Dämpfung auf der Leitung. Was davon später dazukommt, entscheidet der Unterricht.
