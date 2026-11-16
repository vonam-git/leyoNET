# What leyoNET simplifies (English version of the table in docs/protokolle.md)

The first column must match the German row in docs/protokolle.md exactly; src/wiki/build.ts uses it as the key.

| Row (de) | Protocol | Simplification in the simulation |
|---|---|---|
| Ethernet-PHY, 802.11-Funk, DOCSIS, GPON, DSL, LTE | Ethernet PHY, 802.11 radio, DOCSIS, GPON, DSL, LTE | Description only (medium, rate, modulation); no bit errors except “damaged cable” |
| Ethernet II, 802.1Q | Ethernet II, 802.1Q | With FCS (CRC-32) and padding to 64 bytes; preamble, SFD and gap only as information on layer 1; no jumbo frames |
| VXLAN | VXLAN | Inner Ethernet frame in UDP 4789 with VNI; VTEPs from a fixed list (ingress replication), MAC learning in the data path; no EVPN, no multicast groups |
| LACP | LACP | LACPDU (slow protocols, 0x8809) with actor/partner, short timers (1 s, partner expires after 3 s); no priorities, no marker protocol; distribution by hash of the MAC addresses |
| STP | STP | Shortened timers; ports to end devices forward immediately (like PortFast) |
| ARP, Gratuitous ARP, Proxy-ARP | ARP, gratuitous ARP, proxy ARP | – |
| 802.11 Management, EAPOL | 802.11 management, EAPOL | Authentication, association/reassociation and 4-way handshake as a sequence; no real encryption |
| PPP (LCP, IPCP), Cisco-HDLC | PPP (LCP, IPCP), Cisco HDLC | No authentication on serial lines; FCS-16 in the frame, flags and bit stuffing not (pcap without FCS) |
| PPPoE | PPPoE | Discovery (PADI/PADO/PADR/PADS) and session; login with PAP |
| IPv4 | IPv4 | No fragmentation (MSS 1460 prevents it), no options |
| ICMP | ICMP | Echo, destination unreachable, time exceeded |
| IPv6 | IPv6 | No extension headers, no fragmentation, no flow labels; link-local via EUI-64 (RFC 4291), over Ethernet with multicast MAC 33:33:… (RFC 2464) |
| ICMPv6, Neighbor Discovery | ICMPv6, Neighbor Discovery | Echo, destination unreachable, time exceeded; neighbor and router solicitation/advertisement instead of ARP; no MLD (multicast groups without registration), no redirect; router advertisements every 30 s |
| SLAAC | SLAAC | Address from prefix (/64) and EUI-64; optimistic duplicate address detection (address usable at once, conflicts are reported); no privacy addresses |
| DS-Lite | DS-Lite | IPv4 in IPv6 (next header 4) from the home router (B4) to the AFTR, CGNAT there; tunnel addresses 192.0.0.1/192.0.0.2 internal only |
| OSPFv2 | OSPFv2 | Router LSAs and external LSAs (redistribution), no summary LSAs between areas, no DR/BDR (neighbours like point-to-point); hello 2 s instead of 10 s; a stuck database exchange (lost DBD/LSR/LSU) is repeated after two hello intervals; hellos from a foreign subnet form no adjacency |
| OSPFv3 | OSPFv3 | Like OSPFv2, but over IPv6 (next header 89, ff02::5, link-local source); links instead of networks, router LSAs plus intra-area prefix LSAs, AS external LSAs; checksum over the IPv6 pseudo header; router ID from the MAC without IPv4; no link LSAs, no DR/BDR |
| NAT: PAT, statisches SNAT, DNAT (Portweiterleitung, statisch), 1:1-NAT, CGNAT | NAT: PAT, static SNAT, DNAT (port forwarding, static), 1:1 NAT, CGNAT | Endpoint-independent mapping; no application layer gateways; SNAT and DNAT remember connections for the replies |
| Firewall (Paketfilter) | Firewall (packet filter) | Rules in order, the first match applies, otherwise the default rule; stateful over protocol, addresses and ports (timeout 5 minutes), related ICMP errors may return. Routers filter forwarded packets after DNAT and before SNAT, end devices incoming ones; broadcasts and DHCP replies are exempt |
| IPsec ESP (Tunnelmodus) | IPsec ESP (tunnel mode) | Whole IPv4 packet in ESP (IP protocol 50) between the router addresses; SPI, sequence number and 16-byte ICV in the capture, payload only scrambled (no real encryption); no anti-replay window, no NAT traversal; tunnel traffic bypasses NAT |
| UDP | UDP | – |
| TCP | TCP | Three-way handshake, sequence numbers in bytes, MSS 1460, retransmission after 1 s (at most three times), FIN/RST; fixed window size, no congestion control |
| DHCP | DHCP | Discover/offer/request/ack, relay (giaddr); without an answer the client repeats the discover after 4 s and 8 s (doubling, RFC 2131 section 4.1) and reports “no server” after the third attempt; renewal at half the lease time; fixed assignments (reservation by MAC address, also outside the range); pools on router and layer 3 switch (“ip dhcp pool”, excluded addresses); offer and ack as broadcast (client without address) |
| DHCPv6 | DHCPv6 | Solicit/advertise/request/reply with IA_NA, DUID-LL from the MAC; server in the router (M flag in the router advertisement), addresses from ::100; no relay, no prefix delegation |
| DNS | DNS | Records A, AAAA, CNAME (also chains), MX with preference, TXT, NS, PTR (in-addr.arpa, ip6.arpa); authoritative answers from the zone, forwarding to another DNS server with cache (“non-authoritative”), NXDOMAIN, NODATA and SERVFAIL; client cache by TTL; `nslookup -type=…`. No zone transfer, no DNSSEC, no own recursion via the root servers |
| HTTP/1.1 | HTTP/1.1 | GET, Content-Length in bytes (UTF-8), images as binary data; no HTTPS |
| SMTP, POP3, IMAP | SMTP, POP3, IMAP | Small command set, no authentication via TLS |
| SSH | SSH | Version exchange in plain text, then only encrypted bytes |
| RIP v2 | RIP v2 | Update every 5 s instead of 30 s, timeout 30 s instead of 180 s; split horizon |
| RIPng | RIPng | Like RIP v2 over IPv6: UDP 521 to ff02::9, link-local source, hop limit 255; only updates from link-local sources; no next-hop entries |
| IKEv2 | IKEv2 | IKE_SA_INIT and IKE_AUTH with a real header (SPIs, exchange type, flags); Diffie-Hellman only hinted at, authentication with a pre-shared key as check value; traffic selectors must match mirrored (otherwise TS_UNACCEPTABLE); three attempts of 2 s; no rekeying, no CREATE_CHILD_SA |
| BGP-4 | BGP-4 | Binary over TCP 179: OPEN, KEEPALIVE, UPDATE, NOTIFICATION; path selection by AS path length; no policies |
