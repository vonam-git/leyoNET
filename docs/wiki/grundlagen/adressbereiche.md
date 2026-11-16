---
titel: Besondere Adressbereiche
kurz: Private Netze, Loopback, Link-Local, CGNAT und Dokumentationsadressen: welche IPv4- und IPv6-Bereiche reserviert sind und wofür, nach RFC 6890.
reihenfolge: 4.5
schicht: 3 (Vermittlung)
normen: [RFC 6890, RFC 1918, RFC 1122, RFC 3927, RFC 6598, RFC 5737, RFC 4291, RFC 4193, RFC 3849]
uebungen: [m129-routing-a2]
verwandt: [subnetting, nat, ipv4, ipv6]
---
## Warum es reservierte Bereiche gibt

Nicht jede IP-Adresse darf im Internet stehen. Die IANA führt Register für Bereiche mit besonderer Bedeutung; RFC 6890 fasst sie zusammen. Wer ein Netz plant, nimmt für das LAN immer einen privaten Bereich und kennt die Bereiche, die nie geroutet werden.

## IPv4

| Bereich | Zweck | Norm |
|---|---|---|
| 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 | private Netze, nur intern, ins Internet über NAT | RFC 1918 |
| 127.0.0.0/8 | Loopback: das eigene Gerät (`127.0.0.1`) | RFC 1122 |
| 169.254.0.0/16 | Link-Local: selbst vergeben, wenn kein DHCP antwortet | RFC 3927 |
| 100.64.0.0/10 | Shared Address Space für Carrier-Grade-NAT beim Provider | RFC 6598 |
| 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 | nur für Dokumentation und Beispiele | RFC 5737 |
| 0.0.0.0/8 | «dieses Netz», z.B. Absender bei DHCP Discover | RFC 1122 |
| 255.255.255.255 | Broadcast an alle im lokalen Netz | RFC 919, RFC 1122 |

Dazu kommt in jedem Subnetz die **Netzadresse** (alle Host-Bits 0) und die **Broadcast-Adresse** (alle Host-Bits 1); beide sind keine Host-Adressen.

## IPv6

| Bereich | Zweck | Norm |
|---|---|---|
| ::1/128 | Loopback | RFC 4291 |
| fe80::/10 | Link-Local, auf jeder Schnittstelle automatisch | RFC 4291 |
| fc00::/7 (praktisch fd00::/8) | Unique Local Addresses, privat | RFC 4193 |
| ff00::/8 | Multicast, z.B. ff02::1 alle Knoten im Link | RFC 4291 |
| 2001:db8::/32 | nur für Dokumentation | RFC 3849 |
| 2000::/3 | Global Unicast, im Internet routbar | RFC 4291 |

## In leyoNET

Alle Beispielnetze in leyoNET verwenden private Adressen (RFC 1918) und für das «Internet» Dokumentationsadressen (RFC 5737, RFC 3849), Namen nur unter `.example`. Ein PC ohne DHCP-Antwort meldet nach drei Versuchen «kein Server». Der IP-Rechner (Werkzeuge) zeigt bei jeder Adresse, zu welchem dieser Bereiche sie gehört.
