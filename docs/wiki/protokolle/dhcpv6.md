---
titel: DHCPv6
kurz: Adressen für IPv6 vom Server: Solicit, Advertise, Request, Reply – wann man DHCPv6 statt SLAAC nimmt.
reihenfolge: 21
schicht: 7 (Anwendung, über UDP 546/547)
uebungen: [ipv6-router]
normen: [RFC 9915, RFC 8106]
protokolle: [DHCPv6]
verwandt: [ipv6, dhcp]
---
## SLAAC oder DHCPv6?

IPv6-Geräte können ihre Adresse selbst bilden ([[ipv6|SLAAC]]). Mit **DHCPv6** vergibt stattdessen ein Server die Adressen. Das ist nützlich, wenn man genau wissen will, welches Gerät welche Adresse hat. Welches Verfahren gilt, sagt das Router Advertisement: Ist das **M-Flag** (managed) gesetzt, fragen die Geräte per DHCPv6.

## Ablauf

| Schritt | Inhalt |
|---|---|
| Solicit | Client sucht einen Server (Multicast an alle DHCP-Server) |
| Advertise | Server bietet eine Adresse an |
| Request | Client wählt das Angebot |
| Reply | Server bestätigt |

Der Client weist sich mit einer **DUID** aus (in leyoNET aus der MAC abgeleitet). Das Gateway bekommt er weiterhin aus dem Router Advertisement, nicht per DHCPv6.

## DNS-Server für IPv6

Den DNS-Server erfahren IPv6-Geräte entweder per DHCPv6 oder direkt im Router Advertisement (RDNSS-Option). In leyoNET trägt man ihn beim Router-Anschluss ein.
