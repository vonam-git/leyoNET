/**
 * Arbeitsblätter zu den Übungen ohne eigenes Blatt (Reiter «Alle», ohne Modulreihe).
 * Inhalt aus dem Katalog: Auftrag, Lernziele, Fragen; die Musterlösung zeigt zusätzlich,
 * was die Musterlösung (catalogSolutions.ts) gegenüber dem Startnetz ändert, als
 * Konfiguration im Stil der Befehlszeile. Erzeugt mit `npm run arbeitsblaetter`,
 * geprüft in worksheets.test.ts. Nicht Teil der App.
 */
import { hasCli, runningConfig, type Device, type Goal, type Topology } from '../core';
import { t } from '../i18n';
import { CATALOG } from './catalog';
import { generalSheet, type CatalogEntry } from './catalogKit';
import { interfaceLabel } from './labels';
import { ANSWERS, SOLUTIONS } from './catalogSolutions';

type Block = Record<string, unknown>;
export interface Sheet {
  module: string;
  series: string;
  file: string;
  block: string;
  title: string;
  subtitle: string;
  entries: string[];
  projects: string[];
  intro: Block[];
  sections: { id: string; heading: string; stars: number; catalog: string; blocks: Block[] }[];
}

/** Nur WinAnsi: Pfeile und Sterne ersetzen, alles Unbekannte als «?». */
export function winAnsi(text: string): string {
  const mapped = text.replace(/→/g, '->').replace(/←/g, '<-').replace(/↔/g, '<->').replace(/★/g, '*').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '!=').replace(/ | /g, ' ');
  return [...mapped].map((c) => (c === '\n' || c === '\t' || /[\x20-\x7e -ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/.test(c) ? c : '?')).join('');
}

