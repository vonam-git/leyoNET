---
titel: VXLAN
kurz: VLANs über ein geroutetes Netz verlängern: Ethernet-Rahmen in UDP 4789, VNI statt VLAN-Nummer, VTEPs auf Layer-3-Switches.
reihenfolge: 45
schicht: 2 über 3 (UDP 4789)
hilfe: [vxlan]
demos: [vxlan, datacenter]
uebungen: [datacenter]
normen: [RFC 7348]
protokolle: [VXLAN]
verwandt: [vlan, netzwerkdesign, bgp]
---
## Das Problem

Im Rechenzentrum wird zwischen den Switches geroutet (keine Schleifen, kein Spanning Tree). Server, die im selben Netz sein müssen, hängen aber an verschiedenen Switches. Wie kommt ein VLAN über ein geroutetes Netz?

## Die Lösung

**VXLAN** packt den ganzen Ethernet-Rahmen in ein UDP-Paket (Port 4789) und schickt es per IP zum Switch auf der anderen Seite. Dort wird er ausgepackt und ins VLAN gelegt.

```text
[ Ethernet | IP Loopback→Loopback | UDP 4789 | VXLAN VNI 10010 | Ethernet | IP | ICMP ]
  aussen (Underlay)                            innen (der Originalrahmen)
```

| Begriff | Bedeutung |
|---|---|
| **VTEP** | VXLAN Tunnel Endpoint, meist ein Layer-3-Switch (Leaf) |
| **VNI** | 24-Bit-Kennung des Segments (statt der 12-Bit-VLAN-ID, also bis 16 Millionen) |
| **Underlay** | das geroutete Netz zwischen den VTEPs, oft mit OSPF oder BGP |
| **Overlay** | das Layer-2-Netz, das darüber entsteht |

## Einrichten

```
Switch(config)# vlan 10
Switch(config-vlan)# vn-segment 10010
Switch(config)# interface nve1
Switch(config-if)# source-interface loopback0
Switch(config-if)# member vni 10010 peer-ip 10.255.0.2
Switch# show nve peers
```

In leyoNET stehen die anderen VTEPs in einer festen Liste; das Steuerprotokoll EVPN ist nicht nachgebildet.
