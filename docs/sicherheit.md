# IT-Sicherheit

Diese Seite beschreibt, wie man leyoNET angreifen könnte, was dagegen getan ist und was offen bleibt. Sie wird bei jeder Änderung an Server, Dateiformaten oder Oberfläche nachgeführt (siehe `CLAUDE.md`).

## Angriffsfläche

| Teil | Wer erreicht ihn | Was dort passiert |
|---|---|---|
| Lokale Datei `leyonet.html`, Desktop-App | nur wer die Datei öffnet | alles im Browser bzw. im App-Fenster, kein Netzwerkzugriff (CSP `connect-src 'none'`), Desktop ohne Systemrechte |
| Webversion: Seite und `/assets/` | alle | nur Auslieferung der fertigen Datei |
| Webversion: `/api/sessions`, `/api/exams/join`, `/api/classes/join`, `/api/feedback` | alle, **ohne Anmeldung** | Projekte speichern und laden, Prüfung beitreten, Rückmeldung senden |
| Webversion: `/api/classes/:code/verbund`, `/api/classes/:code/messages` | wer den Klassencode kennt | Infrastruktur und (falls freigegeben) Standorte des Klassen-Verbunds lesen; Nachrichten nur mit Session der Klasse |
| Webversion: `/api/admin/…` | nur mit Admin-Passwort oder Zugangsschlüssel | Einstellungen, Klassen, Prüfungen, Rückmeldungen, Zugänge (je nach Rolle) |
| Website leyonet.ch (`website/httpdocs/`) | alle | statische Seiten, ein kleines eigenes Skript für Animationen, Downloads als Links auf GitHub-Releases |
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
| Zugangsschlüssel erraten oder vom Server lesen | Schlüssel `LN-<Kennung>-<Geheimnis>` mit 192 Bit Zufall; gespeichert ist nur der SHA-256 des Geheimnisses, Vergleich in konstanter Zeit, dieselbe Ratenbegrenzung wie das Admin-Passwort. Angezeigt wird der Schlüssel nur einmal. |
| Lehrperson liest Klassen oder Prüfungen einer anderen | Jede Klasse und Prüfung hat einen Besitzer; der Server filtert Listen und weist fremde Codes mit 403 ab. Eine Schule sieht ihre Lehrpersonen, Lehrpersonen nur sich. Einstellungen, Rückmeldungen, Prüfberichte und das Leeren aller Sessions nur für den Hauptadmin. |
| Klassen-Verbund: fremde Netze oder Codes abgreifen | Der Verbund-Endpunkt liefert nie Session-Codes; Netze anderer Standorte nur mit «Standorte untereinander sichtbar», Status nur mit «Karte zeigen». Unbekannte Klassen geben 404 und zählen als Fehlversuch (Ratenbegrenzung). |
| Nachrichten fälschen oder fluten | Senden nur mit Session der Klasse und Schreiberkennung des Geräts; 6 pro Minute und Session, 600 Abrufe pro Minute und Adresse; höchstens 200 Nachrichten je Klasse mit 500 Zeichen, nur im Arbeitsspeicher, nach 30 Minuten weg. Ausgabe als Text (kein `{@html}`). |
| Status auf der Karte fälschen | Nur das Dashboard der Lehrperson (mit Anmeldung) meldet den Status; Werte werden auf bekannte Stufen und Zahlen 0–99 begrenzt. Lernende melden nur ihren eigenen Fortschritt (Ziele), der allein nie «online» ergibt. |
| Schaufenster-Link mit fremdem Inhalt (`?schaufenster=…`) | Der Parameter wählt nur unter den eingebauten Demos (unbekannte Namen → Standard); es wird keine Datei und keine Adresse geladen. Das Netz ist schreibgeschützt, und solange das Schaufenster läuft, wird nichts gespeichert, ein eigener Stand also nicht überschrieben. |
| Kontaktformular: Spam über den Server, Adresse abgreifen | Kein Server-Endpunkt: Das Formular baut nur einen `mailto:`-Link im Browser, es gibt nichts zu fluten. Felder werden mit `encodeURIComponent` kodiert, nichts landet als HTML auf der Seite. Die Adresse steht nur in der echten Impressum-Datei auf dem Server; ohne eingetragene Adresse bleibt das Formular versteckt. |
| Link «leyoNET unterstützen» als Einfallstor | Feste Adresse im Code, geöffnet mit `noopener,noreferrer`; keine Einbindung, kein Abruf. Im Prüfungsmodus gesperrt, damit niemand die Prüfung über den Browser verlässt. Die CSP (`connect-src 'none'`) bleibt unverändert. |
| Wiki: Skript oder Link einschleusen | Seiten entstehen beim Release aus eigenen Markdown-Quellen; der Übersetzer maskiert alles HTML, lässt nur https-, mailto- und Wiki-Verweise zu und meldet andere als Fehler. Keine Inline-Skripte, CSP `script-src 'self'`; die Suche liest eine mitgelieferte Datei, ohne Abruf. Ein Test prüft Skripte und Links aller Seiten. |
| Fremde Seite liest die API (CSRF/CORS) | Keine CORS-Freigabe; Anfragen mit Inhalt müssen `application/json` sein; Admin nur mit Token im Kopf `Authorization` (kein Cookie). |

