---
titel: TCP/IP-Modell
kurz: Vier Schichten nach RFC 1122 statt sieben nach ISO/IEC 7498-1: wie die beiden Modelle zusammenpassen und warum das Internet nach dem TCP/IP-Modell gebaut ist.
reihenfolge: 1.5
schicht: 1 bis 7
normen: [ISO/IEC 7498-1, RFC 1122, RFC 1123]
verwandt: [osi-modell, rahmen-und-pakete, ports-dienste]
---
## Zwei Modelle, ein Netz

Das **OSI-Referenzmodell** (ISO/IEC 7498-1) beschreibt Kommunikation in sieben Schichten. Es ist ein Denkmodell: Jede Schicht hat eine klare Aufgabe und spricht nur mit der Schicht darunter und darüber. Das **TCP/IP-Modell** stammt aus den Anforderungen an Internet-Hosts (RFC 1122 für die unteren, RFC 1123 für die Anwendungsschicht) und kennt nur vier Schichten. Nach ihm sind die Protokolle des Internets gebaut.

| TCP/IP (RFC 1122) | OSI (ISO/IEC 7498-1) | Beispiele | Dateneinheit |
|---|---|---|---|
| Anwendung | 7 Anwendung, 6 Darstellung, 5 Sitzung | HTTP, DNS, DHCP, SMTP | Daten |
| Transport | 4 Transport | TCP, UDP | Segment, Datagramm |
| Internet | 3 Vermittlung | IPv4, IPv6, ICMP | Paket |
| Netzzugang (Link) | 2 Sicherung, 1 Bitübertragung | Ethernet, WLAN, PPP | Rahmen, Bits |

## Was die Schichten tun

- **Netzzugang:** bringt Rahmen über ein einzelnes Medium zum nächsten Gerät. Adressen sind lokal (MAC-Adressen).
- **Internet:** bringt Pakete über viele Netze bis zum Ziel. Adressen sind weltweit eindeutig (IP-Adressen); Router entscheiden den Weg.
- **Transport:** verbindet Programme auf den Endgeräten über Ports. TCP sorgt für Reihenfolge und Wiederholung, UDP schickt einfach los.
- **Anwendung:** der eigentliche Dienst, etwa eine Webseite oder eine Namensauflösung. Darstellung (Kodierung, Verschlüsselung) und Sitzung (Verbindung halten) erledigt im Internet meist die Anwendung selbst.

## Ende-zu-Ende-Prinzip

RFC 1122 verlangt, dass Router das Netz einfach halten: Sie lesen nur bis Schicht 3 und leiten weiter. Zuverlässigkeit, Reihenfolge und Sicherheit liegen bei den Endgeräten. Darum sieht man in leyoNET, wie ein Router den Ethernet-Kopf ersetzt und die TTL verringert, aber TCP-Segmente unverändert lässt (ausser NAT ändert Adressen und Ports).

> In leyoNET: Die Paketdetails zeigen alle sieben OSI-Schichten. Schicht 5 und 6 bleiben grau mit dem Hinweis «bei TCP/IP Teil der Anwendung», genau wie es das TCP/IP-Modell vorsieht.
