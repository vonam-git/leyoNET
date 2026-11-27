# Klassen-Verbund

Im Klassen-Verbund (nur Webversion) baut jede Person oder Gruppe ihren eigenen **Standort**: ein kleines Netz mit Router, Modem oder Internet-Box. Die Standorte hängen an einer gemeinsamen **Klassen-Infrastruktur**, die die Lehrperson bereitstellt: einem Provider und einer Zentrale mit Webserver. Auf dem Beamer zeigt ein **Dashboard**, welche Standorte wirklich online sind.

## Ablauf im Unterricht

1. **Klasse vorbereiten** (Admin-Konsole → Klassen → «Anzeigen»):
   - «Verbund freigeben».
   - «Vorlage laden»: Provider (198.51.100.1/24) und Zentrale mit Webserver (198.51.100.10), Adressen nach RFC 5737. Wer mehr will (DNS, Mail, VPN-Gateway), baut die Vorlage im Editor aus und klickt «Aktuelles Netz übernehmen». Im eigenen Netz muss ein Internet-Gerät als «Provider des Klassen-Verbunds» markiert sein.
   - Optional «Standorte untereinander sichtbar» (die Lernenden bekommen die Netze der anderen Standorte, z.B. für VPN zwischen Standorten oder Webseiten der Nachbarn) und «Karte für Lernende zeigen».
2. **Lernende treten bei**: «Session» → Klassencode, **Platznummer** (1–62) und optional eine **Gruppe** (z.B. «Team Rot»). Ohne Platznummer vergibt der Server den nächsten freien Platz. Platz und Gruppe lassen sich später am Anschlussgerät ändern.
3. **Standort anschliessen**: Modem, Internet-Box, Router oder Firewall auswählen → Abschnitt «Klassen-Verbund» → «Anschluss an die Klassen-Infrastruktur». Beim Router oder bei der Firewall den WAN-Anschluss wählen und «Adressen eintragen».
4. **Dashboard** (Admin-Konsole → Klasse → «Dashboard»): Karte, Kacheln oder beides, Vollbild für den Beamer. Ein Klick auf einen Standort schaut ihm zu (wie «Ansehen»), mit dem Verbund und den Lernzielen dieses Platzes. Standorte, die **Hilfe angefordert** haben, leuchten magenta; «Code gross zeigen» blendet den Klassencode für den Beamer ein.

## Adressplan

Jeder Platz *n* bekommt ein eigenes Transitnetz aus 203.0.113.0/24 (RFC 5737):

| | Adresse |
|---|---|
| Transitnetz | 203.0.113.(4·n)/30 |
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
| fertig | online und alle Lernziele der geladenen Aufgabe erfüllt (den Fortschritt bestimmt der Browser der Lernenden von selbst kurz nach jeder Änderung; niemand muss abgeben) |

Unten läuft ein Ticker mit Statuswechseln, neu dazugekommenen Standorten und Nachrichten. Das Ergebnis schickt das Dashboard an den Server, damit die Karte der Lernenden (falls freigegeben) dieselben Farben zeigt.

## Nachrichten

Unter **Werkzeuge → Klassen-Verbund: Karte und Nachrichten** schreiben die Lernenden an die Zentrale, an einen anderen Standort oder an alle. Eine Nachricht geht nur weg, wenn der eigene Standort in der Simulation die Zentrale erreicht. Auf dem Dashboard fliegt sie als Lichtpunkt über die Karte.

Nachrichten liegen nur im Arbeitsspeicher des Servers (höchstens 200 je Klasse, je 500 Zeichen, 30 Minuten, nach einem Neustart weg) und sind auf 6 pro Minute und Session begrenzt. Betreff und Text sieht nur, an wen sie gehen (ein Standort, alle oder die Zentrale) und wer sie schrieb; die anderen Standorte sehen nur die Funkspur auf der Karte. Lesen geht nur mit einer eigenen Session der Klasse. Der Hinweis im Fenster erinnert daran, keine persönlichen Angaben zu schreiben.

## Verbund-Übungen

Im Aufgabenkatalog erscheinen Verbund-Übungen nur in einer Klasse mit freigegebenem Verbund:

