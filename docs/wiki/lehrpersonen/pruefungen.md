---
titel: Prüfungen durchführen
kurz: Prüfungsdatei und Schlüssel, Varianten je Platz, Prüfungsmodus, Safe Exam Browser, Webversion mit Platz-Codes und automatischer Auswertung.
reihenfolge: 8
hilfe: [webExam]
verwandt: [aufgaben-erstellen, webversion]
---
## Grundsatz

Eine Prüfung besteht aus zwei Dateien: der **Prüfungsdatei** für die Lernenden (Aufgabe, Startnetz, Punkte je Teil, ohne Prüfbausteine und Lösungen) und dem **Schlüssel** für Sie (alle Prüfbausteine, Lösungen, Code zum Beenden). Ausgewertet wird mit dem Schlüssel.

## Prüfung erstellen

- **Generator:** Werkzeuge → Prüfung erstellen erzeugt ein Firmennetz mit drei Standorten, 75 Punkte, Note = 5 × Punkte / 75 + 1. Je Platz eine eigene Variante ist möglich.
- **Jede Aufgabe als Prüfung:** Werkzeuge → Als Prüfung speichern, mit Startnetz leer, nur Geräte, aktuell oder als **Fehlersuche** mit zufälligen Fehlern je Platz.
- **Gerechter auswerten:** Teilpunkte, Folgefehler (Gateway «ein Router im eigenen Netz»), Fragen direkt in leyoNET, Bausteine «von Hand».

## Während der Prüfung

Beim Öffnen der Prüfungsdatei beginnt der **Prüfungsmodus**: Katalog, Demos, Aufgabeneditor und das Öffnen anderer Dateien sind gesperrt, eine Leiste zeigt Titel, Platz und Zeit. Er übersteht ein Neuladen und endet nur mit Ihrem Code. Für abgesicherte Rechner erzeugt leyoNET eine Konfiguration für den **Safe Exam Browser**.

## In der Webversion

Prüfungsdatei und Schlüssel in der Admin-Konsole hochladen, Platzkarten mit Platz-Codes drucken, starten. Gespeichert wird alle 20 Sekunden; ist die Zeit um, ist automatisch abgegeben. Das Prüfungscockpit zeigt je Platz, ob er verbunden ist, erlaubt Nachteilsausgleich (+5′, +15′) und «Ansehen» live. Am Ende wertet leyoNET alle Plätze aus, mit Nachkorrektur und Bericht.

Ablauf, Grenzen und was leyoNET gegen Abschreiben tun kann: [Prüfungen](https://github.com/vonam-git/leyoNET/blob/main/docs/pruefungen.md).
