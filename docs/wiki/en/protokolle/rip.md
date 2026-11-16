---
titel: RIP and RIPng
kurz: Distance vector routing: routers tell their neighbours which networks they reach in how many hops – simple, but with limits.
---
## The idea

With the Routing Information Protocol every router regularly sends its whole table to its neighbours: “I reach network A in 1 hop, network B in 2.” A neighbour adds one and takes over the route if it is better than its own. The metric is **hops** (number of routers); 16 means unreachable. RIP therefore cannot handle more than 15 routers in a row.

## Split horizon

A router does not report a route back to the neighbour it learned it from. Otherwise, after a failure, two routers could fool each other with a route that no longer exists, slowly counting the hops up to 16.

## Setting up

```
Router(config)# router rip
Router(config-router)# version 2
Router(config-router)# network 10.0.0.0/30
Router(config-router)# network 192.168.1.0/24
Router# show ip route
```

**RIPng** is the same for IPv6: updates to `ff02::9` over UDP 521, the source is the link-local address.

> In leyoNET the timers are shortened (update every 5 instead of 30 seconds) so nobody has to wait in class.
