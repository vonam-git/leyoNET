---
titel: IPv4
kurz: Addresses, masks and the IPv4 header: how a packet finds its destination across many networks, with TTL, checksum and private addresses.
---
## Addresses

An IPv4 address has 32 bits, written as four numbers from 0 to 255: `192.168.1.10`. Together with the **mask** (`255.255.255.0` or `/24`) it says which network a device is in ([[subnetting]]).

| Range | Purpose |
|---|---|
| 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 | private, only in your own network (RFC 1918) |
| 100.64.0.0/10 | provider NAT (CGNAT) |
| 127.0.0.0/8 | the device itself (loopback) |
| 169.254.0.0/16 | self-assigned when DHCP is missing |
| 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 | for examples and documentation (RFC 5737) |

## The IPv4 header

Without options the header is 20 bytes long, five rows of 32 bits. The values come from a real packet of the simulation.

{{format ipv4}}

On the way through several networks the Ethernet header changes at every router, the IP header stays; only TTL and checksum change.

## Typical mistakes

- **Wrong mask:** two devices think they are in the same network but are not (or vice versa).
- **Gateway outside the network:** leyoNET allows the entry but warns; this makes troubleshooting tasks possible.
- **Duplicate address:** two devices with the same address in the same network; leyoNET marks both with a red exclamation mark.
