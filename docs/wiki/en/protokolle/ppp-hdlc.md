---
titel: Serial lines: HDLC, PPP and PPPoE
kurz: Point-to-point links between routers without ARP, the encapsulation HDLC or PPP with LCP and IPCP, and PPPoE with DSL.
---
## Point to point

A serial line connects exactly two routers. Because there is only one receiver, no MAC addresses and no ARP are needed. Such leased lines used to be the usual WAN connection between sites; the principle lives on in DSL and mobile networks.

## Encapsulation

Both ends must use the same **encapsulation**, otherwise the line stays down:

| Encapsulation | Properties |
|---|---|
| HDLC (Cisco) | simple, default on many routers, no negotiation |
| PPP | negotiates the connection: **LCP** (line), **IPCP** (IP addresses), optional authentication |

```
Router(config)# interface serial0
Router(config-if)# encapsulation ppp
Router(config-if)# ip address 10.0.0.1/30
```

The port must first be set to “serial” in the form.

## The PPP frame

{{format ppp}}

## PPPoE

With DSL, PPP runs over Ethernet: **PPPoE**. First the modem looks for the provider’s access concentrator (PADI, PADO, PADR, PADS), then LCP, authentication with user and password (PAP) and IPCP follow, which assigns the public address. More under [[zugangstechniken]].
