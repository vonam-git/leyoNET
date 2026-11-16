---
titel: Ports and services
kurz: How ports distinguish programs on a device, which ranges exist according to RFC 6335 and which port numbers you should know.
---
## Address plus port

The IP address brings a packet to the right device, the **port** to the right program. TCP and UDP each have 65,536 ports (16 bits). A connection is uniquely identified by five values: protocol, source IP, source port, destination IP, destination port. NAT (which replaces address and port) and the firewall (which filters by them) depend on this.

## Three ranges

RFC 6335 divides the ports; IANA keeps the registry:

| Range | Name | Use |
|---|---|---|
| 0–1023 | system ports (“well-known”) | server services, on many systems only with administrator rights |
| 1024–49151 | user ports (“registered”) | registered services of programs |
| 49152–65535 | dynamic ports (“ephemeral”) | source ports of clients, new for every connection |

## Ports you should know

| Port | Protocol | Service |
|---|---|---|
| 20, 21 | TCP | FTP |
| 22 | TCP | SSH |
| 23 | TCP | Telnet (unencrypted) |
| 25 | TCP | SMTP (sending e-mail) |
| 53 | UDP and TCP | DNS |
| 67, 68 | UDP | DHCP (server, client) |
| 80 | TCP | HTTP |
| 110 | TCP | POP3 |
| 143 | TCP | IMAP |
| 443 | TCP (and UDP for QUIC) | HTTPS |
| 520, 521 | UDP | RIP, RIPng |
| 179 | TCP | BGP |
| 500 | UDP | IKE (IPsec) |
| 5060 | UDP and TCP | SIP (IP telephony) |

## In leyoNET

The packet list shows source and destination port for every TCP and UDP frame; the filter `tcp.port == 80` shows only web traffic. Clients use source ports from 49152, servers reply from the well-known port. In the firewall and for port forwarding (DNAT), services are selected by their ports.
