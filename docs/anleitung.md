# Anleitung für Lernende

Diese Anleitung erklärt die Bedienung von leyoNET Schritt für Schritt. Im Programm selbst hilft **F1** jederzeit: Es öffnet die Hilfe zum gewählten Gerät oder Fenster. **?** zeigt alle Tastenkürzel.

## Der Bildschirm

```
┌ Datei  Bearbeiten  Einfügen  Ansicht  Simulation  Werkzeuge  Hilfe ─── [Entwurf | Simulation] ┐
├ Werkzeugleiste: Auswählen · Kabel · Bereich · Zoom · Profil · Kosten                           ┤
│ Shop     │                 Zeichenfläche                     │  Einstellungen des             │
│ (links)  │                                                   │  gewählten Elements (rechts)   │
├──────────┴───────────────────────────────────────────────────┴────────────────────────────────┤
│ Paketliste, Aufgaben, Zeitregler (unten, in der Simulation)                                   │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Menüleiste** oben, aufgebaut wie bei macOS. Jeder Eintrag zeigt sein Tastenkürzel.
- **Strg+K** (macOS: ⌘K) öffnet die Befehlssuche: Befehl oder Gerätenamen eintippen und Enter drücken.
- Oben rechts wechselt der Schalter zwischen **Entwurf** und **Simulation** (Taste **M** oder **F5**).

## Zwei Modi

| | Entwurf | Simulation |
|---|---|---|
| Geräte einfügen, löschen, verkabeln | ✔ | – |
| Konfigurieren (IP, Dienste, VLANs …) | ✔ | ✔ (wirkt sofort) |
| Dokumentieren (Bereiche, Farbtags, Beschreibungen) | ✔ | – |
| Geräte verschieben | ✔ | ✔ (WLAN-Geräte wechseln dabei den Access Point) |
| Ports ab- und einschalten | ✔ | ✔ |
| Ping, Browser, Mail, Befehlszeile | – | ✔ |
| Paketliste | – | ✔ |

Beim Start der Simulation wird automatisch ein Snapshot angelegt. Weitere entstehen alle fünf Minuten, wenn sich etwas geändert hat (**Datei → Snapshots**).

## Ein Netz bauen

1. **Gerät holen:** Im Shop links eine Kategorie anklicken (z.B. «Switches»). Es öffnet sich eine Liste mit Ausführungen, Anschlüssen und Richtpreis. Gerät auf die Fläche ziehen oder anklicken.
2. **Verkabeln:** Mit **K** (oder im Shop unter «Verbindungen») ein Kabel wählen und nacheinander zwei Geräte anklicken. Der Simulator nimmt den nächsten freien passenden Anschluss. Wer den Anschluss selbst bestimmen will, stellt oben in der Zeichenfläche «Anschluss: aus Liste wählen» ein; dann erscheint bei jedem Gerät eine Liste mit allen Anschlüssen (belegte zeigen, womit sie verbunden sind). Passt die Kabelart nicht, erscheint ein Hinweis.
3. **Konfigurieren:** Gerät anklicken; rechts erscheinen die Grundeinstellungen (Name, Adressen). Eingaben werden gespeichert, sobald man das Feld verlässt (Tab, Klick daneben oder Enter); ein «Übernehmen» braucht es nicht. Neben jedem Adressfeld öffnet der Rechner-Knopf den **IP-Rechner**.
4. **Erweitert:** **Erweitert …** (Taste **E**, bei Endgeräten auch Doppelklick) öffnet alle Einstellungen in einem eigenen Fenster mit Reitern: Adressen, Anschlüsse, Routing, NAT, DHCP, VLAN & STP, WLAN, E-Mail, Dienste. Mit ◀ ▶ (oder Bild↑/Bild↓) geht es direkt zum vorherigen bzw. nächsten Gerät.
   Die Fenster lassen sich am Kopf verschieben, und für mehrere Geräte können gleichzeitig Fenster offen sein.
5. **Testen:** **M** drücken, ein Endgerät doppelklicken und im Desktop `ping 192.168.1.20` eingeben.

Nützlich: **Strg+D** dupliziert die Auswahl, **F2** benennt um, **Entf** löscht, **Strg+Z** macht rückgängig.

## IPv6

Oben in der Werkzeugleiste stellst du die **IP-Version** ein: **IPv4**, **v4 + v6** (beides) oder **IPv6**. Mit IPv6 hat jedes Gerät ein eigenes IPv6-Feld:

- **Endgeräte:** «IPv6 automatisch» (der Router kündigt sein Präfix an, das Gerät bildet seine Adresse selbst = SLAAC, oder holt sie per DHCPv6) oder eine feste Adresse wie `2001:db8:1::10/64` mit Standardgateway.
- **Router:** je Anschluss eine Adresse mit `/64`, z.B. `2001:db8:1::1/64`. Mit «Adressen per DHCPv6 vergeben» verteilt der Router die Adressen selbst.
- **Layer-3-Switch:** Jedes VLAN-Interface (SVI) erhält eine IPv6-Adresse, der Switch kündigt das Präfix im VLAN an und routet zwischen den VLANs, wie mit IPv4. Auf der Befehlszeile: `interface vlan 10`, `ipv6 address 2001:db8:10::1/64`, `ipv6 nd managed-config-flag`, `ipv6 nd ra dns server 2001:db8:99::10`. Siehe Demo «IPv6 auf dem Layer-3-Switch».
- Statt ARP fragen die Geräte per **Neighbor Discovery** nach der MAC. `ping 2001:db8:2::20`, `tracert`, `ipconfig` und `netsh interface ipv6 show neighbors` funktionieren in der Eingabeaufforderung.
- **DNS über IPv6:** Beim Router-Anschluss trägst du einen IPv6-**DNS-Server** ein; automatisch konfigurierte Geräte erhalten ihn im Router Advertisement (RDNSS) oder per DHCPv6. Geräte mit fester Adresse haben ein eigenes Feld «IPv6-DNS-Server». Im DNS-Server ordnen **AAAA**-Einträge einem Namen eine IPv6-Adresse zu.
- **Web, Mail und SSH über IPv6:** `ping www.schule.example`, der Browser, E-Mail und `ssh admin@router.schule.example` funktionieren auch über IPv6. Im Browser steht eine Adresse in eckigen Klammern: `http://[2001:db8:b::80]/`. Siehe Demo «Web, Mail und SSH über IPv6».
- **DS-Lite:** Die Internet-Box tunnelt IPv4 durch das IPv6-Netz des Providers; der Provider übersetzt per CGNAT. Siehe Demo «DS-Lite».

