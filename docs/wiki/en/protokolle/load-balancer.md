---
titel: Load balancer
kurz: A load balancer spreads the clients' connections over several identical servers and takes failed ones out of the game.
---
## What for?

A single web server has limits: it handles only so many requests, and if it fails, the site is gone. If you set up several identical servers, someone has to distribute the clients. That is the **load balancer**: clients only know its address (e.g. via DNS `www.firma.example`), and it passes each connection to one of the servers behind it.

## Methods

| Method | How | Good for |
|---|---|---|
| Round robin | in turn | equally strong servers, short requests |
| Least connections | to the server with the fewest open connections | requests of different length |
| Source hash | by the client's address | sessions that must stay with the same server |

## Health checks

The load balancer regularly checks whether the servers answer, here every 2 s with a TCP connection setup. After two failures a server counts as down and gets no new connections, after two successes it is back. Clients notice nothing of the failure.

## Reverse proxy on layer 4

leyoNET works like HAProxy in TCP mode: the load balancer accepts the client's TCP connection itself and opens a **second connection** to the chosen server. In between it passes the data on unchanged. That is why the server sees the load balancer as the sender, not the client. Real layer 7 load balancers put the client address into an HTTP header for this (e.g. «X-Forwarded-For»).

The load balancer itself is thus a single point that can fail. Large networks therefore have two that share an address, as with [[vrrp]].

## In leyoNET

In the shop under **Servers → Load balancer** (ready configured) or on a server under **Services → Load balancer**: port, method, health check and the servers behind it. In the simulation the table shows «up» or «down», open and total connections for each server. The packet list shows two TCP connections per request; the web server reports the load balancer as the client in its console.
