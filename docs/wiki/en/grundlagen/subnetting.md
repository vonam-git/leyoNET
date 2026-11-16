---
titel: Subnetting and VLSM
kurz: Split a network into smaller ones, read masks and prefixes, compute host range and broadcast – evenly or as needed.
---
## Network part and host part

An IPv4 address has 32 bits. The **mask** says how many bits at the front identify the network; the rest numbers the devices in the network. `/24` (255.255.255.0) means 24 bits network, 8 bits host.

| Prefix | Mask | Addresses | usable |
|---|---|---|---|
| /24 | 255.255.255.0 | 256 | 254 |
| /25 | 255.255.255.128 | 128 | 126 |
| /26 | 255.255.255.192 | 64 | 62 |
| /27 | 255.255.255.224 | 32 | 30 |
| /30 | 255.255.255.252 | 4 | 2 (transfer network between routers) |

The first address is the **network address**, the last the **broadcast**; the device addresses lie in between.

## Example

The network `192.168.10.0/24` is to be split into four equal networks. Four networks need 2 more bits: `/26`. Each network has 64 addresses:

| Network | Host range | Broadcast |
|---|---|---|
| 192.168.10.0/26 | .1 – .62 | 192.168.10.63 |
| 192.168.10.64/26 | .65 – .126 | 192.168.10.127 |
| 192.168.10.128/26 | .129 – .190 | 192.168.10.191 |
| 192.168.10.192/26 | .193 – .254 | 192.168.10.255 |

## VLSM: as needed

With **VLSM** (variable-length subnet masks) every network only gets as much as it needs. Start with the largest: 100 devices need /25, 50 devices /26, the router link /30. This keeps address space for later.

> In leyoNET the **IP calculator** (key I) does both, in decimal and binary, and transfers the values at the push of a button. An **area** with a network address shows host range and broadcast directly on the canvas.

Private addresses for your own networks are listed in RFC 1918: 10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16 (more in [[adressbereiche]]).
