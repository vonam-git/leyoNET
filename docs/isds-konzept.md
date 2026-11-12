# ISDS-Konzept leyoNET

**Informationssicherheits- und Datenschutzkonzept** für den Einsatz von leyoNET an Schulen (Volksschule Sek I, Berufsfachschule, Gymnasium, Fachhochschule). Aufbau angelehnt an die ISDS-Vorlagen der Kantone (HERMES-Ergebnis «ISDS-Konzept») und an den Leitfaden «Informationssicherheit in Volksschulen» der Datenschutzbeauftragten des Kantons Zürich (V 1.4, 2022).

| | |
|---|---|
| Stand | November 2026, leyoNET 1.4 |
| Verantwortlich (Betrieb leyonet.ch, app.leyonet.ch) | Mark und Mika (Betreiber), siehe Impressum auf leyonet.ch |
| Verantwortlich (Einsatz an der Schule) | die Schule bzw. ihre Trägerschaft; dieses Dokument ist die Vorlage, Abschnitt 10 ist von der Schule auszufüllen |
| Ergänzende Dokumente | [datenschutz.md](datenschutz.md) (Daten im Detail), [sicherheit.md](sicherheit.md) (Bedrohungen und Massnahmen), [dsfa-abklaerung.md](dsfa-abklaerung.md) (Schwellwertanalyse), [pruefungen.md](pruefungen.md), [plesk.md](plesk.md) (Betrieb) |

> Dieses Konzept ist eine fachliche Vorlage, keine Rechtsberatung. Massgebend sind das kantonale Datenschutzrecht der Schule und die Vorgaben ihrer Trägerschaft; im Zweifel die kantonale Datenschutzstelle beiziehen.

## 1. Zweck und Geltungsbereich

leyoNET ist ein Netzwerk-Simulator für den Informatikunterricht. Lernende bauen Netzwerke, konfigurieren Geräte und beobachten Pakete; Lehrpersonen stellen Übungen und führen Prüfungen durch. Das Konzept beschreibt, welche Informationen dabei anfallen, wie schutzbedürftig sie sind, welche Massnahmen bestehen und welche Restrisiken die Schule tragen muss.

Geltungsbereich:

| Komponente | Läuft wo | Daten verlassen das Gerät? |
|---|---|---|
| **Einzeldatei** `leyonet.html` | im Browser, offline | nein (CSP `connect-src 'none'`) |
| **Desktop-App** (Windows, macOS, Linux) | lokal installiert | nein |
| **Webversion** app.leyonet.ch (stabil) und beta.leyonet.ch (Test) | Server beim Betreiber (Plesk, Rechenzentrum Hetzner, Deutschland) | ja: Sessions, Klassen, Prüfungen, Rückmeldungen |
| **Website** leyonet.ch | statische Seiten, gleicher Server | nur Webserver-Protokolle |
| **Selbst betrieben** (Schule betreibt den Server selbst, Docker oder Plesk) | Infrastruktur der Schule | nur innerhalb der Schule |

Nicht im Geltungsbereich: Endgeräte der Lernenden, Schulnetz, Safe Exam Browser selbst, GitHub (Quellcode, Downloads).

## 2. Systembeschreibung und Datenflüsse

```
Lernende/r (Browser) ──HTTPS──► app.leyonet.ch (Plesk: nginx → Node-Server) ──► Datenordner (JSON-Dateien)
        │                                    ▲
        │ Platz-Code, Session-Code           │ Admin-Konsole (Passwort)
        ▼                                    │
  lokaler Speicher (Sprache, Code)     Lehrperson (Browser)
```

- Der Server hat **keine Abhängigkeiten** (nur Node.js), keine Datenbank, keine Konten, keine Cookies, kein Tracking, keine Ressourcen von Dritten.
- Gespeichert wird in JSON-Dateien je Session, Klasse, Prüfung und Rückmeldung; alles mit Ablaufdatum und automatischer Löschung.
- Prüfungsschlüssel (Musterlösung) liegen **verschlüsselt** (AES-256-GCM, Schlüssel vom Admin-Passwort abgeleitet).
- Vor dem Node-Server führt der Webserver von Plesk Zugriffsprotokolle (IP-Adresse, Zeit, Pfad, Browserkennung), Aufbewahrung 7 Tage.

### Rollen