## DNS

Ein Rechner wird unter **Erweitert → Dienste** zum DNS-Server. In seine Zone kommen Einträge wie `web.schule.example A 192.168.0.3`, Aliase (`www CNAME web`), Mailserver (`MX` mit Vorrang), Text (`TXT`), Nameserver (`NS`) und Rückwärtseinträge (`PTR`: als Name einfach die Adresse eintragen). Mit **Weiterleitung an** fragt der Server für alle anderen Namen einen weiteren DNS-Server, z.B. den des Providers.

Testen in der Eingabeaufforderung:

- `nslookup intranet.schule.example`: Adresse, mit allen Aliasen der Kette
- `nslookup -type=MX schule.example` (auch `AAAA`, `CNAME`, `TXT`, `NS`, `PTR`)
- `nslookup 192.168.0.3`: Rückwärtsauflösung (PTR)
- `nslookup www.provider.example 203.0.113.53`: einen bestimmten Server fragen

Antworten aus der eigenen Zone sind «autorisierend», weitergeleitete «nicht autorisierend». Siehe Demo «DNS mit Weiterleitung».

## Firewall

Im Fenster **Erweitert … → Firewall** (Router, Internet-Box und Endgeräte, ab Profil 3) schaltest du die Firewall ein. Sicher ist der Start mit **«alles verbieten, was nicht erlaubt ist»**. Dann trägst du Regeln ein:

- **Aktion** (Erlauben/Verbieten), **Protokoll** (TCP, UDP, ICMP, alle) und bei TCP/UDP den **Zielport**, z.B. 80 für Webseiten.
- **Quelle** und **Ziel**: `any`, eine Adresse (`203.0.113.80`) oder ein Netz (`192.168.1.0/24`). Beim Router kannst du zusätzlich den **Eingang** wählen.
- Die Regeln gelten **von oben nach unten**, die erste passende entscheidet. Mit ↑ ↓ änderst du die Reihenfolge.

