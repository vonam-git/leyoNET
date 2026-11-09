import type { Topology } from '../core';
import type { CatalogEntry } from './catalogKit';
import { usedFeatures } from './features';

/**
 * Themen-Tags für den Aufgaben-Katalog, abgeleitet aus den Funktionen einer Übung
 * (vorgegeben und im Startnetz verwendet) und aus den Prüfarten ihrer Lernziele.
 * So bekommen neue Übungen ihre Tags von selbst. Anzeige: `catalog.tag.<id>`.
 */
const BY_FEATURE: Record<string, string> = {
  'net.vlan': 'vlan',
  'net.subinterfaces': 'vlan',
  'device.l3switch': 'layer3',
  'routing.static': 'routing',
  'routing.auto': 'routing',
  'routing.ospf': 'ospf',
  'routing.rip': 'rip',
  'routing.bgp': 'bgp',
  'service.dhcp': 'dhcp',
  'net.dhcpRelay': 'dhcp',
  'service.dns': 'dns',
  'service.web': 'http',
  'service.mail': 'email',
  'net.nat': 'nat',
  'net.cgnat': 'nat',
  'net.acl': 'acl',
  'net.firewall': 'firewall',
  'device.firewall': 'firewall',
  'net.stp': 'stp',
  'net.lag': 'lacp',
  'net.ipv6': 'ipv6',
  'net.vpn': 'vpn',
  'net.vrf': 'vrf',
  'net.vxlan': 'vxlan',
  'net.cli': 'cli',
  'net.ssh': 'ssh',
  'medium.wireless': 'wlan',
  'medium.fiber': 'glasfaser',
  'medium.access': 'internetzugang',
  'device.modem': 'internetzugang',
  'tool.sniffer': 'paketanalyse',
};

const BY_CHECK: Record<string, string> = {
  dhcpLease: 'dhcp',
  dhcpServer: 'dhcp',
  dnsRecord: 'dns',
  http: 'http',
  mail: 'email',
  packetSeen: 'paketanalyse',
  hostVlan: 'vlan',
  trunk: 'vlan',
  vlanDocumented: 'vlan',
  noStorm: 'stp',
  seenAs: 'nat',
  areaNote: 'subnetting',
  inNetwork: 'subnetting',
  budget: 'planung',
};

export function tagsOf(entry: CatalogEntry, topology: Topology, checks: readonly string[]): string[] {
  const tags = new Set<string>();
  for (const f of [...(entry.features ?? []), ...usedFeatures(topology)]) if (BY_FEATURE[f]) tags.add(BY_FEATURE[f]);
  for (const c of checks) if (BY_CHECK[c]) tags.add(BY_CHECK[c]);
  if (!tags.size) tags.add('basics');
  return [...tags].sort();
}

/** Suchtext normalisieren: klein, ohne Akzente, ä/ö/ü wie ae/oe/ue gefunden. */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Passt der Eintrag zur Suche? Alle Wörter müssen vorkommen (in Titel, Beschreibung oder Tags). */
export function matchesSearch(haystack: string, query: string): boolean {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = normalizeSearch(haystack);
  return words.every((w) => text.includes(w));
}
