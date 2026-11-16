---
titel: Firewall
kurz: A dedicated device that filters out of the box: zones WAN, LAN, DMZ and OPT, stateful rules and protection of the firewall itself.
---
## What for

A firewall sits between networks with different levels of trust: the internet, the internal network and a **DMZ** for servers that should be reachable from outside. It routes like a [[router]] but only lets through what a rule allows.

## Zones

| Interface | Zone | out of the box |
|---|---|---|
| eth0 | WAN (internet) | new connections from here forbidden |
| eth1 | LAN (internal) | may go out |
| eth2 | DMZ (public servers) | may go out |
| eth3 … | OPT (further) | may go out |

The firewall is **stateful**: replies to allowed connections come back without a rule of their own. A web server in the DMZ needs a rule like “allow TCP 80 to the web server, incoming on WAN”, usually together with port forwarding ([[nat]]). Unlike a router, its rules also protect **itself**: from the WAN it answers neither ping nor SSH out of the box.

## Reading rules

Rules apply from top to bottom, the first match decides, the default rule comes last. In the simulation every rule counts its hits, and the console reports blocked packets. [[paketfilter]] explains how rules are built.
