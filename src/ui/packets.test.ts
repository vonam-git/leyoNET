import { describe, expect, it } from 'vitest';
import { Simulation } from '../core';
import { NetBuilder } from '../core/sim/testing';
import { setLocale } from '../i18n';
import { parseFilter, tcpConversation, tcpStreams } from './packets';

setLocale('de');

describe('Paketfilter: TCP-Verbindungen', () => {
  it('tcp.stream zeigt die ganze Verbindung, mit Aufbau, Daten und Abbau', () => {
    const net = new NetBuilder();
    const pc = net.host('PC', '192.168.1.10');
    const web = net.host('Web', '192.168.1.80');
    const sw = net.add('switch', 'S');
    net.link(pc, sw);
    net.link(web, sw);
    net.webServer(web, { '/index.html': '<p>Hallo</p>' });
    const sim = new Simulation(net.topology);
    sim.browse(pc, 'http://192.168.1.80/');
    sim.runUntil(8000);
    const log = sim.getPacketLog();
    const streams = tcpStreams(log);
    expect(streams.size).toBe(1);
    const filter = parseFilter('tcp.stream == 0');
    expect(filter.ok).toBe(true);
    const shown = log.filter((e) => filter.test!(e, net.topology, streams));
    expect(shown.length).toBeGreaterThan(5);
    expect(shown.every((e) => e.frame.payload.kind === 'ipv4' && e.frame.payload.payload.kind === 'tcp')).toBe(true);
    const conv = tcpConversation(log, [...streams.keys()][0]!);
    expect(conv).toMatchObject({ handshake: true, fin: true, reset: false });
    expect(conv.data).toBeGreaterThan(0);
    const syn = parseFilter('tcp.flags.syn == 1 and not tcp.flags.ack == 1');
    expect(log.filter((e) => syn.test!(e, net.topology, streams)).length).toBeGreaterThan(0);
    expect(parseFilter('tcp.stream == x').ok).toBe(false);
    expect(parseFilter('vxlan or lacp').ok).toBe(true);
  });
});
