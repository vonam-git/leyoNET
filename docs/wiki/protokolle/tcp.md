---
titel: TCP
kurz: Zuverlässige Verbindungen zwischen Programmen: Ports, Drei-Wege-Handshake, Sequenz- und Bestätigungsnummern, Wiederholung und Abbau.
reihenfolge: 23
schicht: 4 (Transport)
demos: [web]
uebungen: [m129-lab-a3, web-dns]
normen: [RFC 9293]
protokolle: [TCP]
verwandt: [udp, http, osi-modell, rahmen-und-pakete]
---
## Ports

IP bringt ein Paket zum richtigen Gerät, **Ports** zum richtigen Programm. Ein Webserver wartet auf Port 80, SSH auf 22, SMTP auf 25. Der Client wählt einen freien Port ab 49152. Eine Verbindung ist eindeutig durch Absender, Ziel und beide Ports.

## Drei-Wege-Handshake

| Schritt | Flags | Bedeutung |
|---|---|---|
| 1 | SYN | Client: «Ich möchte verbinden, meine Startnummer ist x» |
| 2 | SYN, ACK | Server: «Einverstanden, meine ist y, ich erwarte x+1» |
| 3 | ACK | Client: «Ich erwarte y+1» – die Verbindung steht |

## Der TCP-Kopf

Ohne Optionen 20 Byte. Im ersten Segment (SYN) steht meist die Option MSS, dann ist der Kopf 24 Byte lang. Werte aus der HTTP-Anfrage der Demo «Webserver».

{{format tcp}}

## Zuverlässigkeit

Jedes Byte hat eine **Sequenznummer**. Der Empfänger bestätigt mit der **ACK-Nummer**, welches Byte er als Nächstes erwartet. Fehlt die Bestätigung, sendet der Absender erneut. Grosse Daten werden in **Segmente** geteilt (MSS 1460 Byte bei Ethernet). Den Abbau leitet ein **FIN** ein, jede Seite bestätigt; ein **RST** bricht sofort ab, z.B. wenn auf dem Port niemand wartet.

## In leyoNET

Im Browser eines PCs eine Webseite aufrufen, dann in der Paketliste mit `tcp` filtern. Ein Klick auf ein Paket und «TCP-Verbindung folgen» zeigt alle Segmente der Verbindung. `netstat` in der Befehlszeile listet offene Verbindungen.
