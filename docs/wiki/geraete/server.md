---
titel: Server
kurz: Das Gerät für Dienste: DHCP, DNS, Webserver und Mailserver, auch als Rack-Server im Rechenzentrum.
reihenfolge: 2
schicht: 7 (Dienste)
hilfe: [device.server, scopes]
demos: [web, mail]
uebungen: [web-dns, m117-m07b, server-group]
verwandt: [dhcp, dns, http, e-mail]
---
## Wozu

Ein Server stellt anderen Geräten **Dienste** bereit. In leyoNET kann jeder Server einen oder mehrere davon übernehmen; eingeschaltet werden sie unter Erweitert → Dienste:

| Dienst | was er tut | Seite |
|---|---|---|
| DHCP | verteilt Adressen, Gateway und DNS-Server | [[dhcp]] |
| DNS | übersetzt Namen in Adressen (Zone mit A, AAAA, MX …) | [[dns]] |
| Web | liefert eigene HTML-Seiten und Bilder | [[http]] |
| Mail | Postfächer, Versand und Abholung | [[e-mail]] |

## Ausführungen

Im Shop gibt es den Server als Tower und als **Rack-Server**. Rack-Server lassen sich in ein Rack einbauen und erscheinen in der Rack-Ansicht als Einschub. Technisch sind beide gleich.

## Feste Adressen

Server haben in der Regel eine **feste Adresse**, damit Clients sie zuverlässig finden (DNS-Einträge, Gateway-Einstellungen). Der DHCP-Bereich darf diese Adresse nicht enthalten, sonst bekommt ein Client dieselbe Adresse: leyoNET markiert doppelte Adressen mit einem roten Ausrufezeichen.
