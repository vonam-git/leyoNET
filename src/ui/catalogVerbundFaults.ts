/**
 * Verbund-Fehlersuche: Ein fertig eingerichteter Standort (Router mit Anschluss an den
 * Klassen-Verbund, Webserver mit Portweiterleitung, Dienste-Server mit DHCP und DNS), in den
 * pro Platz andere Fehler eingebaut sind. Der Startwert hängt vom Platz und vom Klassencode ab:
 * Nachbarn haben andere Fehler, beim erneuten Öffnen bleiben sie gleich. Auf dem Beamer zeigt
 * das Verbund-Dashboard «Fehler behoben n/5» pro Standort.
 */
import { FAULT_GOAL_PREFIX, addDnsRecord, addPortForward, applyVerbundAddresses, configureHost, injectFaults, setDhcpServer, setDnsServerEnabled, setVerbund, validSeat, type Goal, type Topology } from '../core';
import { t } from '../i18n';
import { Start, goal, task, unwrap, type CatalogContext, type CatalogEntry } from './catalogKit';
import { VERBUND_HUB_IP, VERBUND_HUB_NAME } from './verbundTemplate';

export const VERBUND_FAULTS = 5;
export const SITE_INTRANET = 'intranet.standort.example';
const KEY = 'verbundFaults';


/** Der Standort, wie er sein soll (Musterlösung), für Platz `seat`. */
export function verbundFaultSite(seat: number): Topology {
  const lan = (n: number) => `192.168.50.${n}`;
  return new Start()
    .add('pc', 'PC 1', -420, -140)
    .add('pc', 'PC 2', -420, -20)
    .add('notebook', 'Notebook', -420, 100)
    .add('server', 'Webserver', -120, 180)
    .add('server', 'Dienste', 60, 180)
    .add('switch', 'Switch', -160, -20)
    .router('Standort-Router', 140, -20, [`${lan(1)}/24`])
    .link('PC 1', 'Switch')
    .link('PC 2', 'Switch')
    .link('Notebook', 'Switch')
    .link('Webserver', 'Switch')
    .link('Dienste', 'Switch')
    .link('Switch', 'Standort-Router')
    .host('PC 1', lan(10), '24', lan(1), lan(53))
    .host('PC 2', lan(11), '24', lan(1), lan(53))
    .host('Webserver', lan(80), '24', lan(1), lan(53))
    .host('Dienste', lan(53), '24', lan(1))
    .web('Webserver', t('catalog.verbundFaults.page'))
    .apply((topology, id) => {
      let next = unwrap(configureHost(topology, id('Notebook'), { ip: '', mask: '', dhcp: true }));
      next = unwrap(setDhcpServer(next, id('Dienste'), { start: lan(100), end: lan(150), gateway: lan(1), dns: lan(53), leaseTime: 86400 }));
      next = unwrap(setDnsServerEnabled(next, id('Dienste'), true));
      next = unwrap(addDnsRecord(next, id('Dienste'), { name: SITE_INTRANET, type: 'A', value: lan(80), ttl: 3600 }));
      next = unwrap(addDnsRecord(next, id('Dienste'), { name: VERBUND_HUB_NAME, type: 'A', value: VERBUND_HUB_IP, ttl: 3600 }));
      const router = id('Standort-Router');
      next = unwrap(setVerbund(next, router, 1));
      next = unwrap(applyVerbundAddresses(next, router, seat));
      return unwrap(addPortForward(next, router, { protocol: 'tcp', port: 80, to: lan(80), toPort: 80 }));
    })
    .area(t('catalog.verbundFaults.area'), 'teal', -520, -230, 760, 500, '192.168.50.0/24').topology;
}

/** Startwert aus Platz und Klassencode (FNV-1a), damit jede Klasse andere Verteilungen hat. */
export function verbundFaultSeed(seat: number, salt = ''): number {
  let h = 0x811c9dc5;
  for (const ch of `${salt}#${seat}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h || seat;
}

export function buildVerbundFaults(ctx: CatalogContext = {}): { topology: Topology; tasks: ReturnType<typeof task> } {
  const seat = validSeat(ctx.seat) ? ctx.seat : 1;
  const solution = verbundFaultSite(seat);
  const { topology, faults } = injectFaults(solution, {
    seed: verbundFaultSeed(seat, ctx.salt),
    count: VERBUND_FAULTS,
    kinds: ['hostMask', 'hostGateway', 'routerIp', 'portShutdown', 'cable', 'dhcpGateway', 'dhcpDns', 'dnsRecord', 'portForward', 'defaultRoute'],
  });
  // Fehlerziele mit neutralem Text: Welcher Fehler wo steckt, verrät erst der Tipp.
  const faultGoals: Goal[] = faults.map((f, i) => ({
    id: `${FAULT_GOAL_PREFIX}${i + 1}`,
    text: t('catalog.verbundFaults.fault', { n: i + 1, total: faults.length }),
    hint: t(`fault.goal.${f.kind}`, { device: f.device, ...f.params }),
    check: f.check,
  }));
  const tasks = task(KEY, 4, [
    goal(KEY, 1, { type: 'verbundSite' }),
    goal(KEY, 2, { type: 'verbundSite', level: 'services' }),
    goal(KEY, 3, { type: 'http', from: 'Notebook', url: `http://${VERBUND_HUB_NAME}/` }, { name: VERBUND_HUB_NAME }),
    goal(KEY, 4, { type: 'http', from: 'PC 1', url: `http://${SITE_INTRANET}/` }, { name: SITE_INTRANET }),
    ...faultGoals,
  ]);
  // Titel ohne Platz: Der Katalog erkennt die Übung am Titel (erledigt-Haken).
  return { topology, tasks: { ...tasks, description: t(`catalog.${KEY}.description`, { n: faults.length }) } };
}

export const VERBUND_FAULT_ENTRIES: CatalogEntry[] = [
  {
    id: 'verbund-fehlersuche',
    stars: 4,
    verbund: true,
    features: ['net.verbund', 'net.nat', 'routing.static', 'service.web', 'service.dhcp', 'service.dns'],
    level: 3,
    build: (ctx) => buildVerbundFaults(ctx),
  },
];
