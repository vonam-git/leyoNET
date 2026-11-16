---
titel: UDP
kurz: The fast, connectionless transport for DNS, DHCP and RIP: no handshake, no acknowledgement, just ports and a checksum.
---
## How UDP works

UDP only puts a small header with four fields in front of the payload: source port, destination port, length and checksum. There is no connection, no acknowledgement and no retransmission. If a datagram is lost, only the program notices.

| | TCP | UDP |
|---|---|---|
| Connection | handshake, teardown | none |
| Reliable | acknowledgement, retransmission | no |
| Order | guaranteed | not guaranteed |
| Header | at least 20 bytes | 8 bytes |
| Use | web, mail, SSH | DNS, DHCP, RIP, VXLAN, voice and video |

## The UDP header

Only 8 bytes: source port, destination port, length and checksum.

{{format udp}}

## When UDP fits

For a short question with a short answer, a handshake would cost more than the message itself: DNS simply asks again if no answer comes. DHCP even works before the device has an address. For voice and video a late packet is worthless anyway.

| Port | Service |
|---|---|
| 53 | DNS |
| 67 / 68 | DHCP (server / client) |
| 520 | RIP |
| 4789 | VXLAN |
