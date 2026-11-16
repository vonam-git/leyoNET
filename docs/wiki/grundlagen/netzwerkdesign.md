---
titel: Netzwerkdesign: Core, Distribution, Access
kurz: Warum grosse Netze in Schichten gebaut werden, wann ein Collapsed Core genügt und wie ein Rechenzentrum mit Leaf-Spine aussieht.
reihenfolge: 6
demos: [rzVerbund, datacenter]
uebungen: [m145-ue10, m145-ue11, datacenter, l3-campus]
verwandt: [layer3-switch, vlan, stp, dokumentieren]
---
## Das dreistufige Modell

In Firmen- und Campusnetzen hat sich ein Aufbau in drei Schichten bewährt:

| Schicht | Aufgabe | typische Geräte |
|---|---|---|
| **Core** | schnell zwischen den Teilen des Netzes vermitteln, Anschluss nach aussen | Layer-3-Switches, Router |
| **Distribution** | Access-Switches zusammenfassen, Routing zwischen VLANs, Regeln (ACL) | Layer-3-Switches |
| **Access** | Endgeräte anschliessen, VLAN pro Port | Switches, Access Points |

Jede Schicht hat eine klare Aufgabe; Fehler und Änderungen bleiben örtlich begrenzt, und das Netz wächst, indem man unten weitere Access-Switches anhängt. Zwischen den Schichten laufen **Trunks** mit allen VLANs, oft über Glasfaser.

## Collapsed Core

In kleineren Netzen fallen Core und Distribution zusammen: Ein Layer-3-Switch routet zwischen den VLANs und hängt direkt an den Access-Switches. Das spart Geräte und Kosten, solange die Zahl der Access-Switches überschaubar bleibt.

## Leaf-Spine im Rechenzentrum

Im Rechenzentrum fliesst viel Verkehr zwischen Servern («Ost-West»). Dafür eignet sich **Leaf-Spine**: Jeder Leaf-Switch (an dem die Server hängen) ist mit jedem Spine verbunden. Jeder Weg ist gleich lang, und es gibt kein Spanning Tree, weil alles geroutet ist (oft BGP). VLANs, die über mehrere Leafs reichen, transportiert [[vxlan]].

## Im Schaufenster

Der [Rechenzentren-Verbund](https://app.leyonet.ch/?schaufenster) zeigt alle drei Bauarten nebeneinander: Zürich dreistufig, Bern mit Core und Distribution in einem Rack, Basel als Collapsed Core. Die Standorte hängen über Modems am Provider und sind mit [[ipsec-vpn|IPsec]] verbunden.

## Redundanz

Ein Netz ohne Reserve fällt mit dem ersten Kabel aus. Im Schaufenster ist darum alles doppelt:

- **Doppelte Leitungen:** Core und Distribution sind mit zwei Glasfasern verbunden, gebündelt zu einem Port-Channel mit [[lacp]]. Beide tragen Verkehr; fällt eine aus, läuft alles über die andere.
- **Zwei Wege nach oben:** Jeder Access-Switch hängt an beiden Distribution-Switches. Das ergibt eine Schleife, darum läuft [[stp]]: Der Core ist Root-Bridge, ein Uplink jedes Access-Switches ist blockiert und springt ein, wenn der andere ausfällt.
- **Collapsed Core in Basel:** zwei Kupferkabel im Port-Channel zwischen Core und Access.

In der Simulation zeigt `show spanning-tree` am Access-Switch den blockierten Reserve-Uplink, `show etherchannel summary` am Core die gebündelten Leitungen. Wer ein Kabel löscht oder einen Port abschaltet, sieht, wie das Netz weiterläuft.

![Drei Rechenzentren mit Racks, Core- und Access-Switches](rzVerbund)
