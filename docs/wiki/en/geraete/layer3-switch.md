---
titel: Layer 3 switch
kurz: A switch that also routes: VLAN interfaces (SVIs) as gateways, routing between VLANs, DHCP relay, OSPF and VXLAN.
---
## What for

In company networks departments are separated with [[vlan|VLANs]]. For them to still talk to each other, routing between the VLANs is needed. A **layer 3 switch** does that itself: it is switch and router in one device and routes at hardware speed. It is the standard device in the [[netzwerkdesign|core and distribution layer]].

## SVIs: one gateway per VLAN

For every VLAN the switch gets a virtual interface (**SVI**, switch virtual interface) with an address, e.g. `interface vlan 10` with `10.10.0.1/24`. This address is the default gateway of all devices in VLAN 10. With IP routing switched on, the switch routes between all SVIs.

```
Switch(config)# ip routing
Switch(config)# interface vlan 10
Switch(config-if)# ip address 10.10.0.1/24
Switch(config-if)# ip helper-address 10.99.0.10
```

`ip helper-address` turns the switch into a **DHCP relay**: it forwards DHCP requests from the VLAN to a central DHCP server ([[dhcp]]).

## What else it can do

Static routes and dynamic routing ([[ospf]], [[rip]], [[bgp]]), IPv6 on the SVIs with router advertisements, DHCP pools directly on the switch, [[acl|access lists]] on ports and SVIs, [[vrf]] and, as a VTEP, [[vxlan]].
