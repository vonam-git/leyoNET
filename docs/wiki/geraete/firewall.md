---
titel: Firewall
kurz: Ein eigenes Gerät, das ab Werk filtert: Zonen WAN, LAN, DMZ und OPT, zustandsbehaftete Regeln und Schutz der Firewall selbst.
reihenfolge: 7
schicht: 3 und 4
hilfe: [device.firewall]
demos: [firewallZones]
uebungen: [firewall-dmz, acl-guest]
verwandt: [paketfilter, nat, acl]
---
## Wozu

Eine Firewall steht zwischen Netzen, denen man unterschiedlich traut: dem Internet, dem internen Netz und einer **DMZ** für Server, die von aussen erreichbar sein sollen. Sie routet wie ein [[router]], lässt aber nur durch, was eine Regel erlaubt.

## Zonen

| Anschluss | Zone | ab Werk |
|---|---|---|
| eth0 | WAN (Internet) | neue Verbindungen von hier verboten |
| eth1 | LAN (intern) | darf hinaus |
| eth2 | DMZ (öffentliche Server) | darf hinaus |
| eth3 … | OPT (weitere) | darf hinaus |

Die Firewall ist **zustandsbehaftet**: Antworten auf erlaubte Verbindungen kommen ohne eigene Regel zurück. Für einen Webserver in der DMZ braucht es eine Regel wie «Erlauben TCP 80 zum Webserver, eingehend an WAN», meist zusammen mit einer Portweiterleitung ([[nat]]). Anders als ein Router schützt sie mit ihren Regeln auch **sich selbst**: Vom WAN antwortet sie ab Werk weder auf Ping noch auf SSH.

## Regeln lesen

Die Regeln gelten von oben nach unten, die erste passende entscheidet, am Ende steht die Standardregel. In der Simulation zählt jede Regel ihre Treffer, und die Konsole meldet blockierte Pakete. Wie Regeln aufgebaut sind, erklärt [[paketfilter]].
