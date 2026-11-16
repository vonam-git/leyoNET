---
titel: Access control lists (ACL)
kurz: Named lists with permit and deny on a switch port or VLAN interface: stateless, first match applies, implicit deny at the end.
---
## ACL or firewall?

An **ACL** (access control list) filters directly on a switch port or a VLAN interface. It is **stateless**: every packet is checked on its own, replies need their own rule on the port they come in on. In return it is fast and sits exactly where traffic enters the network, e.g. on the guest port.

| | ACL | Firewall |
|---|---|---|
| Where | switch port, VLAN interface | router, firewall, end device |
| State | stateless | usually stateful |
| End of the list | implicit deny | default rule of your choice |

## Structure

```
Switch(config)# ip access-list extended GUESTS
Switch(config-ext-nacl)# permit udp any any eq 53
Switch(config-ext-nacl)# permit tcp 192.168.10.0 0.0.0.255 host 192.168.10.80 eq 80
Switch(config-ext-nacl)# deny ip any any
Switch(config)# interface port1
Switch(config-if)# ip access-group GUESTS in
```

Addresses are written with a **wildcard mask**: `0.0.0.255` means “the last 8 bits don’t matter”, the opposite of the subnet mask. `host` stands for a single address.

ARP, spanning tree and IPv6 neighbor discovery always pass, otherwise the network would not work. In the simulation every rule counts its hits.
