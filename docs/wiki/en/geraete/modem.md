---
titel: Modem
kurz: Handles the access line: cable (DOCSIS), fibre (GPON), VDSL, ADSL or mobile – routing happens behind it.
---
## What for

Between your own network and the provider there is an **access line**: coax, fibre, telephone line or radio. Each needs its own transmission technology. The modem takes care of exactly that: it brings up the line according to the standard and passes the data on as Ethernet at its LAN port. Routing, NAT and firewall are done by the device behind it, usually a [[router]] or the [[internet-box]].

| Type | Line | Technology |
|---|---|---|
| Cable | coax | DOCSIS 3.1 |
| Fibre (ONT) | fibre | GPON |
| VDSL, ADSL | telephone line | VDSL2, ADSL2+, PPPoE |
| Mobile | radio | LTE |

## Connecting

The LAN port (port 1) goes to the router, the WAN port (port 2) with the matching cable to the provider. In the simulation the modem first brings up the line; IP traffic only flows once it reports “online”. The individual steps appear in the packet list, see [[zugangstechniken]].

In the [showcase](https://app.leyonet.ch/?schaufenster) three data centres connect to the provider via three different modems.
