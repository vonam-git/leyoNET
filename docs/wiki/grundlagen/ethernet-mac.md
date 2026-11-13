---
titel: Ethernet und MAC-Adressen
kurz: Wie Rahmen im lokalen Netz adressiert werden, wie ein Switch lernt, wohin er sie schicken muss, und was passiert, wenn eine MAC doppelt vorkommt.
reihenfolge: 2
schicht: 2 (Sicherung)
hilfe: [switching]
demos: [duplicateMac]
uebungen: [switch-lan, sniff-arp]
normen: [IEEE 802.3]
protokolle: [Ethernet II, 802.1Q]
verwandt: [switch, arp, vlan]
---
## Der Ethernet-Rahmen

Ethernet transportiert Daten im lokalen Netz in **Rahmen**. Jeder Rahmen beginnt mit der Ziel- und der Absender-MAC-Adresse, gefolgt vom **EtherType**, der sagt, was drin steckt.

| Feld | Länge | Beispiel |
|---|---|---|
| Ziel-MAC | 6 Byte | `ff:ff:ff:ff:ff:ff` (Broadcast) |
| Absender-MAC | 6 Byte | `02:00:00:00:01:00` |
| EtherType | 2 Byte | `0x0800` IPv4, `0x0806` ARP, `0x86dd` IPv6, `0x8100` VLAN-Tag |
| Nutzdaten | 46–1500 Byte | IP-Paket, ARP … |

Eine **MAC-Adresse** hat 48 Bit, geschrieben als sechs Hexadezimal-Paare. Die ersten drei Byte nennen beim echten Gerät den Hersteller. leyoNET vergibt «lokal administrierte» Adressen (`02:…`), abgeleitet aus der Gerätenummer, damit jedes Projekt reproduzierbar bleibt.

## Wie ein Switch lernt

Ein Switch merkt sich zu jedem Absender, an welchem Port er ihn gesehen hat: die **MAC-Tabelle**. Kommt ein Rahmen an eine bekannte Adresse, geht er nur zu diesem Port. Ist die Adresse unbekannt oder ein Broadcast, schickt der Switch ihn an alle anderen Ports (**Flooding**). Einträge verfallen nach einigen Minuten.

> In leyoNET: Switch anklicken, rechts steht die MAC-Tabelle. Nach dem ersten Ping kennt der Switch beide PCs.

## Doppelte MAC-Adressen

Haben zwei Geräte dieselbe MAC, sieht der Switch dieselbe Adresse abwechselnd an zwei Ports und schreibt seine Tabelle jedes Mal um. Antworten landen beim falschen Gerät. In der Praxis passiert das bei geklonten virtuellen Maschinen. Die Demo «Doppelte MAC-Adresse» führt es vor; der Switch meldet «MAC springt».
