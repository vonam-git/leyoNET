---
titel: VRRP (redundant gateway)
kurz: Two routers share a virtual gateway address. If the master fails, the backup takes over, and the computers notice nothing.
---
## The problem: a single gateway

Every computer knows exactly one default gateway. If that router fails, nobody reaches other networks any more, even if a second router is ready: the computers know nothing about it. You would have to change the gateway everywhere.

## The solution: a virtual address

With **VRRP** (Virtual Router Redundancy Protocol, version 3 per RFC 9568), two or more routers form a **group**. They share a virtual IP address, for example 192.168.1.1, and a virtual MAC address `00:00:5e:00:01:VRID` (VRID = group number). The computers use the virtual address as their gateway.

- The router with the highest **priority** (1–254, default 100) is **master**. It answers ARP for the virtual address with the virtual MAC and forwards the packets.
- The others are **backups** and wait.
- If the virtual address is a router's own interface address, it is the **owner** and always has priority 255.

## Advertisements and takeover

The master sends an **advertisement** every second to the multicast address 224.0.0.18 (IP protocol 112, TTL 255, the source is the virtual MAC). If they stop, the backup counts:

> Master_Down_Interval = 3 × advertisement interval + Skew_Time, Skew_Time = (256 − priority) / 256 s

A backup with priority 100 therefore takes over after about 3.6 seconds, one with 200 already after 3.2: the stronger backup wins. The new master announces itself with a **gratuitous ARP** so that the switches learn where the virtual MAC is now. Nothing changes for the computers.

## Preempt, tracking, accept mode

- **Preempt** (default): if a router with a higher priority comes back, it takes the role. Without preempt the running master stays.
- **Tracking**: if not the LAN but the uplink of the master fails, it is reachable but useless. With tracking it then lowers its priority by a decrement, and the backup takes over. If a router runs VRRP on both sides, each side needs tracking on the other, otherwise replies go through the wrong router.
- **Accept mode**: per RFC 9568 the master drops packets to the virtual address itself (unless it is the owner). Only with accept mode does it answer, for example, a ping to the gateway.

## In leyoNET

Router, firewall and layer 3 switch: device window → **Redundancy**, add a group with interface, VRID, virtual address and priority. On the command line in interface mode `vrrp 1 ip 192.168.1.1`, `vrrp 1 priority 110`, `vrrp 1 track eth1 decrement 20`, `vrrp 1 accept-mode`; `show vrrp brief` shows master and backup. The packet list filters with `vrrp`, the hex view shows version, VRID, priority and checksum.
