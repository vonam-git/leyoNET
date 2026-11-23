---
titel: NAT und PAT
kurz: Private Netze ins Internet bringen: Port-Übersetzung (PAT), Portweiterleitung, statisches SNAT und DNAT, 1:1-NAT und CGNAT beim Provider.
reihenfolge: 30
schicht: 3 und 4
hilfe: [nat, staticNat, portForward, cgnat]
demos: [nat, snat, dnat]
uebungen: [internet-nat, port-forward, static-nat-dmz, snat-mail, dnat-web, m129-routing-a2]
normen: [RFC 3022, RFC 5508, RFC 6598, RFC 1918]
protokolle: [NAT: PAT, statisches SNAT, DNAT (Portweiterleitung, statisch), 1:1-NAT, CGNAT]
verwandt: [provider, internet-box, paketfilter, ipv4]
---
## Warum NAT

Private Adressen (RFC 1918) dürfen nicht ins Internet; der Provider verwirft sie. Und öffentliche IPv4-Adressen sind knapp: Ein Haushalt oder eine Schule bekommt oft nur eine. **NAT** (Network Address Translation) am Router ersetzt beim Hinausgehen die private Absenderadresse durch die öffentliche und merkt sich die Zuordnung, damit die Antwort zurückfindet.

## PAT: viele Geräte, eine Adresse

Bei **PAT** (Port Address Translation, auch NAT-Overload) teilen sich alle Geräte die öffentliche Adresse; unterschieden werden sie am Port:

| innen | aussen |
|---|---|
| 192.168.1.10:49152 | 203.0.113.2:1024 |
| 192.168.1.11:49152 | 203.0.113.2:1025 |

Die **NAT-Tabelle** (`show ip nat translations` oder in der Simulation beim Router) zeigt diese Einträge.

**Und bei Ping?** ICMP liegt auf Schicht 3 und hat keine Ports. Ein Echo Request trägt aber eine **Kennung** (Identifier), und die Antwort trägt dieselbe. PAT nimmt diese Kennung als Ersatz für den Port: Der Router ersetzt sie ausgehend durch eine eigene Nummer und weiss so, an welchen Rechner die Antwort zurück muss. In der NAT-Tabelle steht dann z.B. `192.168.1.10 · ID 1` innen und `203.0.113.2 · ID 50000` aussen. Auch Fehlermeldungen wie «Time Exceeded» (bei `tracert`) übersetzt der Router zurück, samt dem darin eingebetteten Paket (RFC 5508).

![NAT in der Simulation: Der Router ersetzt die private Absenderadresse](nat)

## Von aussen hinein

Von aussen kann niemand eine Verbindung zu einem privaten Gerät beginnen, die Tabelle kennt den Weg nicht. Dafür gibt es:

| Art | Wirkung | Beispiel |
|---|---|---|
| Portweiterleitung (DNAT) | Port der öffentlichen Adresse → internes Gerät | TCP 443 → NAS 192.168.1.20 |
| statisches DNAT | eigene öffentliche Adresse → internes Gerät, eingehend | Webserver unter 203.0.113.80 |
| statisches SNAT | internes Gerät geht immer mit fester Adresse hinaus | Mailserver mit fester Absenderadresse |
| 1:1-NAT | beides zusammen | Server in der DMZ |

## CGNAT

Viele Provider haben selbst zu wenig öffentliche Adressen. Sie geben ihren Kunden Adressen aus **100.64.0.0/10** (RFC 6598) und übersetzen im eigenen Netz ein zweites Mal. Für Portweiterleitungen von aussen ist das ein Problem: Die Kundin besitzt keine öffentliche Adresse mehr. Eine Lösung ist IPv6 oder [[ds-lite]].
