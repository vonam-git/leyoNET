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
| Switching | Router-on-a-Stick, Layer-3-Switch | Routing zwischen VLANs, DHCP-Relay |
| Routing | Statische Routen, OSPF, RIP, BGP | `tracert` über die Router, Protokollmeldungen, gelernte Routen |
| Zugang | NAT, Internet-Box (CPE), serielle Leitung mit PPP, WLAN-Mesh | NAT-Tabelle, DOCSIS-Aufbau, LCP/IPCP, Mesh |
| Sicherheit | Firewall mit DMZ | Webseite erlaubt, Ping blockiert, Trefferzähler je Regel |
| Sicherheit | VPN zwischen zwei Standorten | IKEv2-Aushandlung, ESP-Pakete im Internet, Tunnelstatus |

**Schritt für Schritt** (bei ARP/Ping, Gateway, DHCP, DNS/HTTP, SNAT, DNAT, Internet-Box, DS-Lite, Firewall und VPN): Ein Avatar als Lehrperson erklärt den Testfall in kleinen Schritten. Er hebt Geräte hervor, öffnet die passenden Einstellungen, startet Aktionen und hält die Simulation an, damit die Klasse im Einzelschritt mitgeht. Jede Person kann den Avatar selbst einstellen (Frisur, Bart, Brille, Hautton, Shirt, Headset); gespeichert wird nur das Aussehen, im eigenen Browser.

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

Im Aufgaben-Katalog gibt es die Reihe **«Modul 117»** (Filter oben im Katalog) mit den Übungen aus Block 6 «IP und Router» und Block 7 «Netzwerkdienste»:

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

Zu jeder Übung gibt es ein **ausfüllbares Arbeitsblatt** (PDF) mit den Fragen, die sich nicht automatisch prüfen lassen (Netz-ID, Beobachtungen, Begründungen), dazu eine Version mit Musterlösung: [docs/arbeitsblaetter](arbeitsblaetter/README.md). Die Lernenden geben das ausgefüllte PDF und ihre Projektdateien über die Plattform der Klasse ab (z.B. Teams oder Moodle); ausgewertet wird mit **«Abgaben auswerten …»**.

Die praktische Prüfung (LB3) erstellt **Werkzeuge → Prüfung erstellen …**: eine gewürfelte Variante oder eine eigene je Platz, 75 Punkte, Note = 5 × Punkte / 75 + 1. Die Lernenden erhalten eine Prüfungsdatei ohne Prüfbausteine und Lösungen; du behältst den Schlüssel und wertest damit aus, mit Nachkorrektur und Berichten. Jede andere Aufgabe wird mit **Werkzeuge → Als Prüfung speichern …** zur Prüfung, auch als Fehlersuche mit zufälligen Fehlern je Platz. Ablauf, Prüfungsmodus und Grenzen: [pruefungen.md](pruefungen.md).

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
