---
titel: Quality of Service (DiffServ, 802.1p)
kurz: Wichtigen Verkehr bevorzugen, wenn eine Leitung voll ist: DSCP im IP-Kopf, PCP im VLAN-Tag, Warteschlangen mit Priorität.
reihenfolge: 3.5
schicht: 3 (DSCP) und 2 (PCP)
hilfe: [qos]
demos: [voipQos]
uebungen: [voip-qos]
normen: [RFC 2474, RFC 2475, RFC 3246, RFC 2597, RFC 4594, IEEE 802.1Q]
protokolle: [DiffServ (DSCP), 802.1p]
verwandt: [telefonie, vlan, datenrate, ipv4]
---
## Wann QoS hilft

Solange eine Leitung genug Bandbreite hat, kommt jedes Paket sofort durch, QoS ändert nichts. Kommt aber mehr an, als ein Port senden kann (typisch: schnelles LAN, langsame WAN-Leitung), müssen Pakete **warten**. Eine Warteschlange ohne Regeln behandelt alle gleich: Sprache wartet hinter grossen Datenpaketen und geht verloren, wenn die Warteschlange voll ist (**Tail Drop**). QoS sorgt dafür, dass wichtiger Verkehr zuerst geht. Mehr Bandbreite schafft es nicht.

## Markieren: DSCP und PCP

Bei Differentiated Services (DiffServ, Architektur RFC 2475) markiert der Absender oder das erste Netzgerät jedes Paket, die Geräte unterwegs behandeln es nach dieser Markierung.

| Ort | Feld | Grösse | Norm |
|---|---|---|---|
| IPv4-Kopf, Byte 2 (früher TOS) | DSCP | 6 Bit (0–63) + 2 Bit ECN | RFC 2474, RFC 3168 |
| IPv6-Kopf | Traffic Class | gleich wie IPv4 | RFC 2474 |
| 802.1Q-Tag (nur auf Trunks) | PCP | 3 Bit (0–7) | IEEE 802.1Q |

Empfohlene Klassen nach RFC 4594:

| Verkehr | DSCP | Wert | PCP |
|---|---|---|---|
| Netzsteuerung (Routing) | CS6 | 48 | 6 |
| Telefonie (Sprache) | EF (RFC 3246) | 46 | 5 |
| Signalisierung (SIP) | CS5 | 40 | 5 |
| Video, Konferenz | AF41 (RFC 2597) | 34 | 4 |
| Geschäftsdaten | AF21 | 18 | 2 |
| Normal | Default (Best Effort) | 0 | 0 |
| Hintergrund | CS1 | 8 | 1 |

Die **Class Selector** (CS0–CS7) sind mit den alten IP-Precedence-Werten verträglich: Die oberen drei Bits des DSCP ergeben die Klasse. So bildet ein Switch den DSCP auf den PCP ab: EF = 101110 → 101 = 5.

{{format ipv4}}

## Warteschlangen

Ein Gerät mit QoS hat je Port mehrere Warteschlangen. Bei **strikter Priorität** (Priority Queuing) sendet es immer zuerst aus der wichtigsten nicht leeren Warteschlange. Das ist ideal für Sprache, die wenig Bandbreite braucht, aber keine Verzögerung verträgt. Für viel Verkehr in hohen Klassen nutzen Geräte zusätzlich gewichtete Verfahren (z.B. Weighted Fair Queuing), damit die tiefen Klassen nicht verhungern.

**Vertrauen (Trust):** Ein Switch-Port zu einem PC sollte Markierungen nicht übernehmen, sonst kann jeder seinen Verkehr als «Sprache» markieren. Ohne Vertrauen setzt das Gerät den DSCP ankommender Pakete auf 0.

## In leyoNET

- Router, Switch, Layer-3-Switch, Firewall: Einstellungen → **QoS**. «QoS einschalten» aktiviert vier Warteschlangen mit strikter Priorität: Sprache (EF), Signalisierung und Netzsteuerung (CS5–CS7), bevorzugte Daten (AF, CS2–CS4), Best Effort.
- **Bandbreite je Port** (z.B. `2M`): Nur dort entsteht ein Stau; ohne Eintrag sendet der Port unbegrenzt schnell. Höchstens 40 Rahmen je Warteschlange, dann Tail Drop (in der Paketliste: «verworfen (Warteschlange voll)»).
- IP-Telefone markieren Sprache mit EF und SIP mit CS5; Last erzeugt `iperf -c <IP> -u -b 4M` auf einem PC.
- Auf Trunks trägt der 802.1Q-Tag den PCP aus dem DSCP; die Bytes zeigen beides.
