# Arbeitsblätter zu den Modulen 117 und 129

Ausfüllbare PDFs zu den Übungen der Reiter **«M117»** und **«M129»** im Aufgaben-Katalog (Werkzeuge » Aufgaben-Katalog). Die Lernenden füllen die Felder direkt im PDF aus (Browser, Adobe Acrobat Reader oder eine andere PDF-App) und geben das PDF zusammen mit ihren Projektdateien ab. Die Musterlösungen (`_mL.pdf`) stehen bewusst nicht im öffentlichen Repo; `npm run arbeitsblaetter` erzeugt sie lokal.

| Arbeitsblatt | Übungen im Katalog | Sterne |
|---|---|---|
| [M06C_M117_UE03_Router01](M06C_M117_UE03_Router01.pdf) | UE03 Router01, Aufträge 1–4: ein Netz mit zwei Switches, zwei Netze an denselben Switches, Maske /25, Maske /26 | ★ ★ ★★ ★★ |
| [M06D_M117_UE04_Router02](M06D_M117_UE04_Router02.pdf) | UE04 Router02, Aufträge 1–2: ein Router zwischen zwei Standorten, zwei Router mit Transfernetz | ★★ ★★★ |
| [M06E_M117_UE05_Router03](M06E_M117_UE05_Router03.pdf) | UE05 Router03: drei Standorte mit Standleitungen | ★★★★ |
| [M07A_M117_UE01_Netzwerkdienste](M07A_M117_UE01_Netzwerkdienste.pdf) | UE01 Netzwerkdienste: Firmennetz Watch SA mit DHCP | ★★★ |
| [M07B_M117_UE02_Netzwerkdienste](M07B_M117_UE02_Netzwerkdienste.pdf) | UE02 Netzwerkdienste: Webserver, DNS und feste Zuweisungen | ★★★★ |
| [M07C_M117_UE03_Netzwerkdienste](M07C_M117_UE03_Netzwerkdienste.pdf) | UE03 Netzwerkdienste: Firmennetz Holzer AG (Prüfungsvorbereitung, 75 Punkte mit Note) | ★★★★★ |

**Modul 129:**

| Arbeitsblatt | Übungen im Katalog | Sterne |
|---|---|---|
| [M129_UE01_Subnetting](M129_UE01_Subnetting.pdf) | UE01 Subnetting, Aufträge 1–3: vier gleich grosse Subnetze, VLSM, Fehlersuche | ★★ ★★★★ ★★★ |
| [M129_UE02_Routing](M129_UE02_Routing.pdf) | UE02 Routing, Aufträge 1–3: drei Router statisch, Internet mit NAT, Verwaltungsnetz und SSH | ★★★ ★★★★ ★★★ |
| [M129_UE03_Protokollanalyse](M129_UE03_Protokollanalyse.pdf) | UE03 Protokollanalyse, Aufträge 1–3: ICMP und TTL, DHCP, ARP/DNS/HTTP | ★★ ★★★ ★★★★ |

Die praktische Prüfung (LB3) entsteht in leyoNET selbst: **Werkzeuge » Prüfung erstellen …**, siehe [pruefungen.md](../pruefungen.md).

## Abgabe an die Lehrperson

Jedes Blatt endet mit dem Abschnitt «Abgabe»:

1. Das ausgefüllte PDF speichern als `<Blatt>_Nachname.pdf`.
2. Jedes Projekt in leyoNET mit Strg+S speichern; Projektname z.B. `M06C_UE03_A1_Nachname`.
3. Beides über den Weg abgeben, den die Lehrperson vorgibt (z.B. Abgabeordner in Teams oder Moodle).

Die Lehrperson wertet die Projektdateien mit **«Abgaben auswerten …»** im Aufgabenbereich aus (alle Dateien auf einmal, Ergebnis als CSV). leyoNET sammelt selbst keine Abgaben und speichert keine Namen.

## Adressen

Wo die ursprünglichen Unterlagen Adressen aus dem öffentlichen Internet verwendeten (z.B. 11.128.13.57/24, 1.0.0.0/30, 33.14.12.0/25, 20.40.90.0/24, in M129 8.8.8.8, 1.1.1.1, 178.16.12.80/28), stehen hier private Netze nach RFC 1918 bzw. Dokumentationsadressen nach RFC 5737; Domains enden auf `.example` (RFC 2606). Präfixlängen und damit die Rechenaufgaben sind gleich geblieben.

## Ändern und neu erzeugen

Der Inhalt steht in [`scripts/arbeitsblaetter/inhalt.mjs`](../../scripts/arbeitsblaetter/inhalt.mjs) (Modul 129: [`inhaltM129.mjs`](../../scripts/arbeitsblaetter/inhaltM129.mjs)), das Layout in [`erzeugen.mjs`](../../scripts/arbeitsblaetter/erzeugen.mjs). Nach einer Änderung:

```bash
npm run arbeitsblaetter
```

Ein Test (`src/ui/worksheets.test.ts`) prüft, dass die PDFs zum Inhalt passen, die Musterlösungen sich erzeugen lassen und dass Titel, Sterne und Anzahl Lernziele mit dem Katalog übereinstimmen. Schrift ist Helvetica (Standardschrift jedes PDF-Programms, nicht eingebettet).
