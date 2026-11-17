---
titel: Prüfungen durchführen
kurz: Prüfungsdatei und Schlüssel, Varianten je Platz, Prüfungsmodus, Safe Exam Browser, Webversion mit Platz-Codes und automatischer Auswertung.
reihenfolge: 8
hilfe: [webExam, adminConsole, examAi]
verwandt: [aufgaben-erstellen, webversion]
---
## Grundsatz

Eine Prüfung besteht aus zwei Dateien: der **Prüfungsdatei** für die Lernenden (Aufgabe, Startnetz, Punkte je Teil, ohne Prüfbausteine und Lösungen) und dem **Schlüssel** für Sie (alle Prüfbausteine, Lösungen, Code zum Beenden). Ausgewertet wird mit dem Schlüssel.

## Prüfung erstellen

- **Generator:** Werkzeuge → Prüfung erstellen erzeugt ein Firmennetz mit drei Standorten, 84 Punkte (je Standort 21, Transitnetze 9, Netzwerkdienste 12), Note = 5 × Punkte / 84 + 1. Bei den Transitnetzen zählen die Adressen und ob die richtigen Router verbunden sind, nicht die Nummer des Anschlusses. Je Platz eine eigene Variante ist möglich.
- **Jede Aufgabe als Prüfung:** Werkzeuge → Als Prüfung speichern, mit Startnetz leer, nur Geräte, aktuell oder als **Fehlersuche** mit zufälligen Fehlern je Platz.
- **Mit einer KI** (nur Webversion, nach der Anmeldung mit dem Admin-Passwort): Werkzeuge → Aufgaben mit KI erstellt eine Anleitung mit Regeln, Schema aller Prüfbausteine und der offenen Aufgabe als Beispiel. Die Antwort der KI fügen Sie wieder ein; leyoNET prüft sie streng und öffnet sie im Aufgabeneditor. Einmal selbst lösen, dann als Prüfung speichern. leyoNET sendet nichts an eine KI, geben Sie ihr keine Personendaten mit.
- **Gerechter auswerten:** Teilpunkte, Folgefehler (Gateway «ein Router im eigenen Netz»), Fragen direkt in leyoNET, Bausteine «von Hand».

## Während der Prüfung

Beim Öffnen der Prüfungsdatei beginnt der **Prüfungsmodus**: Katalog, Demos, Aufgabeneditor und das Öffnen anderer Dateien sind gesperrt, eine Leiste zeigt Titel, Platz und Zeit. Er übersteht ein Neuladen und endet nur mit Ihrem Code. Für abgesicherte Rechner erzeugt leyoNET eine Konfiguration für den **Safe Exam Browser**.

## In der Webversion

Prüfungsdatei und Schlüssel in der Admin-Konsole (`/admin`) hochladen, die **Prüfungszeit angeben** (Pflicht), **Prüfungsblätter drucken** (je Platz eine Seite mit Platz-Code, Zeit, Ablauf und Auftrag) und verteilen, starten. Den Code zum Beenden zeigt das Cockpit auf Klick. Gespeichert wird alle 20 Sekunden. Mit **«📤 Abgeben»** in der Prüfungsleiste geben die Lernenden selbst ab: Der Platz ist danach sofort geschlossen, im Cockpit steht «abgegeben 10:42», und bei den Lernenden beginnt eine leere Fläche ohne Verbindung zur Abgabe. Ist die Zeit um, gibt leyoNET automatisch ab. Solange eine Prüfung läuft, zeigt die Admin-Konsole oben eine rote Leiste mit «arbeiten · abgegeben · Plätze» und der Restzeit. Das Prüfungscockpit zeigt je Platz, ob er verbunden ist, erlaubt Nachteilsausgleich (+5′, +15′) und «Ansehen» live. Am Ende wertet leyoNET alle Plätze aus, mit Nachkorrektur und Bericht.

Ablauf, Grenzen und was leyoNET gegen Abschreiben tun kann: [Prüfungen](https://github.com/vonam-git/leyoNET/blob/main/docs/pruefungen.md).
