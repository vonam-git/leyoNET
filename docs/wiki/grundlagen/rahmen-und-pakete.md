---
titel: Aufbau von Rahmen und Paketen
kurz: Wie Ethernet-Rahmen, IPv4- und IPv6-Pakete, TCP-Segmente und UDP-Datagramme ineinanderstecken, Feld für Feld nach Norm, mit echten Bytes aus leyoNET.
reihenfolge: 2
schicht: 1 bis 7
demos: [web, routerOnAStick]
normen: [IEEE 802.3, IEEE 802.1Q, IEEE 802.2, IEEE 802.11, RFC 791, RFC 8200, RFC 9293, RFC 768, RFC 826, RFC 1042, RFC 1662, RFC 2474, RFC 3168]
protokolle: [Ethernet II, 802.1Q; IPv4; IPv6; TCP; UDP]
verwandt: [osi-modell, ethernet-mac, vlan, ipv4, ipv6, tcp, udp]
---
## Verschachtelung

Jede Schicht packt die Daten der Schicht darüber ein: Sie setzt ihren **Kopf** (Header) davor und behandelt alles Übrige als **Nutzdaten** (Payload). Nur Ethernet hängt zusätzlich etwas hinten an: die Prüfsumme **FCS**. Auf der Leitung kommen noch Präambel und SFD davor und eine kurze Pause danach. Das ist Schicht 1, kein Mitschnitt zeigt sie.

{{aufbau http}}

Mit «Nächste Hülle einpacken» entsteht der Rahmen Schritt für Schritt, so wie im Sender: oben die HTTP-Anfrage, unten die Bits auf dem Kabel. Der Empfänger packt in umgekehrter Reihenfolge wieder aus. Ein Switch öffnet nur die Hülle der Schicht 2, ein Router auch die der Schicht 3 (siehe [[osi-modell]]).

| Schicht | Dateneinheit | Kopf enthält | Beispiel |
|---|---|---|---|
| 7 Anwendung | Daten | je nach Dienst | HTTP-Anfrage, DNS-Frage |
| 4 Transport | Segment (TCP), Datagramm (UDP) | Ports | TCP 20 Byte, UDP 8 Byte |
| 3 Vermittlung | Paket | IP-Adressen, TTL | IPv4 20 Byte, IPv6 40 Byte |
| 2 Sicherung | Rahmen (Frame) | MAC-Adressen, Typ; FCS am Ende | Ethernet 14 + 4 Byte |
| 1 Bitübertragung | Bits | Präambel, SFD | 8 Byte vor jedem Rahmen |

## Ein Rahmen, wie leyoNET ihn zeigt

Dieser Rahmen stammt aus der Simulation. Die Paketliste zeigt jeden Rahmen genau so: oben die Anwendung, unten die Bitübertragung, jede Schicht in ihrer Farbe. Darunter liegen die Bytes, wie sie auf der Leitung stehen.

{{paket http}}

> In leyoNET: Simulation starten, in der Paketliste eine Zeile anklicken. Unter jeder Schicht öffnet «Aufbau nach Norm» das Bild des Kopfs mit den Werten genau dieses Rahmens, darunter steht die Verschachtelung. Die Hex-Ansicht lässt sich unter Werkzeuge → Funktionsumfang einschalten.

## Der Ethernet-Rahmen

Ethernet-Rahmen nach IEEE 802.3 sind mindestens **64 Byte** und höchstens **1518 Byte** lang (mit VLAN-Tag 1522), gezählt von der Ziel-MAC bis und mit FCS. Ist das Paket kürzer als 46 Byte, füllt der Sender mit Nullen auf (Padding), so etwa bei jeder ARP-Anfrage. Die **FCS** (Frame Check Sequence) ist eine CRC-32 über den ganzen Rahmen. Der Empfänger rechnet sie nach; stimmt sie nicht, verwirft er den Rahmen ohne Meldung. Die Fehlerbehandlung überlässt Ethernet den oberen Schichten.

{{format ethernet2}}

Viele Mitschnitte zeigen die FCS nicht, weil die Netzwerkkarte sie vorher prüft und entfernt. leyoNET zeigt sie und schreibt sie auch in die pcapng-Datei (mit dem Hinweis «4 Byte FCS» für Wireshark).

### Mit VLAN-Tag

Auf einem Trunk steckt zwischen Quell-MAC und EtherType ein 4 Byte langer Tag nach IEEE 802.1Q. Er beginnt mit 0x8100, danach folgen Priorität und VLAN-Nummer (siehe [[vlan]]).

