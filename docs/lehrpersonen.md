# Hinweise für Lehrpersonen

## Einsatz nach Lehrjahr

| Stufe | Profil | Typische Themen | Katalog |
|---|---|---|---|
| 1. Lehrjahr | 1 | Zwei PCs, Switch, Subnetze, Router, DHCP, erste Pakete (ARP, ICMP) | ★ – ★★ |
| 1.–2. Lehrjahr | 2 | DNS, Web, WLAN, Internet, statische Routen, Ports abschalten, VLSM, Offerten (Budget) | ★★ – ★★★ |
| 2.–3. Lehrjahr | 3 | VLANs mit Farben, STP und Broadcast-Sturm, NAT, Firewall, Modems, Client-Gruppen, CLI | ★★★ |
| 3.–4. Lehrjahr | 4 | Serielle WAN-Leitungen, OSPF, RIP, statisches NAT/DMZ, CGNAT, IPv6 (SLAAC, DHCPv6), DS-Lite, VPN, SSH, Hex und pcap | ★★★★ |
| Fachhochschule | 5 | BGP zwischen autonomen Systemen | ★★★★★ |

Profile und Funktionsdateien: [funktionsprofile.md](funktionsprofile.md).

## Demo-Netze zum Vorführen

**Datei → Demo-Netze …** (oder ▶ in der Werkzeugleiste) enthält zu jedem Protokoll ein fertig konfiguriertes Netz. **Vorführen** lädt es, startet die Simulation und löst nach kurzer Zeit die passende Aktion aus, mit geöffnetem Desktop (z.B. Ping, `tracert`, Webseite, E-Mail). So lässt sich ein Protokoll im Unterricht ohne Vorbereitung zeigen. **Öffnen** lädt das Netz nur, zum Erklären oder Verändern. Das bisherige Projekt holt «Rückgängig» zurück.

| Thema | Demo | Was die Klasse sieht |
|---|---|---|
| Grundlagen | ARP und Ping im LAN | ARP-Broadcast, Antwort, vier ICMP-Echos, MAC-Tabelle des Switches |
| Grundlagen | Standardgateway | Paket an den Router, TTL sinkt |
| Dienste | DHCP (DORA) | Discover, Offer, Request, Ack; `ipconfig /all` |
| Dienste | DNS, TCP und HTTP | DNS-Abfrage, TCP-Handshake, HTTP im Browser |
| Dienste | E-Mail | SMTP, IMAP |
| Switching | VLAN und Spanning Tree | blockierter Port, 802.1Q-Tag auf dem Trunk |
| Switching | Broadcast-Sturm | Schleife ohne STP, Sturm-Warnung |
| Switching | Port-Channel mit LACP | zwei Kabel gebündelt, LACPDUs, kein blockierter Port |
| Switching | VXLAN zwischen zwei Standorten | ARP und Ping in UDP 4789, OSPF-Underlay mit Loopbacks |
| Routing | Rechenzentrum Leaf-Spine mit BGP und VXLAN | eBGP-Underlay mit Loopbacks, zwei VNIs über drei Leafs, ARP und Ping in UDP 4789 |
| Routing | VRF: zwei Kunden, gleiche Adressen | gleiche Adresse, verschiedene Server je nach VRF |
| Switching | Router-on-a-Stick, Layer-3-Switch | Routing zwischen VLANs, DHCP-Relay |
| Routing | Statische Routen, OSPF, RIP, BGP | `tracert` über die Router, Protokollmeldungen, gelernte Routen |
| Zugang | NAT, Internet-Box (CPE), serielle Leitung mit PPP, WLAN-Mesh | NAT-Tabelle, DOCSIS-Aufbau, LCP/IPCP, Mesh |
| Sicherheit | Firewall mit DMZ; Firewall-Gerät und ACL | Webseite erlaubt, Ping blockiert, Trefferzähler je Regel; Zonen WAN/LAN/DMZ, ACL am Switch-Port verwirft Gast-Pings |
| Sicherheit | VPN zwischen zwei Standorten | IKEv2-Aushandlung, ESP-Pakete im Internet, Tunnelstatus |

