---
titel: Telephony over IP (SIP and RTP)
kurz: How an IP phone sets up a call (SIP, SDP), carries the voice (RTP with G.711) and how quality is measured (loss, delay, jitter).
---
## Two protocols, two jobs

A phone call over the data network needs two things: someone has to **set up** the call (who calls whom, where is the other phone, which codec?) and then the **voice** has to flow. There are two protocols for this:

| Job | Protocol | Transport |
|---|---|---|
| Register, call, hang up | SIP (RFC 3261) with SDP (RFC 8866) | UDP 5060, text like HTTP |
| Voice | RTP (RFC 3550) | UDP, here port 4000, one packet every 20 ms |

## Phone system

The phone system (in leyoNET a service on a server) is **registrar** and **proxy**. At startup each phone registers with `REGISTER`: “Number 201 can be reached at 192.168.1.21.” When someone calls 201, the phone system looks it up and forwards the request. Without a phone system a phone can also call an IP address directly.

## How a call works

```
Phone 201           Phone system           Phone 202
   │── INVITE (SDP) ───▶│── INVITE (SDP) ───▶│
   │◀── 180 Ringing ────│◀── 180 Ringing ────│   ringing
   │◀── 200 OK (SDP) ───│◀── 200 OK (SDP) ───│   answered
   │── ACK ────────────▶│── ACK ────────────▶│
   │◀═══════════ RTP (voice, both directions) ═════════════▶│
   │── BYE ────────────▶│── BYE ────────────▶│   hung up
   │◀── 200 OK ─────────│◀── 200 OK ─────────│
```

The INVITE and the 200 OK carry an **SDP** part: `c=IN IP4 192.168.1.21` (where the voice should go), `m=audio 4000 RTP/AVP 0` (port and payload type 0 = G.711 µ-law). The responses find their way back via the **Via** lines.

## Voice with RTP

G.711 (ITU-T) samples the voice 8000 times per second, one byte per sample: 64 kbit/s. Every 20 ms a packet with 160 bytes of voice is created. The RTP header (12 bytes) carries:

| Field | Meaning |
|---|---|
| Version, payload type | 2, type 0 = PCMU (G.711 µ-law, RFC 3551) |
| Sequence number | +1 per packet: the receiver detects loss and reordering |
| Timestamp | +160 per packet (samples): when it was spoken |
| SSRC | identifier of the source |

With all headers (RTP 12, UDP 8, IP 20, Ethernet 18 bytes) a call needs about **87 kbit/s per direction**, not 64.

## Quality

| Measure | good | poor | Why |
|---|---|---|---|
| One-way delay | up to 150 ms (ITU-T G.114) | over 400 ms | people talk over each other |
| Loss | up to 1 % | over 5 % | syllables are missing |
| Jitter | up to 30 ms | over 60 ms | the phone's buffer runs empty or overflows |

**Jitter** is the variation of the delay. RFC 3550 calculates it continuously: J = J + (|D| − J) / 16, where D is the difference in delay between two consecutive packets. After the call a phone shows all three values.

When a line is congested, voice suffers first: it waits behind large data packets. [[qos]] helps.

## In leyoNET

- Phone: settings → Telephony: number and address of the phone system. Command line: `call 202`, `call 192.168.1.22`, `hangup`.
- Server: settings → Telephony → “Enable phone system”; in the simulation the registered numbers are listed there.
- Packet list: filter `sip` or `rtp`; the bytes show the SIP text and the RTP header.
- Check “Phone call”, optionally under load.
