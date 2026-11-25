---
titel: IT security: attacks and defence
kurz: Sort threats with STRIDE and recognise and fend off typical attacks in the simulation: ARP spoofing, SYN flood, port scan, guessing passwords.
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

## Four attacks in leyoNET

Everything runs only in the simulation, no real packet is ever sent.

| Attack | STRIDE | What happens | Defence |
|---|---|---|---|
| ARP spoofing | S | ARP knows no authenticity (RFC 826): the attacker claims to be the gateway | ARP guard on the end devices |
| SYN flood | D | Many half-open connections fill the queue (RFC 4987) | SYN cookies, firewall rule |
| Port scan | I | open ports are searched | publish only necessary services |
| Guess SSH password | E | common passwords are tried | strong password, block SSH from outside |

## Try it yourself

The **Attacker** is in the shop under end devices (feature “Security scenarios”, from profile 3). Cable it, give it an address, choose the attack on the right. On PCs, notebooks and servers **Desktop → Security** shows the guard and the protection switches. The network scanner finds open ports ([[ports-dienste]]).

In the web version the teacher starts an attack on the whole class ([[webversion]]).

> In real networks such attacks are forbidden. Whoever tests a network needs an explicit order from its operator.
