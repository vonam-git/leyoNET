---
titel: WLAN
kurz: Funknetze nach 802.11: SSID, Anmeldung mit Authentication, Association und 4-Way-Handshake, Signalstärke, Roaming und Mesh.
reihenfolge: 5
schicht: 1 und 2
hilfe: [wlan, roaming]
demos: [wlan]
uebungen: [wlan]
normen: [IEEE 802.11, IEEE 802.1X]
protokolle: [802.11 Management, EAPOL]
verwandt: [access-point, ethernet-mac, rahmen-und-pakete]
---
## Wie ein Gerät ins WLAN kommt

Ein Access Point sendet regelmässig **Beacons** mit seiner SSID. Ein Client, der das WLAN kennt, meldet sich in vier Schritten an:

1. **Authentication:** Bei WPA2 eine Formalität (Open System).
2. **Association:** Der Client bittet um Aufnahme, der Access Point bestätigt.
3. **4-Way-Handshake** (EAPOL): Beide leiten aus dem Passwort und Zufallszahlen einen gemeinsamen Schlüssel ab, ohne das Passwort zu senden. Stimmt das Passwort nicht, scheitert dieser Schritt.
4. Danach fliessen Daten, z.B. die DHCP-Anfrage.

## Der WLAN-Rahmen

Der Kopf nach IEEE 802.11 hat bis zu vier Adressen und endet wie Ethernet mit einer FCS (CRC-32). Werte aus einer Verwaltungsnachricht der Simulation.

{{format wlan}}

## Signal, Roaming und Mesh

Die Signalqualität hängt in leyoNET vom Abstand und von Stockwerken ab. Wird ein Client in der Simulation verschoben, sucht er einen stärkeren Access Point mit derselben SSID und meldet sich dort per **Reassociation** an. Ein Gratuitous ARP sagt den Switches, wo der Client jetzt ist ([[arp]]).

Im **Mesh** verbinden sich Access Points per Funk untereinander; nur einer braucht ein Kabel.

| Band | Eigenschaften |
|---|---|
| 2,4 GHz | grössere Reichweite, wenige überlappungsfreie Kanäle (1, 6, 11) |
| 5 GHz | mehr Kanäle und Tempo, geringere Reichweite |
