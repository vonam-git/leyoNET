---
titel: Strukturierte Verkabelung
kurz: Kategorien und Klassen von Twisted-Pair-Kabeln, die 100-Meter-Regel, Glasfasertypen und der Aufbau einer Gebäudeverkabelung nach ISO/IEC 11801.
reihenfolge: 7.5
schicht: 1 (Bitübertragung)
normen: [ISO/IEC 11801-1, IEEE 802.3]
uebungen: [fiber-ont]
verwandt: [medien, netzwerkdesign, switch]
---
## Aufbau im Gebäude

ISO/IEC 11801-1 (in Europa als EN 50173-1 übernommen) beschreibt eine anwendungsneutrale Verkabelung: Sie wird einmal gebaut und trägt danach Ethernet, Telefonie oder Gebäudetechnik. Sie gliedert sich in drei Ebenen:

- **Primärbereich (Campus):** zwischen Gebäuden, meist Glasfaser.
- **Sekundärbereich (Steigbereich):** vom Gebäudeverteiler zu den Etagenverteilern, Glasfaser oder Kupfer.
- **Tertiärbereich (Etage):** vom Etagenverteiler zur Anschlussdose am Arbeitsplatz, Twisted Pair.

## Die 100-Meter-Regel

Ein Übertragungskanal aus Twisted Pair ist höchstens **100 m** lang: höchstens 90 m fest verlegtes Kabel (Permanent Link) plus zusammen 10 m Patchkabel an beiden Enden. Für 1000BASE-T und 10GBASE-T nach IEEE 802.3 gilt dieselbe Grenze. Längere Strecken brauchen einen aktiven Verteiler (Switch) oder Glasfaser.

## Kategorien und Klassen

Die Norm unterscheidet **Klassen** für die ganze Strecke und **Kategorien** für die einzelnen Teile (Kabel, Dose, Stecker):

| Klasse (Strecke) | Kategorie (Teile) | Frequenz | typisch für |
|---|---|---|---|
| D | Cat 5e | 100 MHz | 1 Gbit/s |
| E | Cat 6 | 250 MHz | 1 Gbit/s, 10 Gbit/s auf kurzen Strecken |
| EA | Cat 6A | 500 MHz | 10 Gbit/s auf 100 m, PoE mit hoher Leistung |
| F | Cat 7 | 600 MHz | 10 Gbit/s |
| FA | Cat 7A | 1000 MHz | 10 Gbit/s und mehr |
| I, II | Cat 8.1, 8.2 | 2000 MHz | 25 und 40 Gbit/s auf höchstens 30 m im Rechenzentrum |

Für neue Gebäude ist heute Klasse EA (Cat 6A) üblich.

## Glasfaser

- **Multimode** (OM3, OM4, OM5): dicker Kern, günstige Laser, einige hundert Meter, z.B. 1000BASE-SX und 10GBASE-SR im Gebäude.
- **Singlemode** (OS2): dünner Kern, Kilometer, z.B. 1000BASE-LX, Campus und Provider.

In leyoNET steckt die Glasfaser in SFP-Modulen; SX und LX müssen an beiden Enden zusammenpassen (siehe [[medien]]).