/** Text aus dem Katalog (Absätze, «- »-Listen, `Befehle`) in Blöcke des Arbeitsblatts. */
function textBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push({ list });
    list = [];
  };
  for (const raw of winAnsi(text).split('\n')) {
    const line = raw.trim().replace(/`([^`]+)`/g, '«$1»');
    if (!line) {
      flush();
      continue;
    }
    const item = /^[-*•]\s+(.*)$/.exec(line) ?? /^\d+[.)]\s+(.*)$/.exec(line);
    if (item) list.push(item[1]!);
    else {
      flush();
      blocks.push(/^#+\s/.test(line) ? { h: line.replace(/^#+\s*/, '') } : { p: line });
    }
  }
  flush();
  return blocks;
}

// --- Musterlösung: Unterschied Startnetz → gelöst --------------------------------------------

/** Konfiguration in Abschnitte: Kopfzeile ohne Einzug plus eingerückte Zeilen. */
function stanzas(lines: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of lines) {
    if (line.startsWith('!') || !line.trim()) {
      current = null;
      continue;
    }
    if (line.startsWith(' ') && current) current.push(line);
    else {
      current = [line];
      out.set(line, current);
    }
  }
  return out;
}

const cidr = (ip?: string, mask?: string) => (ip ? `${ip}${mask ? ` ${mask}` : ''}` : '');

/** Kurzbeschreibung der Einstellungen eines Endgeräts oder Dienstes (ohne Befehlszeile). */
function settings(d: Device): string[] {
  const lines: string[] = [];
  d.interfaces.forEach((p, i) => {
    const parts = [i === 0 && d.dhcp ? 'DHCP' : cidr(p.ip, p.mask), p.ipv6 ? `IPv6 ${p.ipv6}` : ''].filter(Boolean);
    if (parts.length) lines.push(`${interfaceLabel(d, i)}: ${parts.join(', ')}`);
  });
  if (d.gateway) lines.push(`Standardgateway ${d.gateway}`);
  if (d.dns) lines.push(`DNS-Server ${d.dns}`);
  if (d.ipv6Auto) lines.push('IPv6 automatisch');
  if (d.gateway6) lines.push(`IPv6-Gateway ${d.gateway6}`);
  for (const r of d.routes ?? []) lines.push(`Route ${r.network} ${r.mask}${r.gateway ? ` über ${r.gateway}` : ''}`);
  const s = d.dhcpServer;
  if (s) {
    lines.push(`DHCP-Server: ${s.start} bis ${s.end}${s.gateway ? `, Gateway ${s.gateway}` : ''}${s.dns ? `, DNS ${s.dns}` : ''}`);
    for (const sc of s.scopes ?? []) lines.push(`  Bereich ${sc.start} bis ${sc.end} ${sc.mask}${sc.gateway ? `, Gateway ${sc.gateway}` : ''}`);
    for (const r of s.reservations ?? []) lines.push(`  Reservation ${JSON.stringify(r).replace(/[{}"]/g, '')}`);
  }
  for (const r of d.dnsServer?.records ?? []) lines.push(`DNS-Eintrag ${r.name} ${r.type} ${r.value}`);
  if (d.dnsServer?.forwarder) lines.push(`DNS-Weiterleitung an ${d.dnsServer.forwarder}`);
  if (d.webServer) lines.push('Webserver eingeschaltet');
  if (d.mailServer) lines.push('Mailserver eingeschaltet');
  if (d.wlan) lines.push(`WLAN «${d.wlan.ssid}»${d.wlan.password ? ' mit Passwort' : ' offen'}, Kanal ${d.wlan.channel}`);
  if (d.wifi) lines.push(`verbunden mit WLAN «${d.wifi.ssid}»`);
  return lines;
}

/** Firewall, NAT, VPN und DS-Lite in Worten (stehen nicht in der Befehlszeilen-Konfiguration). */
function security(d: Device): string[] {
  const lines: string[] = [];
  // Firewall auf Router/Firewall und 1:1-NAT stehen schon in der running-config.
  const inConfig = hasCli(d.type);
  const fw = inConfig && (d.type === 'router' || d.type === 'firewall') ? undefined : d.firewall;
  if (fw) {
    lines.push(`Firewall: Standard ${fw.defaultAction}${fw.stateful === false ? ', zustandslos' : ''}`);
    for (const r of fw.rules) lines.push(`  ${r.action} ${r.protocol} von ${r.src} nach ${r.dst}${r.port ? ` Port ${r.port}` : ''}${r.iface !== undefined ? ` (an ${interfaceLabel(d, r.iface)})` : ''}`);
  }
  for (const n of (d.staticNat ?? []).filter((x) => !inConfig || x.kind)) lines.push(`${n.kind ? n.kind.toUpperCase() : 'Statisches NAT'} ${n.inside} <-> ${n.outside}`);
  for (const f of d.portForwards ?? []) lines.push(`Portweiterleitung ${f.protocol} ${f.port} -> ${f.to}:${f.toPort}`);
  for (const v of d.vpn ?? []) lines.push(`VPN «${v.name}»: Gegenstelle ${v.peer}, eigenes Netz ${v.local}, entferntes Netz ${v.remote}, Schlüssel ${v.key}`);
  if (d.dsLite) lines.push(`DS-Lite, AFTR ${d.dsLite.aftr}`);
  if (d.aftr) lines.push('AFTR eingeschaltet (DS-Lite beim Provider)');
  return lines;
}
const SECURITY_FIELDS = ['firewall', 'staticNat', 'portForwards', 'vpn', 'dsLite', 'aftr'];

/** Was sonst noch geändert wurde, als Feldname. */
function otherChanges(before: Device | undefined, after: Device, shown: Set<string>): string[] {
  const skip = new Set(['id', 'name', 'type', 'position', 'interfaces', 'cli', 'vlanDb', ...SECURITY_FIELDS, ...shown]);
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]);
  const changed = [...keys].filter((k) => !skip.has(k) && JSON.stringify((before as unknown as Record<string, unknown>)?.[k]) !== JSON.stringify((after as unknown as Record<string, unknown>)[k]));
  return changed.length ? [`weitere Einstellungen: ${changed.join(', ')}`] : [];
}

const SETTINGS_FIELDS = ['gateway', 'dns', 'dhcp', 'ipv6Auto', 'gateway6', 'routes', 'dhcpServer', 'dnsServer', 'webServer', 'mailServer', 'wlan', 'wifi'];
const CLI_FIELDS = ['routes', 'vlans', 'vlanNames', 'svis', 'subinterfaces', 'loopbacks', 'vrfs', 'vxlan', 'acls', 'dhcpPools', 'dhcpExcluded', 'ospf', 'rip', 'bgp', 'stp', 'stpPriority', 'ipRouting', 'routingMode'];

