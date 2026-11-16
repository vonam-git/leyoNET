---
titel: IP-Kamera
kurz: Überwachungskamera am Netzwerk, gespeist per PoE: Dome-Kamera Klasse 3, schwenkbare Kamera mit Heizung Klasse 4.
symbol: camera
reihenfolge: 2.6
schicht: 7 (Anwendung), Strom über Schicht 1
hilfe: [device.camera]
demos: [poe]
verwandt: [poe, switch, ip-telefon]
---
## Wozu

Eine IP-Kamera schickt ihr Videobild über das Datennetz an einen Rekorder oder Server. Sie hängt oft dort, wo keine Steckdose ist: an der Decke, über dem Eingang, aussen an der Fassade. Darum bekommt sie den Strom über das Netzwerkkabel.

## Leistung je nach Kamera

| Ausführung | Klasse | am Switch | an der Kamera | nötiger PoE-Typ |
|---|---|---|---|---|
| Dome-Kamera, fest | 3 | 15,4 W | 13 W | Typ 1 (802.3af) |
| schwenkbar mit Heizung | 4 | 30 W | 25,5 W | Typ 2 (PoE+, 802.3at) |

Im Shop gibt es eine Kamera (Klasse 3). Für ein Modell mit Schwenkkopf oder Heizung stellst du unter **PoE** die Klasse 4 ein. Eine Kamera mit Klasse 4 an einem Switch mit Typ 1 bleibt ohne Strom, weil Klasse 4 mehr verlangt, als der Port liefern darf. Wie der Switch die Leistung verteilt, erklärt [[poe]].
