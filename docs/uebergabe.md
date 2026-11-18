# Übergabe an einen neuen Chat (Claude)

Diese Seite ist der Einstieg, wenn die Arbeit an leyoNET in einem neuen Chat oder mit einem neuen Konto weitergeht. Sie fasst zusammen, was Claude bisher über das Projekt, die Arbeitsweise und die offenen Punkte weiss. Die festen Regeln stehen in [`CLAUDE.md`](../CLAUDE.md) im Hauptordner; diese Seite ergänzt sie.

**So startest du den neuen Chat:** Repository `vonam-git/leyoNET` freigeben (siehe unten), dann schreiben: «Lies `CLAUDE.md` und `docs/uebergabe.md` und mach dort weiter.»

## Zugang einrichten (neues Konto)

1. Auf GitHub (Konto `vonam-git`): *Settings → Applications → Installed GitHub Apps → Claude → Configure* → unter *Repository access* das Repository `leyoNET` freigeben.
2. Im Chat das Repository hinzufügen lassen («Füge vonam-git/leyoNET hinzu»). Claude klont es dann selbst.
3. Für die Webversion braucht es keine weiteren Zugangsdaten. Plesk bedient Mark selbst.

**Was Claude nicht kann** (GitHub-Proxy): Tags setzen oder pushen, Releases erstellen oder veröffentlichen, Branches löschen, Repository-Einstellungen ändern. Das macht Mark. Pull Requests erstellen und mergen geht (über `gh api`).

## Projekt in Kürze

- leyoNET ist ein Netzwerk-Simulator für den Informatik-Unterricht (1. Lehrjahr bis Fachhochschule), von Mark und Mika. Überblick: [README](../README.md), Architektur: [entwicklung.md](entwicklung.md).
- Drei Auslieferungen: Einzeldatei `release/leyonet.html` (eingecheckt, muss zum Code passen), Webversion mit Node-Server auf Plesk ([plesk.md](plesk.md)), Desktop-App (Tauri, [desktop.md](desktop.md)).
- Website: `website/httpdocs` (leyonet.ch, statisch, Mark lädt sie selbst hoch). Wiki-Quellen in `docs/wiki/`, erzeugt mit `npm run wiki`.
- Versionen: [versionen.md](versionen.md), Release-Texte in `docs/releases/`. Aktuell ist die Version aus `package.json`.

## Arbeitsweise (von Mark so gewünscht)

