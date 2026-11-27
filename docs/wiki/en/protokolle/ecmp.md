---
titel: ECMP (equal-cost paths)
kurz: If several paths with the same cost lead to the destination, the router uses all of them. It does not spread each packet but each flow.
---
## Two paths, equally good

Normally a router picks exactly one route for a destination: longest prefix, then smallest administrative distance, then smallest metric. If two or more routes are still equally good, this is called **equal-cost multi-path** (ECMP). The router installs all of them and spreads the load. If one path fails, the packets use the remaining ones.

- **Static**: two routes to the same network with the same distance but a different gateway.
- **OSPF**: paths with the same total cost (RFC 2328, section 16.1).

## Per flow, not per packet

If the router alternated packets, they would arrive out of order and TCP would retransmit needlessly. So it computes a **hash** over source, destination, protocol and ports (for ICMP the identifier) and divides the number range into equal parts, one per path (**hash threshold**, RFC 2992). All packets of a connection take the same path; different connections are spread. With few connections the distribution may be uneven.

## In leyoNET

Up to four equal paths for static routes and OSPFv2. `show ip route` marks every active path with `>*`, the routing table shows both entries. In the demo the traceroutes of two PCs take different paths; if you remove a cable, only one remains. The same route twice cannot be added; with another distance it becomes a backup route ([[statisches-routing]]).
