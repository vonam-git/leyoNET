---
titel: Server
kurz: The device for services: DHCP, DNS, web server and mail server, also as a rack server in the data centre.
---
## What for

A server provides **services** to other devices. In leyoNET every server can take on one or more of them; they are switched on under Advanced → Services:

| Service | what it does | Page |
|---|---|---|
| DHCP | hands out addresses, gateway and DNS server | [[dhcp]] |
| DNS | translates names into addresses (zone with A, AAAA, MX …) | [[dns]] |
| Web | delivers its own HTML pages and images | [[http]] |
| Mail | mailboxes, sending and fetching | [[e-mail]] |

## Variants

The shop offers the server as a tower and as a **rack server**. Rack servers can be mounted in a rack and appear as a rack unit in the rack view. Technically both are the same.

## Static addresses

Servers usually have a **static address** so clients find them reliably (DNS records, gateway settings). The DHCP range must not contain this address, otherwise a client gets the same address: leyoNET marks duplicate addresses with a red exclamation mark.
