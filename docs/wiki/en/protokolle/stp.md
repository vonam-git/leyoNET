---
titel: Spanning tree (STP)
kurz: Redundant cables without a broadcast storm: root bridge, port roles, blocked ports and what happens without STP.
---
## The problem: loops

Two cables between switches increase resilience but form a **loop**. A broadcast is sent round in circles endlessly and multiplies: a **broadcast storm**. After seconds the network is full and the MAC tables flap back and forth.

![Broadcast storm without spanning tree: frames circle endlessly](storm)

## The solution: a tree

The Spanning Tree Protocol turns the meshed network into a tree without loops:

1. The switches exchange **BPDUs** and elect a **root bridge**: the switch with the smallest bridge ID (priority, then MAC address).
2. Every other switch determines its **root port**: the path with the lowest cost to the root.
3. Every link has one **designated port**; all other ports are **blocked**.

If a cable fails, the switches recompute and a blocked port takes over.

| Role | State |
|---|---|
| Root port | forwards (towards the root) |
| Designated port | forwards (away from the root) |
| Alternate (blocked) | does not forward, only listens to BPDUs |

With `spanning-tree priority 4096` you make a particular switch (usually in the core) the root.

## The BPDU in the frame

BPDUs do not travel in Ethernet II but in an IEEE 802.3 frame with length and LLC header (DSAP and SSAP 0x42) to the multicast address 01:80:c2:00:00:00.

{{format ieee8023}}

## In leyoNET

Without STP the simulation detects the storm, shows a banner with the affected devices and throttles forwarding so the page stays responsive. With STP, `show spanning-tree` shows root, roles and states; the blocked port is marked on the canvas.
