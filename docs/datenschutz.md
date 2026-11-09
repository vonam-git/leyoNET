# Datenschutz

leyoNET ist so gebaut, dass er **keine Personendaten** braucht und keine speichert. Dieses Dokument beschreibt, was wo verarbeitet wird, und dient Schulen als Grundlage für ihre eigene Datenschutzerklärung. Der Text im Simulator (**Hilfe → Datenschutz**) fasst dasselbe für Lernende zusammen.

> Hinweis: Dies ist eine technische Beschreibung, keine Rechtsberatung. Verantwortlich im Sinne von revDSG und DSGVO ist, wer eine Webversion betreibt (in der Regel die Schule). Bei Unsicherheit die kantonale bzw. schulinterne Datenschutzstelle beiziehen.

## Grundsätze

Das Konzept folgt dem Schweizer Datenschutzgesetz (revDSG, in Kraft seit 1.9.2023) und der EU-Datenschutz-Grundverordnung (DSGVO):

- **Datenvermeidung** (Art. 6 Abs. 2 revDSG, Art. 5 Abs. 1 lit. c DSGVO): keine Konten, keine Namen, keine E-Mail-Adressen, keine Geräte-Kennungen, kein Tracking, keine Analyse-Dienste, keine Werbung, keine Cookies, keine externen Schriften oder CDNs.
- **Datenschutz durch Technikgestaltung und Voreinstellungen** (Art. 7 revDSG, Art. 25 DSGVO): Die lokale Datei und die Desktop-Version können technisch keine Verbindung aufbauen (Content-Security-Policy `connect-src 'none'`). Die Webversion spricht ausschliesslich mit dem eigenen Server (`connect-src 'self'`).
- **Speicherbegrenzung**: Alles auf dem Server hat ein Ablaufdatum und wird automatisch gelöscht.
- **Zweckbindung**: Gespeichert wird nur, was für die Übung nötig ist: die Netzwerk-Konfiguration.

## Lokale Datei und Desktop-Version

| Was | Wo | Dauer |
|---|---|---|
| Aktuelles Projekt (Autosave) inkl. Snapshots | IndexedDB im Browserprofil bzw. im App-Datenordner | bis «Neues Netz» oder Löschen der Browserdaten |
| Sprache, Darstellung (hell/dunkel), Funktionsprofil bzw. Funktionsauswahl, Währung, Adressanzeige und Schnittstellennamen an Kabeln ein/aus, ein- und ausgefahrene Bereiche, Anschlusswahl beim Verbinden, Aussehen des Avatars (nur Frisur, Farben usw., kein Name, kein Bild) | `localStorage` | bis Löschen der Browserdaten |
| Erledigte Übungen aus dem Aufgaben-Katalog (Kennung der Übung und Datum, an dem alle Ziele erfüllt waren) | `localStorage` | bis «Fortschritt zurücksetzen» oder Löschen der Browserdaten |
| Laufende Prüfung (Kennung, Titel, Platznummer, Beginn, Prüfwert des Codes; in der Webversion zusätzlich Platz-Code und Ende), damit der Prüfungsmodus ein Neuladen übersteht | `localStorage` | bis die Lehrperson die Prüfung beendet bzw. nach der Abgabe |
| Gespeicherte Projekte und Funktionsdateien | `.json`-Dateien, die die Person selbst ablegt | liegt in ihrer Hand |

Projektdateien enthalten Geräte, Kabel, Adressen und Konfiguration, auch Webseiten und Bilder, die auf einem simulierten Webserver liegen. Bilder werden beim Hochladen auf höchstens 480 Pixel verkleinert und neu kodiert, dabei gehen Metadaten wie Ort und Kamera verloren (EXIF). Trotzdem gilt: **keine Fotos von Personen hochladen.** Gerätenamen sind frei wählbar; sie sollten neutral sein («PC 1», nicht «PC Anna»). Der gemeinsame Schlüssel eines simulierten VPN-Tunnels steht im Klartext in der Projektdatei; er schützt nichts Reales und darf **kein echtes Passwort** sein. Bei Prüfungen erstellt die Lehrperson zusätzlich einen Prüfungsschlüssel und allenfalls eine Korrekturdatei (Punkte und Bemerkungen je Abgabe, mit den Dateinamen der Abgaben). Beide entstehen und bleiben auf ihrem Gerät; leyoNET lädt nichts hoch (Ausnahme: Prüfungen in der Webversion, siehe unten).

Es wird nichts übertragen. Die Admin-Konsole, Sessions und Rückmeldungen sind hier ausgegraut.

## Webversion (Node.js-Server)

### Sessions

