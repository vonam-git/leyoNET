---
titel: Zugriffslisten (ACL)
kurz: Benannte Listen mit permit und deny am Switch-Port oder VLAN-Interface: zustandslos, erste passende Regel gilt, am Ende implizit verweigert.
reihenfolge: 51
schicht: 3 und 4
hilfe: [acl]
demos: [firewallZones]
uebungen: [acl-guest, m145-ue07b]
verwandt: [paketfilter, switch, layer3-switch]
---
## ACL oder Firewall?

Eine **ACL** (Access Control List) filtert direkt am Switch-Port oder an einem VLAN-Interface. Sie ist **zustandslos**: Jedes Paket wird für sich geprüft, Antworten brauchen eine eigene Regel am Port, über den sie hereinkommen. Dafür ist sie schnell und genau dort, wo der Verkehr ins Netz kommt, z.B. am Gäste-Port.

| | ACL | Firewall |
|---|---|---|
| Wo | Switch-Port, VLAN-Interface | Router, Firewall, Endgerät |
| Zustand | zustandslos | meist zustandsbehaftet |
| Ende der Liste | implizit verweigert | Standardregel nach Wahl |

## Aufbau

```
Switch(config)# ip access-list extended GAESTE
Switch(config-ext-nacl)# permit udp any any eq 53
Switch(config-ext-nacl)# permit tcp 192.168.10.0 0.0.0.255 host 192.168.10.80 eq 80
Switch(config-ext-nacl)# deny ip any any
Switch(config)# interface port1
Switch(config-if)# ip access-group GAESTE in
```

Adressen stehen mit **Wildcard-Maske**: `0.0.0.255` heisst «die letzten 8 Bit egal», das Gegenteil der Subnetzmaske. `host` steht für eine einzelne Adresse.

ARP, Spanning Tree und IPv6 Neighbor Discovery gehen immer durch, sonst würde das Netz nicht funktionieren. In der Simulation zählt jede Regel ihre Treffer.
