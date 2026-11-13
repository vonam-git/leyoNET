---
titel: Internet-Box (CPE)
kurz: Das Gerät vom Provider für zu Hause: Modem, Router mit NAT, DHCP-Server und kleiner Switch in einem Gehäuse.
reihenfolge: 10
hilfe: [device.cpe]
demos: [cpe]
uebungen: [cpe-home]
verwandt: [modem, nat, dhcp]
---
## Wozu

Zu Hause steht selten ein eigenes Modem, ein Router und ein Switch. Der Provider liefert eine **Internet-Box** (CPE, Customer Premises Equipment), die alles vereint:

| Teil | Aufgabe |
|---|---|
| Modem | Zugangsleitung (Kabel, Glasfaser, VDSL) zum Provider |
| Router mit NAT | alle Geräte erscheinen im Internet unter einer öffentlichen Adresse |
| DHCP-Server | vergibt Adressen im Heimnetz (ab Werk 192.168.1.100–199) |
| Switch | vier LAN-Buchsen im selben Netz |

## Einrichten

Einzutragen sind meist nur die **WAN-Adresse** und das **Gateway des Providers**. Ab Werk hat die Box im LAN 192.168.1.1/24. Portweiterleitungen, DHCP-Bereich und Routen stehen unter «Erweitert …». Mit IPv6 kann die Box IPv4 per [[ds-lite]] durch das IPv6-Netz des Providers tunneln.

## Was man daran lernt

Die Internet-Box zeigt, dass «Router» im Alltag ein Bündel von Funktionen ist. Die Demo «Internet-Box» zerlegt es: Leitungsaufbau, DHCP im Heimnetz, NAT am WAN.