/** Konfigurationsänderungen der Musterlösung, je Gerät, als Textzeilen. */
export function solutionLines(start: Topology, solved: Topology): string[] {
  const out: string[] = [];
  const name = (top: Topology, id: string) => top.devices.find((d) => d.id === id)?.name ?? id;
  for (const d of solved.devices) {
    const before = start.devices.find((x) => x.id === d.id);
    const lines: string[] = [];
    if (!before) lines.push(`neues Gerät (${t(`device.${d.type}`)})`);
    if (hasCli(d.type)) {
      const a = before ? stanzas(runningConfig(before)) : new Map<string, string[]>();
      const b = stanzas(runningConfig(d));
      for (const [head, stanza] of b) if (a.get(head)?.join('\n') !== stanza.join('\n') && !(stanza.length === 1 && /^interface /.test(head))) lines.push(...stanza);
      for (const head of a.keys()) if (!b.has(head) && !/^interface /.test(head)) lines.push(`no ${head}`);
      lines.push(...otherChanges(before, d, new Set(CLI_FIELDS)));
    } else {
      const was = new Set(before ? settings(before) : []);
      lines.push(...settings(d).filter((l) => !was.has(l)));
      lines.push(...otherChanges(before, d, new Set(SETTINGS_FIELDS)));
    }
    const was = new Set(before ? security(before) : []);
    lines.push(...security(d).filter((l) => !was.has(l)));
    if (lines.length) out.push(`${d.name}:`, ...lines.map((l) => `  ${l}`), '');
  }
  const key = (top: Topology, c: Topology['cables'][number]) => [`${name(top, c.a.device)} (${port(top, c.a.device, c.a.iface)})`, `${name(top, c.b.device)} (${port(top, c.b.device, c.b.iface)})`].sort().join(' - ');
  const port = (top: Topology, device: string, iface: number) => {
    const d = top.devices.find((x) => x.id === device);
    return d ? interfaceLabel(d, iface) : String(iface);
  };
  const was = new Set(start.cables.map((c) => key(start, c)));
  const now = new Set(solved.cables.map((c) => key(solved, c)));
  const added = [...now].filter((k) => !was.has(k));
  const removed = [...was].filter((k) => !now.has(k));
  if (added.length || removed.length) out.push('Kabel:', ...added.map((k) => `  + ${k}`), ...removed.map((k) => `  - ${k}`), '');
  return out.map(winAnsi);
}

// --- Blätter -----------------------------------------------------------------------------------

/** Antwort einer Frage für die Musterlösung. */
function answerOf(entry: CatalogEntry, goal: Goal): string | undefined {
  return ANSWERS[entry.id]?.[goal.id] ?? (goal.check.type === 'answer' ? goal.check.accept?.[0] : undefined);
}

function sheetOf(entry: CatalogEntry): Sheet {
  const { topology, tasks } = entry.build();
  const solve = SOLUTIONS[entry.id];
  const config = solve ? solutionLines(topology, solve(topology)) : [];
  const questions = tasks.goals.filter((g) => g.check.type === 'answer');
  const hints = tasks.goals.flatMap((g) => (g.hint ? [winAnsi(g.hint)] : []));
  const level = entry.level ? `Profil ${entry.level}: ${t(`profile.${entry.level}`)}` : '';
  const file = entry.sheet ?? generalSheet(entry.id);
  const title = winAnsi(tasks.title);
  return {
    module: 'Aufgaben-Katalog',
    series: 'Alle',
    file,
    block: title,
    title,
    subtitle: [`Schwierigkeit ${entry.stars} von 5`, level].filter(Boolean).join(' · '),
    entries: [entry.id],
    projects: [file],
    intro: [],
    sections: [
      {
        id: 'a1',
        heading: 'Auftrag',
        stars: entry.stars,
        catalog: tasks.title,
        blocks: [
          ...textBlocks(tasks.description ?? ''),
          { h: 'Lernziele' },
          { list: tasks.goals.map((g) => winAnsi(g.text)), ordered: true },
          ...(hints.length ? [{ h: 'Hinweise' }, { list: hints }] : []),
          ...(questions.length ? [{ h: 'Fragen' }] : []),
          ...questions.map((g) => ({
            question: {
              name: g.id,
              lines: 1,
              text: winAnsi(g.check.type === 'answer' && g.check.options ? `${g.text} (${g.check.options.join(' / ')})` : g.text),
              answer: winAnsi(answerOf(entry, g) ?? ''),
            },
          })),
          { h: 'Dokumentation' },
          { question: { name: 'vorgehen', lines: 5, text: 'Was hast du eingerichtet? Notiere Geräte, Adressen und die wichtigsten Befehle oder Einstellungen.', answer: config.length ? 'Siehe Musterlösung: Konfiguration (unten).' : 'Keine Konfiguration nötig.' } },
          { question: { name: 'pruefung', lines: 3, text: 'Wie hast du kontrolliert, dass es funktioniert? (z.B. ping, Webseite im Browser, Routingtabelle, Paketliste)', answer: winAnsi(tasks.goals.map((g, i) => `${i + 1}. ${g.text}`).join(' ')) } },
          { check: tasks.goals.length },
          ...(config.length ? [{ solutionCode: { title: 'Musterlösung: Konfiguration (Änderungen gegenüber dem Startnetz)', lines: config } }] : []),
        ],
      },
    ],
  };
}

/** Alle Übungen ohne Modulreihe, in Katalog-Reihenfolge. */
export function catalogSheets(): Sheet[] {
  return CATALOG.filter((e) => !e.series).map(sheetOf);
}
