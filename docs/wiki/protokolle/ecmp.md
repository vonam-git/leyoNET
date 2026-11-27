---
titel: ECMP (gleich gute Wege)
kurz: Führen mehrere Wege mit gleichen Kosten zum Ziel, nutzt der Router alle. Er verteilt nicht jedes Paket, sondern jeden Datenfluss.
reihenfolge: 42.5
schicht: 3 (Vermittlung)
hilfe: [ecmp]
demos: [ecmp]
normen: [RFC 2992, RFC 2328]
protokolle: [ECMP (gleich gute Wege)]
verwandt: [statisches-routing, ospf, load-balancer]
---
## Zwei Wege, gleich gut

Normalerweise wählt ein Router für ein Ziel genau eine Route: längstes Präfix, dann kleinste administrative Distanz, dann kleinste Metrik. Sind danach immer noch zwei oder mehr Routen gleich gut, spricht man von **Equal-Cost Multi-Path** (ECMP). Der Router trägt alle ein und verteilt die Last. Fällt ein Weg aus, laufen die Pakete über die übrigen.

- **Statisch**: zwei Routen zum selben Netz mit derselben Distanz, aber verschiedenem Gateway.
- **OSPF**: Wege mit denselben Gesamtkosten (RFC 2328, Abschnitt 16.1).

## Je Datenfluss, nicht je Paket

Würde der Router die Pakete abwechselnd verteilen, kämen sie in falscher Reihenfolge an, und TCP würde unnötig wiederholen. Darum rechnet er einen **Hash** über Absender, Ziel, Protokoll und Ports (bei ICMP die Kennung) und teilt den Zahlenraum in gleich grosse Bereiche, einen je Weg (**Hash-Threshold**, RFC 2992). Alle Pakete einer Verbindung nehmen so denselben Weg; verschiedene Verbindungen verteilen sich. Mit wenigen Verbindungen kann die Verteilung ungleich ausfallen.

## In leyoNET

Bis zu vier gleich gute Wege für statische Routen und OSPFv2. `show ip route` markiert alle aktiven Wege mit `>*`, die Routing-Tabelle zeigt beide Einträge. In der Demo nehmen die Traceroutes zweier PCs verschiedene Wege; entfernt man ein Kabel, bleibt nur einer. Eine gleiche Route zweimal lässt sich nicht eintragen; mit anderer Distanz wird sie zur Reserve-Route ([[statisches-routing]]).
