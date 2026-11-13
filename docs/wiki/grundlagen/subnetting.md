---
titel: Subnetting und VLSM
kurz: Ein Netz in kleinere aufteilen, Masken und Präfixe lesen, Hostbereich und Broadcast berechnen – gleichmässig oder nach Bedarf.
reihenfolge: 3
schicht: 3 (Vermittlung)
hilfe: [subnetting, ipcalc]
uebungen: [subnetting-vlsm, m129-sub-a1, m129-sub-a2, m117-ue03-a3]
normen: [RFC 1918]
verwandt: [ipv4, routing-grundlagen]
---
## Netzanteil und Hostanteil

Eine IPv4-Adresse hat 32 Bit. Die **Maske** sagt, wie viele Bit vorne das Netz bezeichnen; der Rest nummeriert die Geräte im Netz. `/24` (255.255.255.0) heisst 24 Bit Netz, 8 Bit Host.

| Präfix | Maske | Adressen | nutzbar |
|---|---|---|---|
| /24 | 255.255.255.0 | 256 | 254 |
| /25 | 255.255.255.128 | 128 | 126 |
| /26 | 255.255.255.192 | 64 | 62 |
| /27 | 255.255.255.224 | 32 | 30 |
| /30 | 255.255.255.252 | 4 | 2 (Transfernetz zwischen Routern) |

Die erste Adresse ist die **Netzadresse**, die letzte der **Broadcast**; dazwischen liegen die Geräteadressen.

## Beispiel

Das Netz `192.168.10.0/24` soll in vier gleich grosse Netze geteilt werden. Vier Netze brauchen 2 Bit mehr: `/26`. Jedes Netz hat 64 Adressen:

| Netz | Hostbereich | Broadcast |
|---|---|---|
| 192.168.10.0/26 | .1 – .62 | 192.168.10.63 |
| 192.168.10.64/26 | .65 – .126 | 192.168.10.127 |
| 192.168.10.128/26 | .129 – .190 | 192.168.10.191 |
| 192.168.10.192/26 | .193 – .254 | 192.168.10.255 |

## VLSM: nach Bedarf

Bei **VLSM** (variable Masken) bekommt jedes Netz nur so viel, wie es braucht. Man beginnt mit dem grössten: 100 Geräte brauchen /25, 50 Geräte /26, die Router-Verbindung /30. So bleibt Adressraum für später.

> In leyoNET rechnet der **IP-Rechner** (Taste I) beides vor, in Dezimal und Binär, und überträgt die Werte auf Knopfdruck. Ein **Bereich** mit Netzadresse zeigt Hostbereich und Broadcast direkt auf der Zeichenfläche.

Private Adressen für eigene Netze stehen in RFC 1918: 10.0.0.0/8, 172.16.0.0/12 und 192.168.0.0/16.