**Schritt für Schritt** (bei ARP/Ping, Gateway, DHCP, DNS/HTTP, SNAT, DNAT, Internet-Box, DS-Lite, Firewall, Firewall-Gerät mit ACL, VPN, VXLAN, Port-Channel und Rechenzentrum): Ein Avatar als Lehrperson erklärt den Testfall in kleinen Schritten. Er hebt Geräte hervor, öffnet die passenden Einstellungen, startet Aktionen und hält die Simulation an, damit die Klasse im Einzelschritt mitgeht. Jede Person kann den Avatar selbst einstellen (Frisur, Bart, Brille, Hautton, Shirt, Headset); gespeichert wird nur das Aussehen, im eigenen Browser.

Tipp: Vorführen, dann mit **Leertaste** anhalten und mit **N** im Einzelschritt weitergehen. Jedes ankommende Paket wird dabei Schicht für Schicht ausgepackt (OSI-Farben unten eingeblendet), was die Kapselung gut sichtbar macht. Jede Demo wird bei jedem Release automatisch geprüft (`src/ui/demos.test.ts`); die Dateien liegen auch in [docs/beispiele](beispiele).

## Aufgabenkatalog

**Werkzeuge → Aufgaben-Katalog** enthält fertige Übungen mit automatischer Prüfung. Jede Übung schaltet beim Start die Funktionen ein, die sie braucht, sofern Profil und Admin das erlauben. Für jede gibt es im Code eine Musterlösung, die ein Test bei jedem Build prüft (`src/ui/catalog.test.ts`).

| Sterne | Übung | Inhalt |
|---|---|---|
| ★ | Zwei Rechner verbinden | direkt verkabeln, Adressen im selben Netz |
| ★ | Pakete mitschneiden | ARP-Anfrage und -Antwort in der Paketliste finden |
| ★ | Büro mit Budget | Switch wählen und verkabeln, Kosten unter einer Grenze |
| ★ | Gast aussperren | Switch-Port abschalten, ohne das Kabel zu ziehen |
| ★ | Wer hat die Adresse doppelt? | doppelte IP-Adresse finden und beheben |
| ★ | Drei Router, automatisch geroutet | automatisches Routing einschalten, auch beim Router in der Mitte |
| ★★ | Kleines LAN mit Switch | Switch und Adressen |
| ★★ | Zwei Netze mit einem Router | Router und Gateways |
| ★★ | Ein ganzes Schulzimmer | Client-Gruppe mit 25 PCs per DHCP versorgen |
| ★★ | VLANs dokumentieren | VLANs benennen und einfärben |
| ★★ | Glasfaseranschluss | ONT per Glasfaser mit dem Provider verbinden |
| ★★ | Zwei Router, zwei statische Routen | Hin- und Rückweg mit statischen Routen |
| ★★ | Internet-Box anschliessen | CPE mit WAN-Adresse und Provider-Gateway einrichten |
| ★★★ | Adressen per DHCP verteilen | DHCP-Server |
| ★★★ | Webseite über DNS aufrufen | DNS-Eintrag und Client-Konfiguration |
| ★★★ | WLAN im Klassenzimmer | Access Point und WLAN-Clients |
| ★★★ | Schleife ohne Sturm | Broadcast-Sturm erkennen und mit STP beheben |
| ★★★ | Ins Internet mit NAT | NAT und Standardroute |
| ★★★ | VDSL-Anschluss | Telefonleitung, Training und PPPoE |
| ★★★ | Subnetze nach Bedarf (VLSM) | VLSM mit dem IP-Rechner |
| ★★★ | RIP in der Kette | dynamisches Routing mit RIP |
| ★★★ | Das NAS von unterwegs erreichen | Portweiterleitung (DNAT) |
| ★★★ | IPv6 einrichten | Router-Präfixe setzen, PCs per SLAAC |
| ★★★ | Firewall: DMZ absichern | Standardregel «Verbieten», nur HTTP zum Webserver, LAN darf hinaus |
| ★★★★ | DS-Lite einrichten | IPv4 im IPv6-Tunnel, AFTR mit CGNAT |
| ★★★★ | VPN: Zürich und Bern verbinden | IPsec-Tunnel gespiegelt auf beiden Routern |
| ★★★★ | Netze mit VLANs trennen | Access-Ports |
| ★★★★ | Router-on-a-Stick | Trunks und Subinterfaces |
| ★★★★ | Standorte über eine serielle Leitung | serielle Leitung mit PPP und statischen Routen |
| ★★★★ | Routing mit OSPF | Nachbarschaften und gelernte Routen |
| ★★★★ | Webserver mit eigener öffentlicher Adresse | 1:1-NAT |
| ★★★★ | SNAT: feste Absenderadresse für den Mailserver | statisches SNAT, ohne Zugang von aussen |
| ★★★★ | DNAT: Webserver unter eigener Adresse | statisches DNAT, ausgehend weiter PAT |
| ★★★★★ | Campus mit Layer-3-Switch und Glasfaser | SVIs, DHCP-Relay, Glasfaser-Uplinks |
| ★★★★★ | Zwei autonome Systeme mit BGP | eBGP, angekündigte Netze |