**Zustandsbehaftet** (Standard): Antworten auf erlaubte Verbindungen kommen ohne eigene Regel zurück. Ein Router filtert, was er weiterleitet; ein Endgerät filtert, was bei ihm ankommt. In der Simulation zeigt der Reiter, wie oft jede Regel gegriffen hat, und die Konsole des Geräts meldet blockierte Pakete. Siehe Demo «Firewall mit DMZ».

**Firewall als Gerät** (Shop → Router, ab Profil 3): Statt den Router filtern zu lassen, setzt du eine eigene Firewall zwischen Provider und Netz. Ihre Anschlüsse heissen nach Zonen: **eth0 (WAN)**, **eth1 (LAN)**, **eth2 (DMZ)**, ab eth3 **OPT**. Ab Werk ist sie zustandsbehaftet, lässt alles von innen nach aussen durch und sperrt neue Verbindungen vom WAN. Mit denselben Regeln schützt sie auch sich selbst: Vom WAN antwortet sie nicht auf Ping oder SSH. Für einen Webserver in der DMZ ergänzt du z.B. «Erlauben TCP 80 zum Webserver, Eingang WAN» zuoberst. Sonst kann sie alles, was ein Router kann (NAT, Portweiterleitung, VPN, Routing). Demo «Firewall-Gerät und ACL».

Auf der **Befehlszeile** von Router und Firewall:

```
firewall default deny
firewall rule 1 allow tcp any 192.168.2.80 port 80 in wan
firewall rule deny icmp any any in dmz
no firewall rule 3
no firewall stateful        ! zustandslos
show firewall               ! Regeln mit Trefferzählern
```

## VXLAN: VLAN über ein geroutetes Netz

Ab Profil 4 (oder einzeln «VXLAN») kann ein Layer-3-Switch VTEP sein (Reiter **Switching**, Abschnitt VXLAN): Ein VLAN wird einer VNI zugeordnet, als Quelle dient meist ein Loopback, die anderen VTEPs stehen in einer festen Liste. Rahmen des VLANs reisen dann in UDP (Port 4789) per IP zu den anderen Switches; Geräte an verschiedenen Standorten liegen im selben Subnetz. Die Paketliste zeigt aussen IP von Loopback zu Loopback, innen den Ethernet-Rahmen. EVPN (BGP als Steuerung) ist nicht nachgebildet. Befehlszeile: `vn-segment`, `interface nve1`, `source-interface`, `member vni … peer-ip …`, `show nve peers`. Demo «VXLAN zwischen zwei Standorten».

## VRF: mehrere Routingtabellen

Ab Profil 4 (oder einzeln «VRF») haben Router, Firewall und Layer-3-Switch den Reiter **VRF**. Eine VRF ist eine eigene Routingtabelle: Anschlüsse darin sehen nur die Netze und statischen Routen dieser VRF. So laufen zwei Kunden mit denselben Adressen (z.B. beide 10.0.0.0/24) über denselben Router, ohne sich zu sehen. Pakete bleiben in der VRF des Anschlusses, über den sie hereinkommen. OSPF, RIP, BGP, NAT und das automatische Routing gelten nur für die globale Tabelle. Befehlszeile: `vrf definition KUNDE-A`, am Interface `vrf forwarding KUNDE-A`, `ip route vrf …`, `show ip route vrf KUNDE-A`, `ping vrf KUNDE-A …`.

## Mehrere Kabel und Port-Channel

Zwischen zwei Geräten dürfen mehrere Kabel liegen; die Fläche zeichnet sie nebeneinander. Zwischen Switches ist das ohne weitere Einstellung eine **Schleife**: Spanning Tree blockiert ein Kabel, ohne STP zeigt die Simulation den Broadcast-Sturm.

Ab Profil 4 (oder einzeln «Port-Channel») bündelt man die Kabel zu einem **Port-Channel** (Link Aggregation): Im Reiter **Switching** auf beiden Switches dieselbe Channel-Nummer bei den Ports eintragen, Modus «LACP aktiv» (oder auf einer Seite passiv). Die Switches handeln das Bündel mit LACP aus, Spanning Tree sieht es als einen Port. Fällt ein Kabel aus, läuft alles über die übrigen. Ports mit abweichender VLAN-/Trunk-Einstellung, zu einem anderen Switch oder ohne Partner bleiben ausgestellt. Befehlszeile: `channel-group 1 mode active`, `interface port-channel 1`, `show etherchannel summary`. Demo «Port-Channel mit LACP».

