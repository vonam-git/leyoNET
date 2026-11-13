# Doku-Prüfung

Hilfe, Doku, README, Website und Wiki sollen zum Programm passen. Ein Teil wird bei jedem `npm run release` automatisch geprüft, der Rest steht hier als Liste für jedes Release.

## Automatisch bei jedem Release

| Prüfung | Test |
|---|---|
| Alle relativen Verweise in README und `docs/` zeigen auf vorhandene Dateien | `src/docs.test.ts` |
| Jede Doku-Datei ist irgendwo verlinkt, jede Beispieldatei gehört zu einer Demo | `src/docs.test.ts` |
| Zahlen in Texten («über 70 Übungen», Zähler auf der Website) stimmen mit Katalog und Demos | `src/docs.test.ts` |
| Version in `package.json`, Desktop, Website, Release-Text und [versionen.md](versionen.md) gleich | `src/docs.test.ts` |
| Jedes Hilfethema hat Titel und Text auf Deutsch und Englisch, Verweise in der Hilfe stimmen | `src/docs.test.ts`, `src/i18n` |
| «Bewusst nicht simuliert» in [protokolle.md](protokolle.md) nennt nichts, was es inzwischen gibt | `src/docs.test.ts` |
| Tastenkürzel im Wiki gibt es in der App | `src/docs.test.ts` |
| Wiki: jedes Gerät, jede Demo und jedes Hilfethema hat eine Seite; Demos, Übungen, Normen, Protokollzeilen und Verweise stimmen; Seiten sind neu erzeugt | `src/wiki/wiki.test.ts` |
| Jede zitierte Norm steht in [normen.json](normen.json) | `scripts/normen.mjs` |
| Jede Demo und jede Musterlösung funktioniert in der Simulation | `src/ui/demos.test.ts`, `src/ui/catalog.test.ts` |
| Schaufenster-Datei entspricht dem Bauplan, alle Standorte erreichen sich | `src/ui/showcase.test.ts` |
| Website: Versionsangabe bei CSS/JS, Bilder hell und dunkel, nur erlaubte Links | `src/ui/website.test.ts` |

Schlägt eine Prüfung fehl, nennt sie Datei und Stelle.

## Von Hand bei jedem Release

- [ ] Neue Funktionen stehen in der F1-Hilfe, in der passenden Datei unter `docs/` und im [Wiki](wiki/README.md) (`npm run wiki`).
- [ ] [anleitung.md](anleitung.md) und [lehrpersonen.md](lehrpersonen.md) beschreiben Menüs und Abläufe noch so, wie sie in der App heissen.
- [ ] Bildschirmfotos auf der Website, im README (`docs/bilder/`) und im Schaufenster zeigen den aktuellen Stand (hell und dunkel).
- [ ] Release-Text `docs/releases/v<version>.md` und eine Zeile in [versionen.md](versionen.md).
- [ ] Funktionsprofile in [funktionsprofile.md](funktionsprofile.md) und auf der Wiki-Seite «Funktionsprofile wählen» entsprechen `src/ui/features.ts`.
