# Entwicklung

Erzeugte Inhalte: `npm run wiki` (Wiki unter `website/httpdocs/wiki/` aus `docs/wiki/`), `npm run schaufenster` (`docs/beispiele/rz-verbund.json` aus `src/ui/showcase.build.ts`), `npm run arbeitsblaetter` (PDFs). Was bei jedem Release an der Doku geprüft wird: [doku-pruefung.md](doku-pruefung.md).

Voraussetzung: Node.js 20 oder neuer.

**Branches:** `develop` ist der Entwicklungsstand (Testversion auf Plesk, siehe [docs/plesk.md](plesk.md)), `main` die stabile Version. Gearbeitet wird auf `develop`; vor dem Arbeiten `git pull`, vor dem Push `npm run release`.

```bash
npm ci
npm run dev      # Entwicklungsserver auf http://localhost:5173/dev.html
npm test         # Tests des Simulationskerns
npm run test:server    # Tests des Node.js-Servers (Webversion)
npm run server   # Webversion lokal auf http://localhost:3000 (ADMIN_PASSWORD setzen für die Admin-Konsole)
npm run check    # Typprüfung (UI und DOM-freier Kern)
npm run build    # erzeugt dist/index.html
npm run verify   # alles zusammen: Typprüfung, Tests, Server-Tests, Build (vor jedem Commit)
npm run release  # verify + release/leyonet.html neu erzeugen und offline prüfen
npm run e2e      # Oberflächentests (Playwright) gegen den Build
npm run desktop:dev    # Desktop-Fenster (Tauri, braucht Rust)
npm run desktop:build  # Installer für das eigene System
```

Die Oberflächentests laden keine eigenen Browser herunter, sondern nutzen den installierten: unter Windows Edge, sonst Chrome (anderer Kanal mit `PW_CHANNEL`, z.B. `PW_CHANNEL=chromium` nach `npx playwright install chromium`, oder ein beliebiges Chromium mit `PW_EXECUTABLE=/pfad/zu/chromium`).

`npm run build` erzeugt **eine einzige Datei** `dist/index.html`, die alle Skripte und Stile enthält. `npm run release` kopiert sie nach `release/leyonet.html` (diese Datei ist eingecheckt, damit sie ohne Node.js nutzbar ist) und führt die Release-Prüfung aus (`scripts/release-checks.mjs`): Sie bricht ab, falls die Datei externe Ressourcen, Tracker oder Cookies enthält, die CSP fehlt, Sicherheits-Header fehlen oder eine Lizenz nicht freigegeben ist, und schreibt den Bericht nach `release/checks.json` (sichtbar in der Admin-Konsole). **Nach Änderungen am Code vor dem Push `npm run release` ausführen**, sonst bleibt die verteilte Datei auf dem alten Stand.

GitHub Actions ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) führt bei jedem Push `npm run release` (inklusive Server-Tests) und die Oberflächentests aus und schlägt fehl, wenn die eingecheckte `release/leyonet.html` nicht zum Code passt.

Schulserver: `docker compose up -d --build` (siehe [docs/installation.md](installation.md#b-schulserver-mit-docker)).

## Aufbau

```
src/
  core/   Simulationskern und Dateiformat: reines TypeScript, ohne DOM
  ui/     Svelte-Oberfläche (Editor, Palette, Inspektor)
  i18n/   Sprachdateien (de.json, en.json; ein Test prüft gleiche Schlüssel)
server/   Node.js-Server der Webversion (ohne Abhängigkeiten): Sessions, Klassen, Prüfungen, Rückmeldungen, Admin
docs/     Anleitung, Lehrpersonen, Funktionsprofile, Protokolle, Normen, Aufgaben, Befehlszeile, Datenschutz, Installation, Plesk, Desktop
scripts/  Release, Lizenzhinweise, Release-Prüfung (Datenschutz, Sicherheit, Lizenzen)
```

Regeln, die das Projekt technisch absichert:

- **Der Kern kennt keine Oberfläche.** `tsconfig.core.json` prüft `src/core` ohne DOM-Typen; ein Zugriff auf `document` oder `window` schlägt bei `npm run check` fehl. So bleibt der Kern ohne Browser testbar.
- **Unveränderliche Topologie.** Jede Operation in `core/model/topology.ts` liefert eine neue Topologie oder einen Fehlercode. Undo/Redo speichert daher einfach frühere Stände.
- **Fehlermeldungen kommen aus den Sprachdateien.** Der Kern liefert nur Code und Parameter (z.B. `noFreeInterface`), die Oberfläche übersetzt.
- **Deterministische MAC-Adressen** aus der Gerätenummer (`02:00:…`, lokal administriert).
