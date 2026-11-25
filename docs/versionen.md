# Versionen

Was in welcher Version dazugekommen ist. Die Release-Texte stehen in [releases/](releases/).

| Etappe | Inhalt | Status |
|---|---|---|
| M1 | Topologie-Editor, Speichern/Laden als .json | ✅ |
| M2 | Simulationskern, ARP, IPv4 im gleichen Subnetz, Paketliste | ✅ |
| M3 | Switch-Lerntabelle, Subnetting, Router mit statischen Routen | ✅ |
| M4 | Aktionsmodus mit Desktop: Ping, Traceroute, DHCP; Schichtenansicht | ✅ |
| M5 | DNS, TCP/UDP, HTTP | ✅ |
| M6 | E-Mail, Aufgabenformat mit automatischer Prüfung | ✅ |
| M7 | Deployment (Variante A und B) | ✅ |
| + | Kabel umstecken/beschädigen, DHCP-Relay, Internet mit NAT, VLANs und Spanning Tree, schnelle Paketliste | ✅ |
| + | Aufgaben-Formular, Abgaben auswerten, Oberflächentests, CI | ✅ |
| + | Basis-/Pro-Modus, Router-on-a-Stick, Layer-3-Switch, Befehlszeile (FRRouting-Stil), SSH | ✅ |
| + | WLAN mit Access Point, Mesh über Stockwerke, TP/Glasfaser/Funk, Link-LEDs, Farbtags | ✅ |
| + | Dokumentationsmodus mit Bereichen, Stockwerke, Snapshots, Rack-Ansicht | ✅ |
| + | Desktop-Installer (Tauri), Plesk-Testumgebung, Lizenzhinweise im Build | ✅ |
| + | SFP-Module für Glasfaser, Racks auf der Karte, Bereiche kopieren, hell/dunkel, Englisch statt Französisch | ✅ |
| + | Webversion mit Node.js: Sessions mit Code, Klassen-Sessions, Rückmeldungen, Admin-Konsole (erlaubte Modi, Pro, Aufbewahrung) | ✅ |
| + | Aufgabenkatalog mit Schwierigkeit 1–5 Sterne | ✅ |
| v0.4 | Zwei Modi (Entwurf, Simulation), Menüleiste, Befehlssuche, Tastenkürzel, F1-Hilfe, Funktionsprofile 1–5 mit Funktionsdatei | ✅ |
| v0.4 | Shop mit Varianten und Richtpreisen, Kosten in CHF/EUR/USD, Server, Client-Gruppen | ✅ |
| v0.4 | Serielle Leitungen (HDLC/PPP), statisches NAT, CGNAT, OSPF, RIP, BGP, Modems (DOCSIS, GPON, LTE, ADSL, VDSL) | ✅ |
| v0.4 | WLAN-Roaming, Broadcast-Sturm ohne STP, VLAN-Farben, Adressanzeige privat/öffentlich, IP-Rechner | ✅ |
| v0.4 | Sniffer nach OSI mit echten Bytes, Hex-Ansicht, Filtersprache, pcapng-Export; Release-Prüfung Datenschutz/Sicherheit/Lizenzen | ✅ |
| v0.5 | Neuer Name **leyoNET** mit Logo, Lizenz AGPL-3.0, Herkunftsnachweis | ✅ |
| v0.6 | **IPv6**: IP-Version wählbar (IPv4, Dual Stack, IPv6), Neighbor Discovery, SLAAC, DHCPv6, ICMPv6, IPv6-Routing; **DS-Lite** mit CGNAT; Projektname, Mehrfachauswahl, automatisches Routing | ✅ |
| v0.7 | **Firewall** (zustandsbehafteter Paketfilter auf Routern und Endgeräten) und **Site-to-Site-VPN** mit IPsec (IKEv2, ESP); Demos und Übungen dazu | ✅ |
| v0.8 | **Prüfungen** mit Punkten und Note, Prüfungsgenerator; Übungen zum Modul 117 mit ausfüllbaren Arbeitsblättern (PDF); DHCP mit festen Zuweisungen | ✅ |
| v0.9 | **Prüfungsdatei ohne Lösungen** mit Schlüssel, Prüfungsmodus mit Code, eigene Variante je Platz, **Fehlersuche-Prüfungen**, Ziele aus einer Musterlösung, Fragen, Teilpunkte und Folgefehler, Dokumentation prüfen, Nachkorrektur, Berichte, Hinweis auf ähnliche Abgaben | ✅ |
| v0.10 | **Prüfungen in der Webversion**: Platz-Codes und Platzkarten, Start/Ende durch die Lehrperson, Speichern alle 20 s, automatische Abgabe, Nachteilsausgleich je Platz, automatische Auswertung, Abgaben als Datei, Namensliste nur im Browser | ✅ |
| v0.10.3 | MAC-Adressen ändern und doppelte MAC vorführen (Warnung, «MAC springt» am Switch, Demo), Adapter und MAC in der Schnellansicht, Bereiche in der Grösse verstellbar, Simulation zurücksetzen und Schritt zurück | ✅ |
| v1.0 | **Erste öffentliche Version** mit Website [leyonet.ch](https://leyonet.ch), Webversion [app.leyonet.ch](https://app.leyonet.ch), Installern für Windows, macOS und Linux; Testumgebung mit `LEYONET_CHANNEL=beta`, Schutz der Webversion vor Überlastung | ✅ |
| v1.1 | **IPv6 vollständig**: DNS vollwertig (A, AAAA, CNAME, MX, TXT, NS, PTR, Weiterleitung, `nslookup -type`), DNS-Server per RDNSS/DHCPv6, Web, Mail und SSH über IPv6, Firewall für IPv6, IPv6 auf Layer-3-Switches (SVIs), **OSPFv3** und **RIPng**; macOS-Installer ad hoc signiert | ✅ |
| v1.2 | **Rechenzentrum und Campus**: VLAN-Datenbank, Trunk mit erlaubten und nativem VLAN, Port-Channel (LACP), Loopbacks, VRF, VXLAN, Firewall als Gerät, ACLs an Ports und VLAN-Interfaces, DHCP-Pools auf Router und L3-Switch; Demo Leaf-Spine mit BGP und VXLAN; Reihe **M145** mit Arbeitsblättern, Katalogsuche mit Themen; Befehlszeile verschiebbar mit Einfügen ganzer Konfigurationen und Verlauf; Paketfilter «TCP-Verbindung folgen»; Prüfungscockpit live (Platz nur einmal offen, ansehen, freigeben), Session-Sperre mit PIN | ✅ |
| v1.3 | **Prüfung im Safe Exam Browser** (SEB-Datei mit Start-, Admin- und Beenden-Passwort, Prüfungsschlüssel bis Prüfungsende); Rack mit Etikett und Patchkabeln (Ansicht und Zeichenfläche); Router lehnt zwei Interfaces im selben Netz ab; Session ansehen ohne Aufgabenfenster, mit Hinweis auf neuen Stand; Musterlösungen der Arbeitsblätter für Lehrpersonen auf Anfrage | ✅ |
| v1.4 | **Klassen-Verbund**: Standorte der Lernenden (Platz und Gruppe) an einer Klassen-Infrastruktur mit Provider und Zentrale, Simulation des ganzen Verbunds, **Dashboard für den Beamer** mit Karte, Kacheln und ehrlichen Stufen, Nachrichten zwischen Standorten, Verbund-Übungen und Demo; **eigene Zugänge für Schulen und Lehrpersonen** (ohne Personendaten); Aufgaben und ganze Module je Instanz und Klasse ein- und ausblenden; Sicherheit und Datenschutz für Schulen (Codes raten gebremst, automatische Angriffe bei jedem Release, Live-Prüfung, security.txt, ISDS-Konzept, DSFA-Abklärung) | in v1.5 erschienen |
| v1.5 | **Schaufenster** «Rechenzentren-Verbund» (drei Standorte mit Racks, VLAN-Farben, IPsec und DNS; `?schaufenster` läuft von selbst in Schlaufe); **Wiki** auf leyonet.ch/wiki mit Crashkurs, Theorie, Normen, Bildern und Animationen; neues README; Doku-Prüfung bei jedem Release; Website hell/dunkel mit Kontaktformular (mailto); Patreon im Programm; enthält alles aus v1.4 | ✅ |
| **v1.5.1** | **Aufbau der Rahmen**: Ethernet mit Füllbytes und FCS (CRC-32), WLAN mit FCS, PPP mit FCS-16, pcapng mit Angabe der FCS; Kopf nach Norm (Bitraster wie in den RFCs, Byteband wie IEEE 802.3) mit den echten Werten und Verschachtelung in den Paketdetails; Wiki-Seite «Aufbau von Rahmen und Paketen», OSI-Modell mit Farben und Protokoll-Tags wie in der App | ✅ |
| **v1.6.0** | **Telefonie, QoS und PoE**: IP-Telefone mit Wähltastatur und IP-Kameras, Telefonanlage und SIP-Provider hinter NAT (SIP, SDP, RFC 3581), Sprache per RTP mit G.711 und Messung von Verlust, Laufzeit und Jitter; QoS mit DSCP, PCP, Prioritäts-Warteschlangen und Bandbreite je Port, Lastgenerator iperf; Power over Ethernet Typ 1–4 mit Budget und Klassen; Prüfungen mit KI (nur nach Admin-Anmeldung: Anleitung exportieren, Antwort importieren); Website und Wiki auch auf Englisch, Wiki mit Grundlagen nach Norm, Gerätesymbolen und Seiten zu M117/M129/M145; Schaufenster mit redundanten Links | ✅ |
| **v1.6.1** | **Sicherheit und Exporte**: Server gehärtet (Ratenbegrenzung hinter Socket und je IPv6-/64, Zugangsschlüssel ohne Passwort-Sperre, Prüfungsplatz nur nach Freigabe, keine Arbeit nach Abgabe), Lieferkette gepinnt, Node ab 22; Netzdokumentation als CSV und Konfiguration als Text; «Transitnetz» einheitlich, MAC-Tabelle als SAT, Klassencode wählbar und verlängerbar, Schaltfläche «Admin» | ✅ |
| **v1.7.0** | **Admin-Konsole und Prüfungen**: Admin-Konsole als eigene Seite `/admin` mit Übersicht, laufender Prüfung und Statistik der Sessions (ansehen, verlängern, löschen); Zwei-Faktor-Anmeldung mit Authenticator-App (TOTP, Wiederherstellungscodes, für alle verlangbar); Abgeben in Prüfungen schliesst den Platz sofort mit Zeitpunkt; Prüfungszeit Pflicht; Prüfungsblätter je Platz; Transitnetze im Bewertungsraster; Verbund klarer mit neuer Übung; M129 statisches und dynamisches Routing (RIP, OSPF); Router speichern die Konfiguration (startup-config) | ✅ |
| **v1.7.1** | **Admin-Konsole neu gestaltet**: Seitenleiste mit Symbolen und Gruppen, Seiten mit Erklärung, mehr Luft in Listen und Tabellen, Patchfeld der Prüfungsplätze in der Übersicht, «Zu erledigen», einheitliche Zustandsanzeigen | ✅ |
| **v1.7.2** | **Prüfungen**: versehentlich abgegebene Plätze wieder öffnen (reguläre Restzeit, Gerät lädt von selbst); Transitnetz-Adressen in der Vorlage M117 selbst ausrechnen; «Abgaben auswerten» im Stil der Admin-Konsole | ✅ |
| **v1.8.0** | **Prüfungen im Cockpit erstellen** (Fehlersuche je Platz, Aufbauen M117; nur Admins), Code zum Beenden mit begrenzten Versuchen, Safe Exam Browser ganz einstellbar (Hash, Beenden-Knopf, Optionen); Verbund-Übung **Fehlersuche** mit «Fehler behoben n/5» auf dem Dashboard | ✅ |
| **v1.9.0** | **Klasse im Unterricht**: Fortschritt von selbst, Hilfe anfordern, Erkennen (Bildschirm blinkt), Session bearbeiten oder ansehen mit Lernzielen, Klassencode gross für den Beamer, klarer Session-Dialog; **Konsole für Endgeräte** (Taste T, ifdown/ifup); Abkürzungen auf der Befehlszeile; M129 Statisches Routing übers Fenster (Befehlszeile freiwillig); NAT übersetzt ICMP-Fehlermeldungen zurück (RFC 5508) | ✅ |
| **v1.9.1** | **Schulungsmaterial**: alle Arbeitsblätter im leyoNET-Stil mit Netzplan, drei Einführungsvideos und alle Arbeitsblätter auf [leyonet.ch/schulung.html](https://leyonet.ch/schulung.html); **Klasse**: Einladung mit Direkt-Link, ein Gerät je Klasse, Platzwahl nur auf Wunsch, Sessions schliessen, Blinkdauer bei «Erkennen», Session-Liste in jeder Fensterbreite; Admin-Konsole «Website und Downloads» (anonym) | ✅ |
