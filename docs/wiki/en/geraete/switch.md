---
titel: Switch
kurz: Connects devices in the same network, learns MAC addresses, separates networks with VLANs and prevents loops with spanning tree.
---
## What for

A switch connects devices into a local network. It works on layer 2: it reads the destination MAC of every frame and sends it only to the port behind which the destination lies ([[ethernet-mac|MAC table]]). It has nothing to do with IP addresses; a simple switch needs no configuration.

## What a switch can do in leyoNET

| Function | Page |
|---|---|
| MAC table, flooding, broadcast | [[ethernet-mac]] |
| VLANs: access ports and trunks with 802.1Q tag | [[vlan]] |
| spanning tree against loops | [[stp]] |
| port channel with LACP | [[lacp]] |
| access lists on ports | [[acl]] |
| shutting down ports (`shutdown`), colours and descriptions | [[dokumentieren]] |
| command line and SSH | [[ssh]] |

Depending on the model a switch has 8, 16, 24 or more RJ45 ports and SFP slots for [[medien|fibre]]. The front view on the right shows the ports as on the device; clicking an occupied port and then a free one moves the cable.

## Command line

```
Switch# show mac address-table
Switch# configure terminal
Switch(config)# interface port3
Switch(config-if)# switchport access vlan 20
Switch(config-if)# description Office printer
```
