---
titel: Static routing
kurz: Entering routes by hand: destination network, mask and next hop, default route, outbound and return path and the most common mistakes.
---
## A route

A static route tells the router: “You reach network X via neighbour Y.”

```
Router(config)# ip route 192.168.2.0/24 10.0.0.2
Router(config)# ip route 0.0.0.0/0 203.0.113.1
Router# show ip route
```

The second line is the **default route**: everything for which there is no more specific route, usually towards the internet. The next hop must lie in a directly connected network.

## Example with two routers

```text
192.168.1.0/24 — R1 — 10.0.0.0/30 — R2 — 192.168.2.0/24
               .1  .1             .2  .1
```

| Router | Route |
|---|---|
| R1 | 192.168.2.0/24 via 10.0.0.2 |
| R2 | 192.168.1.0/24 via 10.0.0.1 |

Both routes are needed: R1 for the outbound path, R2 for the **return path** of the reply.

## Pros and cons

Static routes are clear, secure and need no computing power. But they hardly react to failures (only a **backup route** steps in, see below), and in large networks every change must be repeated on many routers. There dynamic protocols such as [[ospf]] take over. Companies often have both: OSPF inside, a static default route to the provider.

> Troubleshooting with `tracert`: where does the list stop? The last router that answers does not know the next step.

## Backup route (floating static route)

Every route has an **administrative distance**, static routes normally 1. If you enter the same destination a second time with a larger distance (e.g. 200, on the command line `ip route 0.0.0.0/0 10.0.1.2 200`), the second one is only used when the first disappears: if its interface has no link any more, the router removes it from the table (RFC 1812). The routing table shows `[distance/metric]` for every route.
