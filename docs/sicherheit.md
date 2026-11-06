# IT-Sicherheit

Diese Seite beschreibt, wie man leyoNET angreifen könnte, was dagegen getan ist und was offen bleibt. Sie wird bei jeder Änderung an Server, Dateiformaten oder Oberfläche nachgeführt (siehe `CLAUDE.md`).

## Angriffsfläche

| Teil | Wer erreicht ihn | Was dort passiert |
|---|---|---|
| Lokale Datei `leyonet.html`, Desktop-App | nur wer die Datei öffnet | alles im Browser bzw. im App-Fenster, kein Netzwerkzugriff (CSP `connect-src 'none'`), Desktop ohne Systemrechte |
| Webversion: Seite und `/assets/` | alle | nur Auslieferung der fertigen Datei |
| Webversion: `/api/sessions`, `/api/exams/join`, `/api/classes/join`, `/api/feedback` | alle, **ohne Anmeldung** | Projekte speichern und laden, Prüfung beitreten, Rückmeldung senden |
| Webversion: `/api/admin/…` | nur mit Admin-Passwort | Einstellungen, Klassen, Prüfungen, Rückmeldungen |
| Projektdateien, Prüfungsdateien, Abgaben | wer eine Datei weitergibt oder hochlädt | werden in der Oberfläche geöffnet und dargestellt |

## Angriffe und Gegenmassnahmen

### Server lahmlegen (Verfügbarkeit)

| Angriff | Gegenmassnahme |
|---|---|
| Viele oder grosse Projekte hochladen, bis die Platte voll ist | Projekt höchstens 1 MB; insgesamt höchstens `MAX_SESSIONS` (5000) Sessions und `MAX_STORAGE_MB` (1 GB) → «507 Speicher voll». Prüfungsplätze und Admin sind ausgenommen. Volle Platte (ENOSPC) gibt 507 statt Absturz. |
| Sehr grosse Anfrage | Angekündigte Grösse über der Grenze wird nicht verarbeitet (413). Bis 16 MB wird der Rest verworfen, damit der Absender die Antwort sicher erhält; darüber wird die Verbindung geschlossen. |
| Viele Anfragen von einer Adresse | Grenzen je Adresse und Minute: neue Sessions 60, Speichern 600 (ganze Klassen hinter einer Schuladresse), Klassen beitreten 30, Rückmeldungen 5, Anmeldung 10. |
| Viele Anfragen mit gefälschten Adressen (falls der Proxy den Weiterleitungs-Kopf nicht selbst setzt) | Zusätzlich Grenzen insgesamt: neue Sessions 1200, Rückmeldungen 60, Anmeldeversuche 30 pro Minute. Die Liste der Zähler ist auf 50 000 Einträge begrenzt. |
| Server mit vielen Dateien blockieren | Verzeichnis im Arbeitsspeicher, beim Start in Stapeln gelesen; Aufräumen und Listen lesen nicht alle Dateien. |
| Langsame Verbindungen offen halten (Slowloris) | Zeitlimits: Kopfzeilen 20 s, ganze Anfrage 120 s, Keep-Alive 5 s, höchstens 60 Kopfzeilen. |
| Kaputtes JSON, `null`, tief verschachtelte Daten | Nur JSON-Objekte werden angenommen (400); Fehler in einer Anfrage werden abgefangen und bringen den Prozess nicht zum Absturz. |

### In fremde Daten schauen (Vertraulichkeit)

| Angriff | Gegenmassnahme |
|---|---|
| Session-, Klassen- oder Platz-Codes erraten | 8 Zeichen aus 31 (rund 8,5 × 10¹¹ Möglichkeiten), zufällig aus `crypto.randomInt`, Ratenbegrenzung. |
| Admin-Passwort erraten | Vergleich in konstanter Zeit, 10 Versuche pro Minute und Adresse, 30 insgesamt. Warnung beim Start, wenn es kürzer als 12 Zeichen ist. |
| Prüfungslösungen lesen | Lernende erhalten nur die Prüfungsdatei ohne Prüfbausteine; der Schlüssel liegt auf dem Server verschlüsselt (AES-256-GCM, Schlüssel per scrypt aus dem Admin-Passwort). Keine Lösungen im öffentlichen Repo. |
| Pfade manipulieren (`../`) | Dateinamen entstehen nur aus geprüften Codes bzw. Kennungen (feste Muster). |
| Fremde Seite liest die API (CSRF/CORS) | Keine CORS-Freigabe; Anfragen mit Inhalt müssen `application/json` sein; Admin nur mit Token im Kopf `Authorization` (kein Cookie). |

