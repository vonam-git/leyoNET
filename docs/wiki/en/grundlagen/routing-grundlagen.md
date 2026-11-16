---
titel: How routing works
kurz: Default gateway, routing table, longest prefix and administrative distance – and when to route statically, automatically or dynamically.
---
## In my own network or not?

Before a device sends, it compares the destination address with its own network (address and mask). If the destination is in the same network, it asks directly for the destination’s MAC via [[arp]]. If it is elsewhere, it sends the packet to its **default gateway**, the router in its own network.

![A ping to another network goes via the default gateway](gateway)

## The routing table

A router decides for every packet by its **routing table**: for every destination network it lists the neighbour (next hop) or interface to use.

| Destination | via | Source |
|---|---|---|
| 192.168.1.0/24 | eth0 | directly connected |
| 192.168.2.0/24 | 10.0.0.2 | static |
| 0.0.0.0/0 | 203.0.113.1 | default route |

If several entries match, the **longest prefix** (the most specific network) wins. On a tie the **administrative distance** decides: connected 0, static 1, eBGP 20, OSPF 110, RIP 120. Every router lowers the **TTL** by one; when it reaches zero, the router drops the packet and reports “TTL expired” (this is how `tracert` works).

## Networks between routers: the transit network

The small network that links two routers is called a **transit network** in leyoNET. It contains no end devices, only the two router ports; a /30 with two usable addresses is therefore enough. The term follows RFC 2328: a *transit network* carries traffic that neither originates nor ends in it. Its counterpart is the *stub network*, a network with end devices and a single exit.

In practice and in textbooks you will meet other words for the same thing:

| Term | Meaning | In leyoNET |
|---|---|---|
| **Transit network** | IP network between routers, without end devices | used throughout |
| Transfer network (German «Transfernetz») | the same; common in German-speaking countries, but not found in any standard | no longer used |
| Transport network | at carriers, the transmission network that carries customer signals; not an IP network between two routers | not used |
| Leased line | the permanently connected **line** of a provider between two sites, i.e. layers 1 and 2; the IP network on it is a transit network | only for the line, see [[ppp-hdlc]] |
| Point-to-point network | network with exactly two members (RFC 2328); every /30 between two routers is one | as an explanation |

## Three ways to the table

- **Automatic** (leyoNET only, for beginners): one tick at the router and it knows all networks in the plan.
- **Static:** enter the routes by hand. Clear, but every change must be repeated on every router ([[statisches-routing]]).
- **Dynamic:** routers exchange their networks themselves and react to failures: [[ospf]], [[rip]], between organisations [[bgp]].

> Most common mistake: the **return path**. Router A knows the network behind router B, but B does not know the network behind A. The ping arrives, the reply does not come back.
