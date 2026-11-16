---
titel: Access technologies: DOCSIS, GPON, DSL and LTE
kurz: How a connection to the provider is set up – over coax, fibre, telephone line or mobile – and what the modem negotiates.
---
## The last mile

Between the house and the provider lies the “last mile”. Depending on the location it is a coax cable of the cable network, a fibre, the old telephone line or radio. Each technology sets up the connection differently; the **modem** (or the home router) takes care of it.

| Technology | Line | Setup sequence |
|---|---|---|
| DOCSIS 3.1 (cable) | coax | search channel, ranging, DHCP and configuration file via TFTP, registration |
| GPON (fibre) | fibre, passively shared | report serial number, receive ONU ID, ranging, configuration (OMCI) |
| VDSL2, ADSL2+ | telephone line | training (handshake), then PPPoE with login |
| LTE (mobile) | radio | connection to the cell, registration with SIM, bearer with IP address |

## Shared media

With cable and GPON many customers share the same medium. Therefore every modem must register and is assigned transmission times (**ranging**: the delay is measured so the signals do not overlap). DSL on the other hand is a separate line to the exchange, but its speed depends strongly on the length.

## In leyoNET

The setup steps appear as frames of their own in the packet list. IP traffic only flows once the modem reports “online”. Attenuation, distance and bandwidth are not simulated. In the [showcase](https://app.leyonet.ch/?schaufenster) three technologies run side by side: fibre in Zurich, cable in Bern, VDSL in Basel.
