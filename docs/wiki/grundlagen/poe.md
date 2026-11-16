---
titel: Power over Ethernet
kurz: Strom über das Twisted-Pair-Kabel nach IEEE 802.3: Typen 1 bis 4, Klassen 0 bis 8, Budget des Switches und was passiert, wenn es nicht reicht.
reihenfolge: 7.7
schicht: 1 (Bitübertragung)
normen: [IEEE 802.3]
hilfe: [poe]
demos: [poe]
verwandt: [verkabelung, ip-telefon, ip-kamera, access-point, switch]
---
## Idee

Power over Ethernet (PoE) überträgt Daten und Strom im selben Twisted-Pair-Kabel. Die **Speisequelle** (PSE, Power Sourcing Equipment) ist meist ein Switch, das **gespeiste Gerät** (PD, Powered Device) ein Telefon, eine Kamera oder ein Access Point. Ein Netzteil am Gerät und eine Steckdose an der Decke entfallen.

PoE steht heute in der Gesamtausgabe IEEE 802.3-2022: Klausel 33 für Typ 1 und 2 (früher 802.3af und 802.3at), Klausel 145 für Typ 3 und 4 (früher 802.3bt). Die alten Namen sind im Handel noch üblich.

## Typen

| Typ | früherer Name | Adernpaare | höchstens je Port (PSE) | höchste Klasse |
|---|---|---|---|---|
| 1 | 802.3af, «PoE» | 2 | 15,4 W | 3 |
| 2 | 802.3at, «PoE+» | 2 | 30 W | 4 |
| 3 | 802.3bt, «PoE++» | 4 | 60 W | 6 |
| 4 | 802.3bt, «PoE++» | 4 | 90 W | 8 |

Die Spannung liegt bei rund 44 bis 57 V Gleichstrom. Das ist ungefährlich (Schutzkleinspannung), aber hoch genug, damit auf 100 m Kabel wenig verloren geht.

## Erkennung und Klassen

Bevor Strom fliesst, prüft der Switch mit kleiner Spannung, ob am Kabel überhaupt ein PoE-Gerät hängt (Erkennung über einen Widerstand von 25 kΩ). Ein PC ohne PoE bekommt also nie Strom. Danach meldet das Gerät seine **Klasse**, und der Switch reserviert die passende Leistung:

| Klasse | am Switch | am Gerät | Beispiel |
|---|---|---|---|
| 1 | 4 W | 3,84 W | einfacher Sensor |
| 2 | 7 W | 6,49 W | IP-Telefon |
| 0 und 3 | 15,4 W | 13 W | Dome-Kamera, einfacher Access Point |
| 4 | 30 W | 25,5 W | Wi-Fi-6-Access-Point, schwenkbare Kamera |
| 5 | 45 W | 40 W | Videotelefon |
| 6 | 60 W | 51 W | Thin Client, kleine Displays |
| 7 | 75 W | 62 W | Beleuchtung |
| 8 | 90 W | 71,3 W | Displays, Ladegeräte |

Die Differenz zwischen Switch und Gerät geht im Kabel als Wärme verloren (gerechnet für 100 m).

## Budget

Das Netzteil des Switches kann nicht jeden Port gleichzeitig mit dem Höchstwert versorgen. Hersteller geben darum ein **PoE-Budget** an, z.B. 370 W für einen Switch mit 24 Ports. Reicht das Budget nicht mehr, bekommt das nächste Gerät keinen Strom. Viele Switches teilen nach Priorität zu; leyoNET verteilt in der Reihenfolge der Ports.

Rechenbeispiel: Zwei Telefone (2 × 7 W), zwei Dome-Kameras (2 × 15,4 W) und drei Access Points der Klasse 4 (3 × 30 W) brauchen zusammen 134,8 W. Ein PoE+-Switch mit 120 W Budget reicht nicht, einer mit 370 W schon.

## In leyoNET

- Beim Switch unter **PoE** Typ und Budget wählen; einzelne Ports lassen sich abschalten. Die Tabelle zeigt je Port Gerät, Klasse, Leistung und Status.
- IP-Telefone und Kameras brauchen PoE, Access Points erst, wenn bei ihnen «PoE» eingestellt ist.
- Ein Gerät ohne Strom wird grau mit Blitz, sein Kabel bleibt rot, und es antwortet auf nichts.
- Auf der Befehlszeile des Switches: `show power inline`, im Interface `power inline never` bzw. `power inline auto`.
- Prüfbaustein für Aufgaben: «Gerät per PoE gespeist».

Vereinfachung: leyoNET kennt keine Leistungsaushandlung über LLDP und keine Ports, die bei zu hoher Klasse mit weniger Leistung trotzdem einschalten. Es zählt die reservierte Leistung der Klasse, nicht den tatsächlichen Verbrauch.
