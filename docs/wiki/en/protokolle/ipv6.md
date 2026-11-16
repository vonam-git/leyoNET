---
titel: IPv6
kurz: 128-bit addresses, prefixes, link-local, neighbor discovery instead of ARP and automatic addresses with SLAAC.
---
## Addresses

An IPv6 address has 128 bits, written as eight groups of four hexadecimal digits. Leading zeros are dropped, one run of zero groups may be replaced once by `::`: `2001:db8:1:0:0:0:0:10` becomes `2001:db8:1::10`.

| Type | Example | Purpose |
|---|---|---|
| Global | `2001:db8:1::10/64` | routable worldwide (2001:db8::/32 only for examples) |
| Link-local | `fe80::…` | created automatically, only in your own network, e.g. for router neighbours |
| Unique local | `fd00::/8` | private, like RFC 1918 addresses in IPv4 |
| Multicast | `ff02::1` (all), `ff02::2` (all routers) | instead of broadcast |

A network usually has a **/64 prefix**: 64 bits network, 64 bits for the device.

## The IPv6 header

The header is always 40 bytes long, ten rows of 32 bits; the two addresses take eight of them. Values from a RIPng packet of the simulation.

{{format ipv6}}

Differences from IPv4 at a glance: [[rahmen-und-pakete]].

## Neighbor discovery

IPv6 knows no ARP and no broadcast. Instead it uses ICMPv6:

- **Neighbor solicitation / advertisement:** “Who has this address?” to a multicast address, reply with the MAC.
- **Router solicitation / advertisement:** routers announce their prefix, their gateway and options (e.g. DNS server).

## SLAAC

With **SLAAC** a device forms its address itself: prefix from the router advertisement plus a device part from the MAC (EUI-64). No DHCP server is needed. With the M flag set, devices get the address via [[dhcpv6]] instead.

## In leyoNET

The project’s IP version is chosen at the top of the toolbar: IPv4 only, both (dual stack) or IPv6 only. Routers get a /64 per interface, end devices “automatic” or a static address.

```
C:\> ipconfig
C:\> ping 2001:db8:2::20
C:\> netsh interface ipv6 show neighbors
```