## Zugriffslisten (ACL) auf Switches

Ab Profil 4 (oder einzeln «Zugriffslisten (ACL)») hat jeder Switch im Fenster **Erweitert … → ACL** benannte Zugriffslisten. Eine Liste wirkt erst, wenn sie einem Port zugewiesen ist; dann prüft der Switch jedes IP-Paket, das an diesem Port **hereinkommt**. Die erste passende Regel gilt, am Ende steht ein **implizites Verweigern**. Anders als die Firewall ist die ACL **zustandslos**: Antworten prüft der Switch am Port, über den sie hereinkommen. ARP, Spanning Tree und IPv6 Neighbor Discovery gehen immer durch. In der Simulation zählt der Reiter die Treffer, die Konsole des Switches meldet verworfene Pakete.

```
ip access-list extended GAESTE
 permit udp any any eq 53
 permit tcp 192.168.10.0 0.0.0.255 host 192.168.10.80 eq 80
 deny ip any any
!
interface port1
 ip access-group GAESTE in
```

Adressen: `any`, `host 192.168.10.80`, Netz mit Wildcard-Maske (`192.168.10.0 0.0.0.255`) oder Präfix (`192.168.10.0/24`). `no 20` löscht im ACL-Modus den Eintrag 20, `show access-lists` zeigt Listen, Ports und Treffer.

## VPN zwischen zwei Standorten

Ein **Site-to-Site-VPN** (ab Profil 4) verbindet zwei private Netze über das Internet. Im Fenster **Erweitert … → VPN** beider Router trägst du je einen Tunnel ein:

| Feld | Router Zürich | Router Bern |
|---|---|---|
| Gegenstelle | 203.0.113.1 (WAN Bern) | 198.51.100.1 (WAN Zürich) |
| Eigenes Netz | 192.168.1.0/24 | 192.168.2.0/24 |
| Entferntes Netz | 192.168.2.0/24 | 192.168.1.0/24 |
| Schlüssel | gleich | gleich |

Das erste Paket ins entfernte Netz startet den Aufbau (IKEv2), danach laufen die Pakete verschlüsselt in **ESP**. Der Reiter zeigt in der Simulation den Status (aufgebaut, gescheitert mit Grund) und die Paketzähler. Mit dem Filter `vpn` siehst du nur Tunnelverkehr. Häufige Fehler: Netze nicht gespiegelt («Netze passen nicht»), unterschiedlicher Schlüssel («falscher Schlüssel»), falsche Gegenstelle («keine Antwort»). Siehe Demo «VPN: Zwei Standorte verbinden».

## Router: automatisches Routing

Für den Einstieg setzt du beim Router rechts das Häkchen **Automatisches Routing**. Er findet dann alle Netze im Plan selbst, ohne dass du Routen eintragen musst. Jeder Router auf dem Weg braucht das Häkchen. Ohne Häkchen wählst du **statisch** (Routen von Hand) oder **dynamisch** (OSPF, RIP, BGP; mit IPv6 OSPFv3 und RIPng), im Fenster **Erweitert … → Routing**. OSPFv3 und RIPng nehmen Anschlüsse auf statt Netze; siehe Demos «OSPFv3 für IPv6» und «RIPng für IPv6».

## Mehrere Geräte auf einmal

- **Auswahlrahmen:** Im Entwurf auf freier Fläche ziehen. Gewählt werden alle Geräte, deren Mitte im Rahmen liegt, und Bereiche, die ganz darin liegen. Mit **Umschalt** kommt der Rahmen zur Auswahl dazu (auch innerhalb eines Bereichs), **Umschalt+Klick** nimmt einzelne Geräte dazu oder heraus, **Strg+A** wählt alles.
- **Verschieben:** Ein gewähltes Gerät ziehen bewegt die ganze Auswahl, ebenso die Pfeiltasten. Ein Bereich verschiebt nur sich selbst; Geräte darin kommen nur mit, wenn sie mitgewählt sind.
- **Kopieren:** **Strg+C** und **Strg+V** (oder **Strg+D**) kopieren die Auswahl samt den Kabeln zwischen den Geräten. Ein einzelnes Gerät kommt ohne Adressen; eine Gruppe behält ihre Einstellungen, z.B. für eine zweite Filiale.
- **Ansicht verschieben:** mit der rechten oder mittleren Maustaste ziehen, oder Leertaste halten und ziehen.

