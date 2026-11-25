# Abläufe für die Arbeit am Projekt

Ergänzt [`CLAUDE.md`](../CLAUDE.md) um Abläufe, die nicht in jeder Sitzung vorkommen: Release, Impressum und Datenschutz der Website, Plesk und praktische Hilfen. Die laufende Liste der offenen Punkte liegt nicht im (öffentlichen) Repository, sondern im claude.ai-Projekt «leyoNET» (`claude/offene-aufgaben.md`) bzw. auf der eigenen VM in `~/leyonet-privat/offene-aufgaben.md` (siehe [Eigene Ubuntu-VM](#eigene-ubuntu-vm-mit-claude-code)).

**Was Claude nicht kann** (in der Cloud-Sitzung von claude.ai, GitHub-Proxy): Tags setzen oder pushen, Releases erstellen oder veröffentlichen, Branches löschen, Repository-Einstellungen ändern. Das macht Mark. Pull Requests erstellen und mergen geht (über `gh api`). Auf der eigenen VM hat Claude Code Marks GitHub-Zugang; Tags, Releases und Löschen fragt es trotzdem immer zuerst (`.claude/settings.json`).

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

**Ablauf bei jeder Website-Änderung, die diese Seiten betrifft** (z.B. neue Version im `?v=`-Parameter oder geänderter Text der Vorlage):

1. `node scripts/rechtstexte.mjs` erzeugt beide Dateien aus den Vorlagen. Die Ortsangabe kommt aus `LEYONET_ORT` oder `~/leyonet-privat/ort.txt` (eine Zeile «PLZ Ort») und wird nie ausgegeben. Claude liest die erzeugten Dateien nicht (Leseverbot in `.claude/settings.json`).
2. In der claude.ai-Cloud fehlt `ort.txt`: Claude fragt Mark einmal nach der Ortsangabe, setzt sie nur als `LEYONET_ORT` für diesen Aufruf und **schickt die beiden Dateien als Datei** an Mark (nicht als Text im Chat).
3. Vor dem Commit prüfen, dass `git status` die beiden Dateien nicht anzeigt.
4. Mark lädt sie mit dem Rest von `website/httpdocs` auf den Webserver.

Ändert sich der Text von Impressum oder Datenschutz, immer zuerst die Vorlage anpassen, dann die Dateien neu erzeugen.

## Plesk

Einrichtung, Umgebungsvariablen und Updates in [plesk.md](plesk.md) (Branch `develop`, Anwendungsstamm `<repo>/server`, Startdatei `start.cjs`, Dokumentstamm `<repo>/server/public`).

## Hilfen für die Arbeit

- Texte: `src/i18n/de.json` und `en.json`. Ein Test prüft, dass jeder verwendete Schlüssel existiert. Neue Schlüssel am besten mit einem kleinen Skript neben einem vorhandenen Schlüssel einfügen (Reihenfolge beibehalten).
- Admin-Konsole lokal testen: `DATA_DIR=<tmp> ADMIN_PASSWORD=<pw> PORT=8790 node server/start.cjs`, vorher `npm run build && cp dist/index.html release/leyonet.html`. Mit Zwei-Faktor braucht ein Testskript TOTP-Codes; jeder Code gilt nur einmal.
- Server-Tests: `npm run test:server`. Pull Requests: `gh api repos/vonam-git/leyoNET/pulls` (nach grüner CI mit `PUT …/pulls/<n>/merge`).

## Eigene Ubuntu-VM mit Claude Code

So zieht die Arbeit an leyoNET (Repo, app.leyonet.ch, leyonet.ch) auf eine eigene VM um. Getestet für Ubuntu 24.04 LTS; 4 GB RAM reichen, 8 GB sind angenehmer (Build, Oberflächentests).

**1. Grundwerkzeuge**
```bash
sudo apt update && sudo apt install -y git curl build-essential python3-pil ffmpeg
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt install -y nodejs   # Node 24 wie in der CI
sudo apt install -y gh
```
`python3-pil` braucht nur `scripts/wiki/bilder.py`, `ffmpeg` nur Filme für die Website.

**2. GitHub**
```bash
gh auth login                      # GitHub.com, HTTPS, im Browser bestätigen
gh auth setup-git
git config --global user.name "Mark v. A."
git config --global user.email "<id>+<name>@users.noreply.github.com"   # GitHub → Settings → Emails, nie die private Adresse
git clone https://github.com/vonam-git/leyoNET.git ~/leyonet && cd ~/leyonet && git checkout develop
npm ci
```

**3. Browser für die Oberflächentests**
```bash
npx playwright install --with-deps chromium
echo 'export PW_CHANNEL=chromium' >> ~/.bashrc
```

**4. Private Dateien** (nie ins Repository): Ordner `~/leyonet-privat/` anlegen mit
- `ort.txt`: eine Zeile «PLZ Ort» für Impressum und Datenschutz, dann `node scripts/rechtstexte.mjs`
- `offene-aufgaben.md` und die übrigen Notizen aus dem claude.ai-Projekt «leyoNET» (dort herunterladen)

**5. Claude Code**
```bash
curl -fsSL https://claude.ai/install.sh | bash
cd ~/leyonet && claude              # beim ersten Start im Browser anmelden
```
Claude Code liest `CLAUDE.md` und diese Datei selbst. Erster Auftrag zum Prüfen: «Lies CLAUDE.md und docs/ablaeufe.md, führe `npm run release` aus und sag mir, ob alles läuft.» Schutzregeln für das Repository stehen in `.claude/settings.json`: kein Force-Push, kein Push auf `main`, kein Lesen von Impressum/Datenschutz; Tags, Releases und Löschen nur nach Rückfrage.

**6. Desktop-App** (nur falls lokal gebaut werden soll; sonst baut sie GitHub Actions beim Tag):
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sudo apt install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

**Was bleibt wie bisher:** Plesk (Git-Pull von `develop`, Neustart) und das Hochladen von `website/httpdocs` macht Mark. Zugangsdaten für Plesk, FTP oder den Admin der Webversion gehören nicht auf die VM in Dateien, die Claude Code liest.
