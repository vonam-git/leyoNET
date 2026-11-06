# Befehlszeile (CLI) für Router und Switches

Router, Firewalls, Switches und Layer-3-Switches lassen sich zusätzlich zu den Formularen über eine Befehlszeile konfigurieren. Die Syntax ist an **FRRouting (vtysh)** angelehnt, mit den aus dem Unterricht bekannten Modi. Es ist eine eigene, vereinfachte Nachbildung (siehe [Lizenzen](#lizenzen)).

## Zugang

| Weg | So geht's |
|---|---|
| Konsole | Doppelklick auf Router oder Switch, oder im Eigenschaftenfenster **Befehlszeile (CLI)**. Geht im Entwurf und in der Simulation. |
| SSH vom PC | In der Simulation den Desktop eines PCs öffnen, `ssh benutzer@adresse` eingeben, Passwort eintippen. Am Router vorher `username …` und `ip ssh` einrichten. Die Verbindung läuft über simuliertes TCP (Port 22) und erscheint verschlüsselt in der Paketliste. |

Änderungen in der Befehlszeile wirken sofort, auch während die Simulation läuft. Im Entwurf lassen sie sich mit **Rückgängig** zurücknehmen.

## Bedienung

- **Abkürzen**: Jedes Wort darf abgekürzt werden, solange es eindeutig ist: `conf t`, `int eth0`, `sh ip ro`.
- **`?`** zeigt die möglichen nächsten Wörter mit Erklärung (`show ?`, `ip ?`).
- **Tab** ergänzt das angefangene Wort.
- **↑ / ↓** blättern durch frühere Befehle.
- **`do`** führt im Konfigurationsmodus Anzeigebefehle aus: `do show ip route`.
- Fehler zeigt ein `^` unter der Stelle, an der die Eingabe nicht passt.

## Modi

```
Router>                    enable
Router#                    configure terminal
Router(config)#            interface eth0          vlan 10          line vty               router ospf | rip | bgp 65001 | ospf6 | ripng
Router(config-if)#         Router(config-vlan)#    Router(config-line)#   Router(config-router)#
Switch(config)#            ip access-list extended NAME
Switch(config-ext-nacl)#
```

`exit` geht eine Stufe zurück, `end` direkt zu `Router#`, `disable` zurück zu `Router>`.

**Direkt wechseln (wie bei Cisco):** Ein Befehl des globalen Konfigurationsmodus funktioniert auch in jedem Untermodus. Er verlässt den Untermodus und wird global ausgeführt. So geht man von `vlan 10` direkt zu `vlan 20`, von `interface port1` direkt zu `interface port2` oder aus dem VLAN-Modus zu `interface port3`, ohne `exit`.

## Interface-Namen

| Gerät | Namen |
|---|---|
| Firewall | wie Router; in Firewall-Regeln nach `in` auch die Zone: `wan`, `lan`, `dmz`, `opt1` … |
| Router | `eth0`, `eth1` …; Subinterfaces `eth0.10` (VLAN 10); serielle Ports `serial0`, `serial1` … (auch `se0`, `s0/0/0`) |
| Switch | `port1`, `port2` … (wie auf der Frontplatte); auch `gi0/1` oder `fa0/1`. SFP-Einschübe für Glasfaser zählen separat: `sfp1`, `sfp2` … (auch `te0/1`) |
| Layer-3-Switch | wie Switch, dazu `vlan10` bzw. `interface vlan 10` |
| Switch (Verwaltung) | `interface vlan 1` (oder ein anderes VLAN) als Verwaltungsadresse |

## Befehle

### Anzeigen (`Router>` und `Router#`)

| Befehl | Zeigt |
|---|---|
| `show running-config` | aktuelle Konfiguration (nur `#`) |
| `show ipv6 route`, `show ipv6 neighbors`, `show ipv6 interface brief` | IPv6-Routingtabelle (O = OSPFv3, R = RIPng, A = automatisch), Nachbartabelle aus Neighbor Discovery, IPv6-Adressen je Anschluss (Router und Layer-3-Switch) |
| `show ipv6 ospf6 neighbor`, `show ipv6 ospf6 database`, `show ipv6 ripng` | OSPFv3-Nachbarn und -Datenbank, per RIPng gelernte Routen (Simulation) |
| `show ip route` | Routingtabelle (C = direkt verbunden, S = statisch, O = OSPF, R = RIP, B = BGP, A = automatisches Routing; in Klammern Distanz/Metrik) |
| `show ip protocols` | aktive Routingprotokolle mit Netzen |
| `show ip ospf neighbor` | OSPF-Nachbarn und ihr Zustand (Simulation) |
| `show ip ospf database` | OSPF-Datenbank (LSAs, Simulation) |
| `show ip rip` | per RIP gelernte Routen (Simulation) |
| `show ip bgp summary` | BGP-Nachbarn mit Zustand und Anzahl Präfixe (Simulation) |
| `show ip bgp` | BGP-Tabelle mit AS-Pfad (Simulation) |
| `show ip interface brief` | Interfaces mit Adresse und Status |
| `show interface brief` | Kurzübersicht der Anschlüsse |
| `show ip arp` | ARP-Tabelle (nur in der Simulation) |
| `show ip nat translations` | NAT-Tabelle (Router) |
| `show mac address-table` | MAC-Tabelle (Switch, Simulation) |
| `show vlan brief` | Angelegte VLANs mit ihren Ports; Ports in fehlenden VLANs als inaktiv (Switch) |
| `show interfaces trunk` | Trunks mit Native VLAN, erlaubten und aktiven VLANs (Switch) |
| `show interfaces status` | Ports mit Status und VLAN (Switch) |
| `show spanning-tree` | Root-Bridge, Port-Rollen und -Zustände (Switch) |
| `show access-lists` (auch `show ip access-lists`) | Zugriffslisten mit Ports und Treffern (Switch) |
| `show firewall` | Firewall-Regeln mit Trefferzählern, blockierte Pakete, gemerkte Verbindungen (Router, Firewall) |
| `ping 192.168.1.10` | vier Echo-Anfragen vom Gerät aus (Simulation) |
| `write memory` | «speichert» (die Konfiguration gilt ohnehin sofort) |

### Allgemein (`(config)#`)

```
hostname R1
username admin password Geheim123
enable secret Klasse!
banner motd Nur fuer berechtigte Personen
ip ssh                         ! SSH-Server ein (oder: line vty → transport input ssh)
line vty 0 4
 transport input ssh
 login local
```

### Router

```
interface eth0
 ip address 192.168.1.1/24     ! oder: ip address 192.168.1.1 255.255.255.0
 description Uplink LAN
 ip helper-address 10.0.0.5    ! DHCP-Relay
 ip nat outside                ! NAT auf diesem Interface
 shutdown / no shutdown
!
interface eth0.10              ! Router-on-a-Stick: Subinterface für VLAN 10
 encapsulation dot1q 10
 ip address 192.168.10.1/24
!
no interface eth0.10           ! Subinterface löschen
ip route 0.0.0.0/0 10.0.0.2
ip route 172.16.0.0 255.255.0.0 eth1
no ip route 172.16.0.0/16
```

### Serielle Leitungen (Router)

```
interface serial0              ! Port vorher im Formular auf «seriell» stellen
 encapsulation ppp             ! oder: encapsulation hdlc (Standard)
 ip address 10.0.0.1/30
```

Beide Enden brauchen dieselbe Kapselung, sonst bleibt die Leitung down.

### Statisches NAT (Router)

```
ip nat inside source static 192.168.0.80 203.0.113.5   ! 1:1-NAT; reines SNAT/DNAT nur im Formular (Reiter NAT)
no ip nat inside source static 192.168.0.80 203.0.113.5
```

### OSPF

```
router ospf
 router-id 1.1.1.1             ! optional, sonst höchste Adresse
 network 10.0.0.0/24 area 0    ! oder: network 10.0.0.0 0.0.0.255 area 0
 passive-interface eth0        ! keine Hellos ins LAN
 default-information originate
 redistribute static           ! connected | static | rip | bgp
!
interface eth1
 ip ospf cost 50               ! Standard 10
!
no router ospf
```

### RIP

```
router rip
 version 2
 network 192.168.1.0/24
 passive-interface eth0
 redistribute connected
```

### OSPFv3 und RIPng (IPv6, Schreibweise wie FRRouting)

```
interface eth0
 ipv6 address 2001:db8:1::1/64
 ipv6 nd managed-config-flag   ! Adressen per DHCPv6 statt SLAAC
 ipv6 nd ra dns server 2001:db8:1::53
 ipv6 ospf6 area 0             ! OSPFv3 auf diesem Anschluss
!
router ospf6
 ospf6 router-id 1.1.1.1       ! empfohlen, wenn der Router keine IPv4-Adresse hat
 interface eth1 area 0         ! gleichwertig zu «ipv6 ospf6 area 0» am Interface
 passive-interface eth0
 redistribute connected        ! connected | static | ripng
!
router ripng
 network eth1                  ! Anschluss statt Netz
 default-information originate
 redistribute ospf6
!
ipv6 route 2001:db8:99::/48 2001:db8:1::fe
```

### BGP

```
router bgp 65001
 bgp router-id 1.1.1.1
 neighbor 172.16.12.2 remote-as 65002
 network 10.1.0.0/16           ! oder: network 10.1.0.0 mask 255.255.0.0
 redistribute ospf
!
no router bgp
```

Ein Netz wird nur angekündigt, wenn es in der Routingtabelle steht.

### Switch

```
spanning-tree                  ! Spanning Tree ein
spanning-tree priority 4096
vlan 10                        ! VLAN anlegen
 name Verwaltung
vlan 20                        ! direkt zum nächsten VLAN
 name Schulung
vlan 30,40-42                  ! mehrere auf einmal anlegen
no vlan 42                     ! löschen (Ports darin werden inaktiv)
!
interface range port1-4
 switchport mode access
 switchport access vlan 10
!
interface port24
 switchport mode trunk
 switchport trunk allowed vlan 10,20      ! nur diese VLANs (add/remove/except/all/none)
 switchport trunk native vlan 99          ! VLAN ohne Tag
 description Uplink zum Router
!
interface vlan 1               ! Verwaltungsadresse (Layer-2-Switch)
 ip address 192.168.1.2/24
ip default-gateway 192.168.1.1
```

**VLAN-Datenbank:** Ein Switch leitet nur angelegte VLANs weiter, auch auf Trunks. `switchport access vlan 30` legt ein fehlendes VLAN an und meldet `% Access VLAN does not exist. Creating vlan 30` (wie Cisco). Ein Switch, der ein VLAN nur über Trunks weitergibt, braucht `vlan 30` trotzdem. Dateien vor Version 1.2 haben keine Liste; dort gelten alle verwendeten VLANs als angelegt, bis man das erste VLAN anlegt oder löscht.

### Zugriffslisten (Switch und Layer-3-Switch)

Benannte, erweiterte ACLs wie bei Cisco. Zustandslos, erste passende Regel gilt, am Ende implizit `deny ip any any`; ARP, STP und IPv6 Neighbor Discovery gehen immer durch.

```
ip access-list extended GAESTE        ! anlegen oder bearbeiten
 remark nur DNS und Web               ! Kommentar (wird nicht gespeichert)
 permit udp any any eq 53
 permit tcp 192.168.10.0 0.0.0.255 host 192.168.10.80 eq 80
 deny icmp any any
 no 30                                ! Eintrag 30 löschen (Nummern 10, 20, 30 …)
!
no ip access-list extended GAESTE     ! Liste löschen (Zuweisungen bleiben, lassen dann alles durch)
interface port1
 ip access-group GAESTE in            ! eingehend am Port prüfen
 no ip access-group GAESTE in
```

| Teil | Möglichkeiten |
|---|---|
| Protokoll | `ip` (alle), `tcp`, `udp`, `icmp` |
| Adresse | `any`, `host 192.168.10.80`, `192.168.10.0 0.0.0.255` (Wildcard-Maske), `192.168.10.0/24`, IPv6 `host 2001:db8::1` oder `2001:db8:1::/64` |
| Port | `eq 80` (nur TCP/UDP, Zielport) |

### Firewall (Router und Firewall)

```
firewall default deny                          ! Standardregel: allow | deny
firewall rule allow tcp any 192.168.2.80 port 80 in eth0
firewall rule 1 deny icmp any any in dmz       ! Zahl zuerst: an dieser Stelle einfügen
no firewall rule 2                             ! Regel 2 löschen
no firewall stateful                           ! zustandslos (firewall stateful = wieder zustandsbehaftet)
no firewall                                    ! Firewall entfernen, alles geht durch
```

Eine Regel: `allow|deny <ip|tcp|udp|icmp> <Quelle> <Ziel> [port <n>] [in <Anschluss>]`. Adressen wie bei den ACLs (`any`, `host A`, Wildcard, Präfix oder einfach eine Adresse). Ohne `in` gilt die Regel für alle Eingänge. Auf einem Router ohne Firewall legt der erste Befehl eine an (Standard `allow`). Die Firewall als Gerät hat ab Werk `default deny` und je eine Regel «von innen erlaubt» für LAN, DMZ und OPT.

### Layer-3-Switch

```
ip routing                     ! Routing zwischen VLANs (Standard: ein)
interface vlan 10
 ip address 10.10.0.1/24
 ip helper-address 10.99.0.10
!
no interface vlan 10
ip route 0.0.0.0/0 10.99.0.254
interface vlan 20
 ipv6 address 2001:db8:20::1/64  ! IPv6 auf dem VLAN-Interface (Router Advertisements ins VLAN)
 ipv6 ospf6 area 0
```

## Lizenzen

Die Befehlszeile ist eine eigene Implementierung für den Unterricht. Sie enthält keinen Code und keine Texte aus FRRouting oder anderen Netzwerkbetriebssystemen. FRRouting ist ein eigenständiges Projekt unter GPL-2.0 und steht in keiner Verbindung zu diesem Simulator; der Name wird nur genannt, um die Herkunft der Syntax zu beschreiben. Befehlsnamen wie `show ip route` sind in der Netzwerktechnik allgemein üblich.
