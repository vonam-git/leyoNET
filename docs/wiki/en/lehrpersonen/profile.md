---
titel: Choosing feature profiles
kurz: Five profiles from the first year of training to university, your own selection and a feature file for the whole class.
---
## Why profiles

Someone building a network for the first time does not need BGP settings. leyoNET therefore hides every feature the selected profile does not need: in the shop, menus, forms and help. Data in the project is kept.

| Profile | Level | New (selection) |
|---|---|---|
| 1 Starter | 1st year of training | PC, notebook, switch, router, server, automatic routing, DHCP, packet list |
| 2 Basics | 1st–2nd year | Wi-Fi, internet, home router, fibre, DNS, web, static routes, costs, frame structure |
| 3 Intermediate | 2nd–3rd year | VLANs, STP, PoE, IP phones and telephony, NAT, firewall, modems, e-mail, command line, network scanner, security scenarios, racks |
| 4 Advanced | 3rd–4th year, module 145 | layer 3 switch, QoS, ACL, port channel, IPv6, VPN, OSPF, RIP, serial lines, hex view |
| 5 University | university of applied sciences | BGP, VRF, VXLAN |

The complete assignment is listed in the documentation [feature profiles](https://github.com/vonam-git/leyoNET/blob/main/docs/funktionsprofile.md) (in German).

## Setting and sharing a profile

- The **profile chip** in the toolbar (or Tools → Features) selects the profile. Individual features can be switched on or off (“Custom selection”).
- **Save file** stores the selection as a small file. Learners load it with Tools → Load feature selection. With “lock” they can no longer change it.
- In the **web version** the admin console sets limits for everyone (highest profile, allowed features).
- If someone opens a project or exercise that needs more, leyoNET switches on the necessary features and says so.
