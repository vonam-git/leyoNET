---
titel: VLAN und Trunks
kurz: Ein Switch, mehrere getrennte Netze: Access-Ports, Trunks mit 802.1Q-Tag, natives VLAN und Routing zwischen VLANs.
reihenfolge: 2
schicht: 2 (Sicherung)
hilfe: [vlan, trunk, routerOnAStick]
demos: [vlanStp, routerOnAStick]
uebungen: [vlans, vlan-colors, router-on-a-stick, m145-ue03, m145-ue04, m145-x2]
normen: [IEEE 802.1Q, IEEE 802.3]
protokolle: [Ethernet II, 802.1Q]
verwandt: [switch, layer3-switch, stp, netzwerkdesign, rahmen-und-pakete]
---
## Wozu

Ohne VLANs ist ein Switch ein einziges Netz: Jeder Broadcast erreicht alle, jedes Gerät sieht jedes. Ein **VLAN** (Virtual LAN) teilt den Switch in getrennte Netze, z.B. Verwaltung, Schulung und Gäste. Zwischen den VLANs geht nichts ohne Router; so lassen sich Abteilungen trennen und Regeln durchsetzen.

## Access-Port und Trunk

| Port-Art | wofür | Rahmen |
|---|---|---|
| **Access** | Endgerät, gehört zu genau einem VLAN | ohne Tag |
| **Trunk** | Verbindung zwischen Switches oder zum Router, trägt mehrere VLANs | mit 802.1Q-Tag (VLAN-Nummer) |

Der **802.1Q-Tag** sind 4 Byte nach den MAC-Adressen: EtherType `0x8100`, Priorität und die 12-Bit-**VLAN-ID** (1 bis 4094). Das **native VLAN** geht auf dem Trunk ohne Tag; beide Enden müssen dasselbe native VLAN haben. Mit «erlaubte VLANs» lässt ein Trunk nur bestimmte VLANs durch.

> Ein Switch leitet nur VLANs weiter, die er kennt. Auch ein Switch, der ein VLAN nur über Trunks weitergibt, braucht es in seiner VLAN-Datenbank.

![VLANs mit Trunk und Spanning Tree in der Simulation](vlanStp)

## Der 802.1Q-Tag

Auf dem Trunk fügt der Switch nach der Quell-MAC 4 Byte ein: TPID 0x8100 und darin die VLAN-Nummer. Am Access-Port nimmt er den Tag wieder weg. Weil sich der Rahmen ändert, rechnet der Switch die FCS neu.

{{format dot1q}}

{{format ethernet2q}}

## Routing zwischen VLANs

- **Router-on-a-Stick:** Ein Router hängt mit einem Trunk am Switch und hat je VLAN ein Subinterface (`eth0.10`), das als Gateway dient.
- **Layer-3-Switch:** Der Switch routet selbst über VLAN-Interfaces (SVIs), siehe [[layer3-switch]].

## Befehlszeile

```
Switch(config)# vlan 10
Switch(config-vlan)# name VERWALTUNG
Switch(config)# interface range port1-4
Switch(config-if)# switchport access vlan 10
Switch(config)# interface port24
Switch(config-if)# switchport mode trunk
Switch(config-if)# switchport trunk allowed vlan 10,20
Switch# show vlan brief
```

In leyoNET färben VLANs mit Farbe die Ports auf Fläche, Frontplatte und im Rack ein; ein Bereich mit VLAN dokumentiert das Netz dazu.
