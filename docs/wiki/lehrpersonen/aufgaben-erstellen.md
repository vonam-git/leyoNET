---
titel: Eigene Aufgaben erstellen
kurz: Lernziele im Formular zusammenstellen, Ziele aus einer Musterlösung vorschlagen lassen und als Aufgabendatei verteilen.
reihenfolge: 7
verwandt: [uebungen-einsetzen, pruefungen]
---
## Der Weg zur eigenen Aufgabe

1. Startnetz bauen: leer, nur Geräte oder schon teilweise konfiguriert.
2. Links unter «Aufgabe» auf **Erstellen** klicken. Titel, Beschreibung und Schwierigkeit eintragen.
3. **Ziele hinzufügen:** Jedes Ziel ist ein Prüfbaustein mit Text, z.B. «PC 1 erreicht 192.168.2.10 per Ping», «Webseite enthält Stundenplan», «Router hat die Adresse 10.0.0.1», «Bereich dokumentiert das Netz richtig». leyoNET schlägt einen Text vor.
4. Optional ein **Tipp** je Ziel und **Punkte** (für Prüfungen).
5. Speichern: Die Aufgabe steckt in der Projektdatei. Diese Datei verteilen.

Schneller geht es mit einer **Musterlösung**: das fertige Netz bauen und im Aufgabeneditor «Ziele aus diesem Netz vorschlagen». leyoNET erzeugt Ziele für Geräte, Adressen, Gateways, DHCP, DNS, Bereiche und Verbindungen. Unpassendes streichen, den Rest gewichten.

## Prüfbausteine (Auswahl)

| Baustein | prüft |
|---|---|
| Ping | ein Gerät erreicht ein Ziel (Name oder Adresse) |
| Webseite | ein Gerät ruft eine Seite ab, optional mit Text |
| Adresse, Gateway, DNS | Konfiguration eines Geräts |
| DHCP | Geräte haben ihre Adresse per DHCP |
| Bereich | Netz, Maske, Hosts im Bereich und in der Notiz |
| Kosten | Total unter einem Budget |
| Antwort | eine Frage mit Freitext oder Auswahl |
| von Hand | Punkte vergibt die Lehrperson bei der Nachkorrektur |

Alle Bausteine mit ihren Feldern beschreibt die Dokumentation [Aufgaben](https://github.com/vonam-git/leyoNET/blob/main/docs/aufgaben.md).

> Weil jedes Ziel in der Simulation geprüft wird, zählt nur, was wirklich funktioniert. Ein falsch eingetragenes Gateway fällt beim Ping auf, nicht erst beim Korrigieren.
