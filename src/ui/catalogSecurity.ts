/**
 * Sicherheits-Szenarien: Ein Angreifer (Gerät aus dem Shop oder der virtuelle Angreifer des
 * Prüfbausteins «resist») stört das Netz; die Lernenden finden die Ursache und wehren ihn ab.
 */
import { addPortForward, cableAt, configureHost, connect, setAttack, setCliConfig, setDhcpServer, setDhcpSnooping, setDhcpTrusted, setInterfaceAddress, setPortSecurity, setProtection, setSyslog, setSyslogServer, setVerbund, applyVerbundAddresses, setWebServerEnabled, type AttackKind, type Topology } from '../core';
import { t } from '../i18n';
import { Start, goal, task, unwrap, type CatalogEntry } from './catalogKit';

const id = (topology: Topology, name: string) => topology.devices.find((d) => d.name === name)!.id;
/** STRIDE in der üblichen englischen Schreibweise (in beiden Sprachen gleich). */
const STRIDE_OPTIONS = ['Spoofing', 'Tampering', 'Repudiation', 'Information Disclosure', 'Denial of Service', 'Elevation of Privilege'];
const stride = (accept: string) => ({ type: 'answer' as const, kind: 'choice' as const, options: STRIDE_OPTIONS, accept: [accept] });

/** Kleine Firma: zwei PCs, Webserver, Router ins Internet. */
function firm(): Start {
  return new Start()
    .area('Firma 192.168.10.0/24', 'blue', -520, -240, 620, 480, '192.168.10.0/24')
    .add('pc', 'PC 1', -420, -120)
    .add('pc', 'PC 2', -420, 0)
    .add('server', 'Webserver', -420, 130)
    .add('switch', 'Switch', -180, 0)
    .router('Router', 40, 0, ['192.168.10.1/24', '203.0.113.2/30'])
    .router('Internet', 280, 0, ['203.0.113.1/30'], 'internet')
    .link('PC 1', 'Switch')
    .link('PC 2', 'Switch')
    .link('Webserver', 'Switch')
    .host('PC 1', '192.168.10.11', '24', '192.168.10.1')
    .host('PC 2', '192.168.10.12', '24', '192.168.10.1')
    .host('Webserver', '192.168.10.80', '24', '192.168.10.1')
    .web('Webserver', '<h1>Firma</h1>')
    .route('Router', '0.0.0.0', '0', '203.0.113.1')
    .nat('Router', 1)
    .apply((x, n) => unwrap(connect(x, n('Router'), n('Switch'), 'tp', { a: 0 })).topology)
    .apply((x, n) => unwrap(connect(x, n('Router'), n('Internet'), 'tp', { a: 1, b: 0 })).topology);
}

/** Angreifer am Switch. */
const withAttackerDevice = (s: Start, kind: AttackKind): Start =>
  s
    .add('notebook', 'Angreifer', -180, 170, { variant: 'attacker' })
    .link('Angreifer', 'Switch')
    .host('Angreifer', '192.168.10.66', '24', '192.168.10.1')
    .apply((x, n) => unwrap(setAttack(x, n('Angreifer'), { kind })));

const site = (): Topology =>
  new Start()
    .add('server', 'Webserver', -360, -60)
    .add('pc', 'PC Standort', -360, 80)
    .add('switch', 'Switch', -120, 0)
    .router('Standort-Router', 140, 0, ['192.168.50.1/24'])
    .link('Webserver', 'Switch')
    .link('PC Standort', 'Switch')
    .link('Switch', 'Standort-Router')
    .host('Webserver', '192.168.50.80', '24', '192.168.50.1')
    .host('PC Standort', '192.168.50.10', '24', '192.168.50.1')
    .web('Webserver', t('catalog.verbundWeb.page'))
    .apply((x, n) => unwrap(setVerbund(x, n('Standort-Router'), 1)))
    .apply((x, n) => unwrap(setCliConfig(x, n('Standort-Router'), { ssh: true, users: [{ name: 'admin', password: 'admin' }] })))
    .area('Mein Standort', 'teal', -460, -170, 720, 330, '192.168.50.0/24').topology;

