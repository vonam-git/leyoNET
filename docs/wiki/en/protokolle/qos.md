---
titel: Quality of Service (DiffServ, 802.1p)
kurz: Prefer important traffic when a line is full: DSCP in the IP header, PCP in the VLAN tag, priority queues.
---
## When QoS helps

As long as a line has enough bandwidth, every packet gets through immediately and QoS changes nothing. But when more arrives than a port can send (typically: fast LAN, slow WAN line), packets have to **wait**. A queue without rules treats all of them the same: voice waits behind large data packets and is lost when the queue is full (**tail drop**). QoS makes sure important traffic goes first. It does not create more bandwidth.

## Marking: DSCP and PCP

With Differentiated Services (DiffServ, architecture RFC 2475) the sender or the first network device marks each packet, and the devices along the way treat it according to that marking.

| Where | Field | Size | Standard |
|---|---|---|---|
| IPv4 header, byte 2 (formerly TOS) | DSCP | 6 bits (0–63) + 2 bits ECN | RFC 2474, RFC 3168 |
| IPv6 header | Traffic Class | same as IPv4 | RFC 2474 |
| 802.1Q tag (trunks only) | PCP | 3 bits (0–7) | IEEE 802.1Q |

Recommended classes according to RFC 4594:

| Traffic | DSCP | Value | PCP |
|---|---|---|---|
| Network control (routing) | CS6 | 48 | 6 |
| Telephony (voice) | EF (RFC 3246) | 46 | 5 |
| Signalling (SIP) | CS5 | 40 | 5 |
| Video, conferencing | AF41 (RFC 2597) | 34 | 4 |
| Business data | AF21 | 18 | 2 |
| Normal | Default (best effort) | 0 | 0 |
| Background | CS1 | 8 | 1 |

The **class selectors** (CS0–CS7) are compatible with the old IP precedence values: the top three bits of the DSCP give the class. This is how a switch maps DSCP to PCP: EF = 101110 → 101 = 5.

{{format ipv4}}

## Queues

A device with QoS has several queues per port. With **strict priority** (priority queuing) it always sends from the most important non-empty queue first. That is ideal for voice, which needs little bandwidth but cannot tolerate delay. For a lot of high-class traffic, devices additionally use weighted methods (e.g. weighted fair queuing) so that the lower classes do not starve.

**Trust:** a switch port to a PC should not accept markings, otherwise anyone could mark their traffic as “voice”. Without trust, the device resets the DSCP of incoming packets to 0.

## In leyoNET

- Router, switch, layer 3 switch, firewall: settings → **QoS**. “Enable QoS” activates four strict-priority queues: voice (EF), signalling and network control (CS5–CS7), preferred data (AF, CS2–CS4), best effort.
- **Bandwidth per port** (e.g. `2M`): congestion only happens there; without an entry the port sends at unlimited speed. At most 40 frames per queue, then tail drop (in the packet list: “dropped (queue full)”).
- IP phones mark voice with EF and SIP with CS5; `iperf -c <IP> -u -b 4M` on a PC generates load.
- On trunks the 802.1Q tag carries the PCP derived from the DSCP; the bytes show both.
