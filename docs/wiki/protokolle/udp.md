---
titel: UDP
kurz: Der schnelle, verbindungslose Transport für DNS, DHCP und RIP: ohne Handshake, ohne Bestätigung, nur Ports und Prüfsumme.
reihenfolge: 24
schicht: 4 (Transport)
demos: [dns]
uebungen: [m129-lab-a2]
normen: [RFC 768]
protokolle: [UDP]
verwandt: [tcp, dns, dhcp, rahmen-und-pakete]
---
## Wie UDP funktioniert

UDP setzt vor die Nutzdaten nur einen kleinen Kopf mit vier Feldern: Absender-Port, Ziel-Port, Länge und Prüfsumme. Es gibt keine Verbindung, keine Bestätigung und keine Wiederholung. Geht ein Datagramm verloren, merkt es nur das Programm.

| | TCP | UDP |
|---|---|---|
| Verbindung | Handshake, Abbau | keine |
| Zuverlässig | Bestätigung, Wiederholung | nein |
| Reihenfolge | garantiert | nicht garantiert |
| Kopf | mindestens 20 Byte | 8 Byte |
| Einsatz | Web, Mail, SSH | DNS, DHCP, RIP, VXLAN, Sprache und Video |

## Der UDP-Kopf

Nur 8 Byte: Quellport, Zielport, Länge und Prüfsumme.

{{format udp}}

## Wann UDP passt

Für eine kurze Frage mit kurzer Antwort wäre ein Handshake teurer als die Nachricht selbst: DNS fragt einfach noch einmal, wenn keine Antwort kommt. DHCP funktioniert sogar, bevor das Gerät eine Adresse hat. Bei Sprache und Video ist ein verspätetes Paket ohnehin wertlos.

| Port | Dienst |
|---|---|
| 53 | DNS |
| 67 / 68 | DHCP (Server / Client) |
| 520 | RIP |
| 4789 | VXLAN |
