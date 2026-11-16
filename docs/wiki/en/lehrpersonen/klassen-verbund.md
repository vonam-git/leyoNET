---
titel: Class network in the classroom
kurz: Every group builds a site and connects it to your infrastructure; the dashboard on the projector shows live who is really online.
---
## The idea

Instead of everyone working alone on a network, the class becomes one network: every group builds its **site** (router, switch, PCs) and connects it to the shared **class infrastructure**, a provider and a head office with a web server. Whoever sets up addresses, default route and NAT correctly is online. The projector shows it to everyone.

## Running it in a lesson

1. Admin console → class → “Enable class network”, “Load template”.
2. Learners join with the class code, their **seat number** and a group (e.g. “Team Red”).
3. On the router: section “Class network” → “Connect to the class infrastructure”, then “Fill in addresses”. Every seat *n* gets its own transit network 203.0.113.(4·n)/30.
4. Open the **dashboard** (admin console → class → dashboard), full screen on the projector.

Every 20 seconds the dashboard computes the whole network in your browser and checks by ping and web page: not connected, connected, online, services reachable, done. Nobody can report “done” – only what works turns green. Messages between sites fly across the map as a dot of light.

## Teaching notes

- The first quarter of an hour belongs to connecting: the class sees live how one site after another turns green. That motivates.
- Then the class network exercises in the catalog, e.g. publishing your own web server via port forwarding ([[nat]]). Every class network exercise shows the box “Your seat in the class network” in the task window, with seat number, transit network, WAN address, provider and hub for exactly this seat, and states the goal in one sentence.
- Troubleshooting together: clicking a site in the dashboard shows its network, the class helps find the mistake.

In detail: [class network](https://github.com/vonam-git/leyoNET/blob/main/docs/verbund.md) (in German).
