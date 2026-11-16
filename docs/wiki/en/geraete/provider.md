---
titel: Internet (provider)
kurz: Stands for the provider and the rest of the internet: public addresses, routing between customers, DNS, CGNAT and DS-Lite.
---
## What for

The “Internet” device replaces everything behind the connection: the provider with its routers and the rest of the internet. It routes between its interfaces like a router and behaves like a real provider: it does not forward **private addresses** (RFC 1918). Anyone who wants to reach the internet therefore needs [[nat]].

## Interfaces and addresses

Every interface of the provider leads to a customer, usually with a small **transit network** (/30): one address for the provider, one for the customer. Public example addresses come from the documentation networks according to RFC 5737 (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24).

## Special functions

- **CGNAT:** the provider gives customers addresses from 100.64.0.0/10 and translates once more itself because public IPv4 addresses are scarce ([[nat]]).
- **AFTR for DS-Lite:** it receives IPv4 in the IPv6 tunnel and translates it ([[ds-lite]]).
- **Provider for the class network:** in the teacher’s infrastructure an internet device is the connection point of all sites ([[klassen-verbund]]).
