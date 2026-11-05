import { describe as group, expect, it } from 'vitest';
import { addDnsRecord, setDnsForwarder } from '../model/topology';
import { answerFromZone, checkDnsRecord, normalizeRecord, reverseName } from '../net/dns';
import type { DnsServerConfig } from '../model/types';
import { Simulation } from './simulation';
import { NetBuilder, unwrap } from './testing';

/**
 * Schulnetz: Client, Schul-DNS und Webserver an einem Switch; der Schul-DNS
 * leitet unbekannte Namen an den DNS-Server des Providers hinter einem Router weiter.
 */
function network({ forward = true } = {}) {
  const net = new NetBuilder();
  const client = net.host('Client', '192.168.0.10', '24', '192.168.0.1');
  net.setDns(client, '192.168.0.2');
  const dns = net.host('DNS', '192.168.0.2', '24', '192.168.0.1');
  const web = net.host('Web', '192.168.0.3', '24', '192.168.0.1');
  const provider = net.host('Provider-DNS', '198.51.100.53', '24', '198.51.100.1');
  const router = net.router('R1', ['192.168.0.1/24', '198.51.100.1/24']);
  const sw = net.add('switch', 'S1');
  for (const id of [client, dns, web, router]) net.link(id, sw);
  net.link(provider, router);
  net.dnsRecord(dns, 'web.schule.example', 'A', '192.168.0.3');
  net.dnsRecord(dns, 'www.schule.example', 'CNAME', 'web.schule.example');
  net.dnsRecord(dns, 'intranet.schule.example', 'CNAME', 'www.schule.example');
  net.dnsRecord(dns, 'schule.example', 'MX', 'mail2.schule.example', { priority: 20 });
  net.dnsRecord(dns, 'schule.example', 'MX', 'mail1.schule.example', { priority: 5 });
  net.dnsRecord(dns, 'schule.example', 'TXT', 'v=spf1 mx -all');
  net.dnsRecord(dns, 'schule.example', 'NS', 'dns.schule.example');
  net.dnsRecord(dns, reverseName('192.168.0.3')!, 'PTR', 'web.schule.example');
  net.dnsRecord(dns, 'cdn.schule.example', 'CNAME', 'shop.provider.example');
  net.dnsRecord(provider, 'shop.provider.example', 'A', '198.51.100.53', { ttl: 120 });
  if (forward) net.apply((t) => setDnsForwarder(t, dns, '198.51.100.53'));
  return { net, client, dns, web, provider };
}

const consoleOf = (sim: Simulation, id: string, prefix: string) => sim.getDeviceState(id).console.filter((l) => l.code.startsWith(prefix));

