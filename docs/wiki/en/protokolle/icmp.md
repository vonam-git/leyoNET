---
titel: ICMP, ping and traceroute
kurz: Echo request and reply, “destination unreachable” and “TTL expired”: how ping and traceroute work.
---
## Messages

ICMP (Internet Control Message Protocol) carries control and error messages in IP packets (protocol 1). The most important ones:

| Type | Name | when |
|---|---|---|
| 8 / 0 | echo request / reply | `ping` |
| 3 | destination unreachable | no route to the network, host unreachable, port closed |
| 11 | time exceeded | the TTL dropped to 0 on the way |

## The ICMP header

ICMP sits directly in the IP packet (protocol 1). The first 4 bytes are the same for all messages; what follows depends on the type. For ping it is identifier and sequence number.

{{format icmp}}

## Ping

`ping 192.168.2.10` sends four echo requests. Every reply shows the time and the TTL of the reply packet; from the TTL you can estimate how many routers lie in between. “Request timed out” means: no reply, but no error message either, often a missing return path.

## Traceroute

`tracert` (Windows) uses the TTL cleverly: the first packet has TTL 1 and is already dropped by the first router, which sends back “TTL expired”. The second has TTL 2, and so on. This way every router on the path reports.

```
C:\> tracert 192.168.3.10
  1  192.168.1.1
  2  10.0.0.2
  3  192.168.3.10
```

For IPv6 there is ICMPv6 with the same tasks plus neighbor discovery ([[ipv6]]).