- Inhalt: nur die **Projektdatei** (Geräte, Kabel, IP-Konfiguration, Dokumentationsbereiche, Snapshots, Inhalte simulierter Webserver) und technische Metadaten (Erstellungs- und Ablaufzeit, optional der Klassencode).
- Schlüssel: ein **Zufallscode** (z.B. `DHGT-V8SS`, rund 40 Bit Zufall aus `crypto.randomInt`). Wer den Code kennt, kann die Session öffnen; der Code ist keiner Person zugeordnet.
- Löschung: automatisch nach der eingestellten Zeit ohne Änderung (Standard **24 Stunden**, Admin wählbar 1 Stunde bis 30 Tage) oder sofort mit **Session löschen**.
- Im Browser werden nur der Code und ein zufälliges **Schreib-Token** in `localStorage` gemerkt, damit die Session nach einem Neuladen weiterläuft und nur dieses Gerät in ihr speichert. Auf dem Server liegt vom Token nur ein Hash. Eine neue Session beginnt immer leer.
- Ob ein Gerät verbunden ist, weiss der Server nur aus dem Zeitpunkt der letzten Meldung (Speichern oder Lebenszeichen alle 20 Sekunden), im Arbeitsspeicher und ohne Adresse.
- Wer eine Session mit einer **PIN** sperrt: Gespeichert wird nur ein Hash der PIN (scrypt mit Salz) in der Session, gelöscht mit ihr. Fehlversuche zählt der Server nur kurz im Arbeitsspeicher.

### Schutz vor Überlastung

- Projekte sind auf **1 MB** begrenzt. Insgesamt nimmt der Server höchstens **5000 Sessions** und **1 GB** für Sessions und Rückmeldungen an (in Plesk mit `MAX_SESSIONS` und `MAX_STORAGE_MB` anpassbar). Darüber antwortet er mit «Speicher voll»; Prüfungsplätze und die Admin-Konsole sind ausgenommen.
- Neue Sessions sind auf 60 pro Minute und Adresse begrenzt, Rückmeldungen auf 5. Für diese Grenze nimmt der Server hinter dem Proxy von Plesk die Adresse aus dem Weiterleitungs-Kopf des Proxys. Sie wird wie bisher nur gesalzen gehasht im Arbeitsspeicher gezählt und nie gespeichert oder protokolliert.

### Klassen-Sessions

- Die Lehrperson eröffnet in der Admin-Konsole eine Klasse mit einer **Bezeichnung ohne Personenbezug** (z.B. «INF22a»). Lernende treten mit dem Klassencode bei.
- Die Lehrperson sieht die Session-Codes und kann die Arbeiten öffnen, aber **keine Namen**. Wer welche Session hat, klärt die Klasse mündlich oder über den Code, ohne dass der Server davon weiss.
- Löschung: automatisch nach der eingestellten Zeit (Standard 14 Tage) oder mit **Schliessen**.

### Prüfungen (Webversion)

- Inhalt: Bezeichnung (z.B. «INF22a LB3»), die **Prüfungsdatei**, der **Prüfungsschlüssel verschlüsselt** (AES-256-GCM, Schlüssel aus dem Admin-Passwort abgeleitet), Dauer, Startzeit, je Platz eine **Platznummer** und ein **Platz-Code**, allfällige Zusatzminuten (Nachteilsausgleich) und das Ende. Die Arbeiten liegen als Sessions mit Verweis auf Prüfung und Platz.
- **Keine Namen:** Der Server kennt nur Plätze. Die Zuordnung Platz ↔ Person hat nur die Lehrperson (Sitzplan, Platzkarten). Eine Namensliste im Auswertungsfenster bleibt im Arbeitsspeicher des Browsers und wird nicht übertragen. Die Zusatzminuten sind eine Zahl ohne Begründung; der Grund für einen Nachteilsausgleich gehört nicht in leyoNET.
- Löschung: automatisch **60 Tage** nach dem Anlegen (Prüfungseinsicht und Rekursfrist), oder sofort mit «Löschen» in der Admin-Konsole (Prüfung samt allen Abgaben). Lernende können eine Prüfungs-Session nicht selbst löschen, damit die Abgabe erhalten bleibt.
- Im Browser der Lernenden: Platz-Code, Session-Code und Zustand der Prüfung in `localStorage`, bis sie die Prüfung nach der Abgabe schliessen.

### Rückmeldungen

- Inhalt: Art (Problem/Idee), der eingegebene Text (max. 2000 Zeichen), Programmversion, Sprache, Zeitpunkt, optional eine Kopie des aktuellen Netzes (nur wenn die Person das Häkchen setzt, damit der Admin das Problem nachvollziehen kann).
- Das Formular weist darauf hin, **keine Namen oder anderen Personendaten** einzugeben. Freitext kann das technisch nicht verhindern; der Admin löscht solche Rückmeldungen.
- Löschung: automatisch nach der eingestellten Zeit (Standard 30 Tage) oder einzeln in der Admin-Konsole.

### Admin

- Ein einziges Passwort aus der Umgebungsvariable `ADMIN_PASSWORD`; es wird nicht gespeichert. Die Anmeldung erzeugt ein Token, das nur im Arbeitsspeicher des Servers und der geöffneten Seite liegt (höchstens 8 Stunden gültig, endet mit dem Neuladen der Seite).

