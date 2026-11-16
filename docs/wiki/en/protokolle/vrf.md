---
titel: VRF
kurz: Several separate routing tables on one router: two customers with the same addresses over the same device without seeing each other.
---
## The idea

A router normally has one routing table. With **VRF** (virtual routing and forwarding) it gets several, each with its own interfaces and routes. A packet stays in the VRF of the interface it comes in on. This way two customers can both use 10.0.0.0/24 and still run over the same router without seeing each other.

## Use

| Where | For |
|---|---|
| Provider | separating customer networks (in large networks together with MPLS) |
| Data centre | separating tenants |
| Company | separating the management network from the production networks |

## Setting up

```
Router(config)# vrf definition CUSTOMER-A
Router(config)# interface eth2
Router(config-if)# vrf forwarding CUSTOMER-A
Router(config-if)# ip address 10.0.0.1/24
Router(config)# ip route vrf CUSTOMER-A 0.0.0.0/0 10.9.0.2
Router# show ip route vrf CUSTOMER-A
Router# ping vrf CUSTOMER-A 10.0.0.10
```

First `vrf forwarding`, then the address: only inside the VRF may the same network appear a second time. In leyoNET, OSPF, RIP, BGP, NAT and automatic routing only apply to the global table.
