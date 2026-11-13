---
titel: Layer-3-Switch
kurz: Ein Switch, der auch routet: VLAN-Interfaces (SVIs) als Gateways, Routing zwischen VLANs, DHCP-Relay, OSPF und VXLAN.
reihenfolge: 5
schicht: 2 und 3
hilfe: [device.l3switch]
demos: [l3switch, l3switchIpv6]
uebungen: [m145-ue07, m145-ue08, m145-ue09, l3-campus]
verwandt: [vlan, netzwerkdesign, router, dhcp]
---
## Wozu

In Firmennetzen trennt man Abteilungen mit [[vlan|VLANs]]. Damit sie trotzdem miteinander reden können, braucht es Routing zwischen den VLANs. Ein **Layer-3-Switch** erledigt das selbst: Er ist Switch und Router in einem Gerät und routet in Hardware-Geschwindigkeit. In der [[netzwerkdesign|Core- und Distribution-Schicht]] ist er das Standardgerät.

## SVIs: ein Gateway pro VLAN

Für jedes VLAN bekommt der Switch ein virtuelles Interface (**SVI**, Switch Virtual Interface) mit einer Adresse, z.B. `interface vlan 10` mit `10.10.0.1/24`. Diese Adresse ist das Standardgateway aller Geräte im VLAN 10. Mit eingeschaltetem IP-Routing routet der Switch zwischen allen SVIs.

```
Switch(config)# ip routing
Switch(config)# interface vlan 10
Switch(config-if)# ip address 10.10.0.1/24
Switch(config-if)# ip helper-address 10.99.0.10
```

`ip helper-address` macht den Switch zum **DHCP-Relay**: Er leitet DHCP-Anfragen aus dem VLAN an einen zentralen DHCP-Server weiter ([[dhcp]]).

## Was er sonst noch kann

Statische Routen und dynamisches Routing ([[ospf]], [[rip]], [[bgp]]), IPv6 auf den SVIs mit Router Advertisements, DHCP-Pools direkt auf dem Switch, [[acl|Zugriffslisten]] an Ports und SVIs, [[vrf]] und als VTEP [[vxlan]].
