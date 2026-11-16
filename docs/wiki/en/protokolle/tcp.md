---
titel: TCP
kurz: Reliable connections between programs: ports, three-way handshake, sequence and acknowledgement numbers, retransmission and teardown.
---
## Ports

IP brings a packet to the right device, **ports** to the right program. A web server waits on port 80, SSH on 22, SMTP on 25. The client chooses a free port from 49152. A connection is uniquely identified by source, destination and both ports.

## Three-way handshake

| Step | Flags | Meaning |
|---|---|---|
| 1 | SYN | client: “I want to connect, my initial number is x” |
| 2 | SYN, ACK | server: “Agreed, mine is y, I expect x+1” |
| 3 | ACK | client: “I expect y+1” – the connection is up |

## The TCP header

Without options 20 bytes. The first segment (SYN) usually carries the MSS option, then the header is 24 bytes long. Values from the HTTP request of the demo “DNS, TCP and HTTP”.

{{format tcp}}

## Reliability

Every byte has a **sequence number**. The receiver acknowledges with the **ACK number** which byte it expects next. If the acknowledgement is missing, the sender retransmits. Large data is split into **segments** (MSS 1460 bytes on Ethernet). Teardown starts with a **FIN**, each side acknowledges; an **RST** aborts immediately, e.g. if nobody is waiting on the port.

## In leyoNET

Open a web page in a PC’s browser, then filter the packet list with `tcp`. Clicking a packet and “Follow TCP stream” shows all segments of the connection. `netstat` on the command line lists open connections.
