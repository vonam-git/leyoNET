---
titel: Home router (CPE)
kurz: The provider’s device for the home: modem, router with NAT, DHCP server and small switch in one box.
---
## What for

At home there is rarely a separate modem, router and switch. The provider supplies a **home router** (CPE, customer premises equipment) that combines everything:

| Part | Task |
|---|---|
| Modem | access line (cable, fibre, VDSL) to the provider |
| Router with NAT | all devices appear on the internet under one public address |
| DHCP server | assigns addresses in the home network (default 192.168.1.100–199) |
| Switch | four LAN ports in the same network |

## Setting up

Usually only the **WAN address** and the **provider’s gateway** need to be entered. Out of the box the box has 192.168.1.1/24 in the LAN. Port forwarding, DHCP range and routes are under “Advanced …”. With IPv6 the box can tunnel IPv4 through the provider’s IPv6 network using [[ds-lite]].

## What you learn from it

The home router shows that a “router” in everyday life is a bundle of functions. The demo “Internet box (CPE) on cable” takes it apart: line setup, DHCP in the home network, NAT on the WAN.
