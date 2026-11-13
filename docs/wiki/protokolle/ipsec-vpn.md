---
titel: IPsec-VPN
kurz: Zwei Standorte sicher über das Internet verbinden: IKEv2 handelt den Tunnel aus, ESP verpackt die Pakete.
reihenfolge: 52
schicht: 3 (ESP, IP-Protokoll 50) und 7 (IKE über UDP 500)
hilfe: [vpn]
demos: [vpn, rzVerbund]
uebungen: [vpn-sites]
normen: [RFC 4301, RFC 4303, RFC 7296]
protokolle: [IPsec ESP (Tunnelmodus); IKEv2]
verwandt: [nat, paketfilter, netzwerkdesign]
---
## Wozu

Eine Firma mit Standorten in Zürich und Bern will ihre Netze verbinden, ohne eine teure Standleitung zu mieten. Ein **Site-to-Site-VPN** baut einen verschlüsselten Tunnel durch das Internet: Für die Geräte sieht es aus, als wären beide Netze direkt verbunden.

## IKEv2: den Tunnel aushandeln

Bevor Daten fliessen, einigen sich die beiden Router mit **IKEv2** (UDP 500):

1. **IKE_SA_INIT:** Verfahren auswählen, Schlüsselmaterial austauschen (Diffie-Hellman).
2. **IKE_AUTH:** Sich gegenseitig ausweisen, hier mit einem gemeinsamen Schlüssel (Pre-Shared Key), und festlegen, welche Netze durch den Tunnel dürfen (**Traffic Selectors**).

Die Netze müssen **gespiegelt** passen: Was in Zürich «lokal 192.168.1.0/24, entfernt 192.168.2.0/24» ist, muss in Bern genau umgekehrt stehen. Sonst lehnt der Partner ab.

## ESP: Pakete verpacken

Im Tunnelmodus packt **ESP** (Encapsulating Security Payload) das ganze ursprüngliche IP-Paket ein und setzt einen neuen IP-Kopf davor, von Router zu Router:

```text
[ IP 198.51.100.1 → 203.0.113.1 | ESP (SPI, Nr.) | verschlüsselt: IP 192.168.1.10 → 192.168.2.20 | ICMP ]
```

Im Internet sieht man nur die öffentlichen Adressen der Router, nicht, wer innen mit wem spricht. Tunnelverkehr geht am NAT vorbei.

![Site-to-Site-VPN: Pakete laufen verschlüsselt durch den Tunnel](vpn)

## In leyoNET

Unter Erweitert → VPN beim Router: Name, Adresse des Partners, eigenes und entferntes Netz, Schlüssel. In der Simulation zeigt der Reiter den Zustand des Tunnels; die Paketliste zeigt IKE und ESP mit echten Köpfen. Die Verschlüsselung selbst ist nur angedeutet.
