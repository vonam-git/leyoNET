# Prüfungen mit leyoNET

leyoNET erstellt praktische Prüfungen, wertet sie automatisch aus und lässt Raum für die Nachkorrektur von Hand. Dieses Dokument beschreibt den Ablauf und was leyoNET gegen Abschreiben und Einblick in Lösungen tun kann – und was nicht.

## Grundsatz: Prüfungsdatei und Schlüssel

Eine Prüfung besteht aus zwei Dateien:

| Datei | Für wen | Inhalt |
|---|---|---|
| **Prüfungsdatei** (`<Titel>.json`) | Lernende | Aufgabe, Startnetz, Punkteraster (Punkte je Teil), allenfalls Fragen – **ohne Prüfbausteine, ohne Lösungen, ohne Code** |
| **Schlüssel** (`<Titel>_Schluessel.json`) | nur Lehrperson | alle Prüfbausteine mit Punkten, Antworten auf Fragen, je Variante; Code zum Beenden des Prüfungsmodus; bei Fehlersuche die eingebauten Fehler |

Die Lernenden sehen also nur, *was* zu tun ist und wie viele Punkte ein Teil gibt, nicht *wie* geprüft wird. Ausgewertet wird mit dem Schlüssel.

## Prüfung erstellen

**Generator «Firmennetz mit drei Standorten»** (Werkzeuge → Prüfung erstellen …): Hauptsitz und zwei Filialen mit DHCP/DNS-Server, Transportnetzen und Intranet mit Webserver, 75 Punkte (je Standort 21, Netzwerkdienste 12).

- Eine Variante würfeln (Startwert) und von Hand anpassen, oder **je Platz eine eigene Variante** (bis 40 Plätze). Mit demselben Startwert entstehen wieder dieselben Varianten.
- «Erstellen» → Prüfungsdatei und Schlüssel speichern. «Aufgabenblätter (HTML)» gibt alle Varianten zum Drucken aus. «Musterlösung öffnen» zeigt die Lösung eines Platzes.
- Es gibt bewusst **keine festen Varianten im Quellcode**, weil das Repo öffentlich ist.

**Jede Aufgabe als Prüfung** (Werkzeuge → Als Prüfung speichern …): Startnetz wählen:

- **leer** – alles selbst aufbauen;
- **nur Geräte** – Geräte mit Namen, ohne Kabel und Einstellungen;
- **aktuelles Netz** – so, wie es ist;
- **Fehlersuche** – das aktuelle, funktionierende Netz mit zufälligen Fehlern, für jeden Platz andere (falsche Maske, falsches Gateway, Router-Adresse geändert, automatisches Routing aus, Port abgeschaltet, Kabel fehlt, DHCP gibt falsches Gateway oder falschen DNS-Server, DNS-Eintrag falsch). Zu jedem Fehler kommt ein Ziel mit 2 Punkten dazu; der Schlüssel nennt die Fehler je Platz.

**Prüfung aus einer Musterlösung:** Lösung bauen, im Aufgabeneditor «Ziele aus diesem Netz vorschlagen». leyoNET schlägt Ziele mit Punkten und Teilen vor (Geräte, Adressen, Gateways, DHCP, DNS, Bereiche, Verbindungen, Webseiten). Streichen, gewichten, dann «Als Prüfung speichern».

## Gerechtere Auswertung

- **Teilpunkte:** Bei Gerätelisten, mehreren Pings und der Dokumentation gibt es Punkte anteilig (auf halbe Punkte gerundet).
- **Folgefehler:** Gateways werden mit `@router` geprüft («ein Router im eigenen Netz»). Wer die Router-Adresse falsch wählt, aber konsequent damit weiterarbeitet, verliert nur die Punkte für die Router-Adresse.
- **Dokumentation:** Der Baustein `areaNote` liest die Notiz eines Bereichs und prüft Wert für Wert (Netzadresse, Maske, kleinster/grösster Host, Broadcast, Anzahl Hosts). Schreibweisen wie «10.0.0.0 / 24» oder «16'382» gelten.
- **Fragen:** Der Baustein `answer` stellt eine Frage (Freitext oder Auswahl). Die Antwort steht in der Abgabe, die Lösung nur im Schlüssel. Adressen und Zahlen werden tolerant verglichen.
- **Von Hand:** Der Baustein `manual` (z.B. «Darstellung übersichtlich») zählt zum Maximum; die Punkte vergibt die Lehrperson bei der Nachkorrektur.

