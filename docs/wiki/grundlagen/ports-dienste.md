---
titel: Ports und Dienste
kurz: Wie Ports Programme auf einem Gerät unterscheiden, welche Bereiche es nach RFC 6335 gibt und welche Portnummern man kennen sollte.
reihenfolge: 5.5
schicht: 4 (Transport)
normen: [RFC 6335, RFC 9293, RFC 768]
uebungen: [m129-lab-a3]
verwandt: [tcp, udp, nat, paketfilter]
---
## Adresse plus Port

Die IP-Adresse bringt ein Paket zum richtigen Gerät, der **Port** zum richtigen Programm. TCP und UDP haben je 65 536 Ports (16 Bit). Eine Verbindung ist eindeutig durch fünf Angaben bestimmt: Protokoll, Quell-IP, Quellport, Ziel-IP, Zielport. Davon leben NAT (es ersetzt Adresse und Port) und die Firewall (sie filtert danach).

## Drei Bereiche

RFC 6335 teilt die Ports ein; die IANA führt das Register:

| Bereich | Name | Verwendung |
|---|---|---|
| 0–1023 | System Ports («well-known») | Server-Dienste, auf vielen Systemen nur mit Administratorrechten |
| 1024–49151 | User Ports («registered») | registrierte Dienste von Programmen |
| 49152–65535 | Dynamic Ports («ephemeral») | Quellports der Clients, für jede Verbindung neu |

## Ports, die man kennen sollte

| Port | Protokoll | Dienst |
|---|---|---|
| 20, 21 | TCP | FTP |
| 22 | TCP | SSH |
| 23 | TCP | Telnet (unverschlüsselt) |
| 25 | TCP | SMTP (E-Mail versenden) |
| 53 | UDP und TCP | DNS |
| 67, 68 | UDP | DHCP (Server, Client) |
| 80 | TCP | HTTP |
| 110 | TCP | POP3 |
| 143 | TCP | IMAP |
| 443 | TCP (und UDP für QUIC) | HTTPS |
| 520, 521 | UDP | RIP, RIPng |
| 179 | TCP | BGP |
| 500 | UDP | IKE (IPsec) |
| 5060 | UDP und TCP | SIP (IP-Telefonie) |

## In leyoNET

In der Paketliste steht bei jedem TCP- und UDP-Rahmen Quell- und Zielport; der Filter `tcp.port == 80` zeigt nur Web-Verkehr. Clients nehmen Quellports ab 49152, Server antworten vom bekannten Port. In der Firewall und bei der Portweiterleitung (DNAT) wählt man Dienste über ihre Ports.