| Rolle | Wer | Rechte |
|---|---|---|
| Betreiber | Mark und Mika | Betrieb, Updates, Admin-Konsole der eigenen Instanz |
| Hosting | Privatperson als Server-Betreiber, Rechenzentrum Hetzner Online GmbH (DE) | technischer Betrieb, Zugriff auf Server und Protokolle (Auftragsbearbeitung) |
| Hauptadmin | mit Admin-Passwort der Instanz | alles: Klassen, Prüfungen, Abgaben, Rückmeldungen, Einstellungen, Zugänge |
| Schule | mit Zugangsschlüssel der Schule | eigene Klassen und Prüfungen und die ihrer Lehrpersonen, Zugänge der eigenen Lehrpersonen |
| Lehrperson | mit Zugangsschlüssel (oder Admin-Passwort der eigenen Instanz) | eigene Klassen, Prüfungen und Abgaben |
| Lernende | mit Session-, Klassen- oder Platz-Code | nur die eigene Session |
| Öffentlichkeit | ohne Code | Startseite, Einzeldatei, Downloads |

## 3. Bearbeitete Informationen

| Information | Personenbezug | Aufbewahrung | Ort |
|---|---|---|---|
| Netzwerk-Konfiguration (Session) | keiner (nur Technik); Code ist zufällig | Frist der Instanz (Standard 24 h nach letzter Änderung), jederzeit löschbar | Server |
| Klassen | Bezeichnung (z.B. «INF22a»), keine Namen; im Verbund Platz und Gruppe je Session, Infrastruktur-Netz | Frist der Instanz | Server |
| Zugänge (Schule, Lehrperson) | Bezeichnung ohne Personenbezug, Prüfsumme des Schlüssels | bis zum Löschen in der Admin-Konsole | Server |
| Verbund-Nachrichten und -Status | Freitext der Lernenden (Hinweis «keine persönlichen Angaben»), Stufen | 30 Minuten, nur Arbeitsspeicher | Server-RAM |
| Prüfungsabgaben | **pseudonym**: Platznummer und Arbeit; die Zuordnung Platz ↔ Person hat nur die Lehrperson | 60 Tage | Server |
| Punkte, Note, Bericht | wie Abgaben; die Auswertung läuft im Browser der Lehrperson, Namen werden nie übertragen | bei der Lehrperson | Gerät der Lehrperson |
| Prüfungsschlüssel (Lösungen) | keiner, aber vertraulich | 60 Tage, verschlüsselt | Server |
| Rückmeldungen | Freitext (Hinweis «keine Namen»), optional Netz | 30 Tage | Server |
| IP-Adressen (Ratenbegrenzung) | ja, flüchtig | Minuten, nur gesalzener Hash im Arbeitsspeicher | Server-RAM |
| Webserver-Protokolle | ja (IP, Browser) | 7 Tage | Hosting |
| SEB-Passwörter | keiner | nirgends (nur Hash in der SEB-Datei) | Gerät der Lehrperson |
| Lokaler Speicher | keiner (Sprache, Darstellung, Session-Code) | bis zum Löschen | Browser |

Besonders schützenswerte Personendaten (Gesundheit, Religion, Massnahmen der sozialen Hilfe usw.) werden **nicht** bearbeitet. Prüfungsleistungen sind Personendaten, sobald die Lehrperson sie einer Person zuordnet; auf dem Server bleiben sie pseudonym.

## 4. Schutzbedarfsanalyse

Skala: **normal** (Schaden begrenzt, schnell behebbar), **hoch** (spürbarer Schaden, z.B. verfälschte Note), **sehr hoch** (existenzbedrohend, nicht der Fall). V = Vertraulichkeit, I = Integrität, A = Verfügbarkeit.

| Information | V | I | A | Begründung |
|---|---|---|---|---|
| Sessions (Übungen) | normal | normal | normal | technische Übungsstände, leicht neu zu erstellen |
| Klassen | normal | normal | normal | nur Bezeichnungen |
| Prüfungsabgaben | normal | **hoch** | **hoch** während der Prüfung | Grundlage einer Note: darf nicht verfälscht werden oder verloren gehen |
| Prüfungsschlüssel | **hoch** | **hoch** | normal | Bekanntwerden entwertet die Prüfung |
| Admin-Passwort / Token | **hoch** | **hoch** | normal | öffnet alle Prüfungen der Instanz |
| Rückmeldungen | normal | normal | normal | |
| Webserver-Protokolle | normal | normal | normal | Personendaten, aber ohne Inhalt |

**Gesamtschutzbedarf: normal**, für Prüfungen **hoch** (Integrität und Verfügbarkeit, Vertraulichkeit des Schlüssels). Daraus folgen die erweiterten Massnahmen in Abschnitt 6 für den Prüfungsbetrieb.

## 5. Rechtliche Einordnung

