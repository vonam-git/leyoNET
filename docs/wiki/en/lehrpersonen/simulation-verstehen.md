---
titel: Understanding the simulation and the packet list
kurz: What happens in the simulation, how to find packets, unpack them layer by layer and save them as a capture for Wireshark.
---
## What the simulation does

In the simulation every device runs its own process: end devices send ARP, DHCP or pings, switches learn MAC addresses, routers decide by their routing table. Every transmission over a cable is an event with a timestamp. The same sequence therefore always produces the same packets, which makes demonstrations and exercises repeatable.

Time in the simulation runs like real time; in design mode it stops, and states such as ARP tables are kept. At the top are the buttons **Pause**, **Single step**, **Step back**, **Reset** and the **speed** (real time or slow motion).

## The packet list

At the bottom the packet list shows every frame with time, path (from → to, with interface), protocol and short info. Clicking a row shows the details:

- **OSI view:** layers 7 to 1, every field with value and meaning. What leyoNET simplifies is noted at the layer.
- **Structure per standard** and **nesting:** every header drawn as in the RFC or IEEE standard, with the values of this frame (see [[rahmen-und-pakete]]).
- **Hex view:** the real bytes; clicking a field highlights its bytes.
- **Filters** like in Wireshark: `arp`, `icmp and ip.dst == 192.168.1.11`, `tcp.port == 80`, `not stp`. The buttons below set common filters.
- **Export** as pcapng: the file opens in Wireshark like a real capture.

## Single step with OSI colours

In single step mode (key **N**) every frame travels across the cable as a coloured dot. A switch unpacks it up to layer 2, a router up to layer 3, the destination completely. This makes visible what [[osi-modell|encapsulation]] means.

> Proven in class: present a demo, pause with the **space bar** and continue step by step with **N**. The class predicts what happens next each time.
