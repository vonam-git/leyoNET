---
titel: IP camera
kurz: Surveillance camera on the network, powered via PoE: dome camera class 3, pan/tilt camera with heater class 4.
---
## What for

An IP camera sends its video over the data network to a recorder or server. It is often mounted where there is no socket: on the ceiling, above the entrance, outside on the facade. That is why it gets its power over the network cable.

## Power depending on the camera

| Model | Class | at the switch | at the camera | PoE type needed |
|---|---|---|---|---|
| Dome camera, fixed | 3 | 15.4 W | 13 W | type 1 (802.3af) |
| Pan/tilt with heater | 4 | 30 W | 25.5 W | type 2 (PoE+, 802.3at) |

The shop has one camera (class 3). For a model with pan/tilt head or heater, set class 4 under **PoE**. A class 4 camera on a type 1 switch stays without power because class 4 demands more than the port may deliver. How the switch distributes the power is explained in [[poe]].
