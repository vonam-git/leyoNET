---
titel: SSH
kurz: Managing routers and switches remotely: user, password and management network, instead of standing next to them with a console cable.
---
## What for

A network device is rarely configured with a cable at the console but remotely. **SSH** (Secure Shell) opens an encrypted command line over the network for this. Older methods such as Telnet transmit the password in plain text.

## Setting up

The device needs a **reachable address** (router: an interface or loopback; switch: a VLAN interface), a **user** and SSH on the virtual lines:

```
Router(config)# username admin password Netz2026
Router(config)# ip ssh
Router(config)# line vty 0 4
Router(config-line)# transport input ssh
Router(config-line)# login local
```

On the PC:

```
C:\> ssh admin@192.168.10.1
```

In practice management belongs in its own **management VLAN** that only administrators can reach ([[acl]]).

## What you see in the capture

After the TCP handshake client and server exchange their versions in plain text (`SSH-2.0-…`); after that only encrypted bytes can be seen. That is exactly the difference to Telnet or HTTP.