## Während der Prüfung

- Beim Öffnen der Prüfungsdatei wählen die Lernenden ihren **Platz** (bei mehreren Varianten).
- Danach ist leyoNET im **Prüfungsmodus**: Katalog, Demos, Aufgabeneditor, Prüfungsgenerator, Auswertung, Funktionsumfang, «Neu» und das Öffnen anderer Dateien sind gesperrt. Eine Leiste zeigt Titel, Platz und Zeit. «Prüfen» gibt es nicht.
- Der Modus übersteht ein Neuladen. Er endet nur mit dem **Code der Lehrperson** (steht im Schlüssel und im Dialog beim Erstellen). In der Datei steht nur ein Prüfwert (SHA-256) des Codes.
- **Abgeben** heisst: Projekt speichern (Strg+S) und die Datei wie vereinbart abgeben (Prüfungsordner, Teams, Moodle, USB-Stick).

## Auswerten

Werkzeuge → Aufgabe prüfen … (Abgaben auswerten):

1. **Prüfungsschlüssel laden**, dann alle Abgaben auf einmal wählen. Jede Abgabe wird mit ihrer Variante ausgewertet; Dateien einer anderen Prüfung werden gemeldet.
2. In der Tabelle eine Zelle anklicken: **eigene Punkte** und **Bemerkung** je Ziel; auf den Dateinamen klicken für eine **Bemerkung zur ganzen Abgabe**. «Korrektur speichern/laden» sichert das in einer Datei bei dir.
3. **Als CSV speichern** (Punkte, Note, Bemerkung) und **Berichte (HTML)**: je Abgabe eine Druckseite mit allen Zielen, Punkten, Gründen und Bemerkungen für die Prüfungseinsicht.
4. **Auffällig ähnliche Abgaben** werden markiert: Geräte genau an denselben Stellen kommen bei selbst gebauten Netzen praktisch nie vor. Bei Fehlersuche-Prüfungen (vorgegebenes Netz) entfällt der Vergleich. Der Hinweis ist ein Anlass zum Nachschauen, kein Beweis.

## Was leyoNET nicht verhindern kann

leyoNET läuft vollständig auf dem Gerät der Lernenden und ist offen (AGPL). Was dort läuft, lässt sich mit Aufwand untersuchen oder umgehen:

- Wer die Browserdaten löscht oder eine **andere Kopie** von leyoNET öffnet, ist nicht mehr im Prüfungsmodus und könnte dort den Generator mit den Werten vom Aufgabenblatt füttern.
- Dateien lassen sich weitergeben; leyoNET kennt bewusst keine Konten und keine Namen.
- Die Lösung einer Netzwerkprüfung lässt sich aus der Vorgabe ableiten – das ist die Aufgabe.

Darum gehört zur Prüfung die **Organisation**:

- Prüfungsrechner oder ein abgesicherter Browser (z.B. Safe Exam Browser) mit nur leyoNET und ohne Internet; am besten die Einzeldatei `leyonet.html` lokal.
- Eigene Variante je Platz (Generator oder Fehlersuche): Abschreiben vom Nachbarn bringt dann nichts.
- Prüfungsdatei erst zu Beginn verteilen, Schlüssel und Musterlösungen nie an die Klasse geben (auch nicht in eine gemeinsame Ablage).
- Code erst am Ende eingeben, nicht vor der Klasse.

## Dateiformate

- Prüfungsdatei: normale Projektdatei (`netzwerk-simulator`) mit `tasks.exam` (Kennung, Variante bzw. Varianten zur Auswahl, Prüfwert des Codes, Dauer, Punkteraster). Antworten auf Fragen stehen in `tasks.answers`.
- Schlüssel: `meta.format = "netzwerk-simulator-pruefungsschluessel"`, je Variante die vollständige Aufgabe.
- Korrektur: `meta.format = "netzwerk-simulator-korrektur"`, je Datei Punkte, Bemerkungen und Gesamtbemerkung. Sie enthält Dateinamen der Abgaben und bleibt bei der Lehrperson.

Bausteine im Detail: [aufgaben.md](aufgaben.md).
