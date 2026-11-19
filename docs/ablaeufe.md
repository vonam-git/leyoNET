# Abläufe für die Arbeit am Projekt

Ergänzt [`CLAUDE.md`](../CLAUDE.md) um Abläufe, die nicht in jeder Sitzung vorkommen: Release, Impressum und Datenschutz der Website, Plesk und praktische Hilfen. Die laufende Liste der offenen Punkte liegt nicht im (öffentlichen) Repository, sondern im claude.ai-Projekt «leyoNET» (`claude/offene-aufgaben.md`).

**Was Claude nicht kann** (GitHub-Proxy): Tags setzen oder pushen, Releases erstellen oder veröffentlichen, Branches löschen, Repository-Einstellungen ändern. Das macht Mark. Pull Requests erstellen und mergen geht (über `gh api`).

## Projekt in Kürze

- leyoNET ist ein Netzwerk-Simulator für den Informatik-Unterricht (1. Lehrjahr bis Fachhochschule), von Mark und Mika. Überblick: [README](../README.md), Architektur: [entwicklung.md](entwicklung.md).
- Drei Auslieferungen: Einzeldatei `release/leyonet.html` (eingecheckt, muss zum Code passen), Webversion mit Node-Server auf Plesk ([plesk.md](plesk.md)), Desktop-App (Tauri, [desktop.md](desktop.md)).
- Website: `website/httpdocs` (leyonet.ch, statisch, Mark lädt sie selbst hoch). Wiki-Quellen in `docs/wiki/`, erzeugt mit `npm run wiki`.
- Versionen: [versionen.md](versionen.md), Release-Texte in `docs/releases/`. Aktuell ist die Version aus `package.json`.

## Release

Version an allen Stellen hochzählen (`package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, Website-HTML, Release-Text, `versionen.md`). Danach Mark sagen, dass er den Tag setzt:
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

1. Claude fragt Mark einmal im Chat nach der Ortsangabe (PLZ und Ort), falls sie in der laufenden Sitzung nicht bekannt ist.
2. Claude erzeugt die beiden Dateien **lokal** aus den Vorlagen, ersetzt `<span class="platzhalter">[PLZ Ort]</span>` durch `<span>PLZ Ort</span>` und prüft, dass die Version stimmt.
3. Claude **schickt die beiden Dateien als Datei** an Mark (nicht als Text im Chat, nicht ins Repository) und prüft vor dem Commit, dass `git status` sie nicht anzeigt.
4. Mark lädt sie mit dem Rest von `website/httpdocs` auf den Webserver.

Ändert sich der Text von Impressum oder Datenschutz, immer zuerst die Vorlage anpassen, dann die Dateien neu erzeugen.

## Plesk

Einrichtung, Umgebungsvariablen und Updates in [plesk.md](plesk.md) (Branch `develop`, Anwendungsstamm `<repo>/server`, Startdatei `start.cjs`, Dokumentstamm `<repo>/server/public`).

## Hilfen für die Arbeit

- Texte: `src/i18n/de.json` und `en.json`. Ein Test prüft, dass jeder verwendete Schlüssel existiert. Neue Schlüssel am besten mit einem kleinen Skript neben einem vorhandenen Schlüssel einfügen (Reihenfolge beibehalten).
- Admin-Konsole lokal testen: `DATA_DIR=<tmp> ADMIN_PASSWORD=<pw> PORT=8790 node server/start.cjs`, vorher `npm run build && cp dist/index.html release/leyonet.html`. Mit Zwei-Faktor braucht ein Testskript TOTP-Codes; jeder Code gilt nur einmal.
- Server-Tests: `npm run test:server`. Pull Requests: `gh api repos/vonam-git/leyoNET/pulls` (nach grüner CI mit `PUT …/pulls/<n>/merge`).
