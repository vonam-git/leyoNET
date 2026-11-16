---
titel: VLANs and trunks
kurz: One switch, several separate networks: access ports, trunks with 802.1Q tag, native VLAN and routing between VLANs.
---
## What for

Without VLANs a switch is a single network: every broadcast reaches everyone, every device sees every other. A **VLAN** (virtual LAN) divides the switch into separate networks, e.g. administration, training and guests. Nothing passes between the VLANs without a router; this separates departments and enforces rules.

## Access port and trunk

| Port type | for | Frames |
|---|---|---|
| **Access** | end device, belongs to exactly one VLAN | without tag |
| **Trunk** | link between switches or to the router, carries several VLANs | with 802.1Q tag (VLAN number) |

The **802.1Q tag** is 4 bytes after the MAC addresses: EtherType `0x8100`, priority and the 12-bit **VLAN ID** (1 to 4094). The **native VLAN** travels on the trunk without a tag; both ends must have the same native VLAN. With “allowed VLANs” a trunk only lets certain VLANs through.

> A switch only forwards VLANs it knows. Even a switch that only passes a VLAN on over trunks needs it in its VLAN database.

![VLANs with trunk and spanning tree in the simulation](vlanStp)

## The 802.1Q tag

On the trunk the switch inserts 4 bytes after the source MAC: TPID 0x8100 and the VLAN number in it. At the access port it removes the tag again. Because the frame changes, the switch recomputes the FCS.

{{format dot1q}}

{{format ethernet2q}}

## Routing between VLANs

- **Router on a stick:** a router is connected to the switch with a trunk and has one subinterface per VLAN (`eth0.10`) that serves as the gateway.
- **Layer 3 switch:** the switch routes itself via VLAN interfaces (SVIs), see [[layer3-switch]].

## Command line

```
Switch(config)# vlan 10
Switch(config-vlan)# name ADMIN
Switch(config)# interface range port1-4
Switch(config-if)# switchport access vlan 10
Switch(config)# interface port24
Switch(config-if)# switchport mode trunk
Switch(config-if)# switchport trunk allowed vlan 10,20
Switch# show vlan brief
```

In leyoNET VLANs with a colour tint the ports on the canvas, the front panel and in the rack; an area with a VLAN documents the network.
