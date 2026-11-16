---
titel: IP phone
kurz: Desk phone for voice over IP, powered via PoE (class 2), with a static address or via DHCP.
---
## What for

An IP phone makes calls over the data network instead of a separate telephone line (voice over IP). In the network it is an ordinary end device: it needs an IP address, a mask and usually a gateway so that it can reach the phone system.

## Power over the network cable

A desk phone rarely has its own power supply. It takes its power via [[poe]] from the switch and announces **class 2**: the switch reserves 7 W, and after 100 m of cable 6.49 W arrive at the phone. If the switch supplies no PoE, the budget is used up or the port is switched off, the phone stays off: in leyoNET it turns grey with a flash and its cable turns red.

## Settings

| Setting | Meaning |
|---|---|
| Address | static or via DHCP, as on a PC |
| Powered by | PoE (default) or power supply |
| Class | 0–8; default 2 (7 W) |
