---
titel: Wie Routing funktioniert
kurz: Standardgateway, Routing-Tabelle, längstes Präfix und administrative Distanz – und wann man statisch, automatisch oder dynamisch routet.
reihenfolge: 5
schicht: 3 (Vermittlung)
hilfe: [autoRouting]
demos: [gateway, autoRouting]
uebungen: [two-subnets, auto-routing, m117-ue04-a1]
verwandt: [statisches-routing, ospf, router]
---
## Im eigenen Netz oder nicht?

Bevor ein Gerät sendet, vergleicht es die Zieladresse mit seinem eigenen Netz (Adresse und Maske). Liegt das Ziel im selben Netz, fragt es per [[arp]] direkt nach der MAC des Ziels. Liegt es woanders, schickt es das Paket an sein **Standardgateway**, den Router im eigenen Netz.

![Ein Ping ins andere Netz geht über das Standardgateway](gateway)

## Die Routing-Tabelle

Ein Router entscheidet für jedes Paket anhand seiner **Routing-Tabelle**: Zu jedem Zielnetz steht, über welchen Nachbarn (Next Hop) oder Anschluss es weitergeht.

| Ziel | über | Herkunft |
|---|---|---|
| 192.168.1.0/24 | eth0 | direkt verbunden |
| 192.168.2.0/24 | 10.0.0.2 | statisch |
| 0.0.0.0/0 | 203.0.113.1 | Standardroute |

Passen mehrere Einträge, gewinnt das **längste Präfix** (das genaueste Netz). Bei Gleichstand entscheidet die **administrative Distanz**: direkt 0, statisch 1, eBGP 20, OSPF 110, RIP 120. Jeder Router senkt die **TTL** um eins; erreicht sie null, verwirft er das Paket und meldet «TTL abgelaufen» (so funktioniert `tracert`).

## Drei Wege zur Tabelle

- **Automatisch** (nur in leyoNET, für Einsteiger): ein Häkchen beim Router, und er kennt alle Netze im Plan.
- **Statisch:** Die Routen von Hand eintragen. Übersichtlich, aber jede Änderung muss auf jedem Router nachgeführt werden ([[statisches-routing]]).
- **Dynamisch:** Router tauschen ihre Netze selbst aus und reagieren auf Ausfälle: [[ospf]], [[rip]], zwischen Organisationen [[bgp]].

> Häufigster Fehler: der **Rückweg**. Router A kennt das Netz hinter Router B, aber B kennt das Netz hinter A nicht. Der Ping kommt an, die Antwort nicht zurück.
