---
titel: Firewall-Regeln (Paketfilter)
kurz: Regeln von oben nach unten, Standardregel, zustandsbehaftet oder zustandslos – wie ein Router oder eine Firewall entscheidet, was durch darf.
reihenfolge: 50
schicht: 3 und 4
hilfe: [firewall]
demos: [firewall, firewallZones]
uebungen: [firewall-dmz]
protokolle: [Firewall (Paketfilter)]
verwandt: [firewall, acl, nat]
---
## Eine Regel

Jede Regel prüft Merkmale eines Pakets und entscheidet:

| Merkmal | Beispiel |
|---|---|
| Aktion | Erlauben oder Verbieten |
| Protokoll | TCP, UDP, ICMP oder alle |
| Zielport | 80 für Web, 53 für DNS |
| Quelle, Ziel | `any`, eine Adresse, ein Netz wie `192.168.1.0/24` |
| Eingang | Anschluss oder Zone, über den das Paket kommt |

Die Regeln gelten **von oben nach unten**; die erste passende entscheidet. Passt keine, gilt die **Standardregel**. Sicher ist «alles verbieten, was nicht erlaubt ist».

## Zustandsbehaftet

Eine **zustandsbehaftete** Firewall merkt sich erlaubte Verbindungen. Antworten darauf kommen ohne eigene Regel zurück, auch zugehörige ICMP-Fehlermeldungen. Eine zustandslose Firewall braucht für jede Richtung eine Regel; Antworten von Webservern kommen dann z.B. von Port 80 an einen hohen Port zurück.

## Beispiel: DMZ

| # | Aktion | Protokoll | Quelle | Ziel | Port |
|---|---|---|---|---|---|
| 1 | Erlauben | TCP | any | 192.168.2.80 | 80 |
| 2 | Erlauben | alle | 192.168.1.0/24 | any | |
| – | Verbieten | (Standard) | | | |

Von aussen ist nur der Webserver über HTTP erreichbar, das LAN darf hinaus.

```
Router(config)# firewall default deny
Router(config)# firewall rule 1 allow tcp any 192.168.2.80 port 80 in wan
Router# show firewall
```

In der Simulation zählt jede Regel ihre Treffer; die Konsole des Geräts meldet blockierte Pakete.
