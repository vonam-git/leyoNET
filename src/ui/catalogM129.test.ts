import { describe, expect, it } from 'vitest';
import { Simulation, dissect, protocolOf, type Topology } from '../core';
import { setLocale } from '../i18n';
import { CATALOG } from './catalog';
import { solveLab2, solveRouting1, solveRouting2, solveSub1 } from './catalogM129';

setLocale('de');

/** Prüft die Angaben in den Musterlösungen der M129-Arbeitsblätter gegen die Simulation. */
const start = (id: string) => CATALOG.find((e) => e.id === id)!.build().topology;
const byName = (t: Topology, name: string) => t.devices.find((d) => d.name === name)!.id;
const replies = (sim: Simulation, id: string) => sim.getDeviceState(id).console.filter((l) => l.code === 'ping.reply').length;

function pings(t: Topology, from: string, target: string) {
  const sim = new Simulation(t);
  sim.runUntil(3000);
  sim.ping(byName(t, from), target);
  sim.runUntil(sim.now + 10_000);
  return replies(sim, byName(t, from));
}

describe('Arbeitsblatt M129 Routing: Abnahme', () => {
  const net = solveRouting2(solveRouting1(start('m129-routing-a1')));
  it.each([
    ['Router1', '192.168.2.2'],
    ['Router1', '192.168.3.254'],
    ['Router1', '172.16.12.81'],
    ['Router2', '192.168.1.254'],
    ['Router3', '192.168.1.254'],
    ['Router3', '192.168.3.254'],
    ['Router1', '198.51.100.10'],
    ['Router2', '198.51.100.10'],
    ['Router3', '198.51.100.10'],
  ])('%s: ping %s antwortet', (from, target) => {
    expect(pings(net, from, target)).toBe(4);
  });

  it('ohne NAT kommt aus dem LAN keine Antwort aus dem Internet', () => {
    const t = solveRouting1(start('m129-routing-a1'));
    expect(pings(t, 'PC LAN1', '198.51.100.10')).toBe(0);
  });
});

describe('Arbeitsblatt M129 Subnetting', () => {
  it('Lösung von Auftrag 1: alle Abteilungen erreichen sich', () => {
    const t = solveSub1(start('m129-sub-a1'));
    expect(pings(t, 'PC Verwaltung 1', '192.168.40.203')).toBe(4);
  });
});

describe('Arbeitsblatt M129 Protokollanalyse: Zahlen', () => {
  it('ICMP, TTL, DHCP, DNS und HTTP wie in der Musterlösung', () => {
    const t = solveLab2(start('m129-lab-a1'));
    const sim = new Simulation(t);
    sim.runUntil(4000);
    expect(sim.getDeviceState(byName(t, 'Notebook Gast')).address).toMatchObject({ ip: '192.168.1.100', gateway: '192.168.1.1', dns: '192.168.1.2' });
    const dhcp = sim.getPacketLog().find((e) => protocolOf(e.frame) === 'DHCP')!;
    expect(dhcp.frame.payload).toMatchObject({ src: '0.0.0.0', dst: '255.255.255.255', payload: { srcPort: 68, dstPort: 67 } });

    const n = sim.getPacketLog().length;
    sim.ping(byName(t, 'PC W11'), '10.10.1.20');
    sim.runUntil(sim.now + 6000);
    const icmp = sim.getPacketLog().slice(n).filter((e) => protocolOf(e.frame) === 'ICMP');
    const out = icmp.find((e) => e.from.device === byName(t, 'PC W11'))!;
    const dmz = icmp.find((e) => e.from.device === byName(t, 'Firewall') && e.to.device === byName(t, 'Switch DMZ'))!;
    expect(out.frame.payload.kind === 'ipv4' && out.frame.payload.ttl).toBe(64);
    expect(dmz.frame.payload.kind === 'ipv4' && dmz.frame.payload.ttl).toBe(63);
    const w = dissect(out.frame);
    expect([w.bytes[12], w.bytes[13]]).toEqual([0x08, 0x00]);
    expect(w.bytes[14 + 9]).toBe(1);
    expect(w.layers.find((l) => l.protocol === 'ICMP')?.length).toBe(40);

    const m = sim.getPacketLog().length;
    sim.browse(byName(t, 'PC W11'), 'http://web.labor.example/');
    sim.runUntil(sim.now + 6000);
    const query = sim.getPacketLog().slice(m).find((e) => protocolOf(e.frame) === 'DNS' && e.from.device === byName(t, 'PC W11'))!;
    const d = dissect(query.frame);
    expect(d.bytes.length).toBe(81); // 14 Ethernet + 20 IPv4 + 8 UDP + 35 DNS + 4 FCS
    expect(d.layers.find((l) => l.protocol === 'Ethernet II')?.fields.at(-1)?.key).toBe('eth.fcs');
    expect(d.layers.find((l) => l.protocol === 'DNS')?.length).toBe(35);
    expect(sim.getDeviceState(byName(t, 'PC W11')).browser).toMatchObject({ status: 'done', response: { status: 200 } });
  });
});
