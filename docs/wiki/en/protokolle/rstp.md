---
titel: Rapid Spanning Tree (RSTP)
kurz: The fast variant of STP: proposal and agreement instead of waiting, a prepared backup port and failover in milliseconds.
---
## Why faster?

Classic [[stp]] only allows a new path after the forward delay (up to 50 seconds in real networks). Calls and connections stand still that long. **RSTP** (formerly IEEE 802.1w, now part of IEEE 802.1Q) elects the root bridge the same way but switches over in milliseconds.

## Proposal and agreement

A port that becomes **designated** does not simply start forwarding. It sends a **proposal** to its neighbour:

1. The neighbour recognises its new path to the root (root port).
2. It briefly blocks its own designated ports (**synchronisation**) so that no loop can form anywhere, and sends proposals there itself.
3. Then it answers with an **agreement**. Both ports forward at once.

The release travels like a wave away from the root through the network, without timers.

## Roles and states

| Role | State | Meaning |
|---|---|---|
| Root port | forwarding | best path to the root |
| Designated | forwarding | forwards on this link away from the root |
| Alternate | discarding | prepared backup for the root port |
| Edge | forwarding | end device attached, active at once |

If the root port fails, the **alternate port** becomes the new root port without waiting. When the tree changes, the switches send BPDUs with the **TC flag** (topology change); whoever receives it forgets the learned MAC addresses on the other ports and passes the message on.

## The RST BPDU

RSTP uses the same frame format as STP, but protocol version 2 and type 0x02. The flag byte holds proposal, agreement, role, learning, forwarding and TC. A switch that only speaks STP does not understand this: on that port RSTP falls back to STP (version 0) and waits as STP does.

## In leyoNET

Choose RSTP in the switch under **Switching → Spanning tree → Variant**, or on the command line `spanning-tree mode rstp` (also `rapid-pvst`). `show spanning-tree` shows «protocol rstp», roles and states. The packet list filters with `rstp`; the packet details show the flags. In the demo a continuous ping keeps running while you remove a cable.
