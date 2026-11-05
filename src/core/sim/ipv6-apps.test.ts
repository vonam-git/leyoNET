import { describe as group, expect, it } from 'vitest';
import { configureHost6, setCliConfig, setFirewall, setInterfaceDns6, setInterfaceIpv6, setIpMode } from '../model/topology';
import { parseProject, serializeProject } from '../io/project';
import { parseUrl, formatUrl } from '../net/http';
import { dissect } from '../wire/encode';
import { internetChecksum } from '../wire/part';
import { protocolOf } from './protocol';
import { Simulation } from './simulation';
import { NetBuilder, describe as line, unwrap } from './testing';

/**
 * Reines IPv6-Netz: PC (SLAAC, DNS per RDNSS) und DNS-Server im Netz A,
 * Web- und Mailserver im Netz B, dazwischen ein Router mit SSH.
 */
function network(mode: 'ipv6' | 'dual' = 'ipv6') {
  const net = new NetBuilder();
  const pc = net.add('pc', 'PC');
  const dns = net.add('server', 'DNS');
  const web = net.add('server', 'Web');
  const r = net.add('router', 'R1');
  const sw = net.add('switch', 'S1');
  net.link(pc, sw);
  net.link(dns, sw);
  net.link(sw, r);
  net.link(web, r);
  net.apply((t) => setIpMode(t, mode));
  net.apply((t) => setInterfaceIpv6(t, r, 0, '2001:db8:a::1/64'));
  net.apply((t) => setInterfaceIpv6(t, r, 1, '2001:db8:b::1/64'));
  net.apply((t) => setInterfaceDns6(t, r, 0, '2001:db8:a::53'));
  net.apply((t) => setCliConfig(t, r, { ssh: true, users: [{ name: 'admin', password: 'Sicher123' }] }));
  net.apply((t) => configureHost6(t, pc, { auto: true }));
  net.apply((t) => configureHost6(t, dns, { auto: false, address: '2001:db8:a::53/64', gateway: '2001:db8:a::1' }));
  net.apply((t) => configureHost6(t, web, { auto: false, address: '2001:db8:b::80/64', gateway: '2001:db8:b::1', dns: '2001:db8:a::53' }));
  net.dnsRecord(dns, 'www.schule.example', 'AAAA', '2001:db8:b::80');
  net.dnsRecord(dns, 'mail.schule.example', 'AAAA', '2001:db8:b::80');
  net.dnsRecord(dns, 'schule.example', 'MX', 'mail.schule.example');
  net.dnsRecord(dns, 'r1.schule.example', 'AAAA', '2001:db8:a::1');
  net.webServer(web, { '/index.html': '<h1>Hallo IPv6</h1>' });
  net.mailServer(web, 'schule.example', ['anna', 'ben']);
  net.mailAccount(pc, 'anna@schule.example', 'mail.schule.example', 'imap');
  return { net, pc, dns, web, r };
}

/** IPv6 sendet regelmässig Router Advertisements: nur eine feste Zeit laufen lassen. */
const settle = (sim: Simulation, ms = 15_000) => sim.runUntil(sim.now + ms);
const codes = (sim: Simulation, id: string) => sim.getDeviceState(id).console.map((l) => l.code);
const started = (net: NetBuilder) => {
  const sim = new Simulation(net.topology);
  sim.runUntil(3000);
  return sim;
};

