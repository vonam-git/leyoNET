---
titel: ARP
kurz: How a device finds the MAC address for an IP address in its own network – with a broadcast request, a reply and a cache.
---
## What for

A frame in the local network needs a destination **MAC address**, but a program only knows the **IP address**. The Address Resolution Protocol (ARP) links the two: “Who has 192.168.1.11? Tell 192.168.1.10.”

## Sequence

1. PC 1 wants to send to 192.168.1.11 and looks into its **ARP cache**. Empty.
2. It sends an **ARP request** as a broadcast (`ff:ff:ff:ff:ff:ff`). The switch distributes it to all ports.
3. Only PC 2 recognises its address and replies as **unicast** with its MAC.
4. PC 1 stores the mapping in the cache and now sends the actual packet.

![ARP request as broadcast, reply as unicast, then the ping](arpPing)

If the destination is in another network, the PC does not ask for the destination but for the MAC of its **default gateway** ([[routing-grundlagen]]).

| Field | Request | Reply |
|---|---|---|
| Operation | 1 (request) | 2 (reply) |
| Sender MAC / IP | PC 1 | PC 2 |
| Target MAC | 00:00:00:00:00:00 (unknown) | PC 1 |
| Target IP | 192.168.1.11 | 192.168.1.10 |

The EtherType of ARP is `0x0806`.

The whole structure according to RFC 826, with the values of an ARP request from the simulation. The message is only 28 bytes long, so Ethernet pads it to 46 bytes.

{{format arp}}

## Special forms

- **Gratuitous ARP:** a device announces its own address, e.g. after starting or when roaming on Wi-Fi. If someone answers, the address is assigned twice.
- **Proxy ARP:** a router answers on behalf of an address that lies behind it, e.g. with static NAT.

## Try it in leyoNET

```
C:\> arp -a
C:\> ping 192.168.1.11
C:\> arp -a
C:\> arp -d
```

In the packet list with the filter `arp`, request and reply appear; the detail view shows all fields and their bytes.
