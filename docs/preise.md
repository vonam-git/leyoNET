# Richtpreise und ihre Prüfung

leyoNET zeigt für Geräte, Kabel und Module Richtpreise in CHF (umgerechnet auch in EUR und USD). Sie stehen in [`src/core/model/costs.ts`](../src/core/model/costs.ts) und dienen Budget-Aufgaben und Offerten im Unterricht. Es sind Richtwerte für die Schweiz, keine Angebote.

## Preisverzeichnis

[`docs/preise.json`](preise.json) nennt für jeden Preis einen plausiblen Bereich (`min`, `max`) und eine kurze Beschreibung, dazu das Datum der letzten Marktprüfung (`geprueft`) und das Intervall (6 Monate).

## Was automatisch geprüft wird

| Prüfung | Wann | Was |
|---|---|---|
| Bereiche | jedes `npm test`, jeder Push (CI) | Jeder Preis steht im Verzeichnis und liegt in seinem Bereich; keine verwaisten Einträge; grössere Ausführungen kosten mehr (24 Ports > 16 > 8, Rack-Server > Tower, LX > SX) – `src/core/model/prices.test.ts` |
| Prüfdatum | jedes `npm run release` | Hinweis in der Release-Prüfung und in der Admin-Konsole, wenn die letzte Marktprüfung älter als 6 Monate ist |
| Erinnerung | jeden Montag (`.github/workflows/woechentlich.yml`) | Ist die Prüfung fällig, steht das im Issue «Wöchentliche Prüfung: Handlungsbedarf» |

Marktpreise lassen sich nicht zuverlässig automatisch abfragen (Händlerseiten ändern sich, Preise schwanken, Nutzungsbedingungen). Der Vergleich mit dem Markt bleibt deshalb Handarbeit; die Automatik sorgt dafür, dass er nicht vergessen geht und keine unplausiblen Werte durchrutschen.

## Preise nachführen

1. Aktuelle Preise bei zwei, drei Schweizer Händlern für die beschriebene Geräteklasse ansehen.
2. Werte in `src/core/model/costs.ts` anpassen; falls nötig die Bereiche in `docs/preise.json`.
3. `geprueft` auf das heutige Datum setzen, `npm run release`, committen.

```bash
node scripts/preise.mjs   # Wann zuletzt geprüft? Endet mit Fehler, wenn fällig.
```

Ob der Shop Preise zeigt, hängt vom Funktionsprofil ab (`tool.prices`, ab Profil 3); **Ansicht → Preise im Shop** schaltet sie um.
