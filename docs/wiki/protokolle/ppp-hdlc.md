---
titel: Serielle Leitungen: HDLC, PPP und PPPoE
kurz: Punkt-zu-Punkt-Verbindungen zwischen Routern ohne ARP, die Kapselung HDLC oder PPP mit LCP und IPCP, und PPPoE bei DSL.
reihenfolge: 60
schicht: 2 (Sicherung)
hilfe: [serial]
demos: [ppp]
uebungen: [serial-wan]
normen: [RFC 1661, RFC 1662, RFC 1332, RFC 2516]
protokolle: [PPP (LCP, IPCP), Cisco-HDLC; PPPoE]
verwandt: [router, zugangstechniken, statisches-routing]
---
## Punkt-zu-Punkt

Eine serielle Leitung verbindet genau zwei Router. Weil es nur einen Empfänger gibt, braucht es keine MAC-Adressen und kein ARP. Früher waren solche Standleitungen die übliche WAN-Verbindung zwischen Standorten; das Prinzip lebt in DSL und Mobilfunk weiter.

## Kapselung

Beide Enden müssen dieselbe **Kapselung** verwenden, sonst bleibt die Leitung down:

| Kapselung | Eigenschaften |
|---|---|
| HDLC (Cisco) | einfach, Standard auf vielen Routern, keine Aushandlung |
| PPP | handelt die Verbindung aus: **LCP** (Leitung), **IPCP** (IP-Adressen), optional Anmeldung |

```
Router(config)# interface serial0
Router(config-if)# encapsulation ppp
Router(config-if)# ip address 10.0.0.1/30
```

Der Port muss vorher im Formular auf «seriell» stehen.

## Der PPP-Rahmen

{{format ppp}}

## PPPoE

Bei DSL läuft PPP über Ethernet: **PPPoE**. Zuerst sucht das Modem den Zugangsrechner des Providers (PADI, PADO, PADR, PADS), dann folgen LCP, die Anmeldung mit Benutzer und Passwort (PAP) und IPCP, das die öffentliche Adresse zuteilt. Mehr dazu unter [[zugangstechniken]].
