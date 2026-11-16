/**
 * Länge eines Rahmens auf der Leitung in Bytes (Ethernet mit FCS, mindestens 64 Bytes), für die
 * Sendezeit an Ports mit begrenzter Bandbreite. Genau für die Pakete, die dort zählen (RTP,
 * iperf, TCP, ICMP); Steuerpakete werden geschätzt.
 */
import type { EthernetFrame, UdpDatagram } from './frames';
import { RTP_PAYLOAD_BYTES } from './frames';

function udpApp(d: UdpDatagram): number {
  const m = d.payload;
  if (m.kind === 'rtp') return 12 + RTP_PAYLOAD_BYTES;
  if (m.kind === 'data') return m.bytes;
  if (m.kind === 'sip') return m.sdp ? 600 : 400;
  if (m.kind === 'dhcp') return 300;
  if (m.kind === 'vxlan') return 8 + frameBytes(m.frame) - 4;
  return 80;
}

export function frameBytes(frame: EthernetFrame): number {
  const header = 14 + 4 + (frame.vlan !== undefined ? 4 : 0);
  const p = frame.payload;
  let body = 46;
  if (p.kind === 'ipv4' || p.kind === 'ipv6') {
    const ip = p.kind === 'ipv4' ? 20 : 40;
    const inner = p.payload;
    if (inner.kind === 'udp') body = ip + 8 + udpApp(inner);
    else if (inner.kind === 'tcp') body = ip + 20 + inner.data.length;
    else if (inner.kind === 'icmp' || inner.kind === 'icmpv6') body = ip + 8 + 32;
    else body = ip + 60;
  } else if (p.kind === 'arp') body = 28;
  return Math.max(64, header + body);
}
