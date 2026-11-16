---
titel: Structure of frames and packets
kurz: How Ethernet frames, IPv4 and IPv6 packets, TCP segments and UDP datagrams nest inside each other, field by field according to the standards, with real bytes from leyoNET.
---
## Nesting

Every layer wraps the data of the layer above: it puts its **header** in front and treats everything else as **payload**. Only Ethernet also appends something at the end: the checksum **FCS**. On the wire, preamble and SFD come before it and a short gap after it. That is layer 1, no capture shows it.

{{aufbau http}}

With “Wrap the next layer” the frame is built step by step, just as in the sender: at the top the HTTP request, at the bottom the bits on the cable. The receiver unpacks in reverse order. A switch only opens the layer 2 envelope, a router also the layer 3 envelope (see [[osi-modell]]).

| Layer | Data unit | Header contains | Example |
|---|---|---|---|
| 7 Application | data | depends on the service | HTTP request, DNS query |
| 4 Transport | segment (TCP), datagram (UDP) | ports | TCP 20 bytes, UDP 8 bytes |
| 3 Network | packet | IP addresses, TTL | IPv4 20 bytes, IPv6 40 bytes |
| 2 Data link | frame | MAC addresses, type; FCS at the end | Ethernet 14 + 4 bytes |
| 1 Physical | bits | preamble, SFD | 8 bytes before every frame |

## A frame as leyoNET shows it

This frame comes from the simulation. The packet list shows every frame exactly like this: the application at the top, the physical layer at the bottom, every layer in its colour. Below are the bytes as they are on the wire.

{{paket http}}

> In leyoNET: start the simulation and click a row in the packet list. Under every layer, “Structure per standard” opens the picture of the header with the values of exactly this frame, with the nesting below. The hex view can be switched on under Tools → Features.

## The Ethernet frame

Ethernet frames according to IEEE 802.3 are at least **64 bytes** and at most **1518 bytes** long (1522 with a VLAN tag), counted from the destination MAC up to and including the FCS. If the packet is shorter than 46 bytes, the sender pads it with zeros, as with every ARP request. The **FCS** (frame check sequence) is a CRC-32 over the whole frame. The receiver recomputes it; if it does not match, it drops the frame silently. Ethernet leaves error handling to the upper layers.

{{format ethernet2}}

Many captures do not show the FCS because the network card checks and strips it first. leyoNET shows it and also writes it into the pcapng file (with the note “4 bytes FCS” for Wireshark).

### With a VLAN tag

On a trunk a 4-byte tag according to IEEE 802.1Q sits between source MAC and EtherType. It starts with 0x8100, followed by priority and VLAN number (see [[vlan]]).

{{format dot1q}}

{{format ethernet2q}}

### IEEE 802.3 with LLC and SNAP

If the position of the EtherType holds a number up to 1500, it is a **length**. Then an LLC header according to IEEE 802.2 follows, which says which service the data is for. Spanning tree (STP) uses this form with DSAP and SSAP 0x42. With DSAP 0xAA a SNAP header with the EtherType follows (RFC 1042); this is how Wi-Fi and other IEEE 802 networks carry IP packets.

{{format ieee8023}}

### Wi-Fi frames

A Wi-Fi frame according to IEEE 802.11 has up to four addresses, because sender and receiver on the radio link are not always source and destination (the access point is in between). It also ends with a CRC-32 FCS. Data travels with LLC/SNAP and encrypted with WPA2.

{{format wlan}}

### PPP on serial lines

A point-to-point line needs no MAC addresses. PPP in HDLC-like framing (RFC 1662) puts flags 0x7E at the start and end, a fixed address and control field, the protocol and at the end a 16-bit FCS (see [[ppp-hdlc]]).

{{format ppp}}

## The IPv4 packet

Without options the IPv4 header according to RFC 791 is **20 bytes** long. Routers mainly read the destination IP (for the path) and the TTL (against loops). The checksum only covers the header; because every router lowers the TTL, it recomputes it. DSCP and ECN (formerly “type of service”) are defined in RFC 2474 and RFC 3168.

{{format ipv4}}

## The IPv6 packet

The IPv6 header according to RFC 8200 is always **40 bytes** long; the addresses alone take 32 of them. It is simpler than IPv4: no checksum (Ethernet and TCP/UDP take care of that), no fragmentation by routers, options only as extension headers behind the header (next header).

{{format ipv6}}

| | IPv4 | IPv6 |
|---|---|---|
| Header length | 20 to 60 bytes | fixed 40 bytes |
| Addresses | 32 bits | 128 bits |
| Lifetime | TTL | hop limit |
| What follows | protocol | next header |
| Checksum in the header | yes | no |
| Fragmentation | sender and routers | sender only |

## The TCP segment

Without options the TCP header according to RFC 9293 is **20 bytes** long. Sequence and acknowledgement numbers count bytes; the flags control setup (SYN), acknowledgement (ACK) and teardown (FIN) of the connection (see [[tcp]]).

{{format tcp}}

## The UDP datagram

UDP according to RFC 768 has only **8 bytes** of header: two ports, length, checksum. No connection, no acknowledgement (see [[udp]]).

{{format udp}}

## Sizes and checksums at a glance

| What | Size | Why |
|---|---|---|
| Ethernet MTU | 1500 bytes | largest packet in one frame |
| Ethernet frame | 64 to 1518 bytes | header 14 + payload 46–1500 + FCS 4 |
| additionally on the wire | 20 bytes | preamble 7, SFD 1, gap 12 |
| MSS for TCP over IPv4 | 1460 bytes | 1500 − 20 (IPv4) − 20 (TCP) |
| MSS for TCP over IPv6 | 1440 bytes | 1500 − 40 (IPv6) − 20 (TCP) |

| Checksum | Layer | covers | who checks |
|---|---|---|---|
| FCS (CRC-32) | 2 | the whole frame | every network card, every switch |
| IPv4 header checksum | 3 | only the IPv4 header | every router |
| TCP and UDP checksum | 4 | header, data and the IP addresses (pseudo header) | only the destination |
