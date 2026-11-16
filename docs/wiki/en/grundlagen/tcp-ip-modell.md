---
titel: TCP/IP model
kurz: Four layers according to RFC 1122 instead of seven according to ISO/IEC 7498-1: how the two models fit together and why the internet is built on the TCP/IP model.
---
## Two models, one network

The **OSI reference model** (ISO/IEC 7498-1) describes communication in seven layers. It is a thinking model: every layer has a clear task and only talks to the layer below and above. The **TCP/IP model** comes from the requirements for internet hosts (RFC 1122 for the lower layers, RFC 1123 for the application layer) and knows only four layers. The internet protocols are built according to it.

| TCP/IP (RFC 1122) | OSI (ISO/IEC 7498-1) | Examples | Data unit |
|---|---|---|---|
| Application | 7 application, 6 presentation, 5 session | HTTP, DNS, DHCP, SMTP | data |
| Transport | 4 transport | TCP, UDP | segment, datagram |
| Internet | 3 network | IPv4, IPv6, ICMP | packet |
| Link | 2 data link, 1 physical | Ethernet, Wi-Fi, PPP | frame, bits |

## What the layers do

- **Link:** carries frames over a single medium to the next device. Addresses are local (MAC addresses).
- **Internet:** carries packets across many networks to the destination. Addresses are globally unique (IP addresses); routers decide the path.
- **Transport:** connects programs on the end devices via ports. TCP takes care of order and retransmission, UDP simply sends.
- **Application:** the actual service, such as a web page or a name lookup. Presentation (encoding, encryption) and session (keeping a connection) are usually handled by the application itself on the internet.

## The end-to-end principle

RFC 1122 requires routers to keep the network simple: they only read up to layer 3 and forward. Reliability, order and security lie with the end devices. That is why leyoNET shows how a router replaces the Ethernet header and lowers the TTL but leaves TCP segments unchanged (unless NAT changes addresses and ports).

> In leyoNET: the packet details show all seven OSI layers. Layers 5 and 6 stay grey with the note “part of the application in TCP/IP”, exactly as the TCP/IP model intends.
