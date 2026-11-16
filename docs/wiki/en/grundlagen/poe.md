---
titel: Power over Ethernet
kurz: Power over the twisted-pair cable according to IEEE 802.3: types 1 to 4, classes 0 to 8, the switch's budget and what happens when it is not enough.
---
## Idea

Power over Ethernet (PoE) carries data and power in the same twisted-pair cable. The **power sourcing equipment** (PSE) is usually a switch, the **powered device** (PD) a phone, a camera or an access point. There is no need for a power supply at the device or a socket on the ceiling.

Today PoE is part of the consolidated edition IEEE 802.3-2022: clause 33 for types 1 and 2 (formerly 802.3af and 802.3at), clause 145 for types 3 and 4 (formerly 802.3bt). The old names are still common in shops.

## Types

| Type | former name | pairs | at most per port (PSE) | highest class |
|---|---|---|---|---|
| 1 | 802.3af, “PoE” | 2 | 15.4 W | 3 |
| 2 | 802.3at, “PoE+” | 2 | 30 W | 4 |
| 3 | 802.3bt, “PoE++” | 4 | 60 W | 6 |
| 4 | 802.3bt, “PoE++” | 4 | 90 W | 8 |

The voltage is about 44 to 57 V DC. That is safe (safety extra-low voltage) but high enough that little is lost over 100 m of cable.

## Detection and classes

Before any power flows, the switch checks with a small voltage whether there is a PoE device on the cable at all (detection via a 25 kΩ resistance). So a PC without PoE never gets power. The device then announces its **class**, and the switch reserves the matching power:

| Class | at the switch | at the device | example |
|---|---|---|---|
| 1 | 4 W | 3.84 W | simple sensor |
| 2 | 7 W | 6.49 W | IP phone |
| 0 and 3 | 15.4 W | 13 W | dome camera, simple access point |
| 4 | 30 W | 25.5 W | Wi-Fi 6 access point, pan/tilt camera |
| 5 | 45 W | 40 W | video phone |
| 6 | 60 W | 51 W | thin client, small displays |
| 7 | 75 W | 62 W | lighting |
| 8 | 90 W | 71.3 W | displays, chargers |

The difference between switch and device is lost as heat in the cable (calculated for 100 m).

## Budget

The switch's power supply cannot feed every port with the maximum at the same time. Manufacturers therefore state a **PoE budget**, e.g. 370 W for a 24-port switch. When the budget runs out, the next device gets no power. Many switches allocate by priority; leyoNET allocates in port order.

Example: two phones (2 × 7 W), two dome cameras (2 × 15.4 W) and three class 4 access points (3 × 30 W) need 134.8 W together. A PoE+ switch with a 120 W budget is not enough, one with 370 W is.

## In leyoNET

- On the switch under **PoE**, choose the type and budget; single ports can be switched off. The table shows the device, class, power and status per port.
- IP phones and cameras need PoE, access points only when “PoE” is set on them.
- A device without power turns grey with a flash, its cable stays red and it answers nothing.
- On the switch's command line: `show power inline`, in the interface `power inline never` or `power inline auto`.
- Check for tasks: “Device powered via PoE”.

Simplification: leyoNET has no power negotiation via LLDP and no ports that still switch on with less power when the class is too high. It counts the reserved power of the class, not the actual consumption.