## Geräte im Überblick

| Gerät | Wofür |
|---|---|
| PC, Notebook | Endgeräte. Das Notebook hat zusätzlich WLAN. |
| Client-Gruppe | 10, 25 oder 50 gleiche PCs als ein Symbol; alle holen ihre Adresse per DHCP. |
| Server | DHCP, DNS, Web und Mail. Im Shop auch fertig eingerichtet erhältlich. |
| Switch, L3-Switch | Verbinden Geräte im selben Netz; der L3-Switch routet zusätzlich zwischen VLANs. |
| Router | Verbindet Netze. Ports wahlweise Ethernet oder seriell. NAT, OSPF, RIP, BGP; für IPv6 OSPFv3 und RIPng. |
| Firewall | Routet wie ein Router, filtert ab Werk: Zonen WAN, LAN, DMZ, OPT; von innen nach aussen offen, vom WAN gesperrt. |
| Access Point | WLAN-Funkzelle. |
| Modem | Kabel, Glasfaser, Mobilfunk, ADSL oder VDSL zum Provider. |
| Internet-Box (CPE) | Wie zu Hause: Modem, Router mit NAT, DHCP-Server und vier LAN-Buchsen in einem Gerät. Ab Werk LAN 192.168.1.1/24; einzutragen sind nur WAN-Adresse und Gateway des Providers. |
| Internet | Provider mit öffentlichen Adressen und Webseiten. |

**Adapter und MAC-Adresse:** Rechts über der IP-Konfiguration steht, welcher Adapter eingestellt wird (z.B. eth0, per Kabel oder WLAN mit wem verbunden) und seine MAC-Adresse. Ab Profil 3 lässt sich die MAC ändern («ändern», leer bzw. «Ab Werk» = ursprüngliche Adresse), auch für jeden Anschluss im Fenster unter «Anschlüsse». Haben zwei Geräte im selben Netz dieselbe MAC, zeigen beide ein rotes **!**, und der Switch meldet in der Simulation «MAC springt von Port … zu Port …» (Demo «Doppelte MAC-Adresse»).

**Eingaben speichern:** Formulare speichern von selbst, sobald du ein Feld verlässt: mit Tab, Enter oder einem Klick daneben, auch direkt auf ein anderes Gerät. Trägst du nur eine IP-Adresse ohne Maske ein, setzt leyoNET die übliche Maske der Adressklasse ein (10.x.x.x → /8, 172.16–31.x.x → /16, 192.168.x.x → /24). Prüfe sie und ändere sie, wenn dein Netz anders aufgeteilt ist.

## Adressen sichtbar machen

**A** (oder **Ansicht → IP-Adressen anzeigen**) blendet an jedem Gerät die Adresse ein, farbig nach Art:

- **blau: privat** (10/8, 172.16/12, 192.168/16), nur im eigenen Netz
- **orange: CGNAT** (100.64/10), vom Provider vergeben
- **grün, fett: öffentlich**, im Internet erreichbar

**Textfeld:** Shop → Bereiche → **Textfeld** setzt ein Feld mit Titel und freiem Text auf die Fläche, z.B. für Infos, einen Auftrag oder eine Legende. Leerzeile = neuer Absatz, «- » = Liste, «1. » = nummerierte Liste, `**fett**`, `` `Befehl` ``; IP-Adressen werden hervorgehoben. Die Ecke unten rechts zieht das Feld grösser.

Ein Bereich «Öffentliches Netz» (mit Weltkugel) markiert ein ganzes Netz als öffentlich, z.B. eine DMZ. Bei Routern steht der Anschluss dezent davor, z.B. `eth0: 192.168.1.1/24`.

**Doppelte Adressen:** Haben zwei Geräte im selben Netz dieselbe IP-Adresse, erscheint am Gerät ein rotes **!**, und das Formular warnt. Hinter verschiedenen Routern (zwei Heimnetze mit 192.168.1.1) ist dieselbe private Adresse erlaubt.