- **Standort an die Zentrale anschliessen** (★★): Anschluss markieren, Adressen eintragen, NAT; PC erreicht die Zentrale.
- **Standort mit DHCP und Namen der Zentrale** (★★★): DHCP-Pool am Standort-Router mit DNS der Zentrale; das Notebook ruft http://zentrale.verbund.example/ auf. Die Vorlage der Infrastruktur macht die Zentrale dafür zum DNS-Server.
- **Eigenen Webserver im Verbund veröffentlichen** (★★★): Portweiterleitung, damit die Zentrale die Webseite des Standorts abruft.
- **Die Webseite des Nachbarn besuchen** (★★★): eigenen Webserver veröffentlichen und die Seite eines anderen Standorts über dessen WAN-Adresse abrufen. Alle Standorte nutzen intern 192.168.50.0/24; NAT trennt sie (Prüfbaustein `verbundWeb`).
- **VPN zum Partnerstandort** (★★★★): Jeder Platz hat ein eigenes LAN 10.10.<Platz>.0/24. Zwei Standorte vereinbaren einen Schlüssel und richten einen IPsec-Tunnel zwischen ihren WAN-Adressen ein; der PC erreicht den PC des Partners an dessen privater Adresse (Prüfbaustein `verbundVpn`).
- **Fehlersuche im Verbund-Standort** (★★★★): Ein fertig eingerichteter Standort (Standort-Router mit Anschluss, NAT und Portweiterleitung, Webserver 192.168.50.80, Server «Dienste» 192.168.50.53 mit DHCP für das Notebook und DNS) mit **5 eingebauten Fehlern, an jedem Platz andere**. Der Startwert hängt von Platznummer und Klassencode ab: Nachbarn haben andere Fehler, beim erneuten Öffnen bleiben sie gleich, eine andere Klasse bekommt eine andere Verteilung. Mögliche Fehler: Maske oder Gateway eines Endgeräts, LAN-Adresse des Routers, abgeschalteter Switch-Port, fehlendes Kabel, DHCP mit falschem Gateway oder DNS, falscher DNS-Eintrag, Portweiterleitung auf den falschen Rechner, fehlende Standardroute. Die Fehlerziele heissen nur «Fehler 1 von 5 behoben»; nach «Prüfen» steht dort kein Grund, und der Tipp (💡, auf Klick) nennt nur das Gerät. Jeder Fehler wird einzeln an der Konfiguration geprüft, unabhängig von den anderen. Vorher dem Verbund beitreten, dann die Übung öffnen (die Adressen des Platzes sind schon eingetragen).

Auf dem **Dashboard** zeigt jede Kachel einer Fehlersuche statt der Lernziele **«Fehler behoben n/5»** als fünf Felder: gelb = behoben, alle grün = fertig. Der Standort wird erst grün («fertig»), wenn alle Ziele erfüllt sind. Die Zahlen meldet der Browser der Lernenden beim Prüfen (wie die Lernziele, zwei kleine Zahlen); Platz und Stufe rechnet das Dashboard selbst.

Jede Verbund-Übung zeigt im Aufgabenfenster den Kasten **«Dein Platz im Klassen-Verbund»**: Platznummer und Gruppe, Transitnetz, WAN-Adresse, Provider und Zentrale für genau diesen Platz, dazu das Ziel in einem Satz. Wer noch keiner Klasse beigetreten ist oder wessen Lehrperson noch keine Infrastruktur geladen hat, liest dort, was fehlt. Der Auftrag selbst ist gegliedert in «Worum es geht», «Dein Auftrag» und «Fertig bist du, wenn».

Die Musterlösungen im Arbeitsblatt zeigen die Adressen von Platz 1 (bei der Fehlersuche auch die Fehler von Platz 1 ohne Klassencode).

## Sicherheits-Szenarien

In jeder Klasse (mit und ohne Verbund) startet die Lehrperson in der Admin-Konsole über der Session-Liste einen **simulierten Angriff** auf eine oder alle Sessions. Im Browser der Lernenden wird dafür ein virtueller Angreifer nur für die Simulation angeschlossen: am Internet-Gerät (bzw. Provider des Verbunds) oder an einem Switch im eigenen Netz. Das Projekt bleibt unverändert, es entsteht nie ein echtes Paket.

