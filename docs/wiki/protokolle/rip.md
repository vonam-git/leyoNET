---
titel: RIP und RIPng
kurz: Distanzvektor-Routing: Router erzählen ihren Nachbarn, welche Netze sie in wie vielen Hops erreichen – einfach, aber mit Grenzen.
reihenfolge: 42
schicht: 7 (über UDP 520 bzw. 521)
hilfe: [rip, ripng]
demos: [rip, ripng]
uebungen: [rip-chain]
normen: [RFC 2453, RFC 2080]
protokolle: [RIP v2; RIPng]
verwandt: [ospf, statisches-routing, udp]
---
## Die Idee

Beim Routing Information Protocol schickt jeder Router regelmässig seine ganze Tabelle an die Nachbarn: «Netz A erreiche ich in 1 Hop, Netz B in 2.» Ein Nachbar zählt eins dazu und übernimmt die Route, wenn sie besser ist als seine. Die Metrik sind **Hops** (Anzahl Router); 16 heisst unerreichbar. Mehr als 15 Router hintereinander kann RIP also nicht.

## Split Horizon

Ein Router meldet eine Route nicht an den Nachbarn zurück, von dem er sie gelernt hat. Sonst könnten zwei Router sich nach einem Ausfall gegenseitig eine Route vorgaukeln, die es nicht mehr gibt, und die Hops zählen langsam bis 16 hoch.

## Einrichten

```
Router(config)# router rip
Router(config-router)# version 2
Router(config-router)# network 10.0.0.0/30
Router(config-router)# network 192.168.1.0/24
Router# show ip route
```

**RIPng** ist dasselbe für IPv6: Updates an `ff02::9` über UDP 521, Absender ist die Link-Local-Adresse.

> In leyoNET laufen die Zeiten verkürzt (Update alle 5 statt 30 Sekunden), damit man im Unterricht nicht warten muss.
