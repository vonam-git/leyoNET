# Wiki-Quellen

Aus diesen Dateien entsteht das Wiki unter [leyonet.ch/wiki/](https://leyonet.ch/wiki/). Erzeugen: `npm run wiki` (schreibt `website/httpdocs/wiki/`). `npm run release` prüft, dass die Seiten aktuell sind und alle Verweise stimmen.

## Aufbau

Je Bereich ein Ordner: `lehrpersonen/`, `grundlagen/`, `geraete/`, `protokolle/`. Jede Seite ist eine Markdown-Datei; der Dateiname ist die Adresse (`arp.md` → `wiki/arp.html`).

```
---
titel: ARP
kurz: Wie ein Gerät zur IP-Adresse die MAC-Adresse findet.
reihenfolge: 10
schicht: 2 (Sicherung) und 3 (Vermittlung)
hilfe: [ip]
demos: [arpPing]
uebungen: [sniff-arp]
normen: [RFC 826]
protokolle: [ARP, Gratuitous ARP, Proxy-ARP]
verwandt: [ethernet-mac, ipv4]
---
## Wozu
…
```

| Kopfzeile | Bedeutung | geprüft gegen |
|---|---|---|
| `titel`, `kurz` | Titel und ein Satz für Übersicht und Suche | Pflicht |
| `reihenfolge` | Sortierung im Bereich | – |
| `schicht` | OSI-Schicht für die Kurzinfo | – |
| `hilfe` | Hilfethemen der App (F1), werden als «So geht es in leyoNET» eingefügt | `src/ui/help.ts` |
| `demos` | Demo-Netze mit Link «Live ansehen» (Schaufenster) | `src/ui/demos.ts` |
| `uebungen` | Übungen aus dem Katalog mit Arbeitsblatt | `src/ui/catalog.ts` |
| `normen` | Normen mit Link (RFC) und aktueller Ausgabe | `docs/normen.json` |
| `protokolle` | Zeilen aus der Übersicht in `docs/protokolle.md` (Vereinfachungen), getrennt mit `;` | `docs/protokolle.md` |
| `verwandt` | Weiterlesen | andere Wiki-Seiten |

Im Text: `## Überschrift`, `### Unterüberschrift`, Aufzählungen, Tabellen, Codeblöcke, `> Hinweis`, **fett**, *kursiv*, `Code`, `[Text](https://…)` und `[[seite]]` bzw. `[[seite|Text]]` für Wiki-Verweise. Eine Zeile `{{katalog}}` fügt die ganze Übungsliste ein, `{{demos}}` alle Demo-Netze. Für Rahmen und Pakete (gleiche Darstellung wie die Paketdetails der App, aus `src/ui/aufbau.ts`, Werte aus echten Rahmen der Demos in `src/ui/frameExamples.ts`):

- `{{osi}}`: die sieben Schichten mit Farben und den Protokollen als Tags
- `{{aufbau http}}`: Verschachtelung eines Beispielrahmens, mit «Nächste Hülle einpacken»
- `{{paket http}}`: der Rahmen wie in den Paketdetails, mit Hex-Ansicht und Markierung
- `{{format ipv4}}`: Kopf nach Norm als Bild und Feldtabelle (Formate in `src/core/wire/formats.ts`: `ethernet2`, `ethernet2q`, `dot1q`, `ieee8023`, `wlan`, `ppp`, `arp`, `ipv4`, `ipv6`, `icmp`, `tcp`, `udp`)

Beispiele: `http`, `vlan`, `arp`, `stp`, `ppp`, `wlan`, `ipv6`. Liefert eine Demo den Rahmen nicht mehr, schlägt der Bau fehl.

## Regeln

- Jede Seite hat mindestens zwei Abschnitte (`##`).
- Jedes Gerät, jede Demo und jedes Hilfethema kommt auf mindestens einer Seite vor (der Test meldet Lücken).
- Beispieladressen aus RFC 1918, RFC 5737 und 2001:db8::/32, Namen auf `.example`.
- Jede zitierte Norm steht in `docs/normen.json`.
- Eigene Texte, nichts kopieren (siehe [herkunft.md](../herkunft.md)).
