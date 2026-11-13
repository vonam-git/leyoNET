---
titel: Funktionsprofile wählen
kurz: Fünf Profile vom ersten Lehrjahr bis zum Studium, eigene Auswahl und eine Funktionsdatei für die ganze Klasse.
reihenfolge: 4
hilfe: [features]
verwandt: [uebungen-einsetzen, webversion]
---
## Warum Profile

Wer zum ersten Mal ein Netz baut, braucht keine BGP-Einstellungen. leyoNET blendet darum jede Funktion aus, die das gewählte Profil nicht braucht: im Shop, in Menüs, Formularen und in der Hilfe. Daten im Projekt bleiben erhalten.

| Profil | Stufe | Neu dazu (Auswahl) |
|---|---|---|
| 1 Einstieg | 1. Lehrjahr | PC, Notebook, Switch, Router, Server, automatisches Routing, DHCP, Paketliste |
| 2 Grundlagen | 1.–2. Lehrjahr | WLAN, Internet, Internet-Box, Glasfaser, DNS, Web, statische Routen, Kosten |
| 3 Fortgeschritten | 2.–3. Lehrjahr | VLANs, STP, NAT, Firewall, Modems, E-Mail, Befehlszeile, Racks |
| 4 Profi | 3.–4. Lehrjahr, Modul 145 | Layer-3-Switch, ACL, Port-Channel, IPv6, VPN, OSPF, RIP, serielle Leitungen, Hex-Ansicht |
| 5 Studium | Fachhochschule | BGP, VRF, VXLAN |

Die vollständige Zuordnung steht in der Dokumentation [Funktionsprofile](https://github.com/vonam-git/leyoNET/blob/main/docs/funktionsprofile.md).

## Profil einstellen und verteilen

- Der **Profil-Chip** in der Werkzeugleiste (oder Werkzeuge → Funktionsumfang) wählt das Profil. Einzelne Funktionen lassen sich dazu- oder wegschalten («Eigene Auswahl»).
- **Datei speichern** legt die Auswahl als kleine Datei ab. Die Lernenden laden sie mit Werkzeuge → Funktionsauswahl laden. Mit «sperren» können sie sie nicht mehr ändern.
- In der **Webversion** setzt die Admin-Konsole Grenzen für alle (höchstes Profil, erlaubte Funktionen).
- Öffnet jemand ein Projekt oder eine Übung, die mehr braucht, schaltet leyoNET die nötigen Funktionen ein und meldet es.
