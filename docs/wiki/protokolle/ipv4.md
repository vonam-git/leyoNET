---
titel: IPv4
kurz: Adressen, Masken und der IPv4-Kopf: wie ein Paket sein Ziel über viele Netze hinweg findet, mit TTL, Prüfsumme und privaten Adressen.
reihenfolge: 10
schicht: 3 (Vermittlung)
hilfe: [ip, duplicates]
demos: [gateway]
uebungen: [two-subnets, duplicate-ip, m117-ue03-a1, m117-ue03-a2]
normen: [RFC 791, RFC 1918, RFC 5737]
protokolle: [IPv4]
verwandt: [subnetting, routing-grundlagen, arp, icmp]
---
## Adressen

Eine IPv4-Adresse hat 32 Bit, geschrieben als vier Zahlen von 0 bis 255: `192.168.1.10`. Zusammen mit der **Maske** (`255.255.255.0` oder `/24`) sagt sie, in welchem Netz ein Gerät liegt ([[subnetting]]).

| Bereich | Zweck |
|---|---|
| 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 | privat, nur im eigenen Netz (RFC 1918) |
| 100.64.0.0/10 | Provider-NAT (CGNAT) |
| 127.0.0.0/8 | das Gerät selbst (Loopback) |
| 169.254.0.0/16 | selbst vergeben, wenn DHCP fehlt |
| 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 | für Beispiele und Dokumentation (RFC 5737) |

## Der IPv4-Kopf

Ohne Optionen ist der Kopf 20 Byte lang, fünf Zeilen zu 32 Bit. Die Werte stammen aus einem echten Paket der Simulation.

{{format ipv4}}

Auf dem Weg durch mehrere Netze wechselt der Ethernet-Kopf an jedem Router, der IP-Kopf bleibt; nur TTL und Prüfsumme ändern sich.

## Typische Fehler

- **Falsche Maske:** Zwei Geräte meinen, im selben Netz zu sein, sind es aber nicht (oder umgekehrt).
- **Gateway ausserhalb des Netzes:** leyoNET erlaubt die Eingabe, warnt aber; so lassen sich Fehlersuche-Aufgaben bauen.
- **Doppelte Adresse:** Zwei Geräte mit derselben Adresse im selben Netz; leyoNET markiert beide mit einem roten Ausrufezeichen.
