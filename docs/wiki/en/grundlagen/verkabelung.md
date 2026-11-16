---
titel: Structured cabling
kurz: Categories and classes of twisted pair cables, the 100-metre rule, fibre types and the structure of building cabling according to ISO/IEC 11801.
---
## Structure in the building

ISO/IEC 11801-1 (adopted in Europe as EN 50173-1) describes application-neutral cabling: it is built once and then carries Ethernet, telephony or building services. It is divided into three levels:

- **Campus backbone:** between buildings, usually fibre.
- **Building backbone:** from the building distributor to the floor distributors, fibre or copper.
- **Horizontal cabling:** from the floor distributor to the outlet at the workplace, twisted pair.

## The 100-metre rule

A twisted pair channel is at most **100 m** long: at most 90 m of permanently installed cable (permanent link) plus 10 m of patch cords at both ends together. The same limit applies to 1000BASE-T and 10GBASE-T according to IEEE 802.3. Longer runs need an active distributor (switch) or fibre.

## Categories and classes

The standard distinguishes **classes** for the whole link and **categories** for the individual parts (cable, outlet, connector):

| Class (link) | Category (parts) | Frequency | Typical for |
|---|---|---|---|
| D | Cat 5e | 100 MHz | 1 Gbit/s |
| E | Cat 6 | 250 MHz | 1 Gbit/s, 10 Gbit/s over short runs |
| EA | Cat 6A | 500 MHz | 10 Gbit/s over 100 m, high-power PoE |
| F | Cat 7 | 600 MHz | 10 Gbit/s |
| FA | Cat 7A | 1000 MHz | 10 Gbit/s and more |
| I, II | Cat 8.1, 8.2 | 2000 MHz | 25 and 40 Gbit/s over at most 30 m in the data centre |

For new buildings, class EA (Cat 6A) is common today.

## Fibre

- **Multimode** (OM3, OM4, OM5): thick core, inexpensive lasers, a few hundred metres, e.g. 1000BASE-SX and 10GBASE-SR in the building.
- **Single-mode** (OS2): thin core, kilometres, e.g. 1000BASE-LX, campus and provider.

In leyoNET fibre plugs into SFP modules; SX and LX must match at both ends (see [[medien]]).
