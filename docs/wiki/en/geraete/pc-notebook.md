---
titel: PC and notebook
kurz: End devices with a desktop: command line, web browser, e-mail and network settings – static or via DHCP.
---
## What for

PCs and notebooks are the devices people work on. They send and receive but do not forward anything. The notebook can also join the network via **Wi-Fi**; a PC needs a cable.

## Settings

| Setting | Meaning |
|---|---|
| IP address and mask | own address and size of the network |
| Default gateway | router that receives everything not in the own network |
| DNS server | who translates names like `www.schule.example` into addresses |
| DHCP | everything automatically from the DHCP server instead of fixed values |
| IPv6 | automatic (SLAAC/DHCPv6) or static, depending on the project’s IP version |

## The desktop

In the simulation a double-click opens the device’s **desktop**:

- **Command line:** `ping`, `tracert`, `ipconfig /all`, `ipconfig /release` and `/renew`, `arp -a`, `nslookup`, `netstat`, `ssh`.
- **Web browser:** shows every step (DNS, TCP, HTTP) and the page.
- **E-mail:** sending via SMTP, fetching via POP3 or IMAP.
- **Network:** addresses and tables at a glance.

```
C:\> ipconfig /all
C:\> ping 192.168.1.1
C:\> tracert www.schule.example
```
