/**
 * Fertige Demo-Netze für den Unterricht: je Protokoll ein Aufbau mit
 * vollständiger Konfiguration. Lehrpersonen öffnen sie per Knopfdruck
 * («Öffnen») oder lassen sie gleich vorführen («Vorführen»): Die Simulation
 * startet, und die Demo löst die passende Aktion aus (z.B. einen Ping).
 *
 * Die Projekte liegen als Dateien in docs/beispiele/ und werden in die App
 * eingebaut. Ein Test (demos.test.ts) führt jede Demo ohne Oberfläche aus und
 * prüft, dass sie das Versprochene zeigt.
 */
const files = import.meta.glob('../../docs/beispiele/*.json', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

export type DemoTopic = 'basics' | 'services' | 'switching' | 'routing' | 'access' | 'security';
export const DEMO_TOPICS: readonly DemoTopic[] = ['basics', 'services', 'switching', 'routing', 'access', 'security'];

/** Aktion nach `at` Millisekunden Simulationszeit auf einem Gerät (nach Namen). */
export type DemoAction =
  | { at: number; device: string; command: string }
  | { at: number; device: string; browse: string }
  | { at: number; device: string; mail: { to: string[]; subject: string; body: string } }
  | { at: number; device: string; fetchMail: true };

/** Was die Demo zeigt (für den automatischen Test). */
export type DemoCheck =
  | { kind: 'ping'; device: string; min?: number }
  | { kind: 'browser'; device: string; contains: string }
  | { kind: 'dhcp'; devices: string[] }
  | { kind: 'mail'; device: string; subject: string }
  | { kind: 'storm' }
  | { kind: 'macFlap'; device: string }
  | { kind: 'trace'; device: string };

/**
 * Schritt einer geführten Demo. Den Text spricht der Avatar
 * (`demo.<id>.tour.<n>` in den Sprachdateien); der Schritt kann den Modus
 * wechseln, die Simulation anhalten, eine Aktion auslösen, ein Gerät
 * hervorheben oder seine erweiterten Einstellungen öffnen.
 */
export interface TourStep {
  /** true: Simulation, false: Entwurf; fehlt = unverändert. */
  sim?: boolean;
  /** Simulation anhalten (true) oder weiterlaufen lassen (false). */
  pause?: boolean;
  /** Aktion beim Betreten des Schritts (nur vorwärts). */
  action?: DemoAction;
  /** Gerät (Name), das auf der Zeichenfläche hervorgehoben wird. */
  highlight?: string;
  /** Erweiterte Einstellungen eines Geräts mit Reiter öffnen. */
  window?: { device: string; tab: string };
}

export interface Demo {
  id: string;
  file: string;
  topic: DemoTopic;
  /** OSI-Schichten, um die es geht (für die Anzeige). */
  layers: number[];
  /** Funktionen, die mindestens nötig sind (werden beim Öffnen eingeschaltet). */
  actions: DemoAction[];
  check: DemoCheck;
  /** So lange (Simulationszeit) läuft der Test. */
  until: number;
  /** Geführte Erklärung Schritt für Schritt (optional). */
  tour?: TourStep[];
}

export const DEMOS: readonly Demo[] = [
  // Grundlagen
  { id: 'arpPing', file: 'arp-ping.json', topic: 'basics', layers: [2, 3], actions: [{ at: 600, device: 'PC 1', command: 'ping 192.168.1.11' }], check: { kind: 'ping', device: 'PC 1' }, until: 8000,
    tour: [
      { sim: false },
      { highlight: 'PC 1', window: { device: 'PC 1', tab: 'addresses' } },
      { sim: true, pause: true, action: { at: 0, device: 'PC 1', command: 'ping 192.168.1.11' }, highlight: 'PC 1' },
      { highlight: 'Switch' },
      { highlight: 'PC 2' },
      { pause: false, window: { device: 'Switch', tab: 'state' } },
    ] },
  { id: 'gateway', file: 'zwei-subnetze.json', topic: 'basics', layers: [3], actions: [{ at: 600, device: 'PC 1', command: 'ping 192.168.2.10' }], check: { kind: 'ping', device: 'PC 1' }, until: 8000,
    tour: [
      { sim: false },
      { highlight: 'PC 1', window: { device: 'PC 1', tab: 'addresses' } },
      { highlight: 'Router 1', window: { device: 'Router 1', tab: 'routing' } },
      { sim: true, pause: true, action: { at: 0, device: 'PC 1', command: 'ping 192.168.2.10' }, highlight: 'Router 1' },
      { pause: false, highlight: 'PC 2' },
    ] },
  { id: 'ipv6', file: 'ipv6-slaac.json', topic: 'basics', layers: [2, 3], actions: [{ at: 3000, device: 'PC 1', command: 'ping 2001:db8:b::100' }], check: { kind: 'ping', device: 'PC 1' }, until: 10_000,
    tour: [
      { sim: false, highlight: 'Router' },
      { highlight: 'Router', window: { device: 'Router', tab: 'addresses' } },
      { sim: true, pause: true, highlight: 'PC 1' },
      { pause: false, highlight: 'PC 1', window: { device: 'PC 1', tab: 'state' } },
      { highlight: 'Notebook', window: { device: 'Notebook', tab: 'state' } },
      { pause: true, action: { at: 0, device: 'PC 1', command: 'ping 2001:db8:b::100' }, highlight: 'PC 1' },
      { pause: false, highlight: 'Router' },
    ] },
  // Dienste
  { id: 'dhcp', file: 'dhcp.json', topic: 'services', layers: [7], actions: [{ at: 4500, device: 'Notebook 1', command: 'ipconfig /all' }], check: { kind: 'dhcp', devices: ['Notebook 1', 'Notebook 2', 'PC 1'] }, until: 10_000,
    tour: [
      { sim: false, highlight: 'Server' },
      { highlight: 'Server', window: { device: 'Server', tab: 'services' } },
      { sim: true, pause: true, highlight: 'Notebook 1' },
      { highlight: 'Server' },
      { pause: false, action: { at: 0, device: 'Notebook 1', command: 'ipconfig /all' }, highlight: 'Notebook 1' },
    ] },
  { id: 'web', file: 'web.json', topic: 'services', layers: [4, 7], actions: [{ at: 2500, device: 'Notebook 1', browse: 'http://www.schule.example/stundenplan.html' }], check: { kind: 'browser', device: 'Notebook 1', contains: 'Stundenplan' }, until: 6000,
    tour: [
      { sim: false, highlight: 'Notebook 1' },
      { highlight: 'Server', window: { device: 'Server', tab: 'services' } },
      { sim: true, pause: false, highlight: 'Notebook 1' },
      { pause: true, action: { at: 0, device: 'Notebook 1', browse: 'http://www.schule.example/stundenplan.html' }, highlight: 'Server' },
      { highlight: 'Webserver' },
      { pause: false, highlight: 'Notebook 1' },
    ] },
  {
    id: 'mail',
    file: 'mail.json',
    topic: 'services',
    layers: [4, 7],
    actions: [
      { at: 600, device: 'Anna', mail: { to: ['ben@schule.example'], subject: 'Hallo Ben', body: 'Treffen wir uns um 10 Uhr in der Bibliothek?' } },
      { at: 3000, device: 'Ben', fetchMail: true },
    ],
    check: { kind: 'mail', device: 'Ben', subject: 'Hallo Ben' },
    until: 6000,
  },
  // Switching
  { id: 'vlanStp', file: 'vlan-stp.json', topic: 'switching', layers: [2], actions: [{ at: 6500, device: 'Verwaltung 1', command: 'ping 10.0.10.12' }], check: { kind: 'ping', device: 'Verwaltung 1' }, until: 15_000 },
  { id: 'duplicateMac', file: 'doppelte-mac.json', topic: 'switching', layers: [2], actions: [{ at: 600, device: 'PC 1', command: 'ping 192.168.1.11' }, { at: 900, device: 'Notebook', command: 'ping 192.168.1.10' }], check: { kind: 'macFlap', device: 'Switch' }, until: 8000,
    tour: [
      { sim: false, highlight: 'Notebook', window: { device: 'Notebook', tab: 'ports' } },
      { sim: true, pause: true, action: { at: 0, device: 'PC 1', command: 'ping 192.168.1.11' }, highlight: 'PC 1' },
      { pause: false, action: { at: 0, device: 'Notebook', command: 'ping 192.168.1.10' }, highlight: 'Notebook' },
      { highlight: 'Switch', window: { device: 'Switch', tab: 'state' } },
      { highlight: 'PC 1' },
    ] },
  { id: 'storm', file: 'broadcast-sturm.json', topic: 'switching', layers: [2], actions: [{ at: 600, device: 'PC 1', command: 'ping 192.168.1.11' }], check: { kind: 'storm' }, until: 3000 },
  { id: 'routerOnAStick', file: 'router-on-a-stick.json', topic: 'switching', layers: [2, 3], actions: [{ at: 600, device: 'PC Verwaltung', command: 'ping 192.168.20.11' }], check: { kind: 'ping', device: 'PC Verwaltung' }, until: 8000 },
  { id: 'l3switch', file: 'layer3-switch.json', topic: 'switching', layers: [2, 3], actions: [{ at: 5000, device: 'Notebook 1', command: 'ping 10.99.0.10' }], check: { kind: 'ping', device: 'Notebook 1' }, until: 15_000 },
  // Routing
  { id: 'autoRouting', file: 'automatisches-routing.json', topic: 'routing', layers: [3], actions: [{ at: 600, device: 'PC A', command: 'tracert 192.168.30.10' }], check: { kind: 'trace', device: 'PC A' }, until: 10_000,
    tour: [
      { sim: false, highlight: 'Router 1' },
      { highlight: 'Router 1', window: { device: 'Router 1', tab: 'routing' } },
      { sim: true, pause: false, action: { at: 0, device: 'PC A', command: 'tracert 192.168.30.10' }, highlight: 'PC A' },
      { highlight: 'Router 2', window: { device: 'Router 2', tab: 'routing' } },
      { highlight: 'Router 1' },
    ] },
  { id: 'static', file: 'statische-routen.json', topic: 'routing', layers: [3], actions: [{ at: 600, device: 'PC A', command: 'tracert 192.168.20.10' }], check: { kind: 'trace', device: 'PC A' }, until: 10_000 },
  { id: 'ospf', file: 'ospf.json', topic: 'routing', layers: [3], actions: [{ at: 9000, device: 'PC 1', command: 'tracert 192.168.2.10' }], check: { kind: 'trace', device: 'PC 1' }, until: 20_000 },
  { id: 'rip', file: 'rip.json', topic: 'routing', layers: [3, 4], actions: [{ at: 9000, device: 'PC 1', command: 'tracert 192.168.2.10' }], check: { kind: 'trace', device: 'PC 1' }, until: 20_000 },
  { id: 'bgp', file: 'bgp.json', topic: 'routing', layers: [4, 7], actions: [{ at: 12_000, device: 'PC AS 65001', command: 'ping 10.3.0.10' }], check: { kind: 'ping', device: 'PC AS 65001' }, until: 25_000 },
  // Zugang ins Internet
  { id: 'nat', file: 'heimnetz-nat.json', topic: 'access', layers: [3, 4], actions: [{ at: 600, device: 'PC', browse: 'http://198.51.100.10/' }], check: { kind: 'browser', device: 'PC', contains: 'Öffentlicher Webserver' }, until: 6000 },
  {
    id: 'snat',
    file: 'snat.json',
    topic: 'access',
    layers: [3, 4],
    actions: [
      { at: 600, device: 'PC 1', browse: 'http://198.51.100.10/' },
      { at: 2500, device: 'Mailserver', command: 'ping 198.51.100.10' },
    ],
    check: { kind: 'ping', device: 'Mailserver' },
    until: 10_000,
    tour: [
      { sim: false, highlight: 'Firmenrouter' },
      { highlight: 'Firmenrouter', window: { device: 'Firmenrouter', tab: 'nat' } },
      { sim: true, pause: false, action: { at: 0, device: 'PC 1', browse: 'http://198.51.100.10/' }, highlight: 'PC 1' },
      { action: { at: 0, device: 'Mailserver', command: 'ping 198.51.100.10' }, highlight: 'Mailserver' },
      { highlight: 'Firmenrouter', window: { device: 'Firmenrouter', tab: 'state' } },
      { highlight: 'Internet' },
    ],
  },
  {
    id: 'dnat',
    file: 'dnat.json',
    topic: 'access',
    layers: [3, 4],
    actions: [
      { at: 600, device: 'Aussen', browse: 'http://203.0.113.5/' },
    ],
    check: { kind: 'browser', device: 'Aussen', contains: 'Firmen-Webseite' },
    until: 6000,
    tour: [
      { sim: false, highlight: 'Webserver intern' },
      { highlight: 'Firmenrouter', window: { device: 'Firmenrouter', tab: 'nat' } },
      { sim: true, pause: false, action: { at: 0, device: 'Aussen', browse: 'http://203.0.113.5/' }, highlight: 'Aussen' },
      { highlight: 'Firmenrouter', window: { device: 'Firmenrouter', tab: 'state' } },
      { action: { at: 0, device: 'Aussen', browse: 'http://203.0.113.2:8080/' }, highlight: 'NAS' },
      { highlight: 'Aussen' },
    ],
  },
  { id: 'cpe', file: 'cpe-heimnetz.json', topic: 'access', layers: [1, 2, 3, 7], actions: [{ at: 6000, device: 'Notebook', browse: 'http://198.51.100.10/' }], check: { kind: 'browser', device: 'Notebook', contains: 'Internet-Box' }, until: 12_000,
    tour: [
      { sim: false, highlight: 'Internet-Box' },
      { highlight: 'Internet-Box', window: { device: 'Internet-Box', tab: 'addresses' } },
      { sim: true, pause: false, highlight: 'Internet-Box' },
      { highlight: 'PC' },
      { action: { at: 0, device: 'Notebook', browse: 'http://198.51.100.10/' }, highlight: 'Notebook' },
      { highlight: 'Internet-Box', window: { device: 'Internet-Box', tab: 'state' } },
    ] },
  { id: 'dsLite', file: 'ds-lite.json', topic: 'access', layers: [3, 4, 7], actions: [{ at: 3500, device: 'Notebook', browse: 'http://198.51.100.80/' }], check: { kind: 'browser', device: 'Notebook', contains: 'nur über IPv4' }, until: 9000,
    tour: [
      { sim: false, highlight: 'Internet-Box' },
      { highlight: 'Internet-Box', window: { device: 'Internet-Box', tab: 'addresses' } },
      { highlight: 'Provider', window: { device: 'Provider', tab: 'addresses' } },
      { sim: true, pause: false, highlight: 'Notebook' },
      { pause: true, action: { at: 0, device: 'Notebook', browse: 'http://198.51.100.80/' }, highlight: 'Internet-Box' },
      { pause: false, highlight: 'Provider', window: { device: 'Provider', tab: 'state' } },
      { highlight: 'Webserver' },
    ] },
  { id: 'ppp', file: 'seriell-ppp.json', topic: 'access', layers: [1, 2], actions: [{ at: 1500, device: 'PC Zürich', command: 'ping 192.168.2.10' }], check: { kind: 'ping', device: 'PC Zürich' }, until: 10_000 },
  { id: 'wlan', file: 'wlan-mesh.json', topic: 'access', layers: [1, 2], actions: [{ at: 600, device: 'Notebook OG', command: 'ping 192.168.50.5' }], check: { kind: 'ping', device: 'Notebook OG' }, until: 10_000 },
  // Sicherheit
  { id: 'firewall', file: 'firewall.json', topic: 'security', layers: [3, 4], actions: [{ at: 600, device: 'Aussen', browse: 'http://203.0.113.80/' }, { at: 3000, device: 'Aussen', command: 'ping 192.168.1.10' }], check: { kind: 'browser', device: 'Aussen', contains: 'DMZ' }, until: 9000,
    tour: [
      { sim: false, highlight: 'Firewall' },
      { highlight: 'Firewall', window: { device: 'Firewall', tab: 'firewall' } },
      { sim: true, pause: false, action: { at: 0, device: 'Aussen', browse: 'http://203.0.113.80/' }, highlight: 'Webserver' },
      { action: { at: 0, device: 'Aussen', command: 'ping 192.168.1.10' }, highlight: 'Firewall' },
      { action: { at: 0, device: 'Büro-PC', command: 'ping 198.51.100.10' }, highlight: 'Büro-PC' },
      { highlight: 'Firewall', window: { device: 'Firewall', tab: 'firewall' } },
    ] },
  { id: 'vpn', file: 'vpn.json', topic: 'security', layers: [3, 4], actions: [{ at: 1000, device: 'PC Zürich', command: 'ping 192.168.2.20' }], check: { kind: 'ping', device: 'PC Zürich', min: 3 }, until: 10_000,
    tour: [
      { sim: false, highlight: 'Internet' },
      { highlight: 'Router Zürich', window: { device: 'Router Zürich', tab: 'vpn' } },
      { highlight: 'Router Bern', window: { device: 'Router Bern', tab: 'vpn' } },
      { sim: true, pause: true, action: { at: 0, device: 'PC Zürich', command: 'ping 192.168.2.20' }, highlight: 'Router Zürich' },
      { pause: false, highlight: 'Internet' },
      { highlight: 'Router Zürich', window: { device: 'Router Zürich', tab: 'vpn' } },
      { action: { at: 0, device: 'PC Zürich', browse: 'http://192.168.2.20/' }, highlight: 'Server Bern' },
    ] },
];

/** Projektdatei einer Demo (Text, wie in docs/beispiele/). */
export function demoProject(demo: Demo): string | undefined {
  const key = Object.keys(files).find((k) => k.endsWith(`/${demo.file}`));
  return key ? files[key] : undefined;
}

/** Desktop-Anwendung, die eine Aktion zeigt. */
export function demoApp(action: DemoAction): 'terminal' | 'browser' | 'mail' {
  return 'browse' in action ? 'browser' : 'mail' in action || 'fetchMail' in action ? 'mail' : 'terminal';
}
