---
titel: Switch
kurz: Verbindet Geräte im selben Netz, lernt MAC-Adressen, trennt Netze mit VLANs und verhindert Schleifen mit Spanning Tree.
reihenfolge: 4
schicht: 2 (Sicherung)
hilfe: [device.switch]
uebungen: [switch-lan, port-shutdown, vlans, stp-loop]
verwandt: [ethernet-mac, vlan, stp, lacp, layer3-switch]
---
## Wozu

Ein Switch verbindet Geräte zu einem lokalen Netz. Er arbeitet auf Schicht 2: Er liest die Ziel-MAC jedes Rahmens und schickt ihn nur an den Port, hinter dem das Ziel liegt ([[ethernet-mac|MAC-Tabelle]]). Mit IP-Adressen hat er nichts zu tun; ein einfacher Switch braucht keine Konfiguration.

## Was ein Switch in leyoNET kann

| Funktion | Seite |
|---|---|
| MAC-Tabelle, Flooding, Broadcast | [[ethernet-mac]] |
| VLANs: Access-Ports und Trunks mit 802.1Q-Tag | [[vlan]] |
| Spanning Tree gegen Schleifen | [[stp]] |
| Port-Channel mit LACP | [[lacp]] |
| Zugriffslisten an Ports | [[acl]] |
| Ports abschalten (`shutdown`), Farben und Beschreibungen | [[dokumentieren]] |
| Befehlszeile und SSH | [[ssh]] |

Je nach Ausführung hat ein Switch 8, 16, 24 oder mehr RJ45-Ports und SFP-Einschübe für [[medien|Glasfaser]]. Die Frontansicht rechts zeigt die Ports wie auf dem Gerät; ein Klick auf einen belegten und dann auf einen freien Port steckt das Kabel um.

## Befehlszeile

```
Switch# show mac address-table
Switch# configure terminal
Switch(config)# interface port3
Switch(config-if)# switchport access vlan 20
Switch(config-if)# description Drucker Büro
```