{{format dot1q}}

{{format ethernet2q}}

### IEEE 802.3 mit LLC und SNAP

Steht an der Stelle des EtherType eine Zahl bis 1500, ist es eine **Länge**. Dann folgt ein LLC-Kopf nach IEEE 802.2, der sagt, für welchen Dienst die Daten sind. Spanning Tree (STP) nutzt diese Form mit DSAP und SSAP 0x42. Mit DSAP 0xAA folgt ein SNAP-Kopf mit dem EtherType (RFC 1042); so tragen WLAN und andere IEEE-802-Netze IP-Pakete.

{{format ieee8023}}

### WLAN-Rahmen

Ein WLAN-Rahmen nach IEEE 802.11 hat bis zu vier Adressen, weil Sender und Empfänger auf der Funkstrecke nicht immer Quelle und Ziel sind (der Access Point steht dazwischen). Auch er endet mit einer CRC-32-FCS. Daten laufen mit LLC/SNAP und mit WPA2 verschlüsselt.

{{format wlan}}

### PPP auf seriellen Leitungen

Auf einer Punkt-zu-Punkt-Leitung braucht es keine MAC-Adressen. PPP in HDLC-ähnlicher Rahmung (RFC 1662) setzt Flags 0x7E an Anfang und Ende, eine feste Adresse und Steuerung, das Protokoll und am Ende eine FCS mit 16 Bit (siehe [[ppp-hdlc]]).

{{format ppp}}

## Das IPv4-Paket

Der IPv4-Kopf nach RFC 791 ist ohne Optionen **20 Byte** lang. Router lesen vor allem die Ziel-IP (für den Weg) und die TTL (gegen Schleifen). Die Prüfsumme deckt nur den Kopf ab; weil jeder Router die TTL verringert, rechnet er sie neu. DSCP und ECN (früher «Type of Service») sind in RFC 2474 und RFC 3168 festgelegt.

{{format ipv4}}

## Das IPv6-Paket

Der IPv6-Kopf nach RFC 8200 ist immer **40 Byte** lang, die Adressen allein brauchen 32 davon. Er ist einfacher als bei IPv4: keine Prüfsumme (das erledigen Ethernet und TCP/UDP), keine Fragmentierung durch Router, Optionen nur als Erweiterungsköpfe hinter dem Kopf (Next Header).

{{format ipv6}}

| | IPv4 | IPv6 |
|---|---|---|
| Kopflänge | 20 bis 60 Byte | fest 40 Byte |
| Adressen | 32 Bit | 128 Bit |
| Lebensdauer | TTL | Hop Limit |
| Was folgt | Protokoll | Next Header |
| Prüfsumme im Kopf | ja | nein |
| Fragmentieren | Sender und Router | nur der Sender |

## Das TCP-Segment

Der TCP-Kopf nach RFC 9293 ist ohne Optionen **20 Byte** lang. Sequenz- und Bestätigungsnummer zählen Bytes; die Flags steuern Aufbau (SYN), Bestätigung (ACK) und Abbau (FIN) der Verbindung (siehe [[tcp]]).

{{format tcp}}

## Das UDP-Datagramm

UDP nach RFC 768 hat nur **8 Byte** Kopf: zwei Ports, Länge, Prüfsumme. Keine Verbindung, keine Bestätigung (siehe [[udp]]).

{{format udp}}

## Grössen und Prüfsummen auf einen Blick

| Was | Grösse | Warum |
|---|---|---|
| MTU Ethernet | 1500 Byte | grösstes Paket in einem Rahmen |
| Ethernet-Rahmen | 64 bis 1518 Byte | Kopf 14 + Nutzdaten 46–1500 + FCS 4 |
| auf der Leitung zusätzlich | 20 Byte | Präambel 7, SFD 1, Pause 12 |
| MSS bei TCP über IPv4 | 1460 Byte | 1500 − 20 (IPv4) − 20 (TCP) |
| MSS bei TCP über IPv6 | 1440 Byte | 1500 − 40 (IPv6) − 20 (TCP) |

| Prüfsumme | Schicht | deckt ab | wer prüft |
|---|---|---|---|
| FCS (CRC-32) | 2 | den ganzen Rahmen | jede Netzwerkkarte, jeder Switch |
| IPv4-Kopfprüfsumme | 3 | nur den IPv4-Kopf | jeder Router |
| TCP- und UDP-Prüfsumme | 4 | Kopf, Daten und die IP-Adressen (Pseudokopf) | nur das Ziel |
