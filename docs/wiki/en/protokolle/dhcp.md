---
titel: DHCP
kurz: Handing out addresses automatically: discover, offer, request, ack, lease time, fixed assignments and DHCP relay across routers.
---
## What for

Configuring a hundred devices by hand is tedious and error-prone. A **DHCP server** hands out address, mask, gateway and DNS server automatically, for a limited time (**lease**).

## DORA

| Step | from → to | Content |
|---|---|---|
| **D**iscover | client → broadcast | “Is there a DHCP server here?” (the client has no address yet: 0.0.0.0) |
| **O**ffer | server → client | offer: address, mask, gateway, DNS, lease time |
| **R**equest | client → broadcast | “I take this server’s offer” |
| **A**ck | server → client | confirmation; from now on the address is valid |

After half the lease time the client renews. With `ipconfig /release` it returns the address, with `/renew` it gets a new one. Without an answer it repeats the discover and reports “no server” after three attempts.

![DHCP in the simulation: discover, offer, request, acknowledge](dhcp)

## Fixed assignments and relay

- **Reservation:** a device with a certain MAC address always gets the same address, e.g. a printer.
- **DHCP relay:** DHCP requests are broadcasts and do not cross routers. A router or layer 3 switch with `ip helper-address` forwards them to a central server and enters the network of the request (GIADDR). The server then chooses the matching range.
- **Pools on the router:** routers and layer 3 switches can also be DHCP servers themselves (`ip dhcp pool`).

## Typical mistakes

The range is too small (client groups!), overlaps with static addresses, or the gateway handed out is wrong. Clients without an answer show no valid address in `ipconfig`.
