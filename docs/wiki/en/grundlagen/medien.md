---
titel: Cables, fibre and radio
kurz: Twisted pair, fibre with SFP modules, coax, telephone line, radio and serial – which medium for what and how to recognise it in leyoNET.
---
## The media

| Medium | Use | Typical reach |
|---|---|---|
| Twisted pair (copper, RJ45) | end devices, switches in the same room | up to 100 m |
| Multimode fibre (SX/SR) | between racks and buildings | a few 100 m |
| Single-mode fibre (LX/LR) | between sites | km |
| Coax | cable connection (DOCSIS) | – |
| Telephone line | DSL | a few km |
| Radio | Wi-Fi, mobile network | room to cell |
| Serial | older WAN lines between routers | – |

## SFP modules

Fibre needs an **SFP module** in the slot at both ends. Both modules must match: SX with SX (multimode, 1 Gbit/s), SR with SR (10 Gbit/s), LX/LR for single-mode. In leyoNET a fibre cable without a matching module stays down; the link LED shows the reason.

## Link LEDs

An LED lights up at each cable end: **green** active, **orange** with traffic, **red** down, with the reason on hover (port shut down, module missing, cable type does not fit). In troubleshooting exercises cables can also be **damaged**: part of the frames are lost.
