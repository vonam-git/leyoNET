import { describe, expect, it } from 'vitest';
import { Simulation, dissect, protocolOf, type Topology } from '../core';
import { setLocale } from '../i18n';
import { CATALOG } from './catalog';
import { solveLab2, solveLab4, solveLab5, solveRouting1, solveRouting2, solveSub1 } from './catalogM129';

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

describe('Arbeitsblatt M129 Protokollanalyse: TTL und Netzscan', () => {
  it('TTL 1 und 2 laufen ab, TTL 3 reicht bis zum Webserver News; Time Exceeded ist Typ 11', () => {
    const t = start('m129-lab-a1');
    const pc = byName(t, 'PC W11');
    const run = (ttl: number) => {
      const sim = new Simulation(t);
      sim.runUntil(4000);
      sim.runCommand(pc, `ping -n 1 -i ${ttl} 198.51.100.10`);
      sim.runUntil(20_000);
      return { sim, lines: sim.getDeviceState(pc).console };
    };
    expect(run(1).lines.find((l) => l.code === 'ping.ttlExpiredSet')?.params).toMatchObject({ from: '192.168.1.1' });
    const second = run(2);
    expect(second.lines.find((l) => l.code === 'ping.ttlExpiredSet')?.params).toMatchObject({ from: '203.0.113.1' });
    expect(run(3).lines.some((l) => l.code === 'ping.reply')).toBe(true);
    const error = second.sim.getPacketLog().find((e) => e.frame.payload.kind === 'ipv4' && e.frame.payload.payload.kind === 'icmp' && e.frame.payload.payload.type === 'timeExceeded')!;
    expect(dissect(error.frame).bytes[14 + 20]).toBe(11);
  });

  const scan = (t: Topology, from: string, request: { target: string; skipDiscovery?: boolean; ports?: number[]; discoverOnly?: boolean }) => {
    const sim = new Simulation(t);
    sim.runUntil(10_000);
    expect(sim.scan(byName(t, from), request)).toBeNull();
    sim.runUntil(60_000);
    const state = sim.getDeviceState(byName(t, from)).scan!;
    expect(state.status).toBe('done');
    return state.hosts;
  };
  const open = (h: { ports: { port: number; state: string }[] } | undefined) => h?.ports.filter((p) => p.state === 'open').map((p) => p.port);

  it('Auftrag 4: vier Geräte, unerwarteter Webserver auf 192.168.1.100, vier offene Ports in der DMZ; Lösung schliesst sie', () => {
    const t = start('m129-lab-a4');
    const hosts = scan(t, 'PC W11', { target: '192.168.1.0/24' });
    expect(hosts.map((h) => h.ip)).toEqual(['192.168.1.1', '192.168.1.2', '192.168.1.11', '192.168.1.100']);
    expect(hosts.filter((h) => open(h)!.includes(80)).map((h) => h.ip)).toEqual(['192.168.1.100']);
    expect(open(scan(t, 'PC W11', { target: '10.10.1.20' })[0])).toEqual([25, 80, 110, 143]);
    expect(open(scan(solveLab4(t), 'PC W11', { target: '10.10.1.20' })[0])).toEqual([80]);
  });

  it('Auftrag 5: von aussen vier Ports offen, 443 gefiltert; nach der Lösung nur 25 und 80', () => {
    const t = start('m129-lab-a5');
    const outside = (x: Topology) => scan(x, 'Prüfgerät', { target: '203.0.113.2', skipDiscovery: true })[0]!;
    expect(open(outside(t))).toEqual([25, 80, 110, 143]);
    expect(outside(t).ports.find((p) => p.port === 443)?.state).toBe('filtered');
    expect(open(outside(solveLab5(t)))).toEqual([25, 80]);
  });
});
