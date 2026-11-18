---
titel: Class network in the classroom
kurz: Every group builds a site and connects it to your infrastructure; the dashboard on the projector shows live who is really online.
---
## The idea

Instead of everyone working alone on a network, the class becomes one network: every group builds its **site** (router, switch, PCs) and connects it to the shared **class infrastructure**, a provider and a head office with a web server. Whoever sets up addresses, default route and NAT correctly is online. The projector shows it to everyone.

## What is a seat, what is its goal?

A **seat** is a site in the class network, like a branch office of a company, built by one person or group. The seat number (1–62) determines the addresses. The **goal of every seat** is always the same: the site is connected to the provider, reaches the hub, and the hub reaches the site (“online” on the dashboard). The class network exercises build on this:

| Exercise | Goal of the seat | Dashboard |
|---|---|---|
| Connect the site to the hub | uplink, WAN address, default route, NAT; the PC opens the hub's web page | online |
| Site with DHCP and the hub's name | additionally DHCP on the router with the hub's DNS; opens zentrale.verbund.example | online |
| Publish your own web server in the class network | additionally port forwarding, the hub opens the site's web page | services reachable |
| Troubleshooting a federation site | finished site with 5 faults, different at every seat; find and fix them all | faults fixed n/5, then done |

| Seat n | Transit network | WAN address | Provider (gateway) |
|---|---|---|---|
| 1 | 203.0.113.4/30 | 203.0.113.6 | 203.0.113.5 |
| 2 | 203.0.113.8/30 | 203.0.113.10 | 203.0.113.9 |
| n | 203.0.113.(4·n)/30 | 203.0.113.(4·n+2) | 203.0.113.(4·n+1) |

In the template the hub (198.51.100.10) has a web page and is the DNS server for `zentrale.verbund.example` and `www.verbund.example`.

## Running it in a lesson

1. Admin console → class → “Enable class network”, “Load template”.
2. Learners join with the class code, their **seat number** and a group (e.g. “Team Red”).
3. On the router: section “Class network” → “Connect to the class infrastructure”, then “Fill in addresses”. Every seat *n* gets its own transit network 203.0.113.(4·n)/30.
4. Open the **dashboard** (admin console → class → dashboard), full screen on the projector.

Every 20 seconds the dashboard computes the whole network in your browser and checks by ping and web page: not connected, connected, online, services reachable, done. Nobody can report “done” – only what works turns green. Messages between sites fly across the map as a dot of light.

## Teaching notes

- **Tell the class in two sentences at the start:** “We are a company, I am the head office, you are the branches. Your branch is done when it is green on the projector.” Show the box “Your seat in the class network” and the steps in it.
- The first quarter of an hour belongs to connecting: the class sees live how one site after another turns green. That motivates.
- Then the class network exercises in the catalog, e.g. publishing your own web server via port forwarding ([[nat]]). Every class network exercise shows the box “Your seat in the class network” in the task window, with seat number, transit network, WAN address, provider and hub for exactly this seat, and states the goal in one sentence.
- Troubleshooting together: clicking a site in the dashboard shows its network, the class helps find the mistake.
- **Troubleshooting race:** Everyone opens «Troubleshooting a federation site». Each seat has 5 different faults, so copying does not help. On the projector five boxes fill up per site («faults fixed n/5»); whoever has them all turns green.

In detail: [class network](https://github.com/vonam-git/leyoNET/blob/main/docs/verbund.md) (in German).
