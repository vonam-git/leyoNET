---
titel: Ethernet and MAC addresses
kurz: How frames are addressed in the local network, how a switch learns where to send them, and what happens when a MAC address appears twice.
---
## The Ethernet frame

Ethernet carries data in the local network in **frames**. Every frame starts with the destination and the source MAC address, followed by the **EtherType**, which says what is inside. At the end is the checksum **FCS** (CRC-32): the receiver recomputes it and drops the frame if it does not match. Before the frame the network card sends preamble and SFD (layer 1) so the receiver can find the clock.

{{format ethernet2}}

A frame is at least 64 and at most 1518 bytes long. The sender pads shorter packets. More on VLAN tag, LLC and Wi-Fi frames: [[rahmen-und-pakete]].

A **MAC address** has 48 bits, written as six hexadecimal pairs. On a real device the first three bytes name the manufacturer. leyoNET assigns “locally administered” addresses (`02:…`) derived from the device number, so every project stays reproducible.

## How a switch learns

A switch remembers for every sender on which port it has seen it: the **MAC table**, also called **SAT** (source address table): the switch learns from the **source** address. A frame to a known address goes only to that port. If the address is unknown or a broadcast, the switch sends it to all other ports (**flooding**). Entries expire after a few minutes.

> In leyoNET: click the switch, the MAC table is shown on the right. After the first ping the switch knows both PCs.

## Duplicate MAC addresses

If two devices have the same MAC, the switch sees the same address alternately on two ports and rewrites its table each time. Replies end up at the wrong device. In practice this happens with cloned virtual machines. The demo “Duplicate MAC address” shows it; the switch reports “MAC flapping”.
