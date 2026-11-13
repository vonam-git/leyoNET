---
titel: IPv6
kurz: 128-Bit-Adressen, Präfixe, Link-Local, Neighbor Discovery statt ARP und automatische Adressen mit SLAAC.
reihenfolge: 12
schicht: 3 (Vermittlung)
hilfe: [ipv6]
demos: [ipv6, ipv6Services]
uebungen: [ipv6-router]
normen: [RFC 8200, RFC 4291, RFC 5952, RFC 4861, RFC 4862, RFC 3849]
protokolle: [IPv6; ICMPv6, Neighbor Discovery; SLAAC]
verwandt: [dhcpv6, ds-lite, ipv4, icmp]
---
## Adressen

Eine IPv6-Adresse hat 128 Bit, geschrieben als acht Gruppen zu vier Hexadezimalziffern. Führende Nullen fallen weg, eine Folge von Nullgruppen darf einmal durch `::` ersetzt werden: `2001:db8:1:0:0:0:0:10` wird `2001:db8:1::10`.

| Art | Beispiel | Zweck |
|---|---|---|
| Global | `2001:db8:1::10/64` | weltweit routbar (2001:db8::/32 nur für Beispiele) |
| Link-Local | `fe80::…` | entsteht automatisch, nur im eigenen Netz, z.B. für Router-Nachbarn |
| Unique Local | `fd00::/8` | privat, wie RFC-1918-Adressen bei IPv4 |
| Multicast | `ff02::1` (alle), `ff02::2` (alle Router) | statt Broadcast |

Ein Netz hat in der Regel ein **/64-Präfix**: 64 Bit Netz, 64 Bit für das Gerät.

## Neighbor Discovery

IPv6 kennt kein ARP und keinen Broadcast. Stattdessen nutzt es ICMPv6:

- **Neighbor Solicitation / Advertisement:** «Wer hat diese Adresse?» an eine Multicast-Adresse, Antwort mit der MAC.
- **Router Solicitation / Advertisement:** Router kündigen ihr Präfix, ihr Gateway und Optionen an (z.B. DNS-Server).

## SLAAC

Mit **SLAAC** bildet ein Gerät seine Adresse selbst: Präfix aus dem Router Advertisement, dazu ein Gerätanteil aus der MAC (EUI-64). Ein DHCP-Server ist nicht nötig. Mit gesetztem M-Flag holen sich die Geräte die Adresse stattdessen per [[dhcpv6]].

## In leyoNET

Oben in der Werkzeugleiste wird die IP-Version des Projekts gewählt: nur IPv4, beides (Dual Stack) oder nur IPv6. Router bekommen je Anschluss ein /64, Endgeräte «automatisch» oder eine feste Adresse.

```
C:\> ipconfig
C:\> ping 2001:db8:2::20
C:\> netsh interface ipv6 show neighbors
```