### Code einschleusen (Integrität)

| Angriff | Gegenmassnahme |
|---|---|
| Skript in einer Projektdatei (Gerätenamen, Notizen, Webseiten eines simulierten Webservers) – z.B. eine Abgabe, die die Lehrperson öffnet | Svelte gibt Texte immer maskiert aus. Simulierte Webseiten laufen in einem `iframe` mit `sandbox` ohne Skripte, Formulare und Popups; die CSP der Seite (`default-src 'none'`, `script-src 'self'`) gilt auch dort. Bilder nur als `data:`. |
| Die Seite in einen fremden Rahmen einbetten (Clickjacking) | `frame-ancestors 'none'` und `X-Frame-Options: DENY`. |
| DNS-Weiterleitung im Kreis (Server A → B → A) oder sehr viele Anfragen in der Simulation | Anfragen des eigenen Weiterleiters werden nicht nochmals weitergeleitet, höchstens 50 offene Weiterleitungen, CNAME-Ketten höchstens 8 Schritte; sonst SERVFAIL. Die Simulation bleibt bedienbar. |
| Firewall eines Geräts über IPv6 umgehen (Dienste laufen jetzt auch über IPv6) | Dieselben Regeln gelten für TCP und UDP über IPv6, Adressbereiche auch als IPv6-Netz; die Standardregel greift, wenn keine Regel passt. Eigene Verbindungen werden gemerkt, damit Antworten zurückkommen. |
| Gefälschte Routen in der Simulation (z.B. eine Projektdatei, die mit RIPng oder OSPFv3 Verkehr umlenkt) | RIPng nimmt nur Updates von Link-Local-Absendern auf derselben Leitung an, OSPFv3 nur auf eingeschalteten Anschlüssen mit Hop Limit 1. Einstellungen aus Dateien werden geprüft (Anschluss muss existieren, Area und Router-ID gültig, keine Doppelten). |
| Formatierung in Aufgabentexten missbrauchen (eine fremde Aufgabendatei mit HTML oder Skript in der Beschreibung) | Die Auszeichnung (`richText.ts`) erzeugt nur Bausteine (Absatz, Liste, fett, Code, Adresse), die Svelte maskiert ausgibt; nie `{@html}`. HTML bleibt sichtbarer Text (Test). |
| Firewall-Gerät, Firewall-Regeln oder ACLs in einer Projektdatei manipulieren (z.B. sehr viele Regeln, ungültige Namen, ACL auf einem Router, Regel auf einem nicht vorhandenen Anschluss) | Beim Laden geprüft wie im Formular: höchstens 16 ACLs mit je 50 Regeln, Namen nur `[A-Za-z0-9_-]{1,32}`, keine doppelten Namen, ACL nur auf Switches, Adressen und Ports gültig, Anschluss muss existieren. Fällt ein Anschluss weg, fallen seine Firewall-Regeln mit. Befehlszeile prüft dieselben Grenzen. |
| Firewall umgehen: Echo Request von aussen als «Antwort» auf eine eigene Verbindung tarnen (gleiche ICMP-Kennung) | Ein Echo Request gilt nie als Antwort; nur Echo Reply und ICMP-Fehler passen auf gemerkte Verbindungen (Test). Die Firewall als Gerät schützt mit denselben Regeln auch ihre eigenen Adressen (Ping, SSH vom WAN gesperrt). |
| VLAN-Listen in einer Projektdatei oder auf der Befehlszeile aufblähen (`vlanDb`, `allowedVlans`, `switchport trunk allowed vlan except 1`) | Nur ganze Zahlen 1–4094, ohne Doppelte, höchstens 4094 Einträge je Liste; Bereiche wie `30-35` werden auf 1–4094 begrenzt. Meldungen über verworfene Rahmen («VLAN nicht angelegt») höchstens alle 5 s je Port und VLAN, damit die Konsole nicht überläuft. |
| OSPF-Sturm: eigenes LSA kommt über einen zweiten Weg zurück und wird endlos neu ausgegeben (hätte die Simulation lahmgelegt) | Nur ein LSA mit **höherer** Nummer gilt als neuer; Test mit mehreren Wegen prüft, dass nach dem Einschwingen keine LSUs mehr fliessen. |
| Port-Channel, Loopbacks, VRFs und VXLAN in einer Projektdatei manipulieren (sehr viele Einträge, ungültige Namen, Verweise auf fehlende VRFs oder Interfaces) | Beim Laden geprüft: Channel 1–64 und gültiger Modus, Loopback 0–99 ohne Doppelte, höchstens 16 VRFs mit Namen `[A-Za-z0-9_-]{1,32}`, jede VRF-Zuordnung muss existieren, höchstens 32 VNIs je Switch mit je 16 VTEPs, VNI 1–16 777 215, jedes VLAN nur einer VNI, Tunnelquelle muss ein vorhandenes Interface sein. Nur auf den passenden Gerätetypen erlaubt. |
| Schleifen und Stürme durch mehrere Kabel | Mehrere Kabel zwischen Geräten sind gewollt; ohne Channel und STP zeigt die gedrosselte Sturm-Simulation die Schleife (bedienbar). LACP stellt Ports ohne passenden Partner aus, statt sie weiterleiten zu lassen. LACP-Timer läuft nur, solange LACP-Ports konfiguriert sind. |
| Fremde Rahmen ins VXLAN einschleusen (UDP 4789 von einem beliebigen Absender) | Ein VTEP packt nur Rahmen von eingetragenen VTEPs und für bekannte VNIs aus, sonst verwerfen und melden. Rahmen aus dem Tunnel gehen nie zurück in den Tunnel (keine Schleife zwischen VTEPs). |
| Verkehr zwischen VRFs (gleiche Adressen verwechseln) | Routen, ARP-Cache und Antworten des Routers sind je VRF getrennt; ein Paket bleibt in der VRF seines Eingangs (Tests mit überlappenden Kundennetzen). |
| Notizfeld (Textfeld) mit HTML | Text wird über dieselbe Auszeichnung wie Aufgabentexte gezeigt, ohne `{@html}`; höchstens 4000 Zeichen. |
| Ungültige Eingaben in Formularen (z.B. MAC-Adressen, Grössen der Bereiche) | Eingaben werden geprüft und vereinheitlicht (MAC nur als 6 Bytes, keine Gruppenadressen); gespeicherte Grössen im Browser werden auf feste Grenzen beschränkt. |
| Formeln in der CSV-Auswertung (Dateinamen, Bemerkungen wie `=HYPERLINK(…)`) | Zellen, die mit `= + - @` beginnen, erhalten ein `'` davor. |
| Skripte in heruntergeladenen Berichten, Platzkarten, Aufgabenblättern | Alle Werte HTML-maskiert, zusätzlich eine CSP ohne Skripte im Dokument. |
| Fremde Pakete mit Schadcode | Server ohne Abhängigkeiten; Oberfläche ohne Laufzeitabhängigkeiten; Lizenz- und `npm audit`-Prüfung bei jedem Release. |