### Was der Server nicht speichert

- **Keine IP-Adressen**, keine User-Agents, keine Referrer. Der Server schreibt kein Zugriffsprotokoll.
- Gegen Missbrauch zählt eine Ratenbegrenzung Anfragen pro Minute. Dafür hält sie einen **gesalzenen Hash** der IP-Adresse höchstens wenige Minuten im Arbeitsspeicher; das Salz wird bei jedem Start neu erzeugt und nie gespeichert. Nach einem Neustart oder nach Ablauf lässt sich nichts mehr zurückführen.
- Keine Cookies. Antworten der API tragen `Cache-Control: no-store`.

### Webserver-Protokolle

Vor dem Node.js-Server steht bei Plesk ein Webserver (Apache/Nginx), der **eigene Zugriffsprotokolle mit IP-Adressen** führen kann. Das liegt ausserhalb des Simulators und muss beim Hosting eingestellt werden:

- Protokollierung für die Subdomain abschalten oder
- die Aufbewahrung kurz halten (Plesk: *Protokolle → Protokollrotation*, z.B. täglich rotieren, 7 Dateien behalten), und
- in der Datenschutzerklärung der Schule erwähnen.

Auch ein vorgeschaltetes CDN oder ein Reverse-Proxy kann protokollieren.

## Website leyonet.ch

Die Website (`website/`) ist eine einzelne statische Seite: keine Cookies, keine Skripte, kein Tracking, keine Schriften oder Bilder von fremden Servern (CSP `default-src 'none'`). Die Downloads sind Links auf die Releases bei GitHub; erst wer darauf klickt, verbindet sich mit github.com, und dort gilt die Datenschutzerklärung von GitHub. Die Seite sagt das im Abschnitt «Datenschutz». Wie bei jedem Webserver kann das Hosting (Plesk) Zugriffe im Server-Log festhalten; diese Logs gehören zum Hosting, nicht zu leyoNET.

## Prüfung bei jedem Release

`npm run release` führt `scripts/release-checks.mjs` aus und bricht bei einem Fehler ab. Das Ergebnis steht in `release/checks.json` und in der Webversion unter **Admin-Konsole → Systemprüfung**. Geprüft wird automatisch:

| Bereich | Prüfung |
|---|---|
| Datenschutz | keine externen Ressourcen in der HTML-Datei; CSP `connect-src 'none'`; keine Analyse-, Tracking- oder Werbedienste; keine Cookies; Browser-Speicher nur mit technischen Schlüsseln; IP-Adressen nur gesalzen gehasht im Arbeitsspeicher, kein Zugriffsprotokoll; automatische Löschfristen |
| Sicherheit | Server ohne npm-Pakete; keine Laufzeitabhängigkeiten; `npm audit` der Build-Werkzeuge; Sicherheits-Header (CSP, nosniff, no-referrer, kein Einbetten); kein `eval`; Admin nur mit Passwort, Vergleich in konstanter Zeit |
| Lizenzen | eingebaute Pakete nur mit freigegebener Lizenz; Lizenztexte eingebettet; eigener Code unter AGPL-3.0 mit Link zum Quellcode in der App; Lizenzen der Build-Werkzeuge |

Die Release-Prüfung ersetzt keine rechtliche Beurteilung, verhindert aber, dass sich unbemerkt ein Tracker, eine externe Schrift oder eine unpassende Lizenz einschleicht.

## Ort der Daten

Alle Daten liegen als JSON-Dateien im Ordner `DATA_DIR` auf dem Server der Schule (Dateirechte `0600`, Ordner `0700`). Es gibt keine Drittanbieter und keine Übermittlung ins Ausland, sofern das Hosting selbst in der Schweiz bzw. im EWR steht.

## Rechte der betroffenen Personen

Da keine Daten einer bestimmten Person zugeordnet werden, gibt es in der Regel nichts herauszugeben. Sessions kann jede Person selbst sofort löschen. Für Rückmeldungen und Klassen wendet man sich an den Betreiber, der sie in der Admin-Konsole löscht; ansonsten verschwinden sie automatisch nach Ablauf der Frist.

## Vorlage für die Datenschutzerklärung der Schule

> **leyoNET.** Die Webversion von leyoNET unter *‹Adresse›* wird von *‹Schule›* betrieben. Sie speichert nur technische Netzwerk-Konfigurationen unter einem Zufallscode, ohne Namen, Konten oder E-Mail-Adressen. Arbeitsstände werden nach *‹24 Stunden›* ohne Änderung automatisch gelöscht, Klassen nach *‹14 Tagen›*, Rückmeldungen nach *‹30 Tagen›*. Der Simulator setzt keine Cookies, nutzt keine Analyse- oder Werbedienste und speichert keine IP-Adressen. Der Webserver führt Zugriffsprotokolle, die nach *‹7 Tagen›* gelöscht werden. Kontakt: *‹Adresse der Datenschutzverantwortlichen›*.