- **Betreiber** (Mark und Mika, Privatpersonen): Schweizer Datenschutzgesetz (DSG, SR 235.1). Grundsätze nach Art. 6 (Zweckbindung, Datenminimierung, Löschung), Datensicherheit nach Art. 8, Auftragsbearbeitung nach Art. 9, Informationspflicht nach Art. 19 (Datenschutzerklärung auf leyonet.ch), Meldung von Verletzungen nach Art. 24.
- **Öffentliche Schule**: kantonales Datenschutzrecht (z.B. IDG ZH, KDSG LU, KDSG BE, IDG BS). Die Schule ist verantwortlich für den Entscheid, leyoNET einzusetzen, für die Zuordnung von Codes zu Personen und für die Information der Lernenden und Eltern.
- **Wer bearbeitet für wen?** Nutzt eine Schule app.leyonet.ch für Klassen und Prüfungen, bearbeitet der Betreiber pseudonyme Daten **im Auftrag der Schule**. Die meisten Kantone verlangen dafür eine schriftliche Vereinbarung (Auftragsbearbeitung, Geheimhaltung, Ort der Daten, Löschung, Unterauftragnehmer). Alternativen ohne Auftragsbearbeitung: **Einzeldatei/Desktop-App** (keine Daten auf dem Server) oder **eigener Server der Schule**.
- **Ort der Daten**: Deutschland (Hetzner); die EU gilt als Staat mit angemessenem Datenschutz (Anhang 1 DSV). Downloads über GitHub (USA) betreffen nur die Website-Besucher, die auf einen Download klicken.
- **Datenschutz-Folgenabschätzung**: siehe [dsfa-abklaerung.md](dsfa-abklaerung.md). Ergebnis der Schwellwertanalyse: **kein hohes Risiko**, keine DSFA nötig, sofern die Schule die Bedingungen dort einhält.

## 6. Risiken und Massnahmen

Bedrohungen und Gegenmassnahmen sind in [sicherheit.md](sicherheit.md) vollständig aufgeführt und werden bei jedem Release automatisch geprüft (Abschnitt 8). Zusammenfassung nach Schutzziel:

| Risiko | Massnahmen (umgesetzt) | Restrisiko |
|---|---|---|
| Fremde lesen oder ändern Sessions | Zufallscodes (8 Zeichen, ≥ 10¹¹), Fehlversuche je Adresse gebremst, Schreiberkennung je Gerät, Sperre mit PIN | gering |
| Platz-Code wird erraten oder weitergegeben | Code je Platz, Fehlversuche gebremst, Platz nur an einem Gerät, Freigabe nur durch Lehrperson | gering; Weitergabe ist organisatorisch zu verhindern |
| Prüfung ausserhalb des Prüfungsbrowsers | Bindung an den Safe Exam Browser mit Zufallsschlüssel bis Prüfungsende | mittel (User-Agent fälschbar), siehe [pruefungen.md](pruefungen.md) |
| Prüfungsschlüssel wird bekannt | verschlüsselt gespeichert, Auswertung im Browser der Lehrperson, Lernende erhalten nur die Prüfungsdatei | gering |
| Abgaben gehen verloren | Speichern alle 20 s, Abgaben herunterladbar, Speicher voll wird abgefangen | mittel: kein zugesicherter Betrieb (siehe 7) |
| Admin-Zugang wird missbraucht | Passwort nur in der Umgebung, Token 8 h im Arbeitsspeicher, Raten gebremst | **mittel bei gemeinsamer Instanz**: ein Admin-Passwort sieht alle Prüfungen der Instanz (siehe 9) |
| Angriffe von aussen (XSS, CSRF, Injection, Pfad-Tricks, Überlast) | strenge CSP, nur JSON, keine Abhängigkeiten, Grössen- und Ratenbegrenzung, automatische Angriffe bei jedem Release und wöchentlich live | gering |
| Verfolgung der Nutzenden | keine Cookies, kein Tracking, keine Dritt-Ressourcen, IP nur gehasht und flüchtig | gering; Webserver-Protokolle 7 Tage |
| Manipulierte Installer | Build nur in GitHub Actions aus dem öffentlichen Code, Prüfsummen (SHA-256) im Release | mittel: Installer **nicht signiert** (siehe 9) |
| Ausfall während der Prüfung | Offline-Rückfall mit der Einzeldatei und Prüfungsdatei (dateibasierter Prüfungsmodus) | gering, wenn vorbereitet |

## 7. Betrieb und Organisation

