---
titel: ARP
kurz: Wie ein Gerät zur IP-Adresse im eigenen Netz die MAC-Adresse findet – mit Broadcast-Anfrage, Antwort und Cache.
reihenfolge: 1
schicht: zwischen 2 und 3
demos: [arpPing]
uebungen: [sniff-arp, m129-lab-a3, m145-ue05]
normen: [RFC 826, RFC 5227]
protokolle: [ARP, Gratuitous ARP, Proxy-ARP]
verwandt: [ethernet-mac, ipv4, icmp]
---
## Wozu

Ein Rahmen im lokalen Netz braucht eine Ziel-**MAC-Adresse**, ein Programm kennt aber nur die **IP-Adresse**. Das Address Resolution Protocol (ARP) verbindet beides: «Wer hat 192.168.1.11? Sag es 192.168.1.10.»

## Ablauf

1. PC 1 will an 192.168.1.11 senden und schaut in seinen **ARP-Cache**. Leer.
2. Er schickt eine **ARP-Anfrage** als Broadcast (`ff:ff:ff:ff:ff:ff`). Der Switch verteilt sie an alle Ports.
3. Nur PC 2 erkennt seine Adresse und antwortet als **Unicast** mit seiner MAC.
4. PC 1 speichert die Zuordnung im Cache und sendet jetzt das eigentliche Paket.

![ARP-Anfrage als Broadcast, Antwort als Unicast, danach der Ping](arpPing)

Liegt das Ziel in einem anderen Netz, fragt der PC nicht nach dem Ziel, sondern nach der MAC seines **Standardgateways** ([[routing-grundlagen]]).

| Feld | Anfrage | Antwort |
|---|---|---|
| Operation | 1 (request) | 2 (reply) |
| Absender-MAC / -IP | PC 1 | PC 2 |
| Ziel-MAC | 00:00:00:00:00:00 (unbekannt) | PC 1 |
| Ziel-IP | 192.168.1.11 | 192.168.1.10 |

Der EtherType von ARP ist `0x0806`.

Der ganze Aufbau nach RFC 826, mit den Werten einer ARP-Anfrage aus der Simulation. Die Nachricht ist nur 28 Byte lang, darum füllt Ethernet sie auf 46 Byte auf.

{{format arp}}

## Sonderformen

- **Gratuitous ARP:** Ein Gerät kündigt seine eigene Adresse an, z.B. nach dem Start oder beim WLAN-Roaming. Antwortet jemand, ist die Adresse doppelt vergeben.
- **Proxy-ARP:** Ein Router antwortet stellvertretend für eine Adresse, die hinter ihm liegt, z.B. beim statischen NAT.

## In leyoNET ausprobieren

```
C:\> arp -a
C:\> ping 192.168.1.11
C:\> arp -a
C:\> arp -d
```

In der Paketliste mit dem Filter `arp` erscheinen Anfrage und Antwort; die Detailansicht zeigt alle Felder und ihre Bytes.
