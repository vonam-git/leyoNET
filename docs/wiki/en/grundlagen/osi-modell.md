---
titel: OSI model and encapsulation
kurz: Seven layers that describe every network connection, and why a packet is built like a Russian doll.
---
## The seven layers

The OSI model divides communication into layers. Each layer solves one task and uses the layer below for it. In class one usually works with five: in everyday networking layers 5 and 6 are part of the application (as in the [[tcp-ip-modell|TCP/IP model]]).

Every layer has a fixed colour in leyoNET – in the packet list, in single step mode and here in the wiki. The tags show the protocols leyoNET simulates on that layer, in the same colours as in the packet list.

{{osi}}

| Layer | Name | Task | Examples | Device |
|---|---|---|---|---|
| 7 | Application | services for programs | HTTP, DNS, DHCP, SMTP | server, PC |
| 4 | Transport | connection between programs (ports) | TCP, UDP | – |
| 3 | Network | path through several networks (IP addresses) | IPv4, IPv6, ICMP, OSPF | router, layer 3 switch |
| 2 | Data link | frames in the local network (MAC addresses) | Ethernet, ARP, VLAN, STP | switch, access point |
| 1 | Physical | signals on the medium | copper, fibre, radio, DSL | cable, modem |

## Encapsulation

When a browser requests a web page, an HTTP request is created (layer 7). TCP puts a header with the ports in front (layer 4), IP a header with source and destination address (layer 3), Ethernet a header with the MAC addresses and the checksum FCS at the end (layer 2). On the cable (layer 1) there are only bits in the end, led by preamble and SFD.

{{aufbau http}}

How every header is built field by field is shown in [[rahmen-und-pakete]].

On the way, every device only unpacks as far as it needs to: a **switch** looks up to layer 2 (MAC address), a **router** up to layer 3 (IP address) and puts a new Ethernet header on for the next network. Only the **destination** unpacks everything.

## Seeing it in leyoNET

The packet list shows every frame by layer, each in its colour. In single step mode frames travel across the cables as coloured dots, and every device visibly unpacks as far as its layer requires. The demo “Default gateway” shows it particularly clearly: the IP addresses stay the same from PC to PC, the MAC addresses change at the router.