group('DNS-Zone: Regeln und Antworten', () => {
  const zone: DnsServerConfig = {
    records: [
      { name: 'a.example', type: 'A', value: '192.0.2.1', ttl: 60 },
      { name: 'b.example', type: 'CNAME', value: 'a.example', ttl: 60 },
      { name: 'c.example', type: 'CNAME', value: 'b.example', ttl: 60 },
      { name: 'x.example', type: 'CNAME', value: 'y.example', ttl: 60 },
      { name: 'y.example', type: 'CNAME', value: 'x.example', ttl: 60 },
    ],
  };

  it('folgt CNAME-Ketten, meldet NODATA und NXDOMAIN, bricht Schleifen ab', () => {
    expect(answerFromZone(zone, 'c.example', 'A')).toMatchObject({ kind: 'answer', records: [{ type: 'CNAME', name: 'c.example' }, { type: 'CNAME', name: 'b.example' }, { type: 'A', value: '192.0.2.1' }] });
    expect(answerFromZone(zone, 'a.example', 'AAAA')).toEqual({ kind: 'nodata', records: [] });
    expect(answerFromZone(zone, 'nirgends.example', 'A')).toEqual({ kind: 'unknown', records: [] });
    expect(answerFromZone(zone, 'x.example', 'A').kind).toBe('nodata');
    expect(answerFromZone(zone, 'b.example', 'CNAME')).toMatchObject({ kind: 'answer', records: [{ value: 'a.example' }] });
  });

  it('prüft Einträge je Typ und die CNAME-Regel', () => {
    const add = (r: Parameters<typeof checkDnsRecord>[1]) => checkDnsRecord(zone, r)?.code ?? null;
    expect(add({ name: 'v6.example', type: 'AAAA', value: '2001:db8::1', ttl: 60 })).toBeNull();
    expect(add({ name: 'v6.example', type: 'AAAA', value: '192.0.2.1', ttl: 60 })).toBe('invalidAaaa');
    expect(add({ name: 't.example', type: 'TXT', value: 'x'.repeat(256), ttl: 60 })).toBe('dnsTxt');
    expect(add({ name: 'a.example', type: 'CNAME', value: 'z.example', ttl: 60 })).toBe('cnameConflict');
    expect(add({ name: 'b.example', type: 'TXT', value: 'hallo', ttl: 60 })).toBe('cnameConflict');
    expect(add({ name: 'm.example', type: 'MX', value: 'mail.example', priority: 70_000, ttl: 60 })).toBe('dnsPriority');
    expect(add({ name: 's.example', type: 'CNAME', value: 's.example', ttl: 60 })).toBe('cnameLoop');
    expect(normalizeRecord({ name: 'V6.Example.', type: 'AAAA', value: '2001:0DB8:0000::0001', ttl: 60 })).toEqual({ name: 'v6.example', type: 'AAAA', value: '2001:db8::1', ttl: 60 });
    expect(normalizeRecord({ name: 'm.example', type: 'MX', value: 'Mail.Example', ttl: 60 }).priority).toBe(10);
  });

  it('Namen für die Rückwärtsauflösung (in-addr.arpa, ip6.arpa)', () => {
    expect(reverseName('192.168.1.10')).toBe('10.1.168.192.in-addr.arpa');
    expect(reverseName('2001:db8::1')).toBe('1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa');
    expect(reverseName('kein-ip')).toBeNull();
  });
});

