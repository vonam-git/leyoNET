---
titel: Statisches Routing
kurz: Routen von Hand eintragen: Zielnetz, Maske und Next Hop, Standardroute, Hin- und Rückweg und die häufigsten Fehler.
reihenfolge: 40
schicht: 3 (Vermittlung)
hilfe: [routing]
demos: [static]
uebungen: [static-routes, m117-ue04-a2, m117-ue05, m129-routing-a1, serial-wan]
verwandt: [routing-grundlagen, router, ospf]
---
## Eine Route

Eine statische Route sagt dem Router: «Das Netz X erreichst du über den Nachbarn Y.»

```
Router(config)# ip route 192.168.2.0/24 10.0.0.2
Router(config)# ip route 0.0.0.0/0 203.0.113.1
Router# show ip route
```

Die zweite Zeile ist die **Standardroute** (Default Route): alles, wofür es keine genauere Route gibt, meist Richtung Internet. Der Next Hop muss in einem direkt angeschlossenen Netz liegen.

## Beispiel mit zwei Routern

```text
192.168.1.0/24 — R1 — 10.0.0.0/30 — R2 — 192.168.2.0/24
               .1  .1             .2  .1
```

| Router | Route |
|---|---|
| R1 | 192.168.2.0/24 über 10.0.0.2 |
| R2 | 192.168.1.0/24 über 10.0.0.1 |

Beide Routen sind nötig: R1 für den Hinweg, R2 für den **Rückweg** der Antwort.

## Vor- und Nachteile

Statische Routen sind übersichtlich, sicher und brauchen keine Rechenleistung. Aber sie reagieren nicht auf Ausfälle, und in grossen Netzen muss jede Änderung auf vielen Routern nachgeführt werden. Dort übernehmen dynamische Protokolle wie [[ospf]]. In Firmen findet man oft beides: OSPF im Innern, eine statische Standardroute zum Provider.

> Fehlersuche mit `tracert`: Wo hört die Liste auf? Der letzte Router, der antwortet, kennt den nächsten Schritt nicht.
