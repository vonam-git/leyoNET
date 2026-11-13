---
titel: Netze dokumentieren
kurz: Bereiche mit Netz und VLAN, Notizen, Racks, Stockwerke, Snapshots und Richtpreise: wie ein Netzplan entsteht, den man auch abgeben kann.
reihenfolge: 5
hilfe: [areas, racks, floors, snapshots, costs]
demos: [rzVerbund]
uebungen: [vlan-colors, budget-office]
verwandt: [netzwerkdesign, vlan]
---
## Warum Dokumentation dazugehört

Ein Netz, das niemand versteht, lässt sich nicht betreiben. In leyoNET ist die Dokumentation Teil des Netzes: Bereiche, Farben und Beschreibungen liegen in derselben Datei wie die Konfiguration und lassen sich in Übungen und Prüfungen bewerten.

## Die Werkzeuge

- **Bereiche:** farbige Flächen mit Titel, Netzadresse (leyoNET berechnet Maske, Hostbereich und Broadcast), VLAN und Notiz. Ein Bereich mit VLAN färbt die Switch-Ports dieses VLANs ein.
- **Notizen:** Textfelder mit Titel, Absätzen, Aufzählungen und **fett**, z.B. für einen VLAN-Plan.
- **Racks:** 19-Zoll-Schränke auf der Zeichenfläche. Geräte hineinziehen, sie werden als Einschübe gestapelt. Ansicht → Rack-Ansicht (Taste R) zeigt alle Racks mit Frontplatten, Link-LEDs, Farbtags und Patchkabeln.
- **Ports:** Jeder Anschluss hat eine Farbe und eine Beschreibung («Uplink Core»), wie die Etiketten im echten Rack.
- **Stockwerke:** Geräte und Bereiche liegen auf Stockwerken; WLAN-Signale werden über Stockwerke schwächer.
- **Snapshots:** benannte Zwischenstände, automatisch vor jedem Start der Simulation.
- **Kosten:** Richtpreise für alle Geräte und Kabel, Total in CHF; Übungen können ein Budget verlangen.

## Ein gutes Beispiel

Das [Schaufenster](https://app.leyonet.ch/?schaufenster) zeigt einen vollständig dokumentierten Rechenzentren-Verbund: Je Standort ein Bereich mit Netz, Racks nach Schicht (Core, Distribution, Access), Ports in den VLAN-Farben, Türkis für Trunks und ein VLAN-Plan als Notiz. Genau so sollen Lernende ihre eigenen Netze abgeben.
