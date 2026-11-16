---
titel: The first network in 10 minutes
kurz: Two PCs, a switch and a ping: shop, cabling, configuring and switching to the simulation.
---
## The screen

On the left is the **shop** with all devices, in the middle the **canvas**, on the right the **settings** of the selected device. At the top right the switch toggles between **Design** (build) and **Simulation** (run); the **M** key does the same.

## Step by step

1. In the shop click “End devices” and drag two **PCs** onto the canvas.
2. Under “Switches”, place a **switch** between them.
3. Press **K** (cable), then click PC 1 and the switch one after the other; likewise PC 2 and the switch. leyoNET takes the next free interface; the link LEDs at the cable ends turn green.
4. Click PC 1 and enter the **IP address** `192.168.1.10` with mask `255.255.255.0` on the right. For PC 2 use `192.168.1.11`. Entries are saved when you leave the field; there is no “Apply” button.
5. Press **M**: the simulation is running.
6. Double-click PC 1, open the **command line** on the desktop and enter `ping 192.168.1.11`.

Four replies? Then the network works. The **packet list** at the bottom now first shows two ARP frames (who has 192.168.1.11?) and then the ICMP echoes. [[arp]] explains why ARP comes first.

> Even this small network contains a lot of teaching: MAC addresses the switch learns (on the right at the switch: MAC table), broadcast and unicast, layers 2 and 3.

## Useful shortcuts

| Key | Effect |
|---|---|
| F1 | Help for the selected device or window |
| Ctrl+K | Command search: type a command or device name |
| E | Advanced settings with all tabs (addresses, routing, VLAN …) |
| Ctrl+D | Duplicate selection |
| Ctrl+Z | Undo |
| I | IP calculator |
| ? | All keyboard shortcuts |

## Common pitfalls

- **No ping, message “Request timed out”:** addresses in different networks? Both must be in the same network (same network address after applying the mask), see [[ipv4]].
- **Red exclamation mark on the device:** two devices have the same address.
- **Red cable:** the interface is shut down or the cable type does not fit (e.g. fibre without SFP module, see [[medien]]).
