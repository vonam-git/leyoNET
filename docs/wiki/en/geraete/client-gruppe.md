---
titel: Client group
kurz: One symbol for many identical computers, e.g. a whole classroom – handy for practising DHCP ranges and network sizes.
---
## What for

Drawing a classroom with 25 PCs as 25 individual devices would be confusing. The **client group** stands for 2 to 500 identical computers on one connection. Every member has its own MAC address and gets its address via [[dhcp]].

## What you practise with it

- **Network size:** 25 clients need at least 25 free addresses. A /27 (30 hosts) is just enough, /26 is better with servers and printers.
- **DHCP range:** if the range is too small, members stay without an address; the group shows how many got their address.
- **Costs:** the group counts each member in the price.

In the simulation a single member can be selected to ping or look at `ipconfig`.