- **Änderungen**: Entwicklung auf `develop`, Testumgebung beta.leyonet.ch, Übernahme nach `main` per Pull Request; vor jedem Commit Typprüfung, rund 670 Tests, Server-Tests, Angriffe, Release-Prüfung (Datenschutz, Herkunft, Lizenz), Oberflächentests in der CI.
- **Updates des Servers**: Plesk und Node.js aktuell halten (Plesk: automatische Updates), SSH nur mit Schlüssel, Firewall nur 80/443.
- **Verfügbarkeit**: Betrieb nach bestem Bemühen, **kein zugesicherter Service**. Für Prüfungen: Rückfallebene Einzeldatei bereithalten, Abgaben nach der Prüfung herunterladen.
- **Sicherung**: bewusst keine Datensicherung der Sessions (kurzlebig, Datenminimierung). Prüfungsabgaben sichert die Lehrperson durch Herunterladen.
- **Löschung**: automatisch nach Frist; «Löschen» in der Admin-Konsole löscht sofort.
- **Sicherheitsvorfälle**: Meldung über GitHub (vertraulich, `SECURITY.md`, `/.well-known/security.txt`). Betreiber prüfen innert 7 Tagen; betrifft ein Vorfall Personendaten mit voraussichtlich hohem Risiko, informieren sie die betroffenen Schulen umgehend, damit diese ihre Meldepflichten wahrnehmen können (Art. 24 DSG bzw. kantonales Recht).
- **Zugänge**: Admin-Passwort lang und zufällig (mindestens 20 Zeichen), je Instanz verschieden, nicht während laufender Prüfungen ändern; GitHub- und Plesk-Konten mit Zwei-Faktor-Anmeldung.

## 8. Prüfung und Nachweis

| Was | Wann | Wie |
|---|---|---|
| Funktion, Datenschutz, Herkunft, Lizenz | jeder Commit und Push | `npm run release`, CI |
| Angriffe von aussen, alle | jeder Release | `scripts/sicherheit/angriff.mjs` (lokal) |
| Angriffe von aussen, live (app, beta, Website) | wöchentlich, nach jedem Desktop-Release | Workflow «Sicherheitsprüfung live», Issue bei Befund |
| Normen, Funktion mit frischen Werkzeugen | wöchentlich | Workflow «Wöchentliche Prüfung» |
| Dieses Konzept, Hosting-Konfiguration, Verträge | jährlich und bei grösseren Änderungen | Betreiber |
| Externer Penetrationstest | vor einem kantonsweiten Einsatz empfohlen | unabhängige Stelle |

## 9. Restrisiken und Empfehlungen

1. **Gemeinsame Instanz für mehrere Schulen** (umgesetzt ab v1.4): Der Hauptadmin legt **eigene Zugänge je Schule oder Lehrperson** an (Bezeichnung ohne Personenbezug, nur die Prüfsumme des Schlüssels gespeichert). Jeder Zugang sieht nur seine Klassen und Prüfungen, eine Schule auch die ihrer Lehrpersonen; Einstellungen, Rückmeldungen und Systemprüfung bleiben beim Hauptadmin. Restrisiko: Der Hauptadmin (Betreiber) sieht weiterhin alles, und der Prüfungsschlüssel ist mit dem Admin-Passwort verschlüsselt. Wer das ausschliessen will, betreibt **eine Instanz je Schule** (eigene Subdomain bzw. eigener Server, eigenes Admin-Passwort).
2. **Auftragsbearbeitung**: Mit dem Hosting (Privatperson, Hetzner) und mit jeder Schule, die app.leyonet.ch für Klassen oder Prüfungen nutzt, eine schriftliche Vereinbarung abschliessen. Eine Vorlage lässt sich aus diesem Konzept ableiten.
3. **Installer nicht signiert**: Schul-IT blockiert sie unter Umständen. Signieren (Windows) und Notarisieren (macOS) prüfen; bis dahin Prüfsummen vergleichen oder die Einzeldatei bzw. Webversion verwenden.
4. **Verfügbarkeit**: kein zugesicherter Betrieb. Wichtige Prüfungen mit Rückfallebene planen oder auf eigenem Server durchführen.
5. **Safe Exam Browser**: Die Bindung ist eine Hürde, kein vollständiger Schutz; SEB-Datei und Startpasswort auf den Prüfungsrechnern bereitstellen, nicht verteilen.
6. **Webserver-Protokolle**: Aufbewahrung in Plesk auf 7 Tage beschränken und regelmässig kontrollieren.
7. **Barrierefreiheit**: Öffentliche Schulen müssen digitale Angebote zugänglich machen; leyoNET bedienbar per Tastatur, mit Beschriftungen für Hilfsmittel; eine formale Prüfung nach WCAG 2.1 AA (eCH-0059) steht noch aus.

## 10. Einsatzentscheid der Schule (auszufüllen)

| Frage | Antwort |
|---|---|
| Welche Variante? (Einzeldatei / Desktop / app.leyonet.ch / eigener Server) | |
| Für Übungen, Klassen, Prüfungen? | |
| Vereinbarung zur Auftragsbearbeitung abgeschlossen (nur app.leyonet.ch)? | |
| Lernende und Eltern informiert (Datenschutzerklärung der Schule)? | |
| Schwellwertanalyse dokumentiert ([dsfa-abklaerung.md](dsfa-abklaerung.md))? | |
| Verantwortliche Person an der Schule | |
| Restrisiken (Abschnitt 9) akzeptiert: Datum, Unterschrift Schulleitung | |
