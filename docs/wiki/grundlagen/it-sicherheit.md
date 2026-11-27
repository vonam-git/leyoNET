---
titel: IT-Sicherheit: Angriffe und Abwehr
kurz: Bedrohungen nach STRIDE ordnen und typische Angriffe in der Simulation erkennen und abwehren: ARP-Spoofing, falscher DHCP-Server, SYN-Flood, Portscan, Passwörter raten; Nachweis mit Syslog.
reihenfolge: 9.5
schicht: 2 bis 7
hilfe: [attacks, l2security, syslog]
normen: [RFC 826, RFC 4987, RFC 7513, RFC 5424, RFC 5426]
uebungen: [sec-arp-spoof, sec-syn-flood, sec-ssh, sec-dhcp, sec-syslog, sec-build, verbund-angriff]
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

## Fünf Angriffe in leyoNET

Alles läuft nur in der Simulation, es entsteht nie ein echtes Paket.

| Angriff | STRIDE | Was passiert | Abwehr |
|---|---|---|---|
| ARP-Spoofing | S | ARP kennt keine Echtheit (RFC 826): Der Angreifer behauptet, das Gateway zu sein | ARP-Schutz auf den Endgeräten |
| Falscher DHCP-Server | T | Mit erfundenen MAC-Adressen braucht er alle Adressen des echten Servers auf («DHCP Starvation») und verteilt dann selbst Adressen mit sich als Gateway und DNS | DHCP-Snooping (RFC 7513) und Port-Sicherheit am Switch |
| SYN-Flood | D | Viele halb offene Verbindungen füllen die Warteschlange (RFC 4987) | SYN-Cookies, Firewall-Regel |
| Portscan | I | offene Ports werden gesucht | nur nötige Dienste veröffentlichen |
| SSH-Passwort raten | E | häufige Passwörter werden probiert | starkes Passwort, SSH von aussen sperren |

## Nachweis statt Abstreiten: Syslog

Gegen **Repudiation** hilft ein Protokoll an einem Ort, den der Angreifer nicht erreicht. Mit **Syslog** (Format nach RFC 5424, Versand über UDP 514 nach RFC 5426) melden Router, Switches, Firewalls und der Wächter der Rechner ihre Ereignisse an einen Syslog-Server: SSH-Anmeldungen, Verstösse gegen Port-Sicherheit und DHCP-Snooping, ARP-Spoofing, SYN-Flood und Portscans. Jede Meldung hat einen Schweregrad (0 Notfall bis 7 Debug), den Gerätenamen und eine Kennung wie `SSHFAIL`. Die Demo «Syslog: Wer war das?» zeigt es.

## Selbst ausprobieren

Den **Angreifer** gibt es im Shop unter Endgeräte (Funktion «Sicherheits-Szenarien», ab Profil 3). Verkabeln, Adresse geben, rechts den Angriff wählen. Auf PC, Notebook und Server zeigt **Desktop → Sicherheit** den Wächter und die Schutzschalter. Offene Ports findet der Netzscanner ([[ports-dienste]]).

In der Webversion startet die Lehrperson einen Angriff auf die ganze Klasse ([[webversion]]).

> In echten Netzen sind solche Angriffe verboten. Wer ein Netz prüft, braucht den ausdrücklichen Auftrag der Betreiberin oder des Betreibers.
