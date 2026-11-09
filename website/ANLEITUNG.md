# leyonet.ch – Auftritt einrichten

Der Ordner `httpdocs/` enthält die ganze Website. Es sind reine Dateien, ohne Datenbank, ohne Node.js und ohne fremde Dienste.

## Vorschau auf dem eigenen Rechner

`httpdocs/index.html` doppelklicken. Alle Verweise sind relativ, die Seite sieht lokal gleich aus wie online. Nur die Fehlerseite `404.html` und die Regeln der `.htaccess` (HTTPS, Sicherheits-Köpfe) wirken erst auf dem Server.

## Aufbau

| Adresse | Inhalt | In Plesk |
|---|---|---|
| `leyonet.ch` | dieser Auftritt | Hauptdomain, Dokumentstamm `httpdocs` |
| `www.leyonet.ch` | leitet auf `leyonet.ch` um (`.htaccess`) | Alias der Hauptdomain |
| `app.leyonet.ch` | das Programm (Node.js-Server aus dem Repo, Branch `main`) | Subdomain, wie in `docs/plesk.md` im Repo |
| `beta.leyonet.ch` (optional) | neueste Entwicklung, Branch `develop` | Subdomain mit eigenem `ADMIN_PASSWORD` und `DATA_DIR` |

## Einrichten in Plesk (über Git, einmalig)

Die Website liegt im Repo unter `website/httpdocs/`. Plesk holt sie direkt von GitHub, hochladen muss man nichts mehr.

1. **leyonet.ch → Git → Repository hinzufügen**: `https://github.com/vonam-git/leyoNET.git`, Branch **`main`**, Bereitstellung *automatisch*, Bereitstellungspfad **`leyonet-repo`** (ein eigener Ordner neben `httpdocs`, nicht `httpdocs` selbst).
2. **Hosting & DNS → Hosting** (bzw. *Hosting-Einstellungen*): Dokumentstamm auf **`leyonet-repo/website/httpdocs`** setzen. So ist nur dieser Ordner öffentlich, nicht der Rest des Repos.
3. `impressum.html` und `datenschutz.html` mit den echten Angaben hochladen (siehe unten). Den alten Inhalt von `httpdocs` (vor allem `download/` mit den Installern, rund 100 MB) löschen; er wird nicht mehr gebraucht.
4. **SSL/TLS-Zertifikate → Let's Encrypt** für `leyonet.ch` und `www.leyonet.ch` (oder ein Wildcard-Zertifikat für `*.leyonet.ch`, dann gilt es auch für `app.`).
5. **Hosting & DNS → Apache & nginx**: Läuft die Domain nur über nginx («Proxy-Modus» aus), greift die `.htaccess` nicht. Dann die Sicherheits-Köpfe unten unter *Zusätzliche nginx-Anweisungen* eintragen.
6. **Protokolle → Protokollrotation**: Zugriffsprotokolle nach höchstens 7 Tagen löschen (so steht es in der Datenschutzerklärung).

Änderungen an der Website: in `website/httpdocs/` auf `develop` ändern, nach `main` übernehmen, dann in Plesk bei leyonet.ch *Git → Pull Updates* (bei automatischer Bereitstellung genügt das).

## Impressum und Datenschutz (nur auf dem Server)

Adresse und E-Mail gehören nicht ins öffentliche Repo. Im Repo liegen darum nur die Vorlagen `impressum.vorlage.html` und `datenschutz.vorlage.html` mit gelb markierten Platzhaltern (`[PLZ Ort]`, `[E-Mail-Adresse]`). Die echten Seiten `impressum.html` und `datenschutz.html` stehen in `.gitignore` und liegen nur auf dem Server:

