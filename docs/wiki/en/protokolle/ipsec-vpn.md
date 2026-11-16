---
titel: IPsec VPN
kurz: Connecting two sites securely over the internet: IKEv2 negotiates the tunnel, ESP wraps the packets.
---
## What for

A company with sites in Zurich and Bern wants to connect its networks without renting an expensive leased line. A **site-to-site VPN** builds an encrypted tunnel through the internet: to the devices it looks as if both networks were directly connected.

## IKEv2: negotiating the tunnel

Before data flows, the two routers agree with **IKEv2** (UDP 500):

1. **IKE_SA_INIT:** choose the algorithms, exchange key material (Diffie-Hellman).
2. **IKE_AUTH:** authenticate each other, here with a pre-shared key, and define which networks may use the tunnel (**traffic selectors**).

The networks must match **mirrored**: what in Zurich is “local 192.168.1.0/24, remote 192.168.2.0/24” must be exactly the other way round in Bern. Otherwise the partner refuses.

## ESP: wrapping packets

In tunnel mode **ESP** (Encapsulating Security Payload) wraps the whole original IP packet and puts a new IP header in front, from router to router:

```text
[ IP 198.51.100.1 → 203.0.113.1 | ESP (SPI, no.) | encrypted: IP 192.168.1.10 → 192.168.2.20 | ICMP ]
```

On the internet you only see the routers’ public addresses, not who is talking to whom inside. Tunnel traffic bypasses NAT.

![Site-to-site VPN: packets travel encrypted through the tunnel](vpn)

## In leyoNET

Under Advanced → VPN at the router: name, partner address, local and remote network, key. In the simulation the tab shows the state of the tunnel; the packet list shows IKE and ESP with real headers. The encryption itself is only hinted at.
