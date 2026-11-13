---
titel: Router
kurz: Verbindet Netze miteinander: Routing-Tabelle, Standardgateway, NAT, DHCP-Relay, dynamisches Routing, VPN und Befehlszeile.
reihenfolge: 6
schicht: 3 (Vermittlung)
hilfe: [device.router, cli, loopback]
demos: [static]
uebungen: [two-subnets, static-routes, loopback-ospf, m129-routing-a1]
verwandt: [routing-grundlagen, statisches-routing, nat, layer3-switch]
---
## Wozu

Ein Router verbindet verschiedene Netze. Jeder Anschluss liegt in einem eigenen Netz und hat eine eigene Adresse; diese Adresse ist das **Standardgateway** der Geräte in diesem Netz. Für jedes Paket entscheidet der Router anhand seiner Routing-Tabelle, wohin es weitergeht ([[routing-grundlagen]]). Broadcasts leitet er nicht weiter: Er trennt Broadcast-Domänen.

## Was ein Router in leyoNET kann

| Funktion | Seite |
|---|---|
| statische Routen, automatisches Routing | [[statisches-routing]], [[routing-grundlagen]] |
| OSPF, RIP, BGP (auch über IPv6) | [[ospf]], [[rip]], [[bgp]] |
| NAT, Portweiterleitung, SNAT/DNAT | [[nat]] |
| Subinterfaces für VLANs (Router-on-a-Stick) | [[vlan]] |
| DHCP-Relay und DHCP-Pools | [[dhcp]] |
| Paketfilter, IPsec-VPN, VRF | [[paketfilter]], [[ipsec-vpn]], [[vrf]] |
| serielle Leitungen (HDLC, PPP) | [[ppp-hdlc]] |
| Loopbacks, Befehlszeile, SSH | [[ssh]] |

Zwei Anschlüsse desselben Routers dürfen nicht im selben Netz liegen; leyoNET lehnt das ab wie ein echtes Gerät.

## Befehlszeile

Ein Doppelklick auf den Router öffnet in der Simulation die **Konsole**. Die Befehle folgen dem Stil von FRRouting und Cisco IOS, mit Abkürzungen, `?` und Tab:

```
Router> enable
Router# configure terminal
Router(config)# interface eth0
Router(config-if)# ip address 192.168.1.1/24
Router(config-if)# exit
Router(config)# ip route 0.0.0.0/0 203.0.113.1
Router(config)# do show ip route
```

Die vollständige Befehlsreferenz steht in der Dokumentation [Befehlszeile](https://github.com/vonam-git/leyoNET/blob/main/docs/cli.md).