/** Büro mit DHCP: Server vergibt die Adressen, die PCs beziehen sie automatisch; ein Angreifer steckt am Switch. */
function office(): Start {
  return new Start()
    .area('Büro 192.168.20.0/24', 'blue', -520, -240, 620, 520, '192.168.20.0/24')
    .add('pc', 'PC 1', -420, -120)
    .add('pc', 'PC 2', -420, 0)
    .add('server', 'Server', -420, 130)
    .add('switch', 'Switch', -180, 0)
    .router('Router', 40, 0, ['192.168.20.1/24'])
    .link('PC 1', 'Switch')
    .link('PC 2', 'Switch')
    .link('Server', 'Switch')
    .link('Router', 'Switch')
    .host('Server', '192.168.20.10', '24', '192.168.20.1')
    .apply((x, n) => unwrap(setDhcpServer(x, n('Server'), { start: '192.168.20.100', end: '192.168.20.150', gateway: '192.168.20.1', dns: '192.168.20.10', leaseTime: 3600 })))
    .apply((x, n) => unwrap(configureHost(unwrap(configureHost(x, n('PC 1'), { ip: '', mask: '', dhcp: true })), n('PC 2'), { ip: '', mask: '', dhcp: true })))
    .add('notebook', 'Angreifer', -180, 190, { variant: 'attacker' })
    .link('Angreifer', 'Switch')
    .host('Angreifer', '192.168.20.66', '24', '192.168.20.1')
    .apply((x, n) => unwrap(setAttack(x, n('Angreifer'), { kind: 'dhcpRogue' })));
}

/** Port des Switches, an dem das Gerät hängt. */
function portTo(x: Topology, sw: string, device: string): number {
  const s = id(x, sw);
  const other = id(x, device);
  return x.devices.find((d) => d.id === s)!.interfaces.find((i) => {
    const c = cableAt(x, { device: s, iface: i.index });
    return c && (c.a.device === other || c.b.device === other);
  })!.index;
}

/** Lösung «Falscher DHCP-Server»: Snooping, Server und Router vertrauenswürdig, sonst höchstens 2 MAC-Adressen je Port. */
function solveDhcp(start: Topology): Topology {
  const sw = id(start, 'Switch');
  let x = unwrap(setDhcpSnooping(start, sw, true));
  const trusted = [portTo(x, 'Switch', 'Server'), portTo(x, 'Switch', 'Router')];
  for (const p of trusted) x = unwrap(setDhcpTrusted(x, sw, p, true));
  for (const i of x.devices.find((d) => d.id === sw)!.interfaces) if (!trusted.includes(i.index)) x = unwrap(setPortSecurity(x, sw, i.index, 2));
  return x;
}

/** Lösung «Wer war das?»: Log-Server sammelt, Router und PCs melden dorthin. */
function solveSyslog(start: Topology): Topology {
  let x = unwrap(setSyslogServer(start, id(start, 'Log-Server'), true));
  for (const n of ['Router', 'PC 1', 'PC 2']) x = unwrap(setSyslog(x, id(x, n), '192.168.10.50'));
  return x;
}

const protect = (x: Topology, names: string[], key: 'arpGuard' | 'synCookies') => names.reduce((acc, n) => unwrap(setProtection(acc, id(acc, n), key, true)), x);
const strong = (x: Topology, router: string) => unwrap(setCliConfig(x, id(x, router), { ssh: true, users: [{ name: 'admin', password: 'Zug-nach-Sursee-17' }] }));

