# leyoNET – Hinweise für die Arbeit am Projekt

leyoNET ist ein Netzwerk-Simulator für den Informatik-Unterricht (1. Lehrjahr bis Fachhochschule) von Mark und Mikael von Allmen. Er läuft als einzelne HTML-Datei im Browser, als Webversion mit Node-Server (Plesk) und als Desktop-App (Tauri). Überblick: [README.md](README.md), Doku in [docs/](docs/).

## Arbeitsweise

- Mark spricht Deutsch (Schweiz). Antworten auf Deutsch, Schweizer Schreibweise («ss» statt «ß», «…»-Anführungszeichen).
- Gearbeitet wird auf `develop`. `main` ist die stabile Version (Pull Request von `develop`). Plesk liefert `develop` aus.
- Vor jedem Commit: `npm run release` (Typprüfung, Tests, Server-Tests, Build, `release/leyonet.html`, Release-Prüfung). Die Datei `release/leyonet.html` ist eingecheckt und muss zum Code passen, sonst schlägt die CI fehl.
- Oberflächentests: `PW_EXECUTABLE=<chromium> npx playwright test` nach `npm run build`.
- Nach Abschluss committen und pushen.

## Architektur

- `src/core/`: Simulationskern ohne DOM, unveränderliche Topologie (`model/topology.ts` liefert `Result<T>` mit Fehlercodes), diskrete Ereignis-Simulation (`sim/`), Protokolle nach Standard, Kodierung in echte Bytes (`wire/`), CLI (`cli/`), Aufgabenprüfung (`tasks/`).
- `src/ui/`: Svelte 5 (Runes). Zustand in `state/*.svelte.ts`, Befehle, Menüs und Tastenkürzel in `commands.svelte.ts`, Funktionsprofile in `features.ts`, Shop in `shop.ts`, Übungskatalog in `catalog.ts` (jede Übung braucht eine Musterlösung in `catalog.test.ts`).
- `src/i18n/de.json`, `en.json`: Alle Texte. Ein Test prüft, dass jeder im Code verwendete Schlüssel existiert. Neue Funktionen brauchen de und en, plus Hilfe (`help.<thema>.title/body`) und gegebenenfalls Funktionsschalter (`features.ts`, `feature.<id>` und `.hint`).
- `server/`: Node-Server ohne Abhängigkeiten (Sessions, Klassen, Rückmeldungen, Admin). In Plesk: Anwendungsstamm `<repo>/server`, Startdatei `start.cjs`, Dokumentstamm `<repo>/server/public`. Siehe `docs/plesk.md`.
- Die Quell-HTML heisst `dev.html` (nicht `index.html`), damit ein Webserver sie nie als Startseite ausliefert. Dev-Server: `http://localhost:5173/dev.html`.

## Feste Regeln

- **Datenschutz (revDSG/DSGVO):** Keine Personendaten speichern, keine Konten, kein Tracking, keine Cookies, keine externen Ressourcen (CSP `connect-src 'none'` in der Datei). Sessions enthalten nur technische Konfiguration. Siehe `docs/datenschutz.md`.
- **Herkunft:** Keinen fremden Code, keine Icons, Schriften oder Texte kopieren. Neue Pakete nur mit freigegebener Lizenz (`scripts/third-party-licenses.mjs`). Beispieldomains nur `.example` (RFC 2606), Adressen aus RFC 1918/5737. Siehe `docs/herkunft.md`.
- **Lizenz:** AGPL-3.0-or-later. Name und Logo (`branding/`) sind ausgenommen (`NOTICE.md`). Der Link zum Quellcode unter «Über» muss bleiben (AGPL §13, prüft die Release-Prüfung).
- **Kompatibilität:** Technische Kennungen bleiben unverändert, damit alte Dateien und Einstellungen funktionieren: Projektformat `netzwerk-simulator`, Speicherschlüssel `netzwerk-simulator.*`, Funktionsdatei `netzwerk-simulator-features`.
- **Doku nachführen:** Neue Funktionen gehören in die passende Datei unter `docs/` und in die F1-Hilfe.