## Modul 117: Übungen, Arbeitsblätter und Prüfung

Im Aufgaben-Katalog gibt es den Reiter **«M117»** (Reiter oben im Katalog) mit den Übungen aus Block 6 «IP und Router» und Block 7 «Netzwerkdienste»:

| Sterne | Übung | Arbeitsblatt |
|---|---|---|
| ★ | UE03 Router01 – Auftrag 1: Ein Netz mit zwei Switches | M06C_M117_UE03_Router01 |
| ★ | UE03 Router01 – Auftrag 2: Zwei Netze an denselben Switches | M06C_M117_UE03_Router01 |
| ★★ | UE03 Router01 – Auftrag 3: Maske /25 | M06C_M117_UE03_Router01 |
| ★★ | UE03 Router01 – Auftrag 4: Maske /26 (optional) | M06C_M117_UE03_Router01 |
| ★★ | UE04 Router02 – Auftrag 1: Ein Router verbindet Sursee und Zürich | M06D_M117_UE04_Router02 |
| ★★★ | UE04 Router02 – Auftrag 2: Zwei Router mit Transfernetz | M06D_M117_UE04_Router02 |
| ★★★★ | UE05 Router03: Drei Standorte mit Standleitungen | M06E_M117_UE05_Router03 |
| ★★★ | UE01 Netzwerkdienste: Firmennetz Watch SA mit DHCP | M07A_M117_UE01_Netzwerkdienste |
| ★★★★ | UE02 Netzwerkdienste: Webserver, DNS und feste Zuweisungen | M07B_M117_UE02_Netzwerkdienste |
| ★★★★★ | UE03 Netzwerkdienste: Firmennetz Holzer AG (Prüfungsvorbereitung mit Punkten und Note) | M07C_M117_UE03_Netzwerkdienste |

