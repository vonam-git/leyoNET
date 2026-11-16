---
titel: OSPF
kurz: Link-state routing: neighbours via hello, a database of all links, shortest paths by Dijkstra – for IPv4 (OSPFv2) and IPv6 (OSPFv3).
---
## The idea

With OSPF (Open Shortest Path First) every router knows the whole map of its **area**: which routers exist and which links with which **costs**. From this each computes the shortest paths itself with the **Dijkstra algorithm**. If a line fails, the change spreads immediately and everyone recomputes.

## Sequence

1. **Hello:** routers regularly send hello packets to `224.0.0.5`. Whoever answers and has the same values (area, network, intervals) becomes a **neighbour**.
2. **Database exchange:** neighbours exchange descriptions (DBD), request missing entries (LSR) and send them (LSU), acknowledged with LSAck.
3. **SPF calculation:** every router computes its routes from the database; they appear with “O” in the table.

The **router ID** is the highest loopback address, otherwise the highest interface address. The cost of an interface can be set; the path with the smallest sum wins.

![OSPF in the simulation: hello packets and exchange of routes](ospf)

## Setting up

```
Router(config)# router ospf
Router(config-router)# network 10.0.0.0/24 area 0
Router(config-router)# network 192.168.1.0/24 area 0
Router# show ip ospf neighbor
Router# show ip route
```

**OSPFv3** does the same for IPv6: neighbours via link-local addresses, configuration per interface instead of with `network`.

## OSPF or RIP?

OSPF converges faster, computes with costs instead of hops and scales better. [[rip]] is easier to understand and sufficient for small networks.
