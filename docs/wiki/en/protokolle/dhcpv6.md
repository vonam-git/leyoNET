---
titel: DHCPv6
kurz: IPv6 addresses from a server: solicit, advertise, request, reply – when to use DHCPv6 instead of SLAAC.
---
## SLAAC or DHCPv6?

IPv6 devices can form their address themselves ([[ipv6|SLAAC]]). With **DHCPv6** a server assigns the addresses instead. That is useful if you want to know exactly which device has which address. The router advertisement says which method applies: if the **M flag** (managed) is set, devices ask via DHCPv6.

## Sequence

| Step | Content |
|---|---|
| Solicit | client looks for a server (multicast to all DHCP servers) |
| Advertise | server offers an address |
| Request | client chooses the offer |
| Reply | server confirms |

The client identifies itself with a **DUID** (derived from the MAC in leyoNET). It still gets the gateway from the router advertisement, not via DHCPv6.

## DNS server for IPv6

IPv6 devices learn the DNS server either via DHCPv6 or directly in the router advertisement (RDNSS option). In leyoNET it is entered at the router interface.
