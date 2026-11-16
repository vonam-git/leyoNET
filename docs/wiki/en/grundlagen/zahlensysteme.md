---
titel: Number systems and addresses
kurz: Converting and reading binary, decimal and hexadecimal, and how MAC addresses, IPv4 and IPv6 addresses are written according to the standards.
---
## Three notations for the same number

Computers calculate in binary (base 2), people in decimal (base 10). Hexadecimal (base 16, digits 0–9 and A–F) is the short notation for binary numbers: **one hex digit corresponds to exactly four bits**, two hex digits to one byte (octet).

| Decimal | Binary | Hex |
|---|---|---|
| 0 | 0000 0000 | 00 |
| 10 | 0000 1010 | 0A |
| 128 | 1000 0000 | 80 |
| 192 | 1100 0000 | C0 |
| 255 | 1111 1111 | FF |

Binary to decimal: add up the place values from the right 1, 2, 4, 8, 16, 32, 64, 128 wherever there is a 1. Example: 1100 0000 = 128 + 64 = 192.

## MAC addresses

A MAC address has 48 bits (EUI-48, administered by the IEEE) and is written as six hex pairs, e.g. `02:00:00:00:01:00` or `02-00-00-00-01-00`. The first three bytes name the manufacturer (OUI). Two bits in the first byte have a meaning:

- Bit 0 (lowest): **1 = multicast** or broadcast (`ff:ff:ff:ff:ff:ff`), 0 = unicast.
- Bit 1: **1 = locally administered**. leyoNET uses such addresses (`02:…`) so they never collide with a real card.

## IPv4 addresses

An IPv4 address has 32 bits (RFC 791). It is written as four decimal numbers from 0 to 255, separated by dots: `192.168.1.10`. Each number is one byte. The mask states how many bits from the left belong to the network, e.g. `/24` = `255.255.255.0` (see [[subnetting]]).

## IPv6 addresses

An IPv6 address has 128 bits (RFC 4291), written as eight blocks of four hex digits. RFC 5952 defines the uniform short form:

1. Omit leading zeros in a block: `0db8` → `db8`.
2. Replace the longest run of zero blocks once with `::`.
3. Use lower-case letters.

Example: `2001:0db8:0000:0000:0000:0000:0000:0001` becomes `2001:db8::1`. The first 64 bits are usually the prefix (network), the last 64 bits the interface.

> In leyoNET: the IP calculator (Tools) converts addresses, masks and networks, also in binary. The packet details show all addresses as the standards write them.
