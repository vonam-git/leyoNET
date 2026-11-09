import { describe, expect, it } from 'vitest';
import { getDevice } from '../model/topology';
import type { Topology } from '../model/types';
import { Simulation } from '../sim/simulation';
import { NetBuilder } from '../sim/testing';
import { execute, prompt, runningConfig, startSession, type CliSession } from './cli';
import { formatAclRule, parseRule, wildcardPrefix } from './rules';

function run(topology: Topology, device: string, lines: string[], state?: () => ReturnType<Simulation['getDeviceState']>) {
  let session: CliSession = startSession(getDevice(topology, device)!).session;
  const output: string[] = [];
  const prompts: string[] = [];
  for (const line of lines) {
    const result = execute(session, line, { topology, state: state?.() });
    output.push(...result.lines);
    if (result.topology) topology = result.topology;
    session = result.session;
    prompts.push(prompt(topology, session));
  }
  return { topology, session, output, prompts };
}

describe('Regeln lesen und schreiben', () => {
  it('versteht Cisco-Schreibweise und die kurze Form', () => {
    expect(parseRule('permit tcp 192.168.10.0 0.0.0.255 host 192.168.10.80 eq 80'.split(' '))).toEqual({
      ok: true,
      rule: { action: 'allow', protocol: 'tcp', src: '192.168.10.0/24', dst: '192.168.10.80', port: 80 },
    });
    expect(parseRule('deny ip any 10.0.0.0/8'.split(' '))).toEqual({ ok: true, rule: { action: 'deny', protocol: 'any', src: 'any', dst: '10.0.0.0/8' } });
    expect(parseRule('permit icmp host 2001:db8::1 2001:db8:1::/64'.split(' '))).toMatchObject({ ok: true, rule: { src: '2001:db8::1', dst: '2001:db8:1::/64' } });
    expect(parseRule('allow tcp any any port 22 in wan'.split(' '), (n) => (n === 'wan' ? 0 : null))).toMatchObject({ ok: true, rule: { port: 22, iface: 0 } });
    expect(parseRule('permit icmp any any eq 80'.split(' ')).ok).toBe(false);
    expect(parseRule('permit tcp any'.split(' ')).ok).toBe(false);
    expect(parseRule('permit tcp any any in eth0'.split(' ')).ok).toBe(false);
    expect(parseRule('permit tcp any any eq 70000'.split(' ')).ok).toBe(false);
    expect(wildcardPrefix('0.0.0.255')).toBe(24);
    expect(wildcardPrefix('0.0.1.255')).toBe(23);
    expect(wildcardPrefix('0.0.0.254')).toBeNull();
    expect(formatAclRule({ action: 'allow', protocol: 'tcp', src: '192.168.10.0/24', dst: '192.168.10.80', port: 80 })).toBe('permit tcp 192.168.10.0 0.0.0.255 host 192.168.10.80 eq 80');
  });
});