### Code einschleusen (Integrität)

| Angriff | Gegenmassnahme |
|---|---|
| Skript in einer Projektdatei (Gerätenamen, Notizen, Webseiten eines simulierten Webservers) – z.B. eine Abgabe, die die Lehrperson öffnet | Svelte gibt Texte immer maskiert aus. Simulierte Webseiten laufen in einem `iframe` mit `sandbox` ohne Skripte, Formulare und Popups; die CSP der Seite (`default-src 'none'`, `script-src 'self'`) gilt auch dort. Bilder nur als `data:`. |
| Inhalt eines Rahmens (HTTP-Text, DNS-Namen, Gerätenamen aus einer fremden Projektdatei) in der Aufbau-Ansicht der Paketdetails oder im Wiki | `aufbau.ts` baut einen Baum aus festen Tags, Klassen und Attributnamen; Werte sind immer Text. Die App zeichnet ihn mit `Tree.svelte` (kein `{@html}`), das Wiki mit `toHtml()`, das alles maskiert. Ein Test erlaubt nur feste Attributnamen (`data-start`, `data-len`, `data-i`, `type`, `open`, `role`, `aria-label`, `reversed`) und verbietet `style=` und `on…=`. Längenfelder aus den Bytes (IHL, Data Offset) sind auf 4 Bit begrenzt, die Hex-Ansicht auf die Rahmenlänge. |
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
| Fremde Session mit erratenem oder mitgelesenem Code überschreiben oder löschen | Schreiben (Speichern, Löschen, Sperren) nur mit dem Schreib-Token des Geräts (zufällig, 192 Bit; auf dem Server nur der SHA-256-Hash, Vergleich in konstanter Zeit). Ein zweites Gerät erhält das Schreibrecht erst, wenn das erste eine Minute still ist; ist die Session gesperrt, nur mit PIN. Ansehen geht mit dem Code (wie bisher), aber nur lesend. |
| PIN erraten | 4 bis 8 Ziffern, scrypt mit Salz; nach 5 Fehlversuchen in 10 Minuten für diese Session gesperrt, zusätzlich die Grenze von 600 Anfragen je Minute und Adresse. |
| Prüfungsplatz an einem zweiten Rechner öffnen (Mitschüler mit fremdem Platz-Code) | Solange das erste Gerät verbunden ist, wird der Beitritt abgewiesen; freigeben kann nur die Lehrperson in der Admin-Konsole. |
| Riesige Konfiguration in die Befehlszeile einfügen (Einfügen per Rechtsklick oder Ctrl+V) | Höchstens 2000 Zeilen je Einfügen, Kommentarzeilen («!») fallen weg; Befehlsverlauf nur im Arbeitsspeicher, höchstens 100 Einträge je Gerät, nie gespeichert. Die Zwischenablage wird nur auf Rechtsklick gelesen (Browser fragt nach Erlaubnis). |
| DHCP-Pools: viele Pools, ungültige Netze, Adressen der Router selbst vergeben | Höchstens 16 Pools und 32 Ausschlüsse je Gerät, Name nach festem Muster, Netz /8 bis /30; eigene Interface-Adressen sind immer ausgeschlossen; Projektdateien werden gleich geprüft. |
| Zugriffslisten an VLAN-Interfaces umgehen | «in» prüft auch Pakete an den Switch selbst (Ping an die SVI, DHCP an das Relay), «out» alles, was ins VLAN geroutet wird; fehlt eine zugewiesene Liste, meldet «show access-lists» das. |
| Notizfeld (Textfeld) mit HTML | Text wird über dieselbe Auszeichnung wie Aufgabentexte gezeigt, ohne `{@html}`; höchstens 4000 Zeichen. |
| Ungültige Eingaben in Formularen (z.B. MAC-Adressen, Grössen der Bereiche) | Eingaben werden geprüft und vereinheitlicht (MAC nur als 6 Bytes, keine Gruppenadressen); gespeicherte Grössen im Browser werden auf feste Grenzen beschränkt. |
| Formeln in der CSV-Auswertung (Dateinamen, Bemerkungen wie `=HYPERLINK(…)`) | Zellen, die mit `= + - @` beginnen, erhalten ein `'` davor. |
| Skripte in heruntergeladenen Berichten, Platzkarten, Aufgabenblättern | Alle Werte HTML-maskiert, zusätzlich eine CSP ohne Skripte im Dokument. |
| Website: fremde Inhalte einschleusen, Besucher verfolgen, untergeschobene Downloads | Nur eigene Dateien und keine Formulare, CSP `default-src 'none'; script-src 'self'` als Header in `.htaccess`, HTTPS erzwungen (HSTS), `frame-ancestors 'none'`, kein Referrer; Dokumentstamm nur `website/httpdocs/`, nicht das ganze Repo. Downloads nur von den Releases des eigenen GitHub-Repos (HTTPS). Ein Test (`website.test.ts`) prüft, dass die Seite nichts Fremdes lädt, nur bekannte Ziele verlinkt und jede Download-Datei im Workflow entsteht. |
| Release-Workflow: Tag-Namen als Befehl ausführen (Script Injection), fremde Dateien in den Release | Tag-Name nur über eine Umgebungsvariable, Release-Text nur aus `docs/releases/<Tag>.md` bei Tags der Form `vX.Y.Z`; die festen Namen entstehen nur aus den eigenen Build-Dateien des Releases; das ZIP enthält nur die Blätter für Lernende (Musterlösungen sind nicht im Repo). |
| Prüfung mit Safe Exam Browser umgehen | Zufälliger Schlüssel (256 Bit, `crypto.randomBytes`) je Prüfung, nur für den Admin sichtbar, Vergleich zeitkonstant; Beitritt **und** Speichern nur mit Schlüssel und SEB-Kennung im User-Agent; Schlüssel beim Beenden gelöscht, «Neuer Schlüssel» macht alte Dateien ungültig. Im Client nur im Speicher (nie localStorage), sofort aus der Adresszeile entfernt. Passwörter der SEB-Datei entstehen im Browser der Lehrperson, werden nicht gespeichert; Admin- und Beenden-Passwort nur als SHA-256 in der Datei, Startpasswort verschlüsselt die Datei (AES-256-CBC, PBKDF2, HMAC-SHA256). Grenze: User-Agent lässt sich fälschen, wer Datei und Startpasswort hat, kann den Schlüssel auslesen (in `pruefungen.md` beschrieben). Tests: `server/app.test.cjs` (SEB), `src/ui/seb.test.ts` (Format, unabhängig entschlüsselt). |
| Router: zwei Interfaces im selben Netz | Wie auf echten Geräten abgelehnt (`overlapsInterface`), ausser in verschiedenen VRFs; verhindert unklare Weiterleitung. |
| Session- und Platz-Codes raten | Codes aus 8 Zeichen (≥ 10¹¹ Möglichkeiten); je Adresse höchstens 30 **Fehlversuche** pro Minute, danach 429 bis Minutenende (bewusst ohne gesamte Grenze, damit niemand allen das Beitreten sperren kann). Test: `server/app.test.cjs` («Codes raten»). |
| Sicherheitslücken melden | `SECURITY.md`, `/.well-known/security.txt` (RFC 9116) auf Server und Website, Meldung vertraulich über GitHub. Die Live-Prüfung warnt 30 Tage vor Ablauf der Datei auf der Website. |
| Musterlösungen in der App oder im öffentlichen Repo | `catalogSolutions.ts` und `catalogSheets.ts` sind nur im Test und im Erzeuger der Arbeitsblätter eingebunden, nicht in der App; die `_mL.pdf` bleiben ausserhalb von Git (`.gitignore`). |
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

