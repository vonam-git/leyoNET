---
titel: Special address ranges
kurz: Private networks, loopback, link-local, CGNAT and documentation addresses: which IPv4 and IPv6 ranges are reserved and what for, according to RFC 6890.
---
## Why there are reserved ranges

Not every IP address may appear on the internet. IANA keeps registries for ranges with a special meaning; RFC 6890 summarises them. When planning a network, always use a private range for the LAN and know the ranges that are never routed.

## IPv4

| Range | Purpose | Standard |
|---|---|---|
| 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 | private networks, internal only, to the internet via NAT | RFC 1918 |
| 127.0.0.0/8 | loopback: the device itself (`127.0.0.1`) | RFC 1122 |
| 169.254.0.0/16 | link-local: self-assigned when no DHCP server answers | RFC 3927 |
| 100.64.0.0/10 | shared address space for carrier-grade NAT at the provider | RFC 6598 |
| 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 | for documentation and examples only | RFC 5737 |
| 0.0.0.0/8 | “this network”, e.g. source of a DHCP discover | RFC 1122 |
| 255.255.255.255 | broadcast to everyone in the local network | RFC 919, RFC 1122 |

In addition, every subnet has its **network address** (all host bits 0) and its **broadcast address** (all host bits 1); neither is a host address.

## IPv6

| Range | Purpose | Standard |
|---|---|---|
| ::1/128 | loopback | RFC 4291 |
| fe80::/10 | link-local, automatically on every interface | RFC 4291 |
| fc00::/7 (in practice fd00::/8) | unique local addresses, private | RFC 4193 |
| ff00::/8 | multicast, e.g. ff02::1 all nodes on the link | RFC 4291 |
| 2001:db8::/32 | for documentation only | RFC 3849 |
| 2000::/3 | global unicast, routable on the internet | RFC 4291 |

## In leyoNET

All example networks in leyoNET use private addresses (RFC 1918) and documentation addresses for the “internet” (RFC 5737, RFC 3849), names only under `.example`. A PC without a DHCP answer reports “no server” after three attempts. The IP calculator (Tools) shows for every address which of these ranges it belongs to.