/** Lösung «Netz bauen und verteidigen». */
function solveBuild(start: Topology): Topology {
  let x = start;
  x = unwrap(configureHost(x, id(x, 'PC 1'), { ip: '192.168.10.11', mask: '24', gateway: '192.168.10.1' }));
  x = unwrap(configureHost(x, id(x, 'PC 2'), { ip: '192.168.10.12', mask: '24', gateway: '192.168.10.1' }));
  x = unwrap(configureHost(x, id(x, 'Webserver'), { ip: '192.168.10.80', mask: '24', gateway: '192.168.10.1' }));
  x = unwrap(setWebServerEnabled(x, id(x, 'Webserver'), true, [{ path: '/index.html', content: 'Firma' }]));
  x = unwrap(setInterfaceAddress(x, id(x, 'Router'), 0, '192.168.10.1', '24'));
  for (const n of ['PC 1', 'PC 2', 'Webserver']) x = unwrap(connect(x, id(x, n), id(x, 'Switch'))).topology;
  x = unwrap(connect(x, id(x, 'Router'), id(x, 'Switch'), 'tp', { a: 0 })).topology;
  x = protect(x, ['PC 1', 'PC 2', 'Webserver'], 'arpGuard');
  return protect(x, ['Webserver'], 'synCookies');
}

export const SECURITY_SOLUTIONS: Record<string, (x: Topology) => Topology> = {
  'sec-arp-spoof': (x) => protect(x, ['PC 1', 'PC 2'], 'arpGuard'),
  'sec-syn-flood': (x) => protect(x, ['Webserver'], 'synCookies'),
  'sec-ssh': (x) => strong(x, 'Router'),
  'sec-build': solveBuild,
  'sec-dhcp': solveDhcp,
  'sec-syslog': solveSyslog,
  'verbund-angriff': (start) => {
    let x = unwrap(applyVerbundAddresses(start, id(start, 'Standort-Router'), 1));
    x = unwrap(addPortForward(x, id(x, 'Standort-Router'), { protocol: 'tcp', port: 80, to: '192.168.50.80', toPort: 80 }));
    return strong(protect(protect(x, ['PC Standort', 'Webserver'], 'arpGuard'), ['Webserver'], 'synCookies'), 'Standort-Router');
  },
};
export const SECURITY_ANSWERS: Record<string, Record<string, string>> = {
  'sec-arp-spoof': { 'ziel-4': 'Spoofing' },
  'sec-syn-flood': { 'ziel-3': 'Denial of Service' },
  'sec-ssh': { 'ziel-2': 'Elevation of Privilege' },
  'sec-dhcp': { 'ziel-4': 'Tampering' },
  'sec-syslog': { 'ziel-3': 'Repudiation' },
};

