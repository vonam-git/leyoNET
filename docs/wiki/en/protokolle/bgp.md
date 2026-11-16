---
titel: BGP
kurz: Routing between providers and organisations: autonomous systems, neighbours over TCP 179, announced networks and the AS path.
---
## What for

On the internet every organisation (provider, university, large company) runs its own **autonomous system** (AS) with an AS number. Inside it uses OSPF or similar. Between the autonomous systems **BGP** runs: it announces which networks are reachable via which AS and lets every organisation decide by its own rules.

## Sequence

1. Two routers are configured as **neighbours** and open a TCP connection to port 179.
2. **OPEN:** they exchange AS number, router ID and hold time.
3. **KEEPALIVE:** keeps the connection alive.
4. **UPDATE:** announces networks (or withdraws them), each with the **AS path**: the list of autonomous systems via which the network is reachable.
5. **NOTIFICATION:** reports an error and closes the connection.

With several paths, the shortest AS path wins in leyoNET. If a router finds its own AS number in the path, it discards the route: this prevents loops. Between different ASes the connection is called **eBGP**, within one **iBGP**.

## Setting up

```
Router(config)# router bgp 65001
Router(config-router)# neighbor 172.16.12.2 remote-as 65002
Router(config-router)# network 10.1.0.0/16
Router# show ip bgp summary
Router# show ip bgp
```

AS numbers from 64512 to 65534 are reserved for private use, like private IP addresses. In the data centre BGP also serves as the underlay for leaf-spine ([[netzwerkdesign]]).