group('Anwendungen über IPv6', () => {
  it('DNS-Server per RDNSS, nslookup liefert AAAA über IPv6', () => {
    const { net, pc } = network();
    const sim = started(net);
    expect(sim.getDeviceState(pc).ipv6?.dns).toBe('2001:db8:a::53');
    expect(codes(sim, pc)).toContain('ipv6.rdnss');
    sim.runCommand(pc, 'nslookup www.schule.example');
    settle(sim);
    expect(sim.getDeviceState(pc).console.find((l) => l.code === 'nslookup.answer')?.params).toMatchObject({ name: 'www.schule.example', ip: '2001:db8:b::80' });
    const dnsFrames = sim.getPacketLog().filter((e) => protocolOf(e.frame) === 'DNS');
    expect(dnsFrames.length).toBeGreaterThan(0);
    expect(dnsFrames.every((e) => e.frame.payload.kind === 'ipv6')).toBe(true);
  });

  it('Webseite über Namen (AAAA) und über eine IPv6-Adresse in eckigen Klammern', () => {
    const { net, pc } = network();
    const sim = started(net);
    sim.browse(pc, 'http://www.schule.example/index.html');
    settle(sim);
    expect(sim.getDeviceState(pc).browser).toMatchObject({ status: 'done', response: { status: 200, body: '<h1>Hallo IPv6</h1>' } });
    const log = sim.getPacketLog();
    const http = log.filter((e) => protocolOf(e.frame) === 'HTTP');
    expect(http.length).toBeGreaterThan(0);
    expect(log.map((e) => line(net.topology, e)).some((l) => l.includes('TCP') && l.includes('>80 [SYN]') && l.endsWith('(IPv6)'))).toBe(true);

    // Echte Bytes: Next Header 6, TCP-Prüfsumme über den IPv6-Pseudo-Header.
    for (const e of log.filter((x) => x.frame.payload.kind === 'ipv6' && x.frame.payload.payload.kind === 'tcp')) {
      const w = dissect(e.frame);
      const v6 = w.layers.find((l) => l.protocol === 'IPv6')!;
      expect(w.bytes[v6.start + 6]).toBe(6);
      const length = (w.bytes[v6.start + 4]! << 8) | w.bytes[v6.start + 5]!;
      const segment = [...w.bytes.slice(v6.start + 40, v6.start + 40 + length)];
      const pseudo = [...w.bytes.slice(v6.start + 8, v6.start + 40), 0, 0, (length >> 8) & 0xff, length & 0xff, 0, 0, 0, 6];
      expect(internetChecksum([...pseudo, ...segment])).toBe(0);
    }

    sim.browse(pc, 'http://[2001:DB8:B::80]/index.html');
    settle(sim);
    expect(sim.getDeviceState(pc).browser).toMatchObject({ url: 'http://[2001:db8:b::80]/index.html', status: 'done', response: { status: 200 } });
  });

  it('URLs mit IPv6-Adressen', () => {
    expect(parseUrl('http://[2001:db8::1]:8080/a.html')).toEqual({ host: '2001:db8::1', port: 8080, path: '/a.html' });
    expect(formatUrl({ host: '2001:db8::1', port: 80, path: '/' })).toBe('http://[2001:db8::1]/');
    expect(parseUrl('http://2001:db8::1/')).toBe('invalidUrl');
    expect(parseUrl('http://[2001:db8::zz]/')).toBe('invalidUrl');
    expect(parseUrl('http://[2001:db8::1]:/')).toBe('invalidUrl');
  });

  it('Ping und Traceroute über einen Namen (AAAA), netstat mit [Adresse]:Port', () => {
    const { net, pc } = network();
    const sim = started(net);
    sim.ping(pc, 'www.schule.example');
    settle(sim);
    expect(codes(sim, pc).filter((c) => c === 'ping.reply')).toHaveLength(4);
    expect(sim.getDeviceState(pc).console.find((l) => l.code === 'ping.reply')?.params).toMatchObject({ from: '2001:db8:b::80' });
    sim.runCommand(pc, 'tracert www.schule.example');
    settle(sim);
    expect(codes(sim, pc)).toContain('tracert.done');
  });

  it('SSH zum Router über seinen Namen', () => {
    const { net, pc, r } = network();
    const sim = started(net);
    sim.ssh(pc, 'r1.schule.example', 'admin', 'Sicher123');
    settle(sim);
    expect(sim.getDeviceState(pc).console.find((l) => l.code === 'ssh.open')?.params).toMatchObject({ device: r });
    const conns = sim.getDeviceState(pc).connections;
    expect(conns?.[0]?.remote).toBe('[2001:db8:a::1]:22');
    sim.sshClose(pc);
    settle(sim);
    expect(codes(sim, pc)).toContain('ssh.closed');
    // Unbekannter Name
    sim.ssh(pc, 'nirgends.schule.example', 'admin', 'x');
    settle(sim);
    expect(codes(sim, pc)).toContain('ssh.unknownHost');
  });

  it('E-Mail per SMTP und IMAP über IPv6', () => {
    const { net, pc, web } = network();
    const sim = started(net);
    sim.sendMail(pc, { to: ['ben@schule.example'], subject: 'IPv6', body: 'Geht auch ohne IPv4.' });
    settle(sim);
    expect(sim.getDeviceState(pc).mail?.steps.at(-1)?.code).toBe('mail.sent');
    expect(Object.fromEntries((sim.getDeviceState(web).mailboxes ?? []).map((m) => [m.user, m.count]))).toEqual({ anna: 0, ben: 1 });
    expect(sim.getPacketLog().some((e) => protocolOf(e.frame) === 'SMTP' && e.frame.payload.kind === 'ipv6')).toBe(true);
  });

  it('Dual Stack: mit globaler IPv6-Adresse wird AAAA vor A verwendet', () => {
    const { net, pc, dns, web } = network('dual');
    net.topology = { ...net.topology, devices: net.topology.devices.map((d) => (d.id === dns ? { ...d, interfaces: d.interfaces.map((i, n) => (n === 0 ? { ...i, ip: '192.168.0.53', mask: '255.255.255.0' } : i)) } : d)) };
    net.dnsRecord(dns, 'www.schule.example', 'A', '192.168.1.80');
    const sim = started(net);
    // PC hat nur IPv6 per SLAAC (keine IPv4-Adresse), DNS kommt per RDNSS.
    sim.browse(pc, 'http://www.schule.example/index.html');
    settle(sim);
    expect(sim.getDeviceState(pc).browser?.steps.find((s) => s.code === 'browser.resolved')?.params).toMatchObject({ ip: '2001:db8:b::80' });
    void web;
  });

  it('IPv6-DNS-Einstellungen werden geprüft und gespeichert', () => {
    const { net, pc, r, web } = network();
    expect(setInterfaceDns6(net.topology, r, 0, 'ff02::1')).toMatchObject({ ok: false, error: { code: 'invalidIp6' } });
    expect(configureHost6(net.topology, pc, { auto: false, address: '2001:db8:a::9/64', dns: 'kein-dns' })).toMatchObject({ ok: false });
    const parsed = parseProject(serializeProject(net.topology));
    if (!parsed.ok) throw new Error('Projekt nicht lesbar');
    const again = parsed.topology;
    expect(again.devices.find((d) => d.id === web)?.dns6).toBe('2001:db8:a::53');
    expect(again.devices.find((d) => d.id === r)?.interfaces[0]?.dns6).toBe('2001:db8:a::53');
  });

  it('Die Firewall des Webservers gilt auch für IPv6 (Regeln mit IPv6-Netzen)', () => {
    const { net, pc, web } = network();
    net.apply((t) => setFirewall(t, web, { defaultAction: 'deny', rules: [{ action: 'allow', protocol: 'tcp', src: '2001:DB8:A::/64', dst: 'any', port: 80 }] }));
    expect(net.topology.devices.find((d) => d.id === web)?.firewall?.rules[0]?.src).toBe('2001:db8:a::/64');
    let sim = started(net);
    sim.browse(pc, 'http://www.schule.example/index.html');
    settle(sim);
    expect(sim.getDeviceState(pc).browser?.status).toBe('done');
    net.apply((t) => setFirewall(t, web, { defaultAction: 'deny', rules: [{ action: 'allow', protocol: 'tcp', src: '2001:db8:c::/64', dst: 'any', port: 80 }] }));
    sim = started(net);
    sim.browse(pc, 'http://www.schule.example/index.html');
    settle(sim);
    expect(sim.getDeviceState(pc).browser?.status).toBe('error');
    expect(codes(sim, web)).toContain('firewall.blocked');
  });
});