describe('CLI: Zugriffslisten auf dem Switch', () => {
  it('ACL anlegen, Regeln ergänzen und löschen, Port zuweisen, running-config', () => {
    const net = new NetBuilder();
    const sw = net.add('switch', 'SW1');
    const { topology, output, prompts } = run(net.topology, sw, [
      'enable',
      'conf t',
      'ip access-list extended GAESTE',
      'remark nur Web',
      'permit tcp 192.168.10.0 0.0.0.255 host 192.168.10.80 eq 80',
      'permit udp any any eq 53',
      'deny icmp any any',
      'no 30',
      'exit',
      'interface port1',
      'ip access-group GAESTE in',
      'end',
    ]);
    expect(output).toEqual([]);
    expect(prompts[2]).toBe('SW1(config-ext-nacl)#');
    const device = getDevice(topology, sw)!;
    expect(device.acls).toEqual([
      {
        name: 'GAESTE',
        rules: [
          { action: 'allow', protocol: 'tcp', src: '192.168.10.0/24', dst: '192.168.10.80', port: 80 },
          { action: 'allow', protocol: 'udp', src: 'any', dst: 'any', port: 53 },
        ],
      },
    ]);
    expect(device.interfaces[0]!.aclIn).toBe('GAESTE');
    const config = runningConfig(device).join('\n');
    expect(config).toContain('ip access-list extended GAESTE\n permit tcp 192.168.10.0 0.0.0.255 host 192.168.10.80 eq 80\n permit udp any any eq 53');
    expect(config).toContain('interface port1\n ip access-group GAESTE in');
    const show = run(topology, sw, ['show access-lists']).output.join('\n');
    expect(show).toContain('Extended IP access list GAESTE  (port1 in)');
    expect(show).toContain('    20 permit udp any any eq 53');
  });

  it('Fehler werden gemeldet; Router kennen keine ACL', () => {
    const net = new NetBuilder();
    const sw = net.add('switch', 'SW1');
    const r = net.add('router', 'R1');
    expect(run(net.topology, sw, ['en', 'conf t', 'ip access-list extended A', 'permit tcp any'] ).output[0]).toMatch(/Invalid destination/);
    expect(run(net.topology, sw, ['en', 'conf t', 'ip access-list extended A', 'no 50']).output[0]).toMatch(/No entry/);
    expect(run(net.topology, sw, ['en', 'conf t', 'ip access-list extended b@d']).output[0]).toMatch(/^% Invalid access list name/);
    expect(run(net.topology, r, ['en', 'conf t', 'ip access-list extended A']).output.join('\n')).toMatch(/% Invalid input/);
  });

  it('Zähler aus der Simulation in «show access-lists»', () => {
    const net = new NetBuilder();
    const sw = net.add('switch', 'SW1');
    const pc1 = net.host('PC1', '192.168.10.11');
    const pc2 = net.host('PC2', '192.168.10.12');
    net.link(pc1, sw);
    net.link(pc2, sw);
    const configured = run(net.topology, sw, ['en', 'conf t', 'ip access-list extended KEIN-PING', 'deny icmp any any', 'permit ip any any', 'exit', 'int port1', 'ip access-group KEIN-PING in']).topology;
    const sim = new Simulation(configured);
    sim.ping(pc1, '192.168.10.12');
    sim.runUntil(6000);
    const show = run(configured, sw, ['show access-lists'], () => sim.getDeviceState(sw)).output.join('\n');
    expect(Number(/10 deny icmp any any \((\d+) matches\)/.exec(show)?.[1])).toBeGreaterThan(0);
    expect(show).toContain('20 permit ip any any (0 matches)');
  });
});

describe('CLI: Firewall auf Router und Firewall', () => {
  it('Regeln anlegen, einfügen, löschen; Zonen als Anschlussname; running-config', () => {
    const net = new NetBuilder();
    const fw = net.add('firewall', 'FW');
    const { topology, output } = run(net.topology, fw, [
      'en',
      'conf t',
      'firewall rule 1 allow tcp any host 192.168.2.80 port 80 in wan',
      'firewall rule deny icmp any any in dmz',
      'no firewall rule 3',
      'no firewall stateful',
      'end',
    ]);
    expect(output).toEqual([]);
    const device = getDevice(topology, fw)!;
    expect(device.firewall).toEqual({
      defaultAction: 'deny',
      stateful: false,
      rules: [
        { action: 'allow', protocol: 'tcp', src: 'any', dst: '192.168.2.80', port: 80, iface: 0 },
        { action: 'allow', protocol: 'any', src: 'any', dst: 'any', iface: 1 },
        { action: 'allow', protocol: 'any', src: 'any', dst: 'any', iface: 3 },
        { action: 'deny', protocol: 'icmp', src: 'any', dst: 'any', iface: 2 },
      ],
    });
    const config = runningConfig(device).join('\n');
    expect(config).toContain('firewall default deny\nno firewall stateful\nfirewall rule allow tcp any 192.168.2.80 port 80 in eth0');
    const show = run(topology, fw, ['show firewall']).output.join('\n');
    expect(show).toContain('Firewall: stateless, default deny');
    expect(show).toContain('eth0 (WAN)');
  });

  it('Router: Firewall per Befehlszeile einschalten und wieder entfernen', () => {
    const net = new NetBuilder();
    const r = net.add('router', 'R1');
    const step1 = run(net.topology, r, ['en', 'conf t', 'firewall default deny', 'firewall rule allow icmp any any']);
    expect(step1.output).toEqual([]);
    expect(getDevice(step1.topology, r)!.firewall).toEqual({ defaultAction: 'deny', rules: [{ action: 'allow', protocol: 'icmp', src: 'any', dst: 'any' }] });
    expect(run(step1.topology, r, ['en', 'conf t', 'firewall default maybe']).output[0]).toMatch(/allow or deny/);
    const step2 = run(step1.topology, r, ['en', 'conf t', 'no firewall']);
    expect(getDevice(step2.topology, r)!.firewall).toBeUndefined();
    expect(run(step2.topology, r, ['show firewall']).output[0]).toMatch(/off/);
  });
});
