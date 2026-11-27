---
titel: IT security: attacks and defence
kurz: Sort threats with STRIDE and recognise and fend off typical attacks in the simulation: ARP spoofing, rogue DHCP server, SYN flood, port scan, guessing passwords; proof with syslog.
---
## Sorting threats: STRIDE

| Letter | Threat | Question |
|---|---|---|
| S | Spoofing | Does someone pretend to be someone else? |
| T | Tampering | Does someone change data? |
| R | Repudiation | Can someone deny having done something? |
| I | Information Disclosure | Does someone see what they must not see? |
| D | Denial of Service | Does someone disable a service? |
| E | Elevation of Privilege | Does someone obtain more rights? |

## Five attacks in leyoNET

Everything runs only in the simulation, no real packet is ever sent.

| Attack | STRIDE | What happens | Defence |
|---|---|---|---|
| ARP spoofing | S | ARP knows no authenticity (RFC 826): the attacker claims to be the gateway | ARP guard on the end devices |
| Rogue DHCP server | T | With made-up MAC addresses it uses up all addresses of the real server (“DHCP starvation”) and then hands out addresses itself, naming itself as gateway and DNS | DHCP snooping (RFC 7513) and port security on the switch |
| SYN flood | D | Many half-open connections fill the queue (RFC 4987) | SYN cookies, firewall rule |
| Port scan | I | open ports are searched | publish only necessary services |
| Guess SSH password | E | common passwords are tried | strong password, block SSH from outside |

## Proof instead of denial: syslog

Against **repudiation**, a log in a place the attacker cannot reach helps. With **syslog** (format following RFC 5424, transport over UDP 514 following RFC 5426), routers, switches, firewalls and the computers' guard report their events to a syslog server: SSH logins, violations of port security and DHCP snooping, ARP spoofing, SYN floods and port scans. Each message has a severity (0 emergency to 7 debug), the device name and an identifier such as `SSHFAIL`. The demo “Syslog: Who did that?” shows it.

## Try it yourself

The **Attacker** is in the shop under end devices (feature “Security scenarios”, from profile 3). Cable it, give it an address, choose the attack on the right. On PCs, notebooks and servers **Desktop → Security** shows the guard and the protection switches. The network scanner finds open ports ([[ports-dienste]]).

In the web version the teacher starts an attack on the whole class ([[webversion]]).

> In real networks such attacks are forbidden. Whoever tests a network needs an explicit order from its operator.
