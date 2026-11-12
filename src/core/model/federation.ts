/**
 * Klassen-Verbund: Jede Person (oder Gruppe) baut einen Standort, die Lehrperson eine
 * Infrastruktur mit Provider («Internet»-Gerät mit `verbundProvider`). Für die Simulation werden
 * Infrastruktur und Standorte zu EINEM Netz zusammengesetzt: Der Anschluss jedes Standorts
 * (Gerät mit `verbund`) hängt an einem eigenen Anschluss des Providers.
 *
 * Adressplan je Platz n (1–62), aus dem Dokumentationsnetz 203.0.113.0/24 (RFC 5737):
 *   Transfernetz 203.0.113.(4n)/30, Provider .(4n+1), Standort .(4n+2).
 * Die Zentrale der Infrastruktur liegt üblicherweise in 198.51.100.0/24.
 *
 * Kennungen: Der eigene Standort behält seine Kennungen (die Oberfläche zeigt ihn an), alle
 * anderen Teile bekommen neue, eindeutige Kennungen und MAC-Adressen; Namen erhalten den
 * Standort als Vorsilbe («Bern: PC 1»).
 */
import { macFor } from './mac';
import type { Cable, Device, DocArea, TagColor, Topology } from './types';
import { portMedium } from './links';

export const VERBUND_MAX_SEAT = 62;
export const VERBUND_NET = '203.0.113';

export interface VerbundAddresses {
  network: string;
  provider: string;
  site: string;
  mask: string;
}

/** Adressen des Transfernetzes für Platz n. */
export function verbundAddresses(seat: number): VerbundAddresses {
  const base = 4 * seat;
  return { network: `${VERBUND_NET}.${base}`, provider: `${VERBUND_NET}.${base + 1}`, site: `${VERBUND_NET}.${base + 2}`, mask: '255.255.255.252' };
}

export const validSeat = (seat: unknown): seat is number => Number.isInteger(seat) && (seat as number) >= 1 && (seat as number) <= VERBUND_MAX_SEAT;

/** Anzeigename eines Standorts: Gruppe, sonst «Platz n». */
export const siteName = (seat: number, label?: string) => (label?.trim() ? label.trim() : `Platz ${seat}`);

export interface VerbundSite {
  seat: number;
  label?: string;
  topology: Topology;
  /** Der eigene Standort: Kennungen bleiben, keine Vorsilbe. */
  own?: boolean;
}

export interface FederatedSite {
  seat: number;
  name: string;
  /** Kennungen der Geräte dieses Standorts im zusammengesetzten Netz. */
  devices: string[];
  /** Anschlussgerät im zusammengesetzten Netz (fehlt: Standort noch nicht verbunden). */
  uplink: string | null;
  /** Hat ein Anschlussgerät, aber kein freier oder passender Provider-Anschluss. */
  problem?: 'noProvider' | 'seatTaken';
}

export interface Federation {
  topology: Topology;
  sites: FederatedSite[];
  /** Provider im zusammengesetzten Netz. */
  provider: string | null;
  /** Kennungen der Geräte der Infrastruktur. */
  infra: string[];
}

const COLORS: TagColor[] = ['blue', 'green', 'orange', 'purple', 'teal', 'pink', 'yellow', 'red'];
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const num = (id: string) => Number(id.slice(1)) || 0;

/** Bereich, in dem ein Teil im zusammengesetzten Netz liegt (Raster um die Infrastruktur). */
function bounds(t: Topology) {
  const xs = t.devices.map((d) => d.position.x);
  const ys = t.devices.map((d) => d.position.y);
  if (!xs.length) return { x: 0, y: 0, w: 400, h: 300 };
  const x = Math.min(...xs) - 120;
  const y = Math.min(...ys) - 120;
  return { x, y, w: Math.max(...xs) - x + 120, h: Math.max(...ys) - y + 120 };
}

/** Teil mit neuen Kennungen (Offset), Vorsilbe und Verschiebung einfügen. */
function relabel(part: Topology, offset: number, prefix: string | null, dx: number, dy: number) {
  const ids = new Map<string, string>();
  const areaIds = new Map<string, string>();
  const keep = offset === 0;
  const areas: DocArea[] = (part.areas ?? []).map((a) => {
    const id = keep ? a.id : `a${offset + num(a.id)}`;
    areaIds.set(a.id, id);
    return { ...clone(a), id, x: a.x + dx, y: a.y + dy };
  });
  const devices: Device[] = part.devices.map((d) => {
    const n = keep ? num(d.id) : offset + num(d.id);
    const id = keep ? d.id : `d${n}`;
    ids.set(d.id, id);
    const copy: Device = clone(d);
    copy.id = id;
    copy.name = prefix ? `${prefix}: ${d.name}` : d.name;
    copy.position = { x: d.position.x + dx, y: d.position.y + dy };
    if (!keep) copy.interfaces = copy.interfaces.map((i) => ({ ...i, mac: macFor(n, i.index) }));
    if (copy.rack) copy.rack = areaIds.get(copy.rack) ?? copy.rack;
    return copy;
  });
  const cables: Cable[] = part.cables.flatMap((c) => {
    const a = ids.get(c.a.device);
    const b = ids.get(c.b.device);
    if (!a || !b) return [];
    return [{ ...clone(c), id: keep ? c.id : `c${offset + num(c.id)}`, a: { ...c.a, device: a }, b: { ...c.b, device: b } }];
  });
  return { devices, cables, areas, ids };
}

