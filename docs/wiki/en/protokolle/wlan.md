---
titel: Wi-Fi
kurz: Wireless networks according to 802.11: SSID, joining with authentication, association and 4-way handshake, signal strength, roaming and mesh.
---
## How a device joins the Wi-Fi

An access point regularly sends **beacons** with its SSID. A client that knows the network joins in four steps:

1. **Authentication:** a formality with WPA2 (open system).
2. **Association:** the client asks to be admitted, the access point confirms.
3. **4-way handshake** (EAPOL): both derive a shared key from the password and random numbers without sending the password. If the password is wrong, this step fails.
4. Then data flows, e.g. the DHCP request.

## The Wi-Fi frame

The header according to IEEE 802.11 has up to four addresses and ends like Ethernet with an FCS (CRC-32). Values from a management message of the simulation.

{{format wlan}}

## Signal, roaming and mesh

In leyoNET the signal quality depends on distance and floors. If a client is moved in the simulation, it looks for a stronger access point with the same SSID and joins it via **reassociation**. A gratuitous ARP tells the switches where the client is now ([[arp]]).

In a **mesh** access points connect to each other by radio; only one needs a cable.

| Band | Properties |
|---|---|
| 2.4 GHz | larger range, few non-overlapping channels (1, 6, 11) |
| 5 GHz | more channels and speed, shorter range |
