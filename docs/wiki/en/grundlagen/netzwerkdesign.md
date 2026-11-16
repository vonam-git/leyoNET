---
titel: Network design: core, distribution, access
kurz: Why large networks are built in layers, when a collapsed core is enough and what a data centre with leaf-spine looks like.
---
## The three-tier model

In company and campus networks a structure with three layers has proven itself:

| Layer | Task | Typical devices |
|---|---|---|
| **Core** | switch quickly between the parts of the network, connection to the outside | layer 3 switches, routers |
| **Distribution** | aggregate access switches, routing between VLANs, rules (ACL) | layer 3 switches |
| **Access** | connect end devices, VLAN per port | switches, access points |

Every layer has a clear task; faults and changes stay local, and the network grows by attaching more access switches at the bottom. **Trunks** carrying all VLANs run between the layers, often over fibre.

## Collapsed core

In smaller networks core and distribution merge: a layer 3 switch routes between the VLANs and connects directly to the access switches. This saves devices and costs as long as the number of access switches stays manageable.

## Leaf-spine in the data centre

In the data centre a lot of traffic flows between servers (“east-west”). **Leaf-spine** suits this: every leaf switch (where the servers are connected) is linked to every spine. Every path has the same length, and there is no spanning tree because everything is routed (often with BGP). VLANs spanning several leafs are carried by [[vxlan]].

## In the showcase

The [data centre network](https://app.leyonet.ch/?schaufenster) shows all three designs side by side: Zurich in three tiers, Bern with core and distribution in one rack, Basel as a collapsed core. The sites connect to the provider via modems and are linked with [[ipsec-vpn|IPsec]].

## Redundancy

A network without backup fails with the first cable. That is why everything is doubled in the showcase:

- **Double links:** core and distribution are connected with two fibres, bundled into a port channel with [[lacp]]. Both carry traffic; if one fails, everything runs over the other.
- **Two ways up:** every access switch is connected to both distribution switches. That creates a loop, so [[stp]] runs: the core is the root bridge, one uplink of every access switch is blocked and takes over if the other fails.
- **Collapsed core in Basel:** two copper cables in a port channel between core and access.

In the simulation `show spanning-tree` on the access switch shows the blocked backup uplink, `show etherchannel summary` on the core the bundled links. Delete a cable or shut down a port and watch the network keep running.

![Three data centres with racks, core and access switches](rzVerbund)
