---
titel: Port channel and LACP
kurz: Bundling several cables into one logical link: more bandwidth, resilience and no blocked port.
---
## What for

Two cables between two switches are a loop for spanning tree; one is blocked and lies idle. A **port channel** (link aggregation) bundles the cables into one logical link. Spanning tree only sees one port, both cables carry traffic, and if one fails everything runs over the other.

## LACP

The Link Aggregation Control Protocol checks that both sides really belong together. The switches send **LACPDUs** with their system ID and a key; only ports with a matching partner join the bundle.

| Mode | Behaviour |
|---|---|
| active | sends LACPDUs itself |
| passive | only answers |
| on | bundles without LACP (both sides must be “on”) |

At least one side must be “active”. Ports with different VLAN or trunk settings stay out. Which frame takes which cable is decided by a hash over the addresses; a single connection therefore always uses the same cable.

## Command line

```
Switch(config)# interface range port7-8
Switch(config-if)# channel-group 1 mode active
Switch(config)# interface port-channel 1
Switch(config-if)# switchport mode trunk
Switch# show etherchannel summary
```
