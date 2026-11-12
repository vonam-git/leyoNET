# Datenschutz-Folgenabschätzung: Abklärung (Schwellwertanalyse)

Ob eine **Datenschutz-Folgenabschätzung (DSFA)** nötig ist, klärt man mit einer **Schwellwertanalyse**: Führt die Bearbeitung voraussichtlich zu einem **hohen Risiko** für die Persönlichkeit oder die Grundrechte der betroffenen Personen? Nur dann ist eine DSFA (und bei verbleibendem hohem Risiko eine Vorabkonsultation der Datenschutzstelle) Pflicht. Die Analyse selbst sollte man dokumentieren; diese Seite ist die Vorlage dafür.

> Fachliche Einschätzung der Betreiber, keine Rechtsberatung. Verantwortlich für den Entscheid ist die Schule bzw. ihre Trägerschaft; massgebend ist das kantonale Recht. Mehrere Kantone stellen eigene Formulare bereit (z.B. Luzern, Basel-Stadt, St. Gallen, Zug); dann dieses Formular verwenden und die Antworten unten übernehmen.

## Rechtsgrundlagen

- **Betreiber** (Privatpersonen): Art. 22 DSG. Hohes Risiko liegt insbesondere vor bei umfangreicher Bearbeitung besonders schützenswerter Personendaten, bei systematischer umfangreicher Überwachung öffentlicher Bereiche und bei Profiling mit hohem Risiko.
- **Öffentliche Schulen**: kantonales Recht, z.B. Luzern § 6 und § 7a KDSG mit § 6c KDSV (Schwellwertanalyse mit Formular, DSFA, Vorabkonsultation), Basel-Stadt IDG/IDV (Schwellwertanalyse mit Indikatoren), Zürich § 10 IDG (Vorabkontrolle), Bern KDSG (Vorabkontrolle). Typische Indikatoren für hohes Risiko in den kantonalen Merkblättern: neue Technologien, Abrufverfahren, besonders schützenswerte Daten oder Berufsgeheimnisse, Profiling, automatisierte Einzelentscheide, sehr viele Betroffene (Basel-Stadt: ab rund 10 000 Personen), Datenpools mehrerer Stellen, Auftragsbearbeitung in Staaten ohne angemessenen Datenschutz, KI im engeren Sinn.

## Schwellwertanalyse für leyoNET

Beurteilt für die drei Einsatzarten. «Nein» heisst: Indikator nicht erfüllt.

| Indikator | Einzeldatei / Desktop | app.leyonet.ch: Übungen, Klassen | app.leyonet.ch: Prüfungen |
|---|---|---|---|
| Besonders schützenswerte Personendaten (Gesundheit, Religion, Sozialhilfe, Strafen …) | nein | nein | nein (Prüfungsleistungen sind keine besonders schützenswerten Daten nach Art. 5 lit. c DSG; kantonal teils anders geregelt, prüfen) |
| Berufs- oder besonderes Amtsgeheimnis | nein | nein | nein |
| Personendaten überhaupt auf dem Server | nein | nein (Netzwerk-Konfiguration, Klassenbezeichnung); nur flüchtig gehashte IP und Webserver-Protokolle 7 Tage | **pseudonym** (Platznummer + Arbeit); Zuordnung zu Namen nur bei der Lehrperson |
| Profiling, Verhaltensauswertung, Tracking | nein | nein (keine Cookies, keine Analyse) | nein |
| Automatisierte Einzelentscheide | nein | nein | **teilweise**: automatische Auswertung schlägt Punkte vor; die Lehrperson prüft und entscheidet (Nachkorrektur). Nicht vollautomatisch, sofern die Lehrperson jede Note verantwortet |
| Neue Technologien, KI | nein | nein (keine KI, kein maschinelles Lernen) | nein |
| Abrufverfahren / Datenpool mehrerer Stellen | nein | nein | nein (eine Instanz je Schule empfohlen, siehe ISDS 9.1) |
| Sehr viele Betroffene | – | möglich bei breiter Nutzung, aber ohne Personenbezug | je Prüfung eine Klasse; pseudonym |
| Auftragsbearbeitung im Ausland ohne angemessenen Schutz | nein | nein (Deutschland, EU: angemessen) | nein |
| Systematische Überwachung | nein | nein | nein (Live-Ansicht nur der Arbeit, ohne Bildschirm, Kamera oder Tastatur) |

## Ergebnis

**Kein hohes Risiko. Eine DSFA ist nach dieser Einschätzung nicht nötig**, weder für die Betreiber noch für eine Schule, die leyoNET so einsetzt, wie es gebaut ist. Gründe: keine besonders schützenswerten Daten, keine Konten und Namen, Prüfungsdaten nur pseudonym und kurz (60 Tage), Auswertung bei der Lehrperson, keine Dritt-Dienste, Daten in der EU bzw. bei der Einzeldatei gar nicht übertragen.

Die Einschätzung gilt unter diesen **Bedingungen** (sonst neu beurteilen):

1. Keine Namen oder andere Personendaten in Netze, Gerätenamen, Rückmeldungen oder Prüfungsbezeichnungen schreiben (z.B. «INF22a LB3», nicht «Prüfung Anna Muster»).
2. Die Zuordnung Platz ↔ Person bleibt bei der Lehrperson (Sitzplan, Namensliste im Auswertungsfenster, die nicht übertragen wird).
3. Noten setzt die Lehrperson; die automatische Auswertung ist ein Vorschlag.
4. Für Prüfungen eine eigene Instanz (oder eigener Server) der Schule, wenn mehrere Schulen app.leyonet.ch nutzen würden.
5. Bei Nutzung von app.leyonet.ch für Klassen oder Prüfungen: Vereinbarung zur Auftragsbearbeitung mit den Betreibern (ISDS-Konzept, Abschnitt 5).

Neu beurteilen, wenn sich etwas Wesentliches ändert, z.B. Konten mit Namen, Anbindung an ein Schulverwaltungssystem, Speichern von Noten auf dem Server, Einsatz von KI, Kamera- oder Bildschirmüberwachung in Prüfungen.

## Dokumentation (auszufüllen von der Schule)

| | |
|---|---|
| Schule / Trägerschaft | |
| Einsatzart (Einzeldatei, Desktop, app.leyonet.ch, eigener Server) | |
| Kantonales Formular verwendet? | |
| Ergebnis | kein hohes Risiko / hohes Risiko → DSFA |
| Bedingungen 1–5 eingehalten | |
| Beurteilt von, Datum | |
| Freigabe (Schulleitung bzw. Datenschutzberatung), Datum | |
