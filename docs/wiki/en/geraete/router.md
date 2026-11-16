---
titel: Router
kurz: Connects networks: routing table, default gateway, NAT, DHCP relay, dynamic routing, VPN and command line.
---
## What for

A router connects different networks. Every interface lies in its own network and has its own address; this address is the **default gateway** of the devices in that network. For every packet the router decides by its routing table where it goes next ([[routing-grundlagen]]). It does not forward broadcasts: it separates broadcast domains.

## What a router can do in leyoNET

| Function | Page |
|---|---|
| static routes, automatic routing | [[statisches-routing]], [[routing-grundlagen]] |
| OSPF, RIP, BGP (also over IPv6) | [[ospf]], [[rip]], [[bgp]] |
| NAT, port forwarding, SNAT/DNAT | [[nat]] |
| subinterfaces for VLANs (router on a stick) | [[vlan]] |
| DHCP relay and DHCP pools | [[dhcp]] |
| packet filter, IPsec VPN, VRF | [[paketfilter]], [[ipsec-vpn]], [[vrf]] |
| serial lines (HDLC, PPP) | [[ppp-hdlc]] |
| loopbacks, command line, SSH | [[ssh]] |

Two interfaces of the same router may not be in the same network; leyoNET rejects that like a real device.

## Command line

In the simulation, double-clicking the router opens the **console**. The commands follow the style of FRRouting and Cisco IOS, with abbreviations, `?` and Tab:

```
Router> enable
Router# configure terminal
Router(config)# interface eth0
Router(config-if)# ip address 192.168.1.1/24
Router(config-if)# exit
Router(config)# ip route 0.0.0.0/0 203.0.113.1
Router(config)# do show ip route
```

The complete command reference is in the documentation [command line](https://github.com/vonam-git/leyoNET/blob/main/docs/cli.md) (in German).