- **Deutsch, Schweizer Schreibweise** («ss», «…»). Kurz, klar, ohne Floskeln.
- Gearbeitet wird auf **`develop`**. `main` ist stabil und bekommt Änderungen per Pull Request von `develop` (nach grüner CI mergen). Plesk liefert `develop` aus.
- **Vor jedem Commit `npm run release`**, danach committen und pushen. Oberflächentests: `PW_EXECUTABLE=<chromium> npx playwright test` nach `npm run build`.
- **Nach jedem Push die Plesk-Schritte nennen**, in dieser Reihenfolge: *Git → Pull Updates*, *Jetzt bereitstellen*, *Node.js → App neu starten*. Dazu sagen, ob etwas Zusätzliches nötig ist (neue Umgebungsvariablen, geänderte Node.js-Einstellungen) oder ob nur der Neustart zählt (Änderungen in `server/`).
- **IT-Sicherheitsprüfung bei jeder Änderung** (Checkliste: [sicherheit.md](sicherheit.md)) und Mark kurz sagen, was geprüft wurde.
- **Nie etwas leaken, was Lernende nicht sehen sollen** (Lösungen, Prüfbausteine, Codes, Varianten anderer Plätze). Bei grösseren Änderungen einen **unabhängigen Test-Agenten** (Subagent) Leck- und Sicherheitstests machen lassen, Befunde beheben, Tests ergänzen.
- Neue Funktionen brauchen: Texte de/en, F1-Hilfe, Doku, Wiki (de/en), gegebenenfalls Funktionsschalter, Demo für neue Protokolle; jede Katalog-Übung eine Musterlösung (Test) und Arbeitsblätter (`npm run arbeitsblaetter`). Zitierte Normen in [normen.json](normen.json).
- Bei einem Release: Version an allen Stellen hochzählen (`package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, Website-HTML, Release-Text, `versionen.md`). Danach Mark sagen, dass er den Tag setzt:
  ```
  git checkout main && git pull && git tag vX.Y.Z && git push origin vX.Y.Z
  ```
  Der Tag startet den Build der Installer. Danach unter *Releases* den Entwurf prüfen und veröffentlichen.

## Impressum und Datenschutzerklärung der Website

Die echten Dateien `website/httpdocs/impressum.html` und `website/httpdocs/datenschutz.html` enthalten Marks Ortsangabe. Sie sind **absichtlich nicht im Repository** (`.gitignore`). Im Repository liegen nur die Vorlagen:

- `website/httpdocs/impressum.vorlage.html`
- `website/httpdocs/datenschutz.vorlage.html`

Die Vorlagen enthalten den Platzhalter `[PLZ Ort]` (als `<span class="platzhalter">…</span>`). Öffentliche Kontaktadresse ist `info@leyonet.ch`. Diese darf überall stehen. Marks private E-Mail-Adresse und Anschrift gehören nirgends ins Repository, in keine Doku, keinen Commit und keine Ausgabe.

**Ablauf bei jeder Website-Änderung, die diese Seiten betrifft** (z.B. neue Version im `?v=`-Parameter):

1. Claude fragt Mark einmal im Chat nach der Ortsangabe (PLZ und Ort), falls sie im neuen Chat nicht bekannt ist.
2. Claude erzeugt die beiden Dateien **lokal** aus den Vorlagen, ersetzt `<span class="platzhalter">[PLZ Ort]</span>` durch `<span>PLZ Ort</span>` und prüft, dass die Version stimmt.
3. Claude **schickt die beiden Dateien als Datei** an Mark (nicht als Text im Chat, nicht ins Repository) und prüft vor dem Commit, dass `git status` sie nicht anzeigt.
4. Mark lädt sie mit dem Rest von `website/httpdocs` auf den Webserver.

Ändert sich der Text von Impressum oder Datenschutz, immer zuerst die Vorlage anpassen, dann die Dateien neu erzeugen.

## Plesk

Einrichtung, Umgebungsvariablen und Updates in [plesk.md](plesk.md) (Branch `develop`, Anwendungsstamm `<repo>/server`, Startdatei `start.cjs`, Dokumentstamm `<repo>/server/public`).

## Offene Punkte

Stand der letzten Arbeit: Version 1.8.0 (PR #52 auf `main`).

**Von Mark zu erledigen**
- Tag `v1.8.0` setzen und das Release veröffentlichen (falls noch nicht geschehen).
- Website hochladen (`website/httpdocs` samt den zugeschickten Impressum und Datenschutz).
- Plesk: Node.js 22 oder neuer; `DATA_DIR` ausserhalb von `httpdocs`; in `/admin` Zwei-Faktor einrichten.
- GitHub: «Automatically delete head branches» **aus** lassen (sonst verschwindet `develop` beim Merge), Schutzregeln für `develop` und `main`, Dependabot-Sicherheitsupdates einschalten. Alte Branches löschen: `claude/sicherheit-und-erweiterungen`, `wip/verbund` und die beiden `dependabot/…`-Branches.
- Bing Webmaster Tools nach dem Hochladen neu prüfen lassen.

**Offen im Projekt**
- DHCP, «zwei Discover auf dem Desktop»: nicht nachvollziehbar, braucht Screenshot oder Schritte.
- Weitere Verbund-Übungen (Webseite eines Nachbarstandorts, VPN zwischen Standorten); Verbund-Fehlersuche auch als Prüfungsvorlage im Cockpit.
- Websuche: Search Console, Sitemaps, Verlinkung von Schulseiten.
- Sicherheit: Mengengrenze je Zugang für Klassen und Prüfungen; Verbund-Nachrichten an einen Platz sind für alle mit Klassencode abrufbar; Beenden-Code in der Einzeldatei (offline) noch 6 Zeichen SHA-256 und Einzeldatei mit Varianten enthält alle Plätze; nur eine Instanz in Plesk; Installer signieren; `cargo audit` in die CI; `server/app.cjs` aufteilen.
- Private Mailadressen in der Git-Historie (Mika): Entscheid offen.
- Ideen Admin-Konsole: Protokoll der Admin-Aktionen, Prüfung zu fester Uhrzeit, Probeprüfung, Sicherung des Datenordners, Passkeys.
- Erweiterungen: VRRP, Rapid-STP, Reihe M123, Syslog/SNMP/NTP, HTTPS sichtbar, 802.1X/RADIUS, Angriffe zum Anschauen, Leitungsfehler, Remote-Access-VPN, geführte Fehlersuche, running-/startup-config, PWA, Barrierefreiheit (WCAG).

## Hilfen für die Arbeit

- Texte: `src/i18n/de.json` und `en.json`. Ein Test prüft, dass jeder verwendete Schlüssel existiert. Neue Schlüssel am besten mit einem kleinen Skript neben einem vorhandenen Schlüssel einfügen (Reihenfolge beibehalten).
- Admin-Konsole lokal testen: `DATA_DIR=<tmp> ADMIN_PASSWORD=<pw> PORT=8790 node server/start.cjs`, vorher `npm run build && cp dist/index.html release/leyonet.html`. Mit Zwei-Faktor braucht ein Testskript TOTP-Codes; jeder Code gilt nur einmal.
- Server-Tests: `npm run test:server`. Pull Requests: `gh api repos/vonam-git/leyoNET/pulls` (nach grüner CI mit `PUT …/pulls/<n>/merge`).
