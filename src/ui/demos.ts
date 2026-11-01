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

export type DemoTopic = 'basics' | 'services' | 'switching' | 'routing' | 'access';
export const DEMO_TOPICS: readonly DemoTopic[] = ['basics', 'services', 'switching', 'routing', 'access'];

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
  | { kind: 'trace'; device: string };

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
}

export const DEMOS: readonly Demo[] = [
  // Grundlagen
  { id: 'arpPing', file: 'arp-ping.json', topic: 'basics', layers: [2, 3], actions: [{ at: 600, device: 'PC 1', command: 'ping 192.168.1.11' }], check: { kind: 'ping', device: 'PC 1' }, until: 8000 },
  { id: 'gateway', file: 'zwei-subnetze.json', topic: 'basics', layers: [3], actions: [{ at: 600, device: 'PC 1', command: 'ping 192.168.2.10' }], check: { kind: 'ping', device: 'PC 1' }, until: 8000 },
  // Dienste
  { id: 'dhcp', file: 'dhcp.json', topic: 'services', layers: [7], actions: [{ at: 4500, device: 'Notebook 1', command: 'ipconfig /all' }], check: { kind: 'dhcp', devices: ['Notebook 1', 'Notebook 2', 'PC 1'] }, until: 10_000 },
  { id: 'web', file: 'web.json', topic: 'services', layers: [4, 7], actions: [{ at: 2500, device: 'Notebook 1', browse: 'http://www.schule.example/stundenplan.html' }], check: { kind: 'browser', device: 'Notebook 1', contains: 'Stundenplan' }, until: 6000 },
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
  { id: 'storm', file: 'broadcast-sturm.json', topic: 'switching', layers: [2], actions: [{ at: 600, device: 'PC 1', command: 'ping 192.168.1.11' }], check: { kind: 'storm' }, until: 3000 },
  { id: 'routerOnAStick', file: 'router-on-a-stick.json', topic: 'switching', layers: [2, 3], actions: [{ at: 600, device: 'PC Verwaltung', command: 'ping 192.168.20.11' }], check: { kind: 'ping', device: 'PC Verwaltung' }, until: 8000 },
  { id: 'l3switch', file: 'layer3-switch.json', topic: 'switching', layers: [2, 3], actions: [{ at: 5000, device: 'Notebook 1', command: 'ping 10.99.0.10' }], check: { kind: 'ping', device: 'Notebook 1' }, until: 15_000 },
  // Routing
  { id: 'static', file: 'statische-routen.json', topic: 'routing', layers: [3], actions: [{ at: 600, device: 'PC A', command: 'tracert 192.168.20.10' }], check: { kind: 'trace', device: 'PC A' }, until: 10_000 },
  { id: 'ospf', file: 'ospf.json', topic: 'routing', layers: [3], actions: [{ at: 9000, device: 'PC 1', command: 'tracert 192.168.2.10' }], check: { kind: 'trace', device: 'PC 1' }, until: 20_000 },
  { id: 'rip', file: 'rip.json', topic: 'routing', layers: [3, 4], actions: [{ at: 9000, device: 'PC 1', command: 'tracert 192.168.2.10' }], check: { kind: 'trace', device: 'PC 1' }, until: 20_000 },
  { id: 'bgp', file: 'bgp.json', topic: 'routing', layers: [4, 7], actions: [{ at: 12_000, device: 'PC AS 65001', command: 'ping 10.3.0.10' }], check: { kind: 'ping', device: 'PC AS 65001' }, until: 25_000 },
  // Zugang ins Internet
  { id: 'nat', file: 'heimnetz-nat.json', topic: 'access', layers: [3, 4], actions: [{ at: 600, device: 'PC', browse: 'http://198.51.100.10/' }], check: { kind: 'browser', device: 'PC', contains: 'Öffentlicher Webserver' }, until: 6000 },
  { id: 'cpe', file: 'cpe-heimnetz.json', topic: 'access', layers: [1, 2, 3, 7], actions: [{ at: 6000, device: 'Notebook', browse: 'http://198.51.100.10/' }], check: { kind: 'browser', device: 'Notebook', contains: 'Internet-Box' }, until: 12_000 },
  { id: 'ppp', file: 'seriell-ppp.json', topic: 'access', layers: [1, 2], actions: [{ at: 1500, device: 'PC Zürich', command: 'ping 192.168.2.10' }], check: { kind: 'ping', device: 'PC Zürich' }, until: 10_000 },
  { id: 'wlan', file: 'wlan-mesh.json', topic: 'access', layers: [1, 2], actions: [{ at: 600, device: 'Notebook OG', command: 'ping 192.168.50.5' }], check: { kind: 'ping', device: 'Notebook OG' }, until: 10_000 },
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