/**
 * Infrastruktur und Standorte zu einem Netz zusammensetzen. Reihenfolge der Kennungen:
 * eigener Standort unverändert, Infrastruktur ab 9 000 000, Platz n ab n × 100 000.
 */
export function federate(infra: Topology, sites: readonly VerbundSite[]): Federation {
  const seen = new Set<number>();
  const own = sites.find((s) => s.own);
  const base: Topology = own ? clone(own.topology) : { devices: [], cables: [], nextId: 1 };
  const devices: Device[] = [];
  const cables: Cable[] = [];
  const areas: DocArea[] = [];

  // Infrastruktur in der Mitte.
  const inf = relabel(infra, 9_000_000, null, 0, 0);
  devices.push(...inf.devices);
  cables.push(...inf.cables);
  areas.push(...inf.areas);
  const providerDevice = inf.devices.find((d) => d.verbundProvider) ?? inf.devices.find((d) => d.type === 'internet') ?? null;
  const infraBox = bounds(infra);

  const result: FederatedSite[] = [];
  const ordered = [...sites].sort((a, b) => a.seat - b.seat);
  ordered.forEach((site, k) => {
    const name = siteName(site.seat, site.label);
    if (seen.has(site.seat)) {
      result.push({ seat: site.seat, name, devices: [], uplink: null, problem: 'seatTaken' });
      return;
    }
    seen.add(site.seat);
    // Standorte im Kreis um die Infrastruktur.
    const box = bounds(site.topology);
    const angle = (2 * Math.PI * k) / Math.max(1, ordered.length) - Math.PI / 2;
    const radius = Math.max(infraBox.w, infraBox.h) / 2 + Math.max(box.w, box.h) / 2 + 260 + ordered.length * 18;
    const cx = infraBox.x + infraBox.w / 2 + Math.cos(angle) * radius;
    const cy = infraBox.y + infraBox.h / 2 + Math.sin(angle) * radius;
    const dx = site.own ? 0 : Math.round(cx - (box.x + box.w / 2));
    const dy = site.own ? 0 : Math.round(cy - (box.y + box.h / 2));
    const part = site.own ? { devices: base.devices, cables: base.cables, areas: base.areas ?? [], ids: new Map(base.devices.map((d) => [d.id, d.id])) } : relabel(site.topology, site.seat * 100_000, name, dx, dy);
    if (!site.own) {
      devices.push(...part.devices);
      cables.push(...part.cables);
      const b = bounds({ ...site.topology, devices: part.devices });
      areas.push({ id: `a${site.seat * 100_000 + 99_999}`, title: name, color: COLORS[(site.seat - 1) % COLORS.length]!, x: b.x, y: b.y, width: b.w, height: b.h });
    }
    const uplink = part.devices.find((d) => d.verbund) ?? null;
    result.push({ seat: site.seat, name, devices: part.devices.map((d) => d.id), uplink: uplink?.id ?? null, ...(uplink && !providerDevice ? { problem: 'noProvider' as const } : {}) });
  });

  // Provider: je verbundenem Standort ein Anschluss im Transfernetz des Platzes.
  if (providerDevice) {
    const used = new Set(cables.flatMap((c) => [c.a, c.b]).filter((e) => e.device === providerDevice.id).map((e) => e.iface));
    let cableSeq = 9_900_000;
    for (const site of result) {
      if (!site.uplink) continue;
      const uplink = [...devices, ...base.devices].find((d) => d.id === site.uplink)!;
      const wan = uplink.verbund!.iface;
      const addr = verbundAddresses(site.seat);
      // Freien Anschluss suchen oder anfügen (im Verbund gilt die Höchstzahl nicht).
      let index = providerDevice.interfaces.findIndex((i, n) => !used.has(n) && !i.ip);
      if (index < 0) {
        index = providerDevice.interfaces.length;
        providerDevice.interfaces.push({ index, mac: macFor(num(providerDevice.id), index) } as Device['interfaces'][number]);
      }
      used.add(index);
      providerDevice.interfaces[index] = { ...providerDevice.interfaces[index]!, ip: addr.provider, mask: addr.mask };
      // Bestehendes Kabel am WAN-Anschluss des Standorts (z.B. zu einem eigenen Internet-Gerät) ersetzen.
      const pool = site.uplink && base.devices.some((d) => d.id === site.uplink) ? base.cables : cables;
      for (let i = pool.length - 1; i >= 0; i--) {
        const c = pool[i]!;
        if ((c.a.device === uplink.id && c.a.iface === wan) || (c.b.device === uplink.id && c.b.iface === wan)) pool.splice(i, 1);
      }
      const medium = portMedium(uplink, wan) ?? 'tp';
      cables.push({ id: `c${cableSeq++}`, a: { device: uplink.id, iface: wan }, b: { device: providerDevice.id, iface: index }, ...(medium !== 'tp' ? { medium } : {}) });
    }
  }

  const topology: Topology = {
    ...base,
    devices: [...base.devices, ...devices],
    cables: [...base.cables, ...cables],
    areas: [...(base.areas ?? []), ...areas],
    nextId: Math.max(base.nextId, 1),
  };
  return { topology, sites: result, provider: providerDevice?.id ?? null, infra: inf.devices.map((d) => d.id) };
}

/** Geräte des eigenen Standorts aus einer zusammengesetzten Topologie (zum Speichern). */
export const isForeignId = (id: string) => num(id) >= 100_000;
