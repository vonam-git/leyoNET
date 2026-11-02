import { describe, expect, it } from 'vitest';
import { eui64, formatIp6, isLinkLocal6, linkLocal, multicastMac6, networkOf6, normalizeIp6, parseCidr6, parseIp6, solicitedNode } from './ipv6';

describe('IPv6-Adressen', () => {
  it('liest und schreibt nach RFC 5952', () => {
    expect(normalizeIp6('2001:0DB8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8::1');
    expect(normalizeIp6('2001:db8:0:0:1:0:0:1')).toBe('2001:db8::1:0:0:1');
    expect(normalizeIp6('2001:db8:0:1:1:1:1:1')).toBe('2001:db8:0:1:1:1:1:1');
    expect(normalizeIp6('::')).toBe('::');
    expect(normalizeIp6('::1')).toBe('::1');
    expect(normalizeIp6('fe80::1%eth0')).toBe('fe80::1');
    expect(normalizeIp6('::ffff:192.0.2.1')).toBe('::ffff:c000:201');
  });

  it('weist ungültige Adressen ab', () => {
    for (const bad of ['2001:db8', '2001::db8::1', '12345::', 'g::1', '1:2:3:4:5:6:7:8:9', '192.168.1.1', '']) expect(parseIp6(bad), bad).toBeNull();
  });

  it('Präfix und Netz', () => {
    const c = parseCidr6('2001:db8:1:2::abcd/64')!;
    expect(c.prefix).toBe(64);
    expect(formatIp6(networkOf6(c.address, c.prefix))).toBe('2001:db8:1:2::');
    expect(parseCidr6('2001:db8::1')!.prefix).toBe(64);
    expect(parseCidr6('2001:db8::1/129')).toBeNull();
  });

  it('EUI-64, Link-Local und Solicited-Node aus der MAC', () => {
    expect(formatIp6(eui64('02:00:00:00:01:00'))).toBe('::ff:fe00:100');
    expect(formatIp6(linkLocal('02:00:00:00:01:00'))).toBe('fe80::ff:fe00:100');
    expect(formatIp6(linkLocal('00:1A:2B:3C:4D:5E'))).toBe('fe80::21a:2bff:fe3c:4d5e');
    expect(isLinkLocal6(linkLocal('02:00:00:00:01:00'))).toBe(true);
    expect(formatIp6(solicitedNode(parseIp6('2001:db8::ab:cdef')!))).toBe('ff02::1:ffab:cdef');
    expect(multicastMac6(parseIp6('ff02::1:ffab:cdef')!)).toBe('33:33:FF:AB:CD:EF');
  });
});
