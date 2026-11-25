---
titel: IT-Sicherheit: Angriffe und Abwehr
kurz: Bedrohungen nach STRIDE ordnen und typische Angriffe in der Simulation erkennen und abwehren: ARP-Spoofing, SYN-Flood, Portscan, Passwörter raten.
reihenfolge: 9.5
schicht: 2 bis 7
hilfe: [attacks]
normen: [RFC 826, RFC 4987]
uebungen: [sec-arp-spoof, sec-syn-flood, sec-ssh, sec-build, verbund-angriff]
verwandt: [arp, tcp, ports-dienste, paketfilter, ssh]
---
## Bedrohungen ordnen: STRIDE

| Buchstabe | Bedrohung | Frage |
|---|---|---|
| S | Spoofing | Gibt sich jemand als jemand anderes aus? |
| T | Tampering | Verändert jemand Daten? |
| R | Repudiation | Kann jemand abstreiten, etwas getan zu haben? |
| I | Information Disclosure | Sieht jemand, was er nicht sehen darf? |
| D | Denial of Service | Legt jemand einen Dienst lahm? |
| E | Elevation of Privilege | Verschafft sich jemand mehr Rechte? |

## Vier Angriffe in leyoNET

Alles läuft nur in der Simulation, es entsteht nie ein echtes Paket.

| Angriff | STRIDE | Was passiert | Abwehr |
|---|---|---|---|
| ARP-Spoofing | S | ARP kennt keine Echtheit (RFC 826): Der Angreifer behauptet, das Gateway zu sein | ARP-Schutz auf den Endgeräten |
| SYN-Flood | D | Viele halb offene Verbindungen füllen die Warteschlange (RFC 4987) | SYN-Cookies, Firewall-Regel |
| Portscan | I | offene Ports werden gesucht | nur nötige Dienste veröffentlichen |
| SSH-Passwort raten | E | häufige Passwörter werden probiert | starkes Passwort, SSH von aussen sperren |

## Selbst ausprobieren

Den **Angreifer** gibt es im Shop unter Endgeräte (Funktion «Sicherheits-Szenarien», ab Profil 3). Verkabeln, Adresse geben, rechts den Angriff wählen. Auf PC, Notebook und Server zeigt **Desktop → Sicherheit** den Wächter und die Schutzschalter. Offene Ports findet der Netzscanner ([[ports-dienste]]).

In der Webversion startet die Lehrperson einen Angriff auf die ganze Klasse ([[webversion]]).

> In echten Netzen sind solche Angriffe verboten. Wer ein Netz prüft, braucht den ausdrücklichen Auftrag der Betreiberin oder des Betreibers.