| Angriff | STRIDE | Wirkung | Abwehr |
|---|---|---|---|
| ARP-Spoofing | Spoofing | Verkehr ans Gateway landet beim Angreifer | ARP-Schutz auf den Endgeräten |
| SYN-Flood | Denial of Service | Warteschlange des Webservers ist voll (RFC 4987) | SYN-Cookies, Firewall-Regel |
| Portscan | Information Disclosure | offene Ports werden sichtbar | nur Web (80, 443) und E-Mail-Empfang (25) von aussen offen |
| SSH-Passwort raten | Elevation of Privilege | häufige Passwörter werden probiert | starkes Passwort, SSH von aussen sperren |
| Falscher DHCP-Server | Tampering | erst den Vorrat des echten Servers mit erfundenen MAC-Adressen aufbrauchen (DHCP Starvation), dann selbst Adressen mit sich als Gateway und DNS verteilen | DHCP-Snooping (RFC 7513) und Port-Sicherheit am Switch |

Für **Repudiation** gibt es keinen Angriff, sondern den Nachweis: Mit Syslog (RFC 5424 über UDP 514) melden Wächter, Switches und Router ihre Ereignisse an einen Syslog-Server. Der Prüfbaustein `logged` prüft, ob ein Angriff dort ankommt.

Die Lernenden sehen «Sicherheitsvorfall», aber nicht, welcher Angriff es ist. Sie finden die Ursache in der Paketliste und unter **Desktop → Sicherheit** (Wächter) und schalten dort den Schutz ein. Ihr Browser prüft nach jeder Änderung, ob der Angriff noch wirkt; die Liste der Lehrperson zeigt «Angriff wirkt», «abgewehrt» oder «kein Ziel». Wie der Fortschritt ist das eine Angabe des Browsers der Lernenden, keine Prüfungsnote. Ein Angriff endet nach 45 Minuten oder mit «Beenden» von selbst; in Prüfungen gibt es ihn nie.

Das Dashboard zeigt bei jedem Standort, ob der Angriff wirkt oder abgewehrt ist, oben die Zahl «abgewehrt», und meldet Wechsel im Laufband.

**Übungen:** im Katalog sechs Übungen mit Angreifer («Wer gibt sich als Gateway aus?», «Die Webseite antwortet nicht mehr», «Ein zu einfaches Passwort», «Wer verteilt hier Adressen?», «Wer war das? Protokollieren mit Syslog», «Netz bauen, dann kommt der Angreifer») und im Verbund «Standort unter Beschuss». Für eigene Aufgaben: der **Angreifer** aus dem Shop (Endgeräte) und die Prüfbausteine `resist` und `logged`.

## Aufgaben ein- und ausblenden

- **Hauptadmin** (Admin-Konsole → Aufgaben): ganze Reihen (Module), einzelne Übungen und die Verbund-Aufgaben für die ganze Instanz.
- **Lehrperson** (bei der Klasse → «Aufgaben für diese Klasse ein- und ausblenden»): zusätzlich für ihre Klasse. Was der Hauptadmin ausblendet, bleibt ausgeblendet.
- In der Einzeldatei und der Desktop-Version gibt es keinen Server: Dort sind alle Übungen sichtbar, ausser den Verbund-Übungen.

## Datenschutz und Sicherheit

- Platz (Zahl) und Gruppe (Freitext, höchstens 30 Zeichen, ohne `<>`) sind keine Personendaten, solange keine Namen eingetragen werden; die Eingabe weist darauf hin.
- Der Verbund-Endpunkt liefert nie Session-Codes, Netze anderer Standorte nur mit «Standorte untereinander sichtbar», den Status nur mit «Karte für Lernende zeigen».
- Nachrichten senden und lesen nur Sessions der Klasse mit Schreibrecht (Schreiberkennung des Geräts). Nachrichten an andere Standorte erscheinen ohne Betreff und Text (nur für die Funkspur auf der Karte); die Zentrale liest alle in der Admin-Konsole.
- Die Simulation des Dashboards läuft im Browser der Lehrperson, nicht auf dem Server.
