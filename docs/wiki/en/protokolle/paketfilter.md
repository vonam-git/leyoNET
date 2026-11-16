---
titel: Firewall rules (packet filter)
kurz: Rules from top to bottom, default rule, stateful or stateless – how a router or firewall decides what may pass.
---
## A rule

Every rule checks properties of a packet and decides:

| Property | Example |
|---|---|
| Action | allow or deny |
| Protocol | TCP, UDP, ICMP or all |
| Destination port | 80 for web, 53 for DNS |
| Source, destination | `any`, an address, a network such as `192.168.1.0/24` |
| Input | interface or zone the packet comes in on |

Rules apply **from top to bottom**; the first match decides. If none matches, the **default rule** applies. Safe is “deny everything that is not allowed”.

## Stateful

A **stateful** firewall remembers allowed connections. Replies to them come back without a rule of their own, as do related ICMP error messages. A stateless firewall needs a rule for each direction; replies from web servers then come back e.g. from port 80 to a high port.

## Example: DMZ

| # | Action | Protocol | Source | Destination | Port |
|---|---|---|---|---|---|
| 1 | allow | TCP | any | 192.168.2.80 | 80 |
| 2 | allow | all | 192.168.1.0/24 | any | |
| – | deny | (default) | | | |

From outside only the web server is reachable via HTTP, the LAN may go out.

```
Router(config)# firewall default deny
Router(config)# firewall rule 1 allow tcp any 192.168.2.80 port 80 in wan
Router# show firewall
```

In the simulation every rule counts its hits; the device console reports blocked packets.
