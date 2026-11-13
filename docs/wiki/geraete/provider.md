---
titel: Internet (Provider)
kurz: Steht für den Provider und den Rest des Internets: öffentliche Adressen, Routing zwischen Kunden, DNS, CGNAT und DS-Lite.
reihenfolge: 11
hilfe: [device.internet]
uebungen: [internet-nat, static-nat-dmz]
verwandt: [nat, modem, bgp]
---
## Wozu

Das Gerät «Internet» ersetzt alles, was hinter dem Anschluss liegt: den Provider mit seinen Routern und das restliche Internet. Es routet zwischen seinen Anschlüssen wie ein Router und verhält sich wie ein echter Provider: **Private Adressen** (RFC 1918) leitet es nicht weiter. Wer ins Internet will, braucht darum [[nat]].

## Anschlüsse und Adressen

Jeder Anschluss des Providers führt zu einem Kunden, meist mit einem kleinen **Transfernetz** (/30): eine Adresse für den Provider, eine für den Kunden. Öffentliche Beispieladressen stammen aus den Dokumentationsnetzen nach RFC 5737 (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24).

## Besondere Funktionen

- **CGNAT:** Der Provider gibt Kunden Adressen aus 100.64.0.0/10 und übersetzt selbst noch einmal, weil öffentliche IPv4-Adressen knapp sind ([[nat]]).
- **AFTR für DS-Lite:** Er nimmt IPv4 im IPv6-Tunnel entgegen und übersetzt es ([[ds-lite]]).
- **Provider für den Klassen-Verbund:** In der Infrastruktur der Lehrperson ist ein Internet-Gerät der Anschlusspunkt aller Standorte ([[klassen-verbund]]).
