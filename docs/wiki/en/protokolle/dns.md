---
titel: DNS
kurz: Translating names into addresses: zones, records (A, AAAA, CNAME, MX, PTR …), forwarding, cache and nslookup.
---
## What for

People remember `www.schule.example`, devices need `192.168.0.3`. The **Domain Name System** translates names into addresses. Every computer has a DNS server configured for this (static or via DHCP) and asks it before opening a connection.

## Records

| Type | maps | Example |
|---|---|---|
| A | name → IPv4 address | `web.schule.example A 192.168.0.3` |
| AAAA | name → IPv6 address | `web AAAA 2001:db8::3` |
| CNAME | alias → another name | `www CNAME web` |
| MX | domain → mail server (with preference) | `schule.example MX 10 mail` |
| NS | domain → responsible name server | |
| PTR | address → name (reverse lookup) | |
| TXT | free text | |

Every record has a **TTL**: a client may keep the answer in its cache for that long.

## How a query works

1. The browser wants `www.schule.example` and asks the DNS server (UDP, port 53).
2. The server finds `www` as a CNAME for `web` and the A record for it.
3. It answers **authoritatively** with the chain; the client remembers the result.
4. If the server does not know the zone, it **forwards** to another DNS server (e.g. the provider’s) and answers “non-authoritative”.

Example names end in `.example`, a domain that according to RFC 2606 is never assigned.

## In leyoNET

A server becomes a DNS server under Advanced → Services and gets a zone.

```
C:\> nslookup www.schule.example
C:\> nslookup -type=MX schule.example
C:\> nslookup 192.168.0.3
C:\> ipconfig /displaydns
C:\> ipconfig /flushdns
```
