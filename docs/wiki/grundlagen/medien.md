---
titel: Kabel, Glasfaser und Funk
kurz: Twisted Pair, Glasfaser mit SFP-Modulen, Koax, Telefonleitung, Funk und seriell – welches Medium wofür und woran man es in leyoNET erkennt.
reihenfolge: 7
schicht: 1 (Bitübertragung)
hilfe: [cables, sfp]
uebungen: [fiber-ont, l3-campus, port-shutdown]
normen: [IEEE 802.3]
protokolle: [Ethernet-PHY, 802.11-Funk, DOCSIS, GPON, DSL, LTE]
verwandt: [zugangstechniken, wlan, ppp-hdlc]
---
## Die Medien

| Medium | Einsatz | Reichweite (typisch) |
|---|---|---|
| Twisted Pair (Kupfer, RJ45) | Endgeräte, Switches im selben Raum | bis 100 m |
| Glasfaser Multimode (SX/SR) | zwischen Racks und Gebäuden | einige 100 m |
| Glasfaser Singlemode (LX/LR) | zwischen Standorten | km |
| Koax | Kabelanschluss (DOCSIS) | – |
| Telefonleitung | DSL | wenige km |
| Funk | WLAN, Mobilfunk | Raum bis Zelle |
| seriell | ältere WAN-Leitungen zwischen Routern | – |

## SFP-Module

Glasfaser braucht an beiden Enden ein **SFP-Modul** im Einschub. Beide Module müssen zusammenpassen: SX mit SX (Multimode, 1 Gbit/s), SR mit SR (10 Gbit/s), LX/LR für Singlemode. In leyoNET bleibt ein Glasfaserkabel ohne passendes Modul aus; die Link-LED zeigt den Grund.

## Link-LEDs

An jedem Kabelende leuchtet eine LED: **grün** aktiv, **orange** bei Verkehr, **rot** aus, mit Grund beim Überfahren (Port abgeschaltet, Modul fehlt, Kabelart passt nicht). Kabel lassen sich in Fehlersuche-Übungen auch **beschädigen**: Ein Teil der Rahmen geht verloren.
