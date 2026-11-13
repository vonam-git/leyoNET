---
titel: Modem
kurz: Setzt die Zugangsleitung um: Kabel (DOCSIS), Glasfaser (GPON), VDSL, ADSL oder Mobilfunk – geroutet wird dahinter.
reihenfolge: 9
schicht: 1 und 2
hilfe: [device.modem]
uebungen: [modem-vdsl, fiber-ont]
verwandt: [zugangstechniken, internet-box, provider]
---
## Wozu

Zwischen dem eigenen Netz und dem Provider liegt eine **Zugangsleitung**: Koax, Glasfaser, Telefonleitung oder Funk. Jede braucht eine eigene Übertragungstechnik. Das Modem übernimmt genau das: Es baut die Leitung nach Norm auf und gibt die Daten am LAN-Anschluss als Ethernet weiter. Routing, NAT und Firewall übernimmt das Gerät dahinter, meist ein [[router]] oder die [[internet-box]].

| Art | Leitung | Technik |
|---|---|---|
| Kabel | Koax | DOCSIS 3.1 |
| Glasfaser (ONT) | Glasfaser | GPON |
| VDSL, ADSL | Telefonleitung | VDSL2, ADSL2+, PPPoE |
| Mobilfunk | Funk | LTE |

## Anschliessen

Der LAN-Anschluss (Port 1) geht zum Router, der WAN-Anschluss (Port 2) mit dem passenden Kabel zum Provider. In der Simulation baut das Modem zuerst die Leitung auf; erst wenn es «online» meldet, fliesst IP-Verkehr. Die einzelnen Schritte stehen in der Paketliste, siehe [[zugangstechniken]].

Im [Schaufenster](https://app.leyonet.ch/?schaufenster) hängen drei Rechenzentren über drei verschiedene Modems am Provider.
