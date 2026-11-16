---
titel: Datenrate, Durchsatz und Verzögerung
kurz: Bit und Byte, Kilo und Kibi, warum 1 Gbit/s nie 125 MB/s Nutzdaten ergibt und wie sich die Verzögerung eines Pakets zusammensetzt.
reihenfolge: 8
schicht: 1 bis 4
normen: [IEEE 802.3]
verwandt: [rahmen-und-pakete, medien, tcp]
---
## Bit, Byte und Vorsilben

Datenraten zählen **Bit pro Sekunde** (bit/s), Dateigrössen meist **Byte** (1 Byte = 8 Bit). Bei Datenraten bedeuten die Vorsilben immer Zehnerpotenzen: 1 Gbit/s = 1 000 000 000 bit/s. Für Speicher gibt es zusätzlich die Zweierpotenzen mit «i»: 1 KiB = 1024 Byte, 1 MiB = 1024 KiB.

Beispiel: Eine Datei von 100 MB über eine Leitung mit 100 Mbit/s braucht mindestens 100 · 8 / 100 = 8 Sekunden.

## Datenrate und Durchsatz

Die **Datenrate** der Leitung (z.B. 1000BASE-T: 1 Gbit/s nach IEEE 802.3) gilt für alle Bits, auch Präambel, Köpfe und Pausen. Der **Durchsatz** an Nutzdaten ist kleiner. Bei vollen Ethernet-Rahmen mit TCP über IPv4:

| Teil | Byte |
|---|---|
| Präambel und SFD | 8 |
| Ethernet-Kopf und FCS | 18 |
| IPv4- und TCP-Kopf | 40 |
| Nutzdaten (MSS) | 1460 |
| Pause (IFG) | 12 |
| **zusammen auf der Leitung** | **1538** |

1460 / 1538 ≈ 95 %: Von 1 Gbit/s bleiben etwa 949 Mbit/s für die Anwendung. Kleine Pakete (z.B. Sprache bei IP-Telefonie) haben viel mehr Anteil an Köpfen.

## Verzögerung (Latenz)

Die Zeit, bis ein Paket ankommt, setzt sich aus vier Teilen zusammen:

1. **Serialisierung:** Bits auf die Leitung legen. 1538 Byte bei 1 Gbit/s dauern 12,3 µs, bei 10 Mbit/s 1,2 ms.
2. **Ausbreitung:** Signal im Kabel, etwa 5 µs pro Kilometer (rund zwei Drittel der Lichtgeschwindigkeit).
3. **Verarbeitung:** Gerät liest Kopf und entscheidet (Switch, Router).
4. **Warteschlange:** Warten, wenn der Ausgang besetzt ist. Hier setzt Quality of Service an.

Die **Umlaufzeit** (RTT) zeigt `ping`: hin und zurück. **Jitter** heisst, wenn die Verzögerung schwankt; für Sprache und Video ist er wichtiger als die Verzögerung selbst.

## In leyoNET

Die Paketdetails zeigen auf Schicht 1 die Datenrate des Mediums und die Bytes auf der Leitung samt Präambel und Pause. Die Simulation rechnet mit Laufzeiten je Medium; Zeitlupe und Einzelschritt machen sichtbar, wo ein Paket gerade ist.
