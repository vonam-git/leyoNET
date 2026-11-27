---
titel: Syslog
kurz: Devices report events to a central syslog server: format following RFC 5424, transport over UDP 514. This makes it possible to prove later what happened when and where.
---
## Why a log?

A router remembers little, and whoever attacks it can delete their traces there. That is why routers, switches, firewalls and servers send their messages to a **syslog server**: a central place that collects everything with time and sender. If something stands out, you can look up what happened. In STRIDE this protects against **repudiation** (denial).

## A message

```
<36>1 - Router leyonet - SSHFAIL [leyonet@32473 user="admin" from="192.168.10.66"] ssh failed login user admin from 192.168.10.66
```

| Part | Meaning |
|---|---|
| `<36>` | PRI = facility × 8 + severity: facility 4 (security), severity 4 (warning) |
| `1` | version of the format |
| `-` | timestamp (empty in leyoNET, the simulation has no clock time; the server notes the time of receipt) |
| `Router` | name of the device |
| `leyonet` | reporting program |
| `SSHFAIL` | identifier of the message (MSGID) |
| `[leyonet@32473 …]` | structured data; 32473 is the number for examples (RFC 5612) |
| rest | text of the message |

Severities: 0 emergency, 1 alert, 2 critical, 3 error, 4 warning, 5 notice, 6 informational, 7 debug.

## In leyoNET

- **Syslog server:** computer → Advanced … → Services → Syslog, switch on “Syslog server”. The list of messages is shown there too.
- **Reporting:** routers, firewalls and switches (with a management address) in the “Protection” tab or with `logging host 192.168.10.50`; computers under Services → Syslog.
- Reported are SSH logins (`SSHLOGIN`, `SSHFAIL`), port security (`PORTSEC`), DHCP snooping (`DHCPSNOOP`) and the guard's warnings (`ARPSPOOF`, `SYNFLOOD`, `PORTSCAN`).
- In the packet list: filter `udp.port == 514`, the hex view shows the text.

> Syslog over UDP is neither encrypted nor acknowledged: if a packet is lost, the message is missing. For sensitive networks there is syslog over TLS (RFC 5425).