group('DNS in der Simulation', () => {
  it('nslookup mit Typen: A über CNAME-Kette, MX nach Vorrang, TXT, NS, PTR, NODATA', () => {
    const { net, client } = network();
    const sim = new Simulation(net.topology);
    for (const cmd of ['nslookup intranet.schule.example', 'nslookup -type=MX schule.example', 'nslookup -type=TXT schule.example', 'nslookup -type=NS schule.example', 'nslookup 192.168.0.3', 'nslookup -type=AAAA web.schule.example', 'nslookup -type=SOA schule.example']) {
      sim.runCommand(client, cmd);
      sim.runUntilIdle();
    }
    const lines = consoleOf(sim, client, 'nslookup.').map((l) => [l.code, l.params]);
    expect(lines).toContainEqual(['nslookup.answer', { name: 'web.schule.example', ip: '192.168.0.3' }]);
    expect(lines).toContainEqual(['nslookup.aliases', { names: 'intranet.schule.example, www.schule.example' }]);
    const mx = lines.filter(([c]) => c === 'nslookup.mx').map(([, p]) => (p as { value: string }).value);
    expect(mx).toEqual(['mail1.schule.example', 'mail2.schule.example']);
    expect(lines).toContainEqual(['nslookup.txt', { name: 'schule.example', value: 'v=spf1 mx -all' }]);
    expect(lines).toContainEqual(['nslookup.ns', { name: 'schule.example', value: 'dns.schule.example' }]);
    expect(lines).toContainEqual(['nslookup.ptr', { name: '3.0.168.192.in-addr.arpa', value: 'web.schule.example' }]);
    expect(lines.find(([c]) => c === 'nslookup.nodata')?.[1]).toMatchObject({ name: 'web.schule.example', type: 'AAAA' });
    expect(lines.find(([c]) => c === 'nslookup.badType')?.[1]).toMatchObject({ type: 'SOA' });
    // Aus der eigenen Zone: autorisierend, also kein Hinweis «nicht autorisierend».
    expect(lines.some(([c]) => c === 'nslookup.nonAuthoritative')).toBe(false);
  });

  it('Weiterleitung: unbekannte Namen beim Provider-DNS, nicht autorisierend, danach aus dem Cache des Servers', () => {
    const { net, client, dns } = network();
    const sim = new Simulation(net.topology);
    sim.runCommand(client, 'nslookup cdn.schule.example');
    sim.runUntilIdle();
    let lines = consoleOf(sim, client, 'nslookup.').map((l) => l.code);
    expect(lines).toContain('nslookup.nonAuthoritative');
    expect(consoleOf(sim, client, 'nslookup.answer')[0]?.params).toMatchObject({ name: 'shop.provider.example', ip: '198.51.100.53' });
    expect(consoleOf(sim, dns, 'dnsServer.forward')).toHaveLength(1);

    sim.runCommand(client, 'nslookup cdn.schule.example');
    sim.runUntilIdle();
    expect(consoleOf(sim, dns, 'dnsServer.forward')).toHaveLength(1);
    expect(consoleOf(sim, dns, 'dnsServer.cached')).toHaveLength(1);

    // Ping über einen Namen, den nur der Provider kennt.
    sim.runCommand(client, 'ping cdn.schule.example');
    sim.runUntilIdle();
    lines = consoleOf(sim, client, 'ping.').map((l) => l.code);
    expect(lines.filter((c) => c === 'ping.reply')).toHaveLength(4);
  });

  it('ohne Weiterleitung: NXDOMAIN; Weiterleiter antwortet nicht: SERVFAIL', () => {
    const { net, client } = network({ forward: false });
    const sim = new Simulation(net.topology);
    sim.runCommand(client, 'nslookup shop.provider.example');
    sim.runUntilIdle();
    expect(consoleOf(sim, client, 'nslookup.nxdomain')).toHaveLength(1);
    // Den Provider-DNS direkt fragen geht trotzdem (Server als zweites Argument).
    sim.runCommand(client, 'nslookup shop.provider.example 198.51.100.53');
    sim.runUntilIdle();
    expect(consoleOf(sim, client, 'nslookup.answer').at(-1)?.params).toMatchObject({ ip: '198.51.100.53' });

    const broken = network();
    broken.net.apply((t) => setDnsForwarder(t, broken.dns, '198.51.100.99'));
    const sim2 = new Simulation(broken.net.topology);
    sim2.runCommand(broken.client, 'nslookup shop.provider.example');
    sim2.runUntilIdle();
    expect(consoleOf(sim2, broken.client, 'nslookup.servfail')).toHaveLength(1);
  });

  it('Weiterleitungsschleife (A → B → A) endet mit SERVFAIL statt endlosem Verkehr', () => {
    const { net, client, dns, provider } = network();
    net.apply((t) => setDnsForwarder(t, provider, '192.168.0.2'));
    const sim = new Simulation(net.topology);
    sim.runCommand(client, 'nslookup niemand.example');
    sim.runUntilIdle();
    expect(consoleOf(sim, client, 'nslookup.servfail')).toHaveLength(1);
    expect(consoleOf(sim, provider, 'dnsServer.loop')).toHaveLength(1);
    expect(sim.getPacketLog().length).toBeLessThan(40);
    void dns;
  });

  it('Mail an eine Domain nutzt den MX mit dem kleinsten Vorrang', () => {
    const { net } = network();
    const zone = net.topology.devices.find((d) => d.name === 'DNS')!.dnsServer!;
    expect(answerFromZone(zone, 'schule.example', 'MX')).toMatchObject({ records: [{ value: 'mail1.schule.example' }, { value: 'mail2.schule.example' }] });
  });

  it('Weiterleitung an sich selbst ist nicht erlaubt', () => {
    const { net, dns } = network();
    expect(setDnsForwarder(net.topology, dns, '192.168.0.2')).toMatchObject({ ok: false, error: { code: 'dnsForwarderSelf' } });
    expect(unwrap(addDnsRecord(net.topology, dns, { name: 'neu.schule.example', type: 'AAAA', value: '2001:DB8::10', ttl: 60 })).devices.find((d) => d.id === dns)!.dnsServer!.records.at(-1)).toMatchObject({ value: '2001:db8::10' });
  });
});
