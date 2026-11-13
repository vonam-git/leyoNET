---
titel: OSPF
kurz: Link-State-Routing: Nachbarn per Hello, Datenbank aller Verbindungen, kürzeste Wege nach Dijkstra – für IPv4 (OSPFv2) und IPv6 (OSPFv3).
reihenfolge: 41
schicht: 3 (IP-Protokoll 89)
hilfe: [ospf, ospf6]
demos: [ospf, ospfv3]
uebungen: [ospf-triangle, loopback-ospf, m145-ue10]
normen: [RFC 2328, RFC 5340]
protokolle: [OSPFv2; OSPFv3]
verwandt: [rip, statisches-routing, routing-grundlagen, router]
---
## Die Idee

Bei OSPF (Open Shortest Path First) kennt jeder Router die ganze Landkarte seines Bereichs (**Area**): welche Router es gibt und welche Verbindungen mit welchen **Kosten**. Daraus berechnet jeder selbst mit dem **Dijkstra-Algorithmus** die kürzesten Wege. Fällt eine Leitung aus, verbreitet sich die Änderung sofort, und alle rechnen neu.

## Ablauf

1. **Hello:** Router senden regelmässig Hello-Pakete an `224.0.0.5`. Wer antwortet und dieselben Werte hat (Area, Netz, Intervalle), wird **Nachbar**.
2. **Datenbankabgleich:** Nachbarn tauschen Beschreibungen (DBD) aus, fordern fehlende Einträge an (LSR) und schicken sie (LSU), bestätigt mit LSAck.
3. **SPF-Berechnung:** Jeder Router berechnet aus der Datenbank seine Routen; sie erscheinen mit «O» in der Tabelle.

Die **Router-ID** ist die höchste Loopback-Adresse, sonst die höchste Interface-Adresse. Die Kosten eines Anschlusses lassen sich einstellen; der Weg mit der kleinsten Summe gewinnt.

## Einrichten

```
Router(config)# router ospf
Router(config-router)# network 10.0.0.0/24 area 0
Router(config-router)# network 192.168.1.0/24 area 0
Router# show ip ospf neighbor
Router# show ip route
```

**OSPFv3** macht dasselbe für IPv6: Nachbarn über Link-Local-Adressen, Konfiguration je Anschluss statt mit `network`.

## OSPF oder RIP?

OSPF konvergiert schneller, rechnet mit Kosten statt Hops und skaliert besser. [[rip]] ist einfacher zu verstehen und für kleine Netze ausreichend.