## VLANs mit Farben

Unter **Werkzeuge → VLANs** bekommt jedes VLAN eine Nummer, einen Namen und eine Farbe. Alle Switch-Ports dieses VLANs erscheinen dann in dieser Farbe, auf der Fläche wie in der Porttabelle. So sieht man auf einen Blick, welcher Port wohin gehört.

## Schleifen und Spanning Tree

Zwei Kabel zwischen denselben Switches oder ein Ring bilden eine Schleife. Ohne Spanning Tree (STP) kreisen Broadcasts darin endlos. Der Simulator erlaubt das absichtlich, zeigt beim Verkabeln eine Warnung und in der Simulation ein rotes Banner «Broadcast-Sturm». Abhilfe: STP auf den Switches einschalten, ein Kabel entfernen oder einen Port abschalten.

## In der Simulation

- **Desktops:** Doppelklick auf ein Endgerät öffnet seinen Desktop (Eingabeaufforderung, Browser, Mail). Mehrere können offen sein. Mit **—** minimieren; «Offene Desktops» in der Simulationsleiste holt sie zurück. Inhalte bleiben erhalten. Desktops lassen sich am Kopf verschieben und unten rechts in der Grösse ändern.
- **Maus darüber:** Geräte zeigen Adressen, MAC, Gateway und die Grösse ihrer Tabellen; Kabel ihren Zustand und den Verkehr; Pakete Protokoll, Quelle, Ziel und OSI-Schichten.
- **Leuchten an den Kabeln:** grün verbunden, orange Daten unterwegs, rot keine Verbindung.
- **Einzelschritt mit OSI-Schichten:** Angehalten (Leertaste) zeigt jedes Paket seine Schichten ineinander, jede in ihrer Farbe. **N** packt ein ankommendes Paket beim Empfänger Schicht für Schicht aus: Ein Switch bis Schicht 2 (MAC), ein Router bis Schicht 3 (IP), das Ziel ganz. Ein Rechner, für den das Paket nicht bestimmt ist, verwirft es auf Schicht 2.
- **Schritt zurück und Zurücksetzen:** **Umschalt+N** (bzw. «⏮ Schritt zurück») geht ein Ereignis zurück, auch durch das Auspacken; leyoNET wiederholt dafür den Ablauf vom Start an exakt. «↺ Zurücksetzen» startet die Simulation neu bei Zeit 0, mit leeren Tabellen und leerer Paketliste; das Netz bleibt.
- **Bereiche anpassen:** Die Ränder der linken Leiste, der Eigenschaften, der Paketliste und der Paketdetails lassen sich mit der Maus ziehen (oder mit dem Griff im Fokus per Pfeiltasten). Doppelklick auf den Rand stellt die Standardgrösse wieder her; die Grössen bleiben gespeichert.

## Pakete mitschneiden

In der Simulation zeigt die Paketliste unten jeden Rahmen. Ein Klick öffnet die Details:

- **OSI-Ansicht** von Schicht 7 (Anwendung) bis 1 (Leitung). Leere Schichten sind grau.
- **Hex-Ansicht** (ab Profil 4): die echten Bytes. Ein Klick auf ein Feld markiert seine Bytes.
- **Filter** wie in Wireshark: `dhcp`, `ip.addr == 10.0.0.1`, `tcp.port == 80`, `host PC1`, verknüpft mit `and`, `or`, `not`. Die Knöpfe unter dem Filter setzen häufige Ausdrücke.
- **Jedes Paket nur einmal** (eingeschaltet): Ein Switch gibt einen Rahmen unverändert weiter; er erscheint dann nur beim ersten Kabel. Ausschalten, um den Weg über jeden Switch zu sehen. Nach einem Router erscheint das Paket wieder, weil der Router einen neuen Rahmen baut (neue MAC-Adressen).
- **pcap**: speichert den Mitschnitt für Wireshark.

## Aufgaben

