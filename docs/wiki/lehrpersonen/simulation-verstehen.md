---
titel: Simulation und Paketliste verstehen
kurz: Was in der Simulation passiert, wie man Pakete findet, Schicht für Schicht auspackt und als Mitschnitt für Wireshark speichert.
reihenfolge: 3
hilfe: [simulation, sniffer, osiStep, filter, pcap]
demos: [arpPing]
uebungen: [sniff-arp, m129-lab-a1]
verwandt: [osi-modell, arp, icmp]
---
## Was die Simulation macht

In der Simulation läuft für jedes Gerät ein eigener Ablauf: Endgeräte senden ARP, DHCP oder Pings, Switches lernen MAC-Adressen, Router entscheiden nach ihrer Routing-Tabelle. Jede Übertragung über ein Kabel ist ein Ereignis mit Zeitstempel. Derselbe Ablauf ergibt darum immer dieselbe Paketfolge, das macht Vorführungen und Übungen wiederholbar.

Die Zeit läuft in der Simulation wie die echte Zeit; im Entwurf hält sie an, Zustände wie ARP-Tabellen bleiben erhalten. Oben stehen die Knöpfe **Anhalten**, **Einzelschritt**, **Schritt zurück**, **Zurücksetzen** und das **Tempo** (Echtzeit oder Zeitlupe).

## Die Paketliste

Unten zeigt die Paketliste jeden Rahmen mit Zeit, Weg (von → nach, mit Anschluss), Protokoll und Kurzinfo. Ein Klick auf eine Zeile zeigt die Details:

- **OSI-Ansicht:** Schicht 7 bis 1, jedes Feld mit Wert und Bedeutung. Was leyoNET vereinfacht, steht bei der Schicht.
- **Hex-Ansicht:** die echten Bytes; ein Feld anklicken markiert seine Bytes.
- **Filter** wie in Wireshark: `arp`, `icmp and ip.dst == 192.168.1.11`, `tcp.port == 80`, `not stp`. Die Knöpfe darunter setzen häufige Filter.
- **Exportieren** als pcapng: Die Datei öffnet sich in Wireshark wie ein echter Mitschnitt.

## Einzelschritt mit OSI-Farben

Im Einzelschritt (Taste **N**) wandert jeder Rahmen als farbiger Punkt über das Kabel. Ein Switch packt ihn bis Schicht 2 aus, ein Router bis Schicht 3, das Ziel ganz. So wird sichtbar, was [[osi-modell|Kapselung]] heisst.

> Im Unterricht bewährt: Demo vorführen, mit der **Leertaste** anhalten und mit **N** Schritt für Schritt weiter. Die Klasse sagt jeweils voraus, was als Nächstes passiert.
