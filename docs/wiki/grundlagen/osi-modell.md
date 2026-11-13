---
titel: OSI-Modell und Kapselung
kurz: Sieben Schichten, die jede Netzwerkverbindung beschreiben, und warum ein Paket wie eine russische Puppe aufgebaut ist.
reihenfolge: 1
schicht: 1 bis 7
hilfe: [osi]
demos: [gateway]
uebungen: [m129-lab-a3]
verwandt: [ethernet-mac, ipv4, tcp]
---
## Die sieben Schichten

Das OSI-Modell teilt die Kommunikation in Schichten. Jede Schicht löst eine Aufgabe und nutzt dafür die Schicht darunter. Im Unterricht arbeitet man meist mit fünf: Die Schichten 5 und 6 gehen im Alltag in der Anwendung auf (wie im TCP/IP-Modell).

| Schicht | Name | Aufgabe | Beispiele | Gerät |
|---|---|---|---|---|
| 7 | Anwendung | Dienste für Programme | HTTP, DNS, DHCP, SMTP | Server, PC |
| 4 | Transport | Verbindung zwischen Programmen (Ports) | TCP, UDP | – |
| 3 | Vermittlung | Weg durch mehrere Netze (IP-Adressen) | IPv4, IPv6, ICMP, OSPF | Router, Layer-3-Switch |
| 2 | Sicherung | Rahmen im lokalen Netz (MAC-Adressen) | Ethernet, ARP, VLAN, STP | Switch, Access Point |
| 1 | Bitübertragung | Signale auf dem Medium | Kupfer, Glasfaser, Funk, DSL | Kabel, Modem |

## Kapselung

Wenn ein Browser eine Webseite anfragt, entsteht eine HTTP-Anfrage (Schicht 7). TCP setzt einen Kopf mit den Ports davor (Schicht 4), IP einen Kopf mit Absender- und Zieladresse (Schicht 3), Ethernet einen Kopf mit den MAC-Adressen (Schicht 2). Auf dem Kabel (Schicht 1) liegen am Ende nur Bits.

```
[ Ethernet | IPv4 | TCP | HTTP-Anfrage ]
  Schicht 2  3      4     7
```

Auf dem Weg packt jedes Gerät nur so weit aus, wie es muss: Ein **Switch** schaut bis Schicht 2 (MAC-Adresse), ein **Router** bis Schicht 3 (IP-Adresse) und setzt einen neuen Ethernet-Kopf für das nächste Netz. Erst das **Ziel** packt alles aus.

## In leyoNET sehen

Die Paketliste zeigt jeden Rahmen nach Schichten, jede in ihrer Farbe. Im Einzelschritt wandern die Rahmen als farbige Punkte über die Kabel, und jedes Gerät packt sichtbar so weit aus, wie es seine Schicht verlangt. Besonders deutlich in der Demo «Standardgateway»: Die IP-Adressen bleiben von PC zu PC gleich, die MAC-Adressen wechseln am Router.