**Werkzeuge → Aufgaben-Katalog** enthält Übungen von ★ (Einstieg) bis ★★★★★ (Studium). Eine Aufgabe lädt ein Startnetz und zeigt unten ihre Lernziele. **Prüfen** sagt, was schon erfüllt ist und was fehlt. Viele Ziele haben einen Tipp. Sind alle Ziele erfüllt, steht die Übung im Katalog mit **✓ erledigt** (nur in diesem Browser; «Fortschritt zurücksetzen» löscht die Markierungen).

Lange Aufträge öffnen sich zusätzlich in einem **grossen Fenster**: Absätze, Listen, Befehle und IP-Adressen sind dort hervorgehoben, die Ziele stehen als Karten darunter. Das Fenster ist nicht modal, du arbeitest daneben im Netz weiter; am Kopf verschieben, unten rechts vergrössern, Esc schliesst. **⤢ Gross anzeigen** im Aufgabenbereich öffnet es jederzeit.

## Demo-Netze

**Datei → Demo-Netze …** (oder ▶ in der Werkzeugleiste) bietet zu jedem Protokoll ein fertig eingerichtetes Netz. «Vorführen» startet die Simulation und zeigt das Protokoll in Aktion, «Öffnen» lädt es zum Erkunden. Bei vielen Demos erklärt **Schritt für Schritt** ein Avatar den Testfall; mit «Weiter» geht es zum nächsten Schritt. Den Avatar stellst du dir selbst ein (Klick auf ihn oder **Hilfe → Avatar anpassen …**). Mit **—** (oder Esc) blendest du die Sprechblase aus; der Avatar bleibt klein in der Ecke, ein Klick holt sie zurück. Eine beendete Führung blendet **Hilfe → Lehrperson einblenden** wieder ein.

## Mehr Platz

Die Bereiche links (Shop), rechts (Eigenschaften) und unten (Paketliste) fahren mit den Griffen ‹ › am Rand der Zeichenfläche oder unter **Ansicht** ein und aus.

## Kosten

Jedes Gerät hat einen Richtpreis. Der Betrag in der Werkzeugleiste und **Ansicht → Kosten** zeigen das Total in CHF, EUR oder USD. Manche Aufgaben verlangen ein Budget. Ob der Shop Preise zeigt, hängt vom Profil ab (ab Profil 3); **Ansicht → Preise im Shop** schaltet sie ein oder aus.

## Tastenkürzel

| Taste | Wirkung |
|---|---|
| M, F5 | Entwurf ↔ Simulation |
| Leertaste / N | Simulation anhalten / einen Schritt weiter |
| V, K, B | Auswählen, Kabel, Bereich |
| Strg+D, F2, Entf | Duplizieren, Umbenennen, Löschen |
| Strg+A, Umschalt+Klick | Alles auswählen, zur Auswahl hinzufügen |
| E | Erweiterte Einstellungen des gewählten Geräts (darin Bild↑/Bild↓: anderes Gerät) |
| Strg+Z, Strg+Y | Rückgängig, Wiederholen |
| Strg+C, Strg+V | Kopieren, Einfügen |
| Strg+S, Strg+O, Alt+N | Speichern, Öffnen, Neues Netz |
| A, P, R, C | Adressen, Schnittstellen an Kabeln, Rack-Ansicht, auf Auswahl zentrieren |
| I | IP-Rechner |
| + / − / 0 | Vergrössern, Verkleinern, alles zeigen |
| F1, ?, Strg+K | Hilfe, Tastenkürzel, Befehlssuche |
| Esc | Abbrechen |

Kürzel wirken nicht, solange ein Eingabefeld aktiv ist.

## Speichern

- **Lokale Datei / Desktop:** Der Stand wird im Browser bzw. App-Ordner automatisch gesichert. **Datei → Speichern** (Strg+S) fragt nach dem Projektnamen (z.B. «Übung 02») und legt eine `.json`-Datei mit diesem Namen ab (Umlaute ausgeschrieben, z.B. `Uebung 02.json`). Den Namen kann man auch vorher oben links in der Werkzeugleiste eintragen. Die Datei kann man abgeben oder weitergeben.
- **Webversion:** Oben rechts steht der Session-Code. Wer ihn kennt, öffnet die Arbeit auch auf einem anderen Gerät. Eine neue Session beginnt immer leer.

Gespeichert wird nur die Netzwerk-Konfiguration: keine Namen, keine Konten (siehe [datenschutz.md](datenschutz.md)).