const features = ['tool.security', 'tool.sniffer'];
export const SECURITY: CatalogEntry[] = [
  {
    id: 'sec-arp-spoof',
    stars: 3,
    level: 3,
    features: [...features, 'device.internet', 'net.nat'],
    build: () => ({
      topology: withAttackerDevice(firm(), 'arpSpoof').topology,
      tasks: task('secArp', 3, [
        goal('secArp', 1, { type: 'ping', from: 'PC 1', to: '203.0.113.1' }),
        goal('secArp', 2, { type: 'ping', from: 'PC 2', to: '203.0.113.1' }),
        goal('secArp', 3, { type: 'linkUp', a: 'Angreifer', b: 'Switch' }),
        goal('secArp', 4, stride('Spoofing')),
      ]),
    }),
  },
  {
    id: 'sec-syn-flood',
    stars: 3,
    level: 3,
    features: [...features, 'service.web', 'device.internet', 'net.nat'],
    build: () => ({
      topology: withAttackerDevice(firm(), 'synFlood').topology,
      tasks: task('secSyn', 3, [
        goal('secSyn', 1, { type: 'http', from: 'PC 1', url: 'http://192.168.10.80/' }),
        goal('secSyn', 2, { type: 'linkUp', a: 'Angreifer', b: 'Switch' }),
        goal('secSyn', 3, stride('Denial of Service')),
      ]),
    }),
  },
  {
    id: 'sec-ssh',
    stars: 3,
    level: 4,
    features: [...features, 'net.ssh', 'net.cli', 'device.internet', 'net.nat'],
    build: () => ({
      topology: firm().apply((x, n) => unwrap(setCliConfig(x, n('Router'), { ssh: true, users: [{ name: 'admin', password: 'cisco' }] }))).topology,
      tasks: task('secSsh', 3, [goal('secSsh', 1, { type: 'resist', attack: 'sshGuess' }), goal('secSsh', 2, stride('Elevation of Privilege'))]),
    }),
  },
  {
    id: 'sec-dhcp',
    stars: 4,
    level: 4,
    features: [...features, 'service.dhcp', 'net.l2security', 'net.cli'],
    build: () => ({
      topology: office().topology,
      tasks: task('secDhcp', 4, [
        goal('secDhcp', 1, { type: 'resist', attack: 'dhcpRogue' }),
        goal('secDhcp', 2, { type: 'dhcpLease', device: 'PC 1', dns: '192.168.20.10' }),
        goal('secDhcp', 3, { type: 'linkUp', a: 'Angreifer', b: 'Switch' }),
        goal('secDhcp', 4, stride('Tampering')),
      ]),
    }),
  },
  {
    id: 'sec-syslog',
    stars: 4,
    level: 4,
    features: [...features, 'net.syslog', 'net.ssh', 'device.internet', 'net.nat'],
    build: () => ({
      topology: firm()
        .add('server', 'Log-Server', -180, 200)
        .link('Log-Server', 'Switch')
        .host('Log-Server', '192.168.10.50', '24', '192.168.10.1')
        .apply((x, n) => unwrap(setCliConfig(x, n('Router'), { ssh: true, users: [{ name: 'admin', password: 'cisco' }] }))).topology,
      tasks: task('secSyslog', 4, [
        goal('secSyslog', 1, { type: 'logged', attack: 'sshGuess' }),
        goal('secSyslog', 2, { type: 'logged', attack: 'arpSpoof' }),
        goal('secSyslog', 3, stride('Repudiation')),
      ]),
    }),
  },
  {
    id: 'sec-build',
    stars: 4,
    level: 3,
    features: [...features, 'service.web'],
    build: () => ({
      topology: new Start().add('pc', 'PC 1', -420, -120).add('pc', 'PC 2', -420, 0).add('server', 'Webserver', -420, 130).add('switch', 'Switch', -180, 0).add('router', 'Router', 60, 0).topology,
      tasks: task('secBuild', 4, [
        goal('secBuild', 1, { type: 'ping', from: 'PC 1', to: 'PC 2' }),
        goal('secBuild', 2, { type: 'ping', from: 'PC 1', to: '192.168.10.1' }),
        goal('secBuild', 3, { type: 'http', from: 'PC 1', url: 'http://192.168.10.80/' }),
        goal('secBuild', 4, { type: 'resist', attack: 'arpSpoof' }),
        goal('secBuild', 5, { type: 'resist', attack: 'synFlood' }),
      ]),
    }),
  },
  {
    id: 'verbund-angriff',
    stars: 4,
    verbund: true,
    level: 3,
    features: [...features, 'net.verbund', 'net.nat', 'routing.static', 'service.web', 'net.ssh'],
    build: () => ({
      topology: site(),
      tasks: task('verbundAttack', 4, [
        goal('verbundAttack', 1, { type: 'verbundSite', level: 'services' }),
        goal('verbundAttack', 2, { type: 'resist', attack: 'synFlood' }),
        goal('verbundAttack', 3, { type: 'resist', attack: 'arpSpoof' }),
        goal('verbundAttack', 4, { type: 'resist', attack: 'sshGuess' }),
      ]),
    }),
  },
];
