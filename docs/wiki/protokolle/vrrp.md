---
titel: VRRP (redundantes Gateway)
kurz: Zwei Router teilen sich eine virtuelle Gateway-Adresse. Fällt der Master aus, übernimmt das Backup, und die Rechner merken nichts.
reihenfolge: 45
schicht: 3 (Vermittlung)
hilfe: [vrrp]
demos: [vrrp]
uebungen: [vrrp-gateway]
normen: [RFC 9568, RFC 826]
protokolle: [VRRP]
verwandt: [router, layer3-switch, arp, ecmp]
---
## Das Problem: ein einziges Gateway

Jeder Rechner kennt genau ein Standardgateway. Fällt dieser Router aus, erreicht niemand mehr andere Netze, auch wenn ein zweiter Router bereitsteht: Die Rechner wissen nichts von ihm. Man müsste überall das Gateway ändern.

## Die Lösung: eine virtuelle Adresse

Mit **VRRP** (Virtual Router Redundancy Protocol, Version 3 nach RFC 9568) bilden zwei oder mehr Router eine **Gruppe**. Sie teilen sich eine virtuelle IP-Adresse, zum Beispiel 192.168.1.1, und eine virtuelle MAC-Adresse `00:00:5e:00:01:VRID` (VRID = Nummer der Gruppe). Die Rechner tragen die virtuelle Adresse als Gateway ein.

- Der Router mit der höchsten **Priorität** (1–254, Standard 100) ist **Master**. Er beantwortet ARP für die virtuelle Adresse mit der virtuellen MAC und leitet die Pakete weiter.
- Die anderen sind **Backup** und warten.
- Ist die virtuelle Adresse die eigene Interface-Adresse eines Routers, ist er ihr **Besitzer** und hat immer Priorität 255.

## Advertisements und Übernahme

Der Master schickt jede Sekunde ein **Advertisement** an die Multicast-Adresse 224.0.0.18 (IP-Protokoll 112, TTL 255, Absender ist die virtuelle MAC). Bleiben sie aus, zählt das Backup:

> Master_Down_Interval = 3 × Advertisement-Intervall + Skew_Time, Skew_Time = (256 − Priorität) / 256 s

Ein Backup mit Priorität 100 übernimmt also nach etwa 3,6 Sekunden, eines mit 200 schon nach 3,2: Das stärkere Backup gewinnt. Der neue Master meldet sich mit einem **Gratuitous ARP**, damit die Switches lernen, wo die virtuelle MAC jetzt hängt. Für die Rechner ändert sich nichts.

## Preempt, Tracking, Accept Mode

- **Preempt** (Standard): Kommt ein Router mit höherer Priorität zurück, holt er sich die Rolle. Ohne Preempt bleibt der laufende Master.
- **Tracking**: Fällt beim Master nicht das LAN, sondern der Uplink aus, ist er zwar erreichbar, aber nutzlos. Mit Tracking senkt er dann seine Priorität um einen Abzug, und das Backup übernimmt. Arbeitet ein Router auf beiden Seiten mit VRRP, braucht jede Seite Tracking auf die andere, sonst laufen die Antworten über den falschen Router.
- **Accept Mode**: Nach RFC 9568 verwirft der Master Pakete an die virtuelle Adresse selbst (ausser er ist der Besitzer). Erst mit Accept Mode antwortet er zum Beispiel auf einen Ping an das Gateway.

## In leyoNET

Router, Firewall und Layer-3-Switch: Gerätefenster → **Redundanz**, Gruppe mit Interface, VRID, virtueller Adresse und Priorität anlegen. Auf der Befehlszeile im Interface-Modus `vrrp 1 ip 192.168.1.1`, `vrrp 1 priority 110`, `vrrp 1 track eth1 decrement 20`, `vrrp 1 accept-mode`; `show vrrp brief` zeigt Master und Backup. Die Paketliste filtert mit `vrrp`, die Hex-Ansicht zeigt Version, VRID, Priorität und Prüfsumme.
