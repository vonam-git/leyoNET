---
titel: Spanning Tree (STP)
kurz: Redundante Kabel ohne Broadcast-Sturm: Root-Bridge, Port-Rollen, blockierte Ports und was ohne STP passiert.
reihenfolge: 3
schicht: 2 (Sicherung)
hilfe: [stp]
demos: [vlanStp, storm]
uebungen: [stp-loop, m145-ue11]
normen: [IEEE 802.1D, IEEE 802.3, IEEE 802.2]
protokolle: [STP]
verwandt: [switch, vlan, lacp]
---
## Das Problem: Schleifen

Zwei Kabel zwischen Switches erhöhen die Ausfallsicherheit, bilden aber eine **Schleife**. Ein Broadcast wird endlos im Kreis geschickt und vervielfacht sich: ein **Broadcast-Sturm**. Nach Sekunden ist das Netz voll, die MAC-Tabellen springen hin und her.

![Broadcast-Sturm ohne Spanning Tree: Rahmen kreisen ohne Ende](storm)

## Die Lösung: ein Baum

Das Spanning Tree Protocol macht aus dem vermaschten Netz einen Baum ohne Schleifen:

1. Die Switches tauschen **BPDUs** aus und wählen eine **Root-Bridge**: den Switch mit der kleinsten Bridge-ID (Priorität, dann MAC-Adresse).
2. Jeder andere Switch bestimmt seinen **Root-Port**: den Weg mit den geringsten Kosten zur Root.
3. Auf jeder Leitung gibt es einen **Designated Port**; alle übrigen Ports werden **blockiert**.

Fällt ein Kabel aus, rechnen die Switches neu, und ein blockierter Port übernimmt.

| Rolle | Zustand |
|---|---|
| Root-Port | leitet weiter (Richtung Root) |
| Designated Port | leitet weiter (weg von der Root) |
| Alternate (blockiert) | leitet nicht weiter, hört nur BPDUs |

Mit `spanning-tree priority 4096` macht man einen bestimmten Switch (meist im Core) zur Root.

## Die BPDU im Rahmen

BPDUs laufen nicht in Ethernet II, sondern in einem IEEE-802.3-Rahmen mit Länge und LLC-Kopf (DSAP und SSAP 0x42) an die Multicast-Adresse 01:80:c2:00:00:00.

{{format ieee8023}}

## In leyoNET

Ohne STP erkennt die Simulation den Sturm, zeigt ein Banner mit den betroffenen Geräten und drosselt die Weiterleitung, damit die Seite flüssig bleibt. Mit STP zeigt `show spanning-tree` Root, Rollen und Zustände; der blockierte Port ist auf der Fläche markiert.
