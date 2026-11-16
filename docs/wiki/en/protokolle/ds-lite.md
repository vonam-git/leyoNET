---
titel: DS-Lite
kurz: IPv4 through a provider’s IPv6-only network: the home router tunnels, the AFTR translates with CGNAT.
---
## The problem

Many providers build their networks with IPv6 only. The devices at home and many websites still speak IPv4, though. **Dual-Stack Lite** still gets IPv4 to its destination without the customer needing a public IPv4 address of their own.

## How it works

| Station | Task |
|---|---|
| PC at home | speaks IPv4 as always (private, e.g. 192.168.1.10) |
| Home router (**B4**) | wraps every IPv4 packet in an IPv6 packet (next header 4) and sends it to the AFTR |
| Provider (**AFTR**) | unwraps it, translates the source address with CGNAT and sends the IPv4 packet to the internet |

IPv6 traffic on the other hand goes directly, without tunnel and without NAT.

## Consequences

The home router no longer does NAT itself; the translation happens at the provider. That is why **port forwarding** over IPv4 does not work: anyone who wants to reach a device at home from outside needs IPv6. In the packet list you see the IPv6 header outside and the IPv4 packet inside.
