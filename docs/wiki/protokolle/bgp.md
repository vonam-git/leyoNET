---
titel: BGP
kurz: Das Routing zwischen Providern und Organisationen: autonome Systeme, Nachbarn über TCP 179, angekündigte Netze und der AS-Pfad.
reihenfolge: 43
schicht: 7 (über TCP 179)
hilfe: [bgp]
demos: [bgp, datacenter]
uebungen: [bgp-two-as, datacenter]
normen: [RFC 4271, RFC 6793]
protokolle: [BGP-4]
verwandt: [ospf, provider, netzwerkdesign]
---
## Wozu

Im Internet betreibt jede Organisation (Provider, Hochschule, grosse Firma) ihr eigenes **autonomes System** (AS) mit einer AS-Nummer. Innerhalb nutzt sie OSPF oder Ähnliches. Zwischen den autonomen Systemen läuft **BGP**: Es kündigt an, welche Netze über welches AS erreichbar sind, und lässt jede Organisation nach eigenen Regeln entscheiden.

## Ablauf

1. Zwei Router werden als **Nachbarn** konfiguriert und bauen eine TCP-Verbindung zu Port 179 auf.
2. **OPEN:** Sie tauschen AS-Nummer, Router-ID und Hold Time aus.
3. **KEEPALIVE:** hält die Verbindung am Leben.
4. **UPDATE:** kündigt Netze an (oder zieht sie zurück), jeweils mit dem **AS-Pfad**: der Liste der autonomen Systeme, über die das Netz erreichbar ist.
5. **NOTIFICATION:** meldet einen Fehler und beendet die Verbindung.

Bei mehreren Wegen gewinnt in leyoNET der kürzeste AS-Pfad. Findet ein Router seine eigene AS-Nummer im Pfad, verwirft er die Route: so entstehen keine Schleifen. Zwischen verschiedenen AS heisst die Verbindung **eBGP**, innerhalb **iBGP**.

## Einrichten

```
Router(config)# router bgp 65001
Router(config-router)# neighbor 172.16.12.2 remote-as 65002
Router(config-router)# network 10.1.0.0/16
Router# show ip bgp summary
Router# show ip bgp
```

AS-Nummern von 64512 bis 65534 sind für private Zwecke reserviert, wie private IP-Adressen. Im Rechenzentrum dient BGP auch als Underlay für Leaf-Spine ([[netzwerkdesign]]).
