---
titel: NAT and PAT
kurz: Bringing private networks to the internet: port address translation (PAT), port forwarding, static SNAT and DNAT, 1:1 NAT and CGNAT at the provider.
---
## Why NAT

Private addresses (RFC 1918) may not go onto the internet; the provider drops them. And public IPv4 addresses are scarce: a household or a school often gets only one. **NAT** (network address translation) at the router replaces the private source address with the public one on the way out and remembers the mapping so the reply finds its way back.

## PAT: many devices, one address

With **PAT** (port address translation, also NAT overload) all devices share the public address; they are told apart by the port:

| inside | outside |
|---|---|
| 192.168.1.10:49152 | 203.0.113.2:1024 |
| 192.168.1.11:49152 | 203.0.113.2:1025 |

The **NAT table** (`show ip nat translations` or at the router in the simulation) shows these entries.

**And for ping?** ICMP sits on layer 3 and has no ports. An echo request does carry an **identifier**, though, and the reply carries the same one. PAT uses this identifier instead of a port: outgoing, the router replaces it with its own number and so knows which computer the reply must go back to. The NAT table then shows e.g. `192.168.1.10 · ID 1` inside and `203.0.113.2 · ID 50000` outside. Error messages such as “Time Exceeded” (with `tracert`) are translated back too, including the packet embedded in them (RFC 5508).

![NAT in the simulation: the router replaces the private source address](nat)

## From outside in

Nobody outside can start a connection to a private device; the table does not know the way. For this there are:

| Type | Effect | Example |
|---|---|---|
| Port forwarding (DNAT) | port of the public address → internal device | TCP 443 → NAS 192.168.1.20 |
| Static DNAT | own public address → internal device, incoming | web server under 203.0.113.80 |
| Static SNAT | internal device always goes out with a fixed address | mail server with a fixed source address |
| 1:1 NAT | both together | server in the DMZ |

## CGNAT

Many providers themselves have too few public addresses. They give their customers addresses from **100.64.0.0/10** (RFC 6598) and translate a second time in their own network. For port forwarding from outside this is a problem: the customer no longer owns a public address. One solution is IPv6 or [[ds-lite]].
