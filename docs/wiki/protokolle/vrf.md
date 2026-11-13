---
titel: VRF
kurz: Mehrere getrennte Routing-Tabellen auf einem Router: zwei Kunden mit denselben Adressen über dasselbe Gerät, ohne dass sie sich sehen.
reihenfolge: 44
schicht: 3 (Vermittlung)
hilfe: [vrf]
demos: [vrf]
uebungen: [vrf-customers]
verwandt: [router, routing-grundlagen, vxlan]
---
## Die Idee

Ein Router hat normalerweise eine Routing-Tabelle. Mit **VRF** (Virtual Routing and Forwarding) bekommt er mehrere, jede mit eigenen Anschlüssen und Routen. Ein Paket bleibt in der VRF des Anschlusses, über den es hereinkommt. So können zwei Kunden beide 10.0.0.0/24 verwenden und laufen trotzdem über denselben Router, ohne sich zu sehen.

## Einsatz

| Wo | Wofür |
|---|---|
| Provider | Kundennetze trennen (in grossen Netzen zusammen mit MPLS) |
| Rechenzentrum | Mandanten trennen |
| Firma | Verwaltungsnetz von den Produktivnetzen trennen |

## Einrichten

```
Router(config)# vrf definition KUNDE-A
Router(config)# interface eth2
Router(config-if)# vrf forwarding KUNDE-A
Router(config-if)# ip address 10.0.0.1/24
Router(config)# ip route vrf KUNDE-A 0.0.0.0/0 10.9.0.2
Router# show ip route vrf KUNDE-A
Router# ping vrf KUNDE-A 10.0.0.10
```

Zuerst `vrf forwarding`, dann die Adresse: Erst in der VRF darf dasselbe Netz ein zweites Mal vorkommen. In leyoNET gelten OSPF, RIP, BGP, NAT und das automatische Routing nur für die globale Tabelle.