1. Vorlage kopieren, Platzhalter ersetzen, als `impressum.html` bzw. `datenschutz.html` speichern.
2. In Plesk unter *Dateien* in den Dokumentstamm (`leyonet-repo/website/httpdocs`) hochladen. *Git → Pull Updates* lässt diese Dateien in Ruhe, weil Git sie nicht kennt.
3. Ändert sich eine Vorlage im Repo (z.B. ein neuer Abschnitt), die echte Seite auf dem Server gleich nachführen.

Die Vorlagen selbst liefert der Server nicht aus (`.htaccess`). In der Schweiz ist eine Datenschutzerklärung nötig, sobald Personendaten anfallen (das sind schon die Zugriffsprotokolle des Webservers); eine Kontaktadresse gehört ins Impressum.

## Falls «500 Internal Server Error» erscheint

Dann erlaubt der Server in der `.htaccess` keine eigenen `Options`. Die Zeilen `Options -Indexes` und den Block `<FilesMatch "^\.">…</FilesMatch>` entfernen; Verzeichnislisten schaltet Plesk dann unter *Apache & nginx* ab.

## Neue Version veröffentlichen

Die Download-Knöpfe zeigen auf `https://github.com/vonam-git/leyoNET/releases/latest/download/<fester Name>`. Bei einer neuen Version muss darum **nichts hochgeladen** werden:

1. Version in `package.json` erhöhen, Release-Text in `docs/releases/v<version>.md` schreiben, nach `main` übernehmen.
2. Tag auf `main` setzen und pushen, z.B. `git tag -a v1.3.0 origin/main -m "leyoNET 1.3.0" && git push origin v1.3.0`.
3. Der Workflow *Desktop* baut die Installer und legt Kopien mit festen Namen in den Release-Entwurf:

   | Datei aus dem Bau | fester Name im Release |
   |---|---|
   | `leyoNET_<version>_x64-setup.exe` | `leyoNET-Windows-Setup.exe` |
   | `leyoNET_<version>_x64_en-US.msi` | `leyoNET-Windows.msi` |
   | `leyoNET_<version>_universal.dmg` | `leyoNET-macOS.dmg` |
   | `leyoNET_<version>_amd64.AppImage` | `leyoNET-Linux.AppImage` |
   | `leyoNET_<version>_amd64.deb` | `leyoNET-Linux.deb` |
   | `leyoNET-<version>-1.x86_64.rpm` | `leyoNET-Linux.rpm` |
   | `release/leyonet.html` aus dem Repo | `leyonet.html` |
   | Prüfsummen aller Dateien oben | `SHA256SUMS.txt` |
   | `docs/arbeitsblaetter/*.pdf` (ohne Musterlösungen) | `leyoNET-Arbeitsblaetter.zip` |

4. Den Entwurf unter *Releases* prüfen und **veröffentlichen**. Ab dann laden alle Knöpfe der Website die neue Version.
5. In `index.html` die Versionsnummer (`data-version`) und allenfalls die Zahlen (Übungen, Demos …) nachführen; ein Test prüft, dass jeder Download-Name im Workflow entsteht.

## Sicherheits-Köpfe für nginx (nur falls ohne Apache)

```nginx
add_header Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" always;
add_header Strict-Transport-Security "max-age=31536000" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "no-referrer" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
location = /download/leyonet.html { add_header Content-Disposition "attachment; filename=leyonet.html"; }
```

## Was die Seite tut und nicht tut

- Keine Cookies, kein Tracking, keine Besucherzählung, keine fremden Schriften oder Skripte. Die Zahlen auf der Startseite zeigen den Funktionsumfang (Übungen, Demos, Gerätetypen, Normen, Tests), keine Besucher.
- Ein kleines Skript (`js/site.js`) spielt die Animation im Kopf ab, schaltet die Bildschirmfotos um und zählt die Zahlen einmal hoch. Ohne Skript bleibt alles lesbar.
- Die Downloads liegen bei GitHub; auf leyonet.ch selbst liegt kein Programm. Erst ein Klick auf einen Download verbindet mit GitHub (steht so in der Datenschutzerklärung).
