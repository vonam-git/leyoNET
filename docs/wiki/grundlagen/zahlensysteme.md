---
titel: Zahlensysteme und Adressen
kurz: Binär, dezimal und hexadezimal umrechnen und lesen, wie MAC-Adressen, IPv4- und IPv6-Adressen nach Norm geschrieben werden.
reihenfolge: 3.5
schicht: 2 und 3
normen: [IEEE 802.3, RFC 791, RFC 4291, RFC 5952]
uebungen: [m129-sub-a1]
verwandt: [subnetting, ethernet-mac, ipv4, ipv6]
---
## Drei Schreibweisen für dieselbe Zahl

Computer rechnen binär (Basis 2), Menschen dezimal (Basis 10). Hexadezimal (Basis 16, Ziffern 0–9 und A–F) ist die kurze Schreibweise für Binärzahlen: **eine Hex-Ziffer entspricht genau vier Bit**, zwei Hex-Ziffern einem Byte (Oktett).

| Dezimal | Binär | Hex |
|---|---|---|
| 0 | 0000 0000 | 00 |
| 10 | 0000 1010 | 0A |
| 128 | 1000 0000 | 80 |
| 192 | 1100 0000 | C0 |
| 255 | 1111 1111 | FF |

Binär in dezimal: Stellenwerte von rechts 1, 2, 4, 8, 16, 32, 64, 128 zusammenzählen, wo eine 1 steht. Beispiel: 1100 0000 = 128 + 64 = 192.

## MAC-Adressen

Eine MAC-Adresse hat 48 Bit (EUI-48, von der IEEE verwaltet) und wird als sechs Hex-Paare geschrieben, z.B. `02:00:00:00:01:00` oder `02-00-00-00-01-00`. Die ersten drei Bytes nennen den Hersteller (OUI). Zwei Bits im ersten Byte haben eine Bedeutung:

- Bit 0 (niedrigstes): **1 = Multicast** bzw. Broadcast (`ff:ff:ff:ff:ff:ff`), 0 = Unicast.
- Bit 1: **1 = lokal vergeben**. leyoNET verwendet solche Adressen (`02:…`), damit sie mit keiner echten Karte kollidieren.

## IPv4-Adressen

Eine IPv4-Adresse hat 32 Bit (RFC 791). Geschrieben wird sie in vier Dezimalzahlen von 0 bis 255, getrennt durch Punkte: `192.168.1.10`. Jede Zahl ist ein Byte. Die Maske gibt an, wie viele Bit von links zum Netz gehören, z.B. `/24` = `255.255.255.0` (siehe [[subnetting]]).

## IPv6-Adressen

Eine IPv6-Adresse hat 128 Bit (RFC 4291), geschrieben als acht Blöcke zu vier Hex-Ziffern. RFC 5952 legt die einheitliche Kurzform fest:

1. Führende Nullen in einem Block weglassen: `0db8` → `db8`.
2. Die längste Folge von Nullblöcken einmal durch `::` ersetzen.
3. Kleinbuchstaben verwenden.

Beispiel: `2001:0db8:0000:0000:0000:0000:0000:0001` wird zu `2001:db8::1`. Die ersten 64 Bit sind meist das Präfix (Netz), die letzten 64 Bit die Schnittstelle.

> In leyoNET: Der IP-Rechner (Werkzeuge) rechnet Adressen, Masken und Netze um, auch binär. In den Paketdetails stehen alle Adressen so, wie die Normen sie schreiben.
