---
titel: Data rate, throughput and delay
kurz: Bits and bytes, kilo and kibi, why 1 Gbit/s never gives 125 MB/s of payload and what makes up the delay of a packet.
---
## Bits, bytes and prefixes

Data rates count **bits per second** (bit/s), file sizes usually **bytes** (1 byte = 8 bits). For data rates the prefixes always mean powers of ten: 1 Gbit/s = 1,000,000,000 bit/s. For storage there are also powers of two with “i”: 1 KiB = 1024 bytes, 1 MiB = 1024 KiB.

Example: a file of 100 MB over a 100 Mbit/s line takes at least 100 · 8 / 100 = 8 seconds.

## Data rate and throughput

The **data rate** of the line (e.g. 1000BASE-T: 1 Gbit/s according to IEEE 802.3) counts all bits, including preamble, headers and gaps. The **throughput** of payload is lower. With full Ethernet frames carrying TCP over IPv4:

| Part | Bytes |
|---|---|
| Preamble and SFD | 8 |
| Ethernet header and FCS | 18 |
| IPv4 and TCP header | 40 |
| Payload (MSS) | 1460 |
| Gap (IFG) | 12 |
| **total on the wire** | **1538** |

1460 / 1538 ≈ 95 %: of 1 Gbit/s about 949 Mbit/s remain for the application. Small packets (e.g. voice in IP telephony) have a much larger share of headers.

## Delay (latency)

The time until a packet arrives consists of four parts:

1. **Serialisation:** putting the bits on the line. 1538 bytes at 1 Gbit/s take 12.3 µs, at 10 Mbit/s 1.2 ms.
2. **Propagation:** the signal in the cable, about 5 µs per kilometre (roughly two thirds of the speed of light).
3. **Processing:** the device reads the header and decides (switch, router).
4. **Queuing:** waiting when the output is busy. This is where quality of service comes in.

`ping` shows the **round-trip time** (RTT): there and back. **Jitter** means the delay varies; for voice and video it matters more than the delay itself.

## In leyoNET

On layer 1 the packet details show the data rate of the medium and the bytes on the wire including preamble and gap. The simulation computes with delays per medium; slow motion and single step make visible where a packet is right now.
