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
- **Fehlersuche** – das aktuelle, funktionierende Netz mit zufälligen Fehlern, für jeden Platz andere (falsche Maske, falsches Gateway, Router-Adresse geändert, automatisches Routing aus, Port abgeschaltet, Kabel fehlt, DHCP gibt falsches Gateway oder falschen DNS-Server, DNS-Eintrag falsch, Access-Port im falschen VLAN, Trunk lässt ein VLAN nicht durch). Zu jedem Fehler kommt ein Ziel mit 2 Punkten dazu; der Schlüssel nennt die Fehler je Platz.

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

## Prüfung in der Webversion (Server)

Läuft leyoNET als Webversion mit Node-Server (siehe [plesk.md](plesk.md)), geht es ohne Dateiablage:

1. **Admin-Konsole → Prüfungen:** Prüfungsdatei und Schlüssel hochladen, Bezeichnung (z.B. «INF22a LB3»), Plätze und Minuten. Bei einer Prüfung mit Varianten gibt es je Variante einen Platz.
2. **Platzkarten drucken:** eine Karte je Platz mit Platz-Code (z.B. `K7QX-3MPA`), Adresse und Anleitung. Karten an die Plätze legen.
3. Die Lernenden öffnen leyoNET, **Datei → Prüfung beitreten …** und tippen den Platz-Code ein. Vor dem Start warten sie; danach erhält jeder Platz seine Variante, der Prüfungsmodus beginnt.
4. **Starten.** Das **Prüfungscockpit** zeigt je Platz: beigetreten, zuletzt gespeichert, Ende und **Live**: ein grüner Punkt, solange das Gerät verbunden ist (es meldet sich alle 20 Sekunden). Der Stand wird **alle 20 Sekunden** automatisch gespeichert (und beim Schliessen der Seite). Ein Neuladen kostet höchstens diese 20 Sekunden.
   - **Nur einmal offen:** Ein Platz ist nur an einem Gerät offen. Tippt jemand denselben Platz-Code an einem zweiten Rechner ein, solange der erste verbunden ist, wird das abgewiesen («Platz schon offen»). Dasselbe Gerät kommt nach einem Neuladen ohne Weiteres wieder hinein.
   - **Freigeben:** Ist ein Browser abgestürzt oder wechselt jemand den Rechner, gibt die Lehrperson den Platz mit «Freigeben» frei. Danach tritt die Person am neuen Gerät mit demselben Platz-Code bei und arbeitet mit dem gespeicherten Stand weiter; das alte Gerät kann nicht mehr speichern. Nach einer Minute ohne Lebenszeichen ist ein Platz ohnehin wieder frei.
   - **Ansehen:** «👁 Ansehen» zeigt den Stand eines Platzes live (alle 5 Sekunden neu, nur lesen). So lässt sich prüfen, ob alles funktioniert, oder eine Person begleiten. Das eigene Projekt kommt mit «Beenden» zurück.
5. **Nachteilsausgleich** je Platz: «+5′», «+15′» (vor oder während der Prüfung, auch nach Ablauf – der Platz öffnet dann wieder), «−5′» zum Korrigieren.
6. Ist die Zeit eines Platzes um, nimmt der Server nichts mehr an: Der letzte Stand ist **automatisch abgegeben**, die Lernenden sehen «Abgegeben». «Für alle beenden» beendet alle Plätze sofort.
7. **Automatisch auswerten:** alle Abgaben werden mit dem hinterlegten Schlüssel korrigiert (wie unten beschrieben, mit Nachkorrektur, CSV und Berichten). **Abgaben herunterladen** speichert eine Datei mit allen Abgaben und dem Schlüssel (`abgaben-….json`); «Abgaben auswerten» liest sie später wieder.

### Wer ist wer?

Der Server kennt **keine Namen**, nur Plätze. Die Zuordnung behältst du:

- Du verteilst die Platzkarten gezielt (Sitzplan) bzw. die Lernenden schreiben ihren Namen auf die Karte und geben sie am Ende zurück.
- Im Auswertungsfenster kannst du eine **Namensliste** einfügen (je Zeile «07 Anna Muster»). Die Namen erscheinen in der Tabelle, in der CSV-Datei und in den Berichten, werden aber weder gespeichert noch an den Server geschickt und sind beim Schliessen des Fensters weg.

Die Lernenden müssen dir also nichts schicken; der Platz-Code ist zugleich ihre Abgabe.

### Sicherheit und Aufbewahrung

- Der Schlüssel liegt auf dem Server **verschlüsselt** (AES-256-GCM, abgeleitet vom Admin-Passwort). Wird das Admin-Passwort geändert, lässt er sich nicht mehr entschlüsseln; dann den Schlüssel im Auswertungsfenster von Hand laden.
- Die Lernenden erhalten nur die Prüfungsdatei (ohne Lösungen). Der Platz-Code ist wie ein Passwort: Wer ihn kennt, arbeitet an diesem Platz.
- Prüfung, Abgaben und Platz-Codes werden **60 Tage** nach dem Anlegen gelöscht (Aufbewahrung für Einsicht und Rekurs) oder sofort mit «Löschen».
- Gesperrt werden auf dem Server auch das Löschen der Session und das Speichern nach Ablauf (30 Sekunden Kulanz für die letzte Übertragung).

### Übungen begleiten (ohne Prüfung)

- **Mit dem Session-Code:** Datei → Online-Session → «Session ansehen» und den Code der lernenden Person eingeben. Der Stand erscheint live und nur lesend; die Person arbeitet ungestört weiter. Der Balken oben zeigt, ob ihr Gerät verbunden ist.
- **Klassen-Sessions:** In der Admin-Konsole bei der Klasse «👁 Ansehen» neben jeder Session.
- **Eigene Session sperren:** Lernende (und Lehrpersonen) können ihre Session unter Datei → Online-Session mit einer **PIN** (4 bis 8 Ziffern) sperren. Wer den Code kennt, kann dann nur noch ansehen; weiterarbeiten an einem anderen Gerät geht nur mit der PIN. Auch ohne Sperre arbeitet immer nur **ein** Gerät in einer Session: Öffnet ein zweites Gerät den Code, während das erste verbunden ist, kann es nur ansehen.

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
- Abgaben einer Server-Prüfung: `meta.format = "netzwerk-simulator-abgaben"` mit Titel, Bezeichnung, Schlüssel und je Platz `seat`, `updated`, `project`.
- Korrektur: `meta.format = "netzwerk-simulator-korrektur"`, je Datei Punkte, Bemerkungen und Gesamtbemerkung. Sie enthält Dateinamen der Abgaben und bleibt bei der Lehrperson.

Bausteine im Detail: [aufgaben.md](aufgaben.md).
