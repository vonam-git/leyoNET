---
titel: ICMP, Ping und Traceroute
kurz: Echo Request und Reply, «Ziel nicht erreichbar» und «TTL abgelaufen»: wie Ping und Traceroute funktionieren.
reihenfolge: 11
schicht: 3 (Vermittlung)
demos: [arpPing, gateway]
uebungen: [m129-lab-a1, two-subnets]
normen: [RFC 792, RFC 4443]
protokolle: [ICMP; ICMPv6, Neighbor Discovery]
verwandt: [ipv4, routing-grundlagen, arp]
---
## Meldungen

ICMP (Internet Control Message Protocol) transportiert Kontroll- und Fehlermeldungen in IP-Paketen (Protokoll 1). Die wichtigsten:

| Typ | Name | wann |
|---|---|---|
| 8 / 0 | Echo Request / Reply | `ping` |
| 3 | Destination Unreachable | kein Weg zum Netz, Host nicht erreichbar, Port geschlossen |
| 11 | Time Exceeded | TTL ist unterwegs auf 0 gefallen |

## Der ICMP-Kopf

ICMP steckt direkt im IP-Paket (Protokoll 1). Die ersten 4 Byte sind bei allen Meldungen gleich; was danach kommt, hängt vom Typ ab. Beim Ping sind es Kennung und Sequenznummer.

{{format icmp}}

## Ping

`ping 192.168.2.10` schickt vier Echo Requests. Jede Antwort zeigt die Zeit und die TTL des Antwortpakets; aus der TTL lässt sich abschätzen, wie viele Router dazwischen liegen. «Zeitüberschreitung» heisst: keine Antwort, aber auch keine Fehlermeldung, oft ein fehlender Rückweg.

## Traceroute

`tracert` (Windows) nutzt die TTL geschickt: Das erste Paket hat TTL 1 und wird schon vom ersten Router verworfen, der «TTL abgelaufen» zurückschickt. Das zweite hat TTL 2, und so weiter. So meldet sich jeder Router auf dem Weg.

```
C:\> tracert 192.168.3.10
  1  192.168.1.1
  2  10.0.0.2
  3  192.168.3.10
```

Für IPv6 gibt es ICMPv6 mit denselben Aufgaben und zusätzlich der Neighbor Discovery ([[ipv6]]).
