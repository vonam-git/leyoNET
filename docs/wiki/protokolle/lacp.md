---
titel: Port-Channel und LACP
kurz: Mehrere Kabel zu einer logischen Leitung bündeln: mehr Bandbreite, Ausfallsicherheit und kein blockierter Port.
reihenfolge: 4
schicht: 2 (Sicherung)
hilfe: [lag]
demos: [portChannel]
uebungen: [m145-x3]
normen: [IEEE 802.1AX]
protokolle: [LACP]
verwandt: [stp, switch]
---
## Wozu

Zwei Kabel zwischen zwei Switches sind für Spanning Tree eine Schleife; eines wird blockiert und liegt brach. Ein **Port-Channel** (Link Aggregation) bündelt die Kabel zu einer logischen Leitung. Spanning Tree sieht nur einen Port, beide Kabel tragen Verkehr, und fällt eines aus, läuft alles über das andere.

## LACP

Das Link Aggregation Control Protocol prüft, dass beide Seiten wirklich zusammengehören. Die Switches senden **LACPDUs** mit ihrer System-ID und einem Schlüssel; nur Ports mit passendem Partner kommen ins Bündel.

| Modus | Verhalten |
|---|---|
| active | sendet selbst LACPDUs |
| passive | antwortet nur |
| on | bündelt ohne LACP (beide Seiten müssen «on» sein) |

Mindestens eine Seite muss «active» sein. Ports mit unterschiedlicher VLAN- oder Trunk-Einstellung bleiben draussen. Welcher Rahmen über welches Kabel geht, entscheidet ein Hash über die Adressen; eine einzelne Verbindung nutzt also immer dasselbe Kabel.

## Befehlszeile

```
Switch(config)# interface range port7-8
Switch(config-if)# channel-group 1 mode active
Switch(config)# interface port-channel 1
Switch(config-if)# switchport mode trunk
Switch# show etherchannel summary
```
