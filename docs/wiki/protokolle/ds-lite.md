---
titel: DS-Lite
kurz: IPv4 durch ein reines IPv6-Netz des Providers: die Internet-Box tunnelt, der AFTR übersetzt per CGNAT.
reihenfolge: 31
schicht: 3 (Tunnel)
hilfe: [dsLite]
demos: [dsLite]
uebungen: [ds-lite]
normen: [RFC 6333, RFC 2473]
protokolle: [DS-Lite]
verwandt: [ipv6, nat, internet-box]
---
## Das Problem

Viele Provider bauen ihr Netz nur noch mit IPv6. Die Geräte zu Hause und viele Webseiten sprechen aber noch IPv4. **Dual-Stack Lite** bringt IPv4 trotzdem ans Ziel, ohne dass der Kunde eine eigene öffentliche IPv4-Adresse braucht.

## So funktioniert es

| Station | Aufgabe |
|---|---|
| PC zu Hause | spricht IPv4 wie immer (privat, z.B. 192.168.1.10) |
| Internet-Box (**B4**) | packt jedes IPv4-Paket in ein IPv6-Paket (Next Header 4) und schickt es zum AFTR |
| Provider (**AFTR**) | packt aus, übersetzt die Absenderadresse per CGNAT und schickt das IPv4-Paket ins Internet |

IPv6-Verkehr geht dagegen direkt, ohne Tunnel und ohne NAT.

## Folgen

Die Internet-Box macht kein NAT mehr selbst, die Übersetzung passiert beim Provider. Darum funktionieren **Portweiterleitungen** über IPv4 nicht: Wer von aussen auf ein Gerät zu Hause zugreifen will, braucht IPv6. In der Paketliste sieht man aussen den IPv6-Kopf und innen das IPv4-Paket.
