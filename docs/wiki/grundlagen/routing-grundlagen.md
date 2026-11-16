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

## Netze zwischen Routern: das Transitnetz

Das kleine Netz, das zwei Router miteinander verbindet, heisst in leyoNET **Transitnetz**. Es enthält keine Endgeräte, nur die beiden Router-Anschlüsse; darum genügt ein /30 mit zwei nutzbaren Adressen. Der Begriff folgt RFC 2328: Ein *transit network* trägt Verkehr, der weder in diesem Netz entsteht noch dort endet. Das Gegenstück ist das *stub network*, ein Netz mit Endgeräten und nur einem Ausgang.

Im Alltag und in Lehrmitteln begegnen dir für dasselbe andere Wörter:

| Bezeichnung | Bedeutung | In leyoNET |
|---|---|---|
| **Transitnetz** (transit network) | IP-Netz zwischen Routern, ohne Endgeräte | einheitlich verwendet |
| Transfernetz | dasselbe; im deutschen Sprachraum verbreitet, steht aber in keiner Norm | nicht mehr verwendet |
| Transportnetz | bei Netzbetreibern das Übertragungsnetz, das Signale der Kunden trägt; kein IP-Netz zwischen zwei Routern | nicht verwendet |
| Standleitung (leased line) | die fest geschaltete **Leitung** eines Anbieters zwischen zwei Standorten, also Schicht 1 und 2; das IP-Netz darauf ist ein Transitnetz | nur für die Leitung, siehe [[ppp-hdlc]] |
| Punkt-zu-Punkt-Netz | Netz mit genau zwei Teilnehmern (RFC 2328); jedes /30 zwischen zwei Routern ist eines | als Erklärung |

## Drei Wege zur Tabelle

- **Automatisch** (nur in leyoNET, für Einsteiger): ein Häkchen beim Router, und er kennt alle Netze im Plan.
- **Statisch:** Die Routen von Hand eintragen. Übersichtlich, aber jede Änderung muss auf jedem Router nachgeführt werden ([[statisches-routing]]).
- **Dynamisch:** Router tauschen ihre Netze selbst aus und reagieren auf Ausfälle: [[ospf]], [[rip]], zwischen Organisationen [[bgp]].

> Häufigster Fehler: der **Rückweg**. Router A kennt das Netz hinter Router B, aber B kennt das Netz hinter A nicht. Der Ping kommt an, die Antwort nicht zurück.
