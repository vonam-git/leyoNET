---
titel: VXLAN
kurz: Extending VLANs across a routed network: Ethernet frames in UDP 4789, VNI instead of VLAN number, VTEPs on layer 3 switches.
---
## The problem

In the data centre the switches route between each other (no loops, no spanning tree). Servers that need to be in the same network are connected to different switches, though. How does a VLAN cross a routed network?

## The solution

**VXLAN** wraps the whole Ethernet frame in a UDP packet (port 4789) and sends it via IP to the switch on the other side. There it is unwrapped and put into the VLAN.

```text
[ Ethernet | IP loopback→loopback | UDP 4789 | VXLAN VNI 10010 | Ethernet | IP | ICMP ]
  outside (underlay)                           inside (the original frame)
```

| Term | Meaning |
|---|---|
| **VTEP** | VXLAN tunnel endpoint, usually a layer 3 switch (leaf) |
| **VNI** | 24-bit identifier of the segment (instead of the 12-bit VLAN ID, so up to 16 million) |
| **Underlay** | the routed network between the VTEPs, often with OSPF or BGP |
| **Overlay** | the layer 2 network created on top |

## Setting up

```
Switch(config)# vlan 10
Switch(config-vlan)# vn-segment 10010
Switch(config)# interface nve1
Switch(config-if)# source-interface loopback0
Switch(config-if)# member vni 10010 peer-ip 10.255.0.2
Switch# show nve peers
```

In leyoNET the other VTEPs are in a fixed list; the control protocol EVPN is not modelled.
