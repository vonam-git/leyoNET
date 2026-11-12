# Klassen-Verbund

Im Klassen-Verbund (nur Webversion) baut jede Person oder Gruppe ihren eigenen **Standort**: ein kleines Netz mit Router, Modem oder Internet-Box. Die Standorte hängen an einer gemeinsamen **Klassen-Infrastruktur**, die die Lehrperson bereitstellt: einem Provider und einer Zentrale mit Webserver. Auf dem Beamer zeigt ein **Dashboard**, welche Standorte wirklich online sind.

## Ablauf im Unterricht

1. **Klasse vorbereiten** (Admin-Konsole → Klassen → «Anzeigen»):
   - «Verbund freigeben».
   - «Vorlage laden»: Provider (198.51.100.1/24) und Zentrale mit Webserver (198.51.100.10), Adressen nach RFC 5737. Wer mehr will (DNS, Mail, VPN-Gateway), baut die Vorlage im Editor aus und klickt «Aktuelles Netz übernehmen». Im eigenen Netz muss ein Internet-Gerät als «Provider des Klassen-Verbunds» markiert sein.
   - Optional «Standorte untereinander sichtbar» (die Lernenden bekommen die Netze der anderen Standorte, z.B. für VPN zwischen Standorten oder Webseiten der Nachbarn) und «Karte für Lernende zeigen».
2. **Lernende treten bei**: «Session» → Klassencode, **Platznummer** (1–62) und optional eine **Gruppe** (z.B. «Team Rot»). Ohne Platznummer vergibt der Server den nächsten freien Platz. Platz und Gruppe lassen sich später am Anschlussgerät ändern.
3. **Standort anschliessen**: Modem, Internet-Box, Router oder Firewall auswählen → Abschnitt «Klassen-Verbund» → «Anschluss an die Klassen-Infrastruktur». Beim Router oder bei der Firewall den WAN-Anschluss wählen und «Adressen eintragen».
4. **Dashboard** (Admin-Konsole → Klasse → «Dashboard»): Karte, Kacheln oder beides, Vollbild für den Beamer. Ein Klick auf einen Standort schaut ihm zu (wie «Ansehen»).

## Adressplan

Jeder Platz *n* bekommt ein eigenes Transfernetz aus 203.0.113.0/24 (RFC 5737):

| | Adresse |
|---|---|
| Transfernetz | 203.0.113.(4·n)/30 |
| Provider (Gateway) | 203.0.113.(4·n+1) |
| Standort (WAN) | 203.0.113.(4·n+2) |
| Zentrale | 198.51.100.10 |

Beispiel Platz 1: WAN 203.0.113.6/30, Gateway 203.0.113.5. «Adressen eintragen» setzt die WAN-Adresse, die Standardroute zum Provider und (bei Router und Firewall) NAT am WAN-Anschluss.

## Wie die Simulation läuft

- Im Browser der Lernenden setzt leyoNET das **eigene Netz**, die **Infrastruktur** und (falls freigegeben) die **anderen Standorte** zu einem Netz zusammen und simuliert dieses. Die Zeichenfläche zeigt nur das eigene Netz, gespeichert wird nur das eigene Netz.
- Die Geräte der anderen Standorte heissen in der Simulation «Gruppe: Gerät» (z.B. «Team Blau: Router»), die der Infrastruktur behalten ihre Namen («Zentrale», «Provider»).
- Lernziele (auch Katalog-Übungen) werden im zusammengesetzten Netz geprüft. Der Prüfbaustein **«Standort im Verbund erreichbar»** (`verbundSite`) prüft von der Zentrale aus: Ping auf die WAN-Adresse, mit Stufe «Webseite erreichbar» zusätzlich http://WAN-Adresse/.

## Dashboard: ehrliche Stufen

Das Dashboard holt alle 20 Sekunden die Netze aller Standorte der Klasse und simuliert den ganzen Verbund **im Browser der Lehrperson**. Niemand kann «fertig» melden: Grün wird nur, was in der Simulation tatsächlich funktioniert.

| Stufe | Bedeutung |
|---|---|
| nicht verbunden | kein Anschluss markiert |
| angeschlossen | Anschluss markiert, aber die Zentrale erreicht den Standort nicht (Adresse, Route, NAT prüfen) |
| online | die Zentrale erreicht die WAN-Adresse (Ping) |
| Dienste erreichbar | unter http://WAN-Adresse/ antwortet eine Webseite (Portweiterleitung) |
| fertig | online und alle Lernziele der geladenen Aufgabe erfüllt (Fortschritt meldet der Browser der Lernenden) |

Unten läuft ein Ticker mit Statuswechseln, neu dazugekommenen Standorten und Nachrichten. Das Ergebnis schickt das Dashboard an den Server, damit die Karte der Lernenden (falls freigegeben) dieselben Farben zeigt.

## Nachrichten

Unter **Werkzeuge → Klassen-Verbund: Karte und Nachrichten** schreiben die Lernenden an die Zentrale, an einen anderen Standort oder an alle. Eine Nachricht geht nur weg, wenn der eigene Standort in der Simulation die Zentrale erreicht. Auf dem Dashboard fliegt sie als Lichtpunkt über die Karte.

Nachrichten liegen nur im Arbeitsspeicher des Servers (höchstens 200 je Klasse, je 500 Zeichen, 30 Minuten, nach einem Neustart weg), sind für alle mit dem Klassencode lesbar und auf 6 pro Minute und Session begrenzt. Der Hinweis im Fenster erinnert daran, keine persönlichen Angaben zu schreiben.

## Verbund-Übungen

Im Aufgabenkatalog erscheinen Verbund-Übungen nur in einer Klasse mit freigegebenem Verbund:

- **Standort an die Zentrale anschliessen** (★★): Anschluss markieren, Adressen eintragen, NAT; PC erreicht die Zentrale.
- **Eigenen Webserver im Verbund veröffentlichen** (★★★): Portweiterleitung, damit die Zentrale die Webseite des Standorts abruft.

Die Musterlösungen im Arbeitsblatt zeigen die Adressen von Platz 1.

## Aufgaben ein- und ausblenden

- **Hauptadmin** (Admin-Konsole → Aufgaben): ganze Reihen (Module), einzelne Übungen und die Verbund-Aufgaben für die ganze Instanz.
- **Lehrperson** (bei der Klasse → «Aufgaben für diese Klasse ein- und ausblenden»): zusätzlich für ihre Klasse. Was der Hauptadmin ausblendet, bleibt ausgeblendet.
- In der Einzeldatei und der Desktop-Version gibt es keinen Server: Dort sind alle Übungen sichtbar, ausser den Verbund-Übungen.

## Datenschutz und Sicherheit

- Platz (Zahl) und Gruppe (Freitext, höchstens 30 Zeichen, ohne `<>`) sind keine Personendaten, solange keine Namen eingetragen werden; die Eingabe weist darauf hin.
- Der Verbund-Endpunkt liefert nie Session-Codes, Netze anderer Standorte nur mit «Standorte untereinander sichtbar», den Status nur mit «Karte für Lernende zeigen».
- Nachrichten senden nur Sessions der Klasse mit Schreibrecht (Schreiberkennung des Geräts).
- Die Simulation des Dashboards läuft im Browser der Lehrperson, nicht auf dem Server.