## Was offen bleibt

- **Speicher füllen:** Wer viele Adressen hat, kann die Gesamtgrenze erreichen. Dann erhalten neue Sessions «Speicher voll», bis der Admin alte Sessions löscht. Laufende Prüfungen, gespeicherte Sessions und die Admin-Konsole funktionieren weiter.
- **Anmeldung sperren:** Viele falsche Anmeldungen blockieren die Anmeldung für eine Minute, auch für den Admin. Das ist der Preis dafür, dass das Passwort nicht erraten werden kann.
- **Gross angelegte Angriffe** (DDoS mit vielen Rechnern) kann eine einzelne Anwendung nicht abwehren; dafür sind das Hosting bzw. vorgeschaltete Dienste zuständig.
- **Prüfungsmodus:** Er ist eine Hürde im Unterricht, kein Schutz gegen Absicht. Wer eine eigene Kopie öffnet, umgeht ihn (siehe [pruefungen.md](pruefungen.md)).
- **HTTPS** richtet Plesk ein (Let's Encrypt). Ohne HTTPS könnten Codes und Admin-Token im Netz mitgelesen werden.

## Checkliste bei Änderungen

1. Neuer Endpunkt: Anmeldung nötig? Ratenbegrenzung je Adresse und insgesamt? Grösse und Anzahl begrenzt? Speicher-Grenze (`fits`)?
2. Neue Eingaben: Typ und Länge prüfen, nur Objekte annehmen, Kennungen mit festem Muster.
3. Neue Dateien auf dem Server: über `store`/`drop`, damit Verzeichnis und Grenzen stimmen; Ablaufdatum setzen.
4. Ausgabe: nie `{@html}` mit fremden Daten, keine Skripte in `iframe`, HTML-Exporte maskieren, CSV entschärfen.
5. Nichts protokollieren, was Personen zuordnet (keine Adressen, keine Anfragedaten).
6. Tests für Grenzen und Fehlerfälle (`server/limits.test.cjs`), `npm run release`.
