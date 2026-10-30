# Normen und automatische Prüfungen

leyoNET bildet Netzwerkprotokolle nach den offiziellen Standards nach (IETF-RFCs, IEEE 802, ITU-T, CableLabs). Damit Lernende nichts Veraltetes lernen, prüft das Projekt automatisch, ob die zitierten Normen noch gelten und ob alles funktioniert.

## Normenverzeichnis

[`docs/normen.json`](normen.json) listet jede Norm, die in Code, Texten oder Doku vorkommt:

- **RFCs**: Nummer, Titel und wofür leyoNET sie braucht. Optional `aktualisiertDurch` (bekannte «updated by»-RFCs) und `abgeloestAkzeptiert` (bewusst weiter zitierte, aber abgelöste RFCs).
- **Weitere Normen** (IEEE, ITU-T, CableLabs): Kennung, enthaltene Ergänzungen (`auch`, z.B. 802.3ab in 802.3), aktuelle Ausgabe (`aktuell`), Bemerkung und Datum der letzten Prüfung (`geprueft`).

## Was wann geprüft wird

| Prüfung | Wann | Was | Ergebnis |
|---|---|---|---|
| Normen im Verzeichnis | jedes `npm run release`, jeder Push (CI) | Jede zitierte Norm (RFC, IEEE 802.x, ITU-T G.9xx, DOCSIS) steht in `docs/normen.json` | Fehler bricht das Release ab |
| Prüfung aktuell | jedes `npm run release` | IEEE-, ITU-T- und CableLabs-Normen wurden in den letzten 12 Monaten geprüft | Hinweis in `release/checks.json` und in der Admin-Konsole |
| Funktionsprüfung | jeder Push und Pull Request, zusätzlich jeden Montag | Typen, Kern- und Server-Tests, Build, Release-Prüfung, Oberflächentests | Fehler im Lauf; wöchentlich zusätzlich ein Issue |
| RFC-Abgleich | jeden Montag (`.github/workflows/woechentlich.yml`) | Alle RFCs gegen den offiziellen [RFC-Index](https://www.rfc-editor.org/rfc-index.xml): abgelöst? neu aktualisiert? | Issue «Wöchentliche Prüfung: Handlungsbedarf» mit Bericht |

IEEE- und ITU-T-Normen sind nicht frei maschinenlesbar verfügbar. Für sie erinnert die Prüfung nach 12 Monaten an eine Kontrolle von Hand.

Die Prüfungen laufen nur in der Entwicklung und auf GitHub. Die ausgelieferte App nimmt dafür keine Verbindung ins Internet auf (siehe [datenschutz.md](datenschutz.md)).

## Wenn eine Meldung kommt

- **RFC abgelöst:** Den neuen RFC lesen. Bei Änderungen am Verhalten den Code anpassen (`src/core/`). Danach Texte, Doku und `docs/normen.json` auf die neue Nummer umstellen. Wird der alte RFC bewusst weiter zitiert (z.B. aus didaktischen Gründen), die neue Nummer unter `abgeloestAkzeptiert` eintragen.
- **Neue Aktualisierung:** Den aktualisierenden RFC prüfen. Ist nichts zu tun, die Nummer unter `aktualisiertDurch` ergänzen.
- **Prüfung fällig (IEEE/ITU-T/CableLabs):** Die aktuelle Ausgabe nachschlagen, `aktuell` und `bemerkung` nachführen und `geprueft` auf das heutige Datum setzen.
- **Neue Norm zitiert:** Eintrag in `docs/normen.json` ergänzen, sonst schlägt `npm run release` fehl.

## Befehle

```bash
node scripts/normen.mjs                    # offline: Verzeichnis vollständig? Prüfungen fällig?
node scripts/normen-online.mjs             # mit Internet: Abgleich mit dem RFC-Index, Bericht in normen-bericht.md
node scripts/normen-online.mjs --schreiben # bekannte «updated by»-RFCs als Ausgangsstand eintragen
```

Die wöchentliche Prüfung lässt sich auf GitHub unter **Actions → Wöchentliche Prüfung → Run workflow** jederzeit von Hand starten.