Zu jeder Übung gibt es ein **ausfüllbares Arbeitsblatt** (PDF) mit den Fragen, die sich nicht automatisch prüfen lassen (Netz-ID, Beobachtungen, Begründungen), dazu eine Version mit Musterlösung: [docs/arbeitsblaetter](arbeitsblaetter/README.md). Für den Einsatz an der Schule (Datenschutz und Informationssicherheit): [ISDS-Konzept](isds-konzept.md) und [DSFA-Abklärung](dsfa-abklaerung.md). Die Musterlösungen gibt es nicht zum Herunterladen, sondern für Lehrpersonen auf Anfrage per E-Mail (Adresse im Impressum auf [leyonet.ch](https://leyonet.ch/impressum.html)). Die Lernenden geben das ausgefüllte PDF und ihre Projektdateien über die Plattform der Klasse ab (z.B. Teams oder Moodle); ausgewertet wird mit **«Abgaben auswerten …»**.

Die praktische Prüfung (LB3) erstellt **Werkzeuge → Prüfung erstellen …**: eine gewürfelte Variante oder eine eigene je Platz, 75 Punkte, Note = 5 × Punkte / 75 + 1. Die Lernenden erhalten eine Prüfungsdatei ohne Prüfbausteine und Lösungen; du behältst den Schlüssel und wertest damit aus, mit Nachkorrektur und Berichten. Jede andere Aufgabe wird mit **Werkzeuge → Als Prüfung speichern …** zur Prüfung, auch als Fehlersuche mit zufälligen Fehlern je Platz. In der **Webversion** lädst du Prüfungsdatei und Schlüssel in der Admin-Konsole hoch, verteilst Platzkarten mit Platz-Codes, gibst je Platz Nachteilsausgleich und lässt am Ende automatisch auswerten; gespeichert wird alle 20 Sekunden, abgegeben automatisch. Ablauf, Prüfungsmodus, «wer ist wer» und Grenzen: [pruefungen.md](pruefungen.md).

## Modul 129: Subnetting, Routing und Protokollanalyse

Der Reiter **«M129»** im Aufgaben-Katalog enthält drei Gruppen mit je einem ausfüllbaren Arbeitsblatt. Alles läuft in leyoNET: Router, Firewall, Server und die Paketanalyse. Adressen im «Internet» stammen aus den Dokumentationsbereichen nach RFC 5737, Namen enden auf `.example`.

| Sterne | Übung | Arbeitsblatt |
|---|---|---|
| ★★ | Subnetting – Auftrag 1: Vier gleich grosse Subnetze | M129_Subnetting |
| ★★★★ | Subnetting – Auftrag 2: Subnetze nach Bedarf (VLSM) | M129_Subnetting |
| ★★★ | Subnetting – Auftrag 3: Fehlersuche im Firmennetz | M129_Subnetting |
| ★★★ | Routing – Auftrag 1: Drei Router statisch verbinden | M129_Routing |
| ★★★★ | Routing – Auftrag 2: Ins Internet mit NAT | M129_Routing |
| ★★★ | Routing – Auftrag 3: Verwaltungsnetz und SSH | M129_Routing |
| ★★ | Protokollanalyse – Auftrag 1: ICMP und TTL | M129_Protokollanalyse |
| ★★★ | Protokollanalyse – Auftrag 2: DHCP | M129_Protokollanalyse |
| ★★★★ | Protokollanalyse – Auftrag 3: ARP, DNS und HTTP | M129_Protokollanalyse |

Neu sind **Fragen direkt in leyoNET** (Baustein «Antwort»): z.B. der EtherType von ARP oder die TTL nach der Firewall. «Prüfen» bewertet sie zusammen mit den Netzzielen. Das Arbeitsblatt zum Routing zeigt die passenden Befehle für die Befehlszeile der Router. Nummern und Titel der Übungen lassen sich später an die Unterlagen der Schule anpassen (`src/ui/catalogM129.ts`, Texte in `src/i18n`, Arbeitsblätter in `scripts/arbeitsblaetter/inhaltM129.mjs`).

### Modul 145: VLAN, Inter-VLAN-Routing, DHCP, Netzwerkdesign

Der Reiter **«M145»** folgt den Unterrichtseinheiten UE02 bis UE09 und ergänzt sie um Netzwerkdesign (UE10 Three-Tier, UE11 Collapsed Core) und drei Zusatzübungen. Zu jeder UE gibt es ein Arbeitsblatt in [docs/arbeitsblaetter/](arbeitsblaetter/README.md). Die Übungen bauen auf einem gemeinsamen Firmennetz auf: ENTWICKLUNG VLAN 10, VERWALTUNG VLAN 20, SALES VLAN 30, ITMGMT VLAN 40, je 192.168.<VLAN>.0/24, Gateway .1.

| Sterne | Übung | Arbeitsblatt |
|---|---|---|
| ★ | UE02 Netzwerk OldSchool: Zwei Netze mit einem Router | M145_UE02_Netzwerk_OldSchool |
| ★★ | UE03 Portbasiertes VLAN | M145_UE03_Portbasiertes_VLAN |
| ★★★ | UE04 Trunk VLAN über zwei Stockwerke | M145_UE04_Trunk_VLAN |
| ★★★ | UE05 VLAN Theorie-Check (Broadcast mit Native-VLAN-Fehlern) | M145_UE05_VLAN_Theorie_Check |
| ★★★ | UE06 Router-on-a-Stick | M145_UE06_Router_on_a_Stick |
| ★★★ | UE07 Layer-3-Switch mit SVIs | M145_UE07_Layer_3_Switch |
| ★★★★ | UE07b Layer-3-Switch mit ACL | M145_UE07b_Layer_3_Switch_mit_ACL |
| ★★★ | UE08 DHCP-Pools auf dem Layer-3-Switch | M145_UE08_DHCP |
| ★★★★ | UE09 DHCP extern mit Relay | M145_UE09_DHCP_extern |
| ★★★★★ | UE10 Three-Tier (Core, Distribution, Access, OSPF) | M145_UE10_Three_Tier |
| ★★★★ | UE11 Collapsed Core mit Spanning Tree | M145_UE11_Collapsed_Core |
| ★★★★ / ★★★ / ★★★★ | Zusatz 1–3: Fehlersuche, Management-VLAN und natives VLAN, Port-Channel | M145_Zusatzuebungen |

Neu dafür: DHCP-Pools auf Routern und Layer-3-Switches («ip dhcp pool»), Zugriffslisten an VLAN-Interfaces («ip access-group NAME in|out» auf «interface vlan N») und die Prüfbausteine `hostVlan` und `trunk`. Das Rätsel in UE05 ist eine eigene Aufgabe von leyoNET (nicht aus den Unterlagen kopiert).

Weitere Module erhalten einen eigenen Reiter, sobald ihre Übungen eine Reihe (`series`) haben, z.B. `m123`.

### Katalog durchsuchen

Oben im Katalog sucht das Suchfeld in Titel, Beschreibung, Arbeitsblatt und Themen (mehrere Wörter: alle müssen vorkommen, «ue» findet auch «ü»). Die **Themen** (VLAN, DHCP, OSPF, ACL …) leitet leyoNET aus den Funktionen und Prüfbausteinen jeder Übung ab; ein Klick filtert, mehrere Themen zeigen Übungen mit mindestens einem davon. **«Nur passend zu meinem Profil»** blendet Übungen aus, die Funktionen ausserhalb des eingestellten Funktionsprofils brauchen.

## Eigene Aufgaben

Unter **Werkzeuge → Aufgabe erstellen** entsteht eine Aufgabe aus dem aktuellen Netz und Prüfbausteinen. Gespeichert wird sie als `.json`, die Lernende öffnen. Beschreibung aller Bausteine: [aufgaben.md](aufgaben.md).

Ideen für die neuen Funktionen:

- **Offerte:** «Plane das Netz für ein Büro mit 12 Arbeitsplätzen für höchstens 20 000 CHF» → Bausteine `budget`, `ping`, `groupLeases`.
- **Fehlersuche Schleife:** Netz mit Ring ohne STP abgeben → `noStorm` und `ping`.
- **Provider wechseln:** Gleiches Heimnetz mit Kabel-, Glasfaser- und Mobilfunkmodem → `modemOnline`, `linkUp` mit `medium`.
- **Dynamisches Routing:** statische Routen durch OSPF ersetzen → `routeLearned` mit `protocol: "ospf"`, `neighbors`.
- **Firewall-Fehlersuche:** Netz mit falsch geordneten Regeln abgeben (Verbieten vor Erlauben) → `http` und `noPing`.
- **Dokumentation:** alle VLANs benennen und einfärben → `vlanDocumented`.

## Abgaben auswerten

**Werkzeuge → Aufgabe prüfen …** prüft die abgegebenen Dateien einer ganzen Klasse gegen die Aufgabe und exportiert die Punkte als CSV. Alle Dateien bleiben auf dem Gerät der Lehrperson.

## Webversion mit Klassen

In der Webversion eröffnet die Lehrperson in der Admin-Konsole eine Klasse mit einer Bezeichnung ohne Personenbezug (z.B. «INF22a»). Lernende treten mit dem Klassencode bei. Die Lehrperson sieht Session-Codes, aber keine Namen. Wer welchen Code hat, klärt die Klasse selbst. Einrichtung: [plesk.md](plesk.md).

## Datenschutz im Unterricht

Lernende brauchen kein Konto und geben keine Namen ein. Projektdateien enthalten nur Technik (Geräte, Adressen, Konfiguration). Gerätenamen wie «PC Anna» sind möglich, aber nicht nötig. Am besten bittet man die Klasse, Geräte neutral zu benennen. Details und Vorlage für die Datenschutzerklärung: [datenschutz.md](datenschutz.md).