## Angriffe von aussen (automatisch)

`scripts/sicherheit/angriff.mjs` greift wie ein Angreifer aus dem Internet an und meldet jede Schwachstelle (Bericht `sicherheit-bericht.md`):

- **Bei jedem Release** (`npm run release`, auch in der CI): startet den Server mit leerem Datenordner und führt **alle** Angriffe aus, auch solche, die Daten anlegen oder die Ratenbegrenzung auslösen: Sicherheitsköpfe (CSP, Clickjacking, nosniff), keine Cookies, keine fremden Ressourcen, versteckte Dateien und Pfad-Tricks (`/.git/`, `/.env`, `%2e%2e`, `..%5c`), CORS und Preflight, CSRF (Formular-Post), TRACE, Admin ohne/mit falschem Token, Injection bei der Anmeldung, kaputtes JSON, Prototype Pollution, Anfragen über 1 MB, ungültige Codes, Überschreiben und Löschen fremder Sessions, XSS über gespeicherte Daten, Raten von Session-, Platz- und Admin-Codes, Fluten von Rückmeldungen und neuen Sessions, Zugänge (Lehrperson sieht und ändert keine fremden Klassen, kein Zugriff auf Zugänge, Einstellungen, Rückmeldungen und Prüfberichte, Schlüssel nicht gespeichert), Klassen-Verbund (keine Session-Codes, Nachrichten nur von Mitgliedern mit Schreiberkennung, Nachrichtenflut gebremst, unbekannte Klassen 404), 60 gleichzeitige Anfragen, kein Serverfehler.
- **Live** (Workflow «Sicherheitsprüfung live»: wöchentlich, nach jedem Desktop-Release, bei Änderungen an der Prüfung und von Hand) gegen **app.leyonet.ch, beta.leyonet.ch und leyonet.ch**, nur lesend und mit Pausen: zusätzlich TLS-Zertifikat (gültig, ≥ 14 Tage), TLS 1.0/1.1 abgelehnt, http → https, HSTS, Server-Banner, Verzeichnislisten, Vorlagen und Anleitungen nicht öffentlich, Impressum und Datenschutz vorhanden und ohne Platzhalter, Downloads nur aus dem eigenen Repo, security.txt gültig. Bei Befunden eröffnet der Workflow das Issue «Sicherheitsprüfung live: Befund».

Neue Massnahmen in dieser Datei bekommen eine Prüfung in `angriff.mjs`. Nicht automatisch geprüft (von Hand, jährlich oder bei grösseren Änderungen): Plesk-Konfiguration (Updates, Firewall, SSH, Backups), Zugriffsrechte im Hosting, Abhängigkeiten der Desktop-App (`cargo audit`), Code-Review der Änderungen (siehe [isds-konzept.md](isds-konzept.md)).
