/**
 * Austauschformat für Aufgaben und Prüfungen mit einer KI.
 *
 * Die Lehrperson exportiert eine Aufgabe (Startnetz und Prüfziele) zusammen mit einer
 * Anleitung (siehe src/ui/examAi.ts), lässt eine KI nach diesem Schema neue Aufgaben
 * schreiben und importiert die Antwort wieder. Das Format ist bewusst einfacher als die
 * Projektdatei: Geräte heissen nach ihrem Namen, Kabel verbinden Namen, IDs und MAC-Adressen
 * entstehen beim Import. Alles wird streng geprüft (Grenzen, Gerätetypen, Adressen über die
 * Funktionen des Kerns, Prüfziele über readTasks); die Antwort einer KI gilt als fremde Eingabe.
 */
import { DEVICE_SPECS, DEVICE_TYPES, isDeviceType } from '../model/devices';
import { addDevice, configureHost, connect, emptyTopology, getDevice, setInterfaceAddress, setInterfaceCount } from '../model/topology';
import { MEDIA, type DeviceType, type Medium, type Topology } from '../model/types';
import { readTasks, type Goal, type TaskSet } from './tasks';

export const AI_FORMAT = 'leyonet-ki-aufgabe';
export const AI_FORMAT_VERSION = 1;
/** Grenzen für den Import: grösser ist keine Unterrichtsaufgabe mehr, sondern ein Versehen. */
export const AI_LIMITS = { chars: 300_000, devices: 150, links: 300, goals: 100, text: 2000 } as const;

export interface AiDevice {
  name: string;
  type: DeviceType;
  x?: number;
  y?: number;
  /** Anzahl Ethernet-Anschlüsse, wenn abweichend vom Gerätetyp. */
  ports?: number;
  /** Feste Adressen je Anschluss (Router, Firewall, L3-Switch, Server …). */
  addresses?: { port: number; ip: string; mask: string }[];
  /** Nur Endgeräte. */
  gateway?: string;
  dns?: string;
  dhcp?: boolean;
}

export interface AiLink {
  a: string;
  b: string;
  medium?: Medium;
  aPort?: number;
  bPort?: number;
}

export interface AiGoal {
  text: string;
  check: Goal['check'];
  points?: number;
  section?: string;
  hint?: string;
}

export interface AiExchange {
  format: typeof AI_FORMAT;
  version: number;
  title: string;
  description?: string;
  difficulty?: number;
  grading?: boolean;
  start: { devices: AiDevice[]; links: AiLink[] };
  goals: AiGoal[];
}

export type AiImportError = { code: string; params?: Record<string, string | number> };
export type AiImportResult = { ok: true; topology: Topology; tasks: TaskSet } | { ok: false; path: string; error?: AiImportError };

/** Aktuelle Aufgabe und Startnetz ins Austauschformat (für das Beispiel in der Anleitung). */
export function toAiExchange(topology: Topology, tasks: TaskSet | null): AiExchange {
  const byId = new Map(topology.devices.map((d) => [d.id, d.name]));
  const devices = topology.devices.map((d): AiDevice => {
    const ethernet = d.interfaces.filter((i) => !i.serial && !i.sfpSlot).length;
    const addresses = d.interfaces.filter((i) => i.ip && i.mask && !d.dhcp).map((i) => ({ port: i.index, ip: i.ip!, mask: i.mask! }));
    return {
      name: d.name,
      type: d.type,
      x: Math.round(d.position.x),
      y: Math.round(d.position.y),
      ...(ethernet !== DEVICE_SPECS[d.type].defaultInterfaces ? { ports: ethernet } : {}),
      ...(addresses.length ? { addresses } : {}),
      ...(d.gateway ? { gateway: d.gateway } : {}),
      ...(d.dns ? { dns: d.dns } : {}),
      ...(d.dhcp ? { dhcp: true } : {}),
    };
  });
  const links = topology.cables.map(
    (c): AiLink => ({
      a: byId.get(c.a.device) ?? c.a.device,
      b: byId.get(c.b.device) ?? c.b.device,
      ...(c.medium && c.medium !== 'tp' ? { medium: c.medium } : {}),
      aPort: c.a.iface,
      bPort: c.b.iface,
    }),
  );
  return {
    format: AI_FORMAT,
    version: AI_FORMAT_VERSION,
    title: tasks?.title ?? topology.title ?? '',
    ...(tasks?.description ? { description: tasks.description } : {}),
    ...(tasks?.difficulty ? { difficulty: tasks.difficulty } : {}),
    ...(tasks?.grading ? { grading: true } : {}),
    start: { devices, links },
    goals: (tasks?.goals ?? []).map((g) => ({
      text: g.text,
      check: g.check,
      ...(g.points !== undefined ? { points: g.points } : {}),
      ...(g.section ? { section: g.section } : {}),
      ...(g.hint ? { hint: g.hint } : {}),
    })),
  };
}

/** Antwort einer KI lesen: JSON allein oder in einem Codeblock ```json … ``` mit Text rundherum. */
export function extractJson(text: string): string | null {
  const fence = /```(?:json)?\s*\n([\s\S]*?)```/i.exec(text);
  const body = fence ? fence[1]! : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : null;
}

class Invalid extends Error {
  constructor(
    readonly path: string,
    readonly error?: AiImportError,
  ) {
    super(path);
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Antwort der KI prüfen und daraus Startnetz und Aufgabe bauen. */
export function fromAiExchange(text: string): AiImportResult {
  try {
    return build(text);
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, path: e.path, ...(e.error ? { error: e.error } : {}) };
    throw e;
  }
}

function build(text: string): AiImportResult {
  const invalid = (path: string, error?: AiImportError): never => {
    throw new Invalid(path, error);
  };
  const limit = (max: number): AiImportError => ({ code: 'aiLimit', params: { max } });
  if (text.length > AI_LIMITS.chars) invalid('size');
  const json = extractJson(text) ?? invalid('json');
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    invalid('json');
  }
  if (!isObject(raw)) invalid('json');
  const r = raw as Record<string, unknown>;
  if (r.format !== AI_FORMAT) invalid('format');
  if (r.version !== AI_FORMAT_VERSION) invalid('version');
  const str = (v: unknown, path: string, max: number = AI_LIMITS.text) => (typeof v === 'string' && v.length <= max ? v : invalid(path));
  const optStr = (v: unknown, path: string) => (v === undefined ? undefined : str(v, path));
  const int = (v: unknown, path: string, min: number, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : invalid(path));
  const title = str(r.title, 'title', 120).trim() || invalid('title');

  const start = isObject(r.start) ? r.start : { devices: [], links: [] };
  const devices = Array.isArray(start.devices) ? start.devices : invalid('start.devices');
  const links = start.links === undefined ? [] : Array.isArray(start.links) ? start.links : invalid('start.links');
  if (devices.length > AI_LIMITS.devices) invalid('start.devices', limit(AI_LIMITS.devices));
  if (links.length > AI_LIMITS.links) invalid('start.links', limit(AI_LIMITS.links));

  let topology: Topology = { ...emptyTopology(), title };
  const ids = new Map<string, string>();
  const step = <T>(result: { ok: true; value: T } | { ok: false; error: AiImportError }, path: string): T =>
    result.ok ? result.value : invalid(path, { code: result.error.code, ...(result.error.params ? { params: result.error.params } : {}) });

  devices.forEach((value, i) => {
    const p = `start.devices[${i}]`;
    if (!isObject(value)) invalid(p);
    const d = value as Record<string, unknown>;
    const name = str(d.name, `${p}.name`, 40).trim();
    if (!isDeviceType(d.type)) invalid(`${p}.type`);
    const type = d.type as DeviceType;
    if (ids.has(name.toLowerCase())) invalid(`${p}.name`, { code: 'nameTaken', params: { name } });
    const x = d.x === undefined ? 120 + (i % 6) * 160 : int(d.x, `${p}.x`, -10000, 10000);
    const y = d.y === undefined ? 120 + Math.floor(i / 6) * 140 : int(d.y, `${p}.y`, -10000, 10000);
    const spec = DEVICE_SPECS[type];
    const ports = d.ports === undefined ? undefined : int(d.ports, `${p}.ports`, spec.minInterfaces, spec.maxInterfaces);
    const added = step(addDevice(topology, type, name, { x, y }, ports !== undefined ? { ports } : {}), `${p}.name`);
    topology = added.topology;
    ids.set(name.toLowerCase(), added.id);
    if (ports !== undefined && getDevice(topology, added.id)!.interfaces.length !== ports && spec.minInterfaces !== spec.maxInterfaces) {
      topology = step(setInterfaceCount(topology, added.id, ports), `${p}.ports`);
    }
    const endpoint = spec.role === 'endpoint';
    if (!endpoint && (d.gateway !== undefined || d.dns !== undefined || d.dhcp !== undefined)) invalid(`${p}.gateway`, { code: 'notAnEndpoint' });
    const addresses = d.addresses === undefined ? [] : Array.isArray(d.addresses) && d.addresses.length <= 48 ? d.addresses : invalid(`${p}.addresses`);
    if (endpoint && type !== 'clientgroup') {
      const first = addresses[0] as Record<string, unknown> | undefined;
      if (addresses.length > 1) invalid(`${p}.addresses`);
      const dhcp = d.dhcp === undefined ? false : d.dhcp === true || d.dhcp === false ? d.dhcp : invalid(`${p}.dhcp`);
      if (first !== undefined && !isObject(first)) invalid(`${p}.addresses[0]`);
      if (dhcp || first || d.gateway !== undefined || d.dns !== undefined) {
        topology = step(
          configureHost(topology, added.id, {
            dhcp,
            ip: first ? str(first.ip, `${p}.addresses[0].ip`, 64) : '',
            mask: first ? str(first.mask, `${p}.addresses[0].mask`, 64) : '',
            gateway: optStr(d.gateway, `${p}.gateway`) ?? '',
            dns: optStr(d.dns, `${p}.dns`) ?? '',
          }),
          `${p}.addresses`,
        );
      }
    } else {
      addresses.forEach((a, k) => {
        const ap = `${p}.addresses[${k}]`;
        if (!isObject(a)) invalid(ap);
        const port = int(a.port, `${ap}.port`, 0, 63);
        topology = step(setInterfaceAddress(topology, added.id, port, str(a.ip, `${ap}.ip`, 64), str(a.mask, `${ap}.mask`, 64)), ap);
      });
    }
  });

  links.forEach((value, i) => {
    const p = `start.links[${i}]`;
    if (!isObject(value)) invalid(p);
    const l = value as Record<string, unknown>;
    const a = ids.get(str(l.a, `${p}.a`, 40).trim().toLowerCase()) ?? invalid(`${p}.a`, { code: 'aiUnknownDevice', params: { name: String(l.a) } });
    const b = ids.get(str(l.b, `${p}.b`, 40).trim().toLowerCase()) ?? invalid(`${p}.b`, { code: 'aiUnknownDevice', params: { name: String(l.b) } });
    const medium = l.medium === undefined ? 'tp' : (MEDIA as readonly unknown[]).includes(l.medium) ? (l.medium as Medium) : invalid(`${p}.medium`);
    const ports = {
      ...(l.aPort !== undefined ? { a: int(l.aPort, `${p}.aPort`, 0, 63) } : {}),
      ...(l.bPort !== undefined ? { b: int(l.bPort, `${p}.bPort`, 0, 63) } : {}),
    };
    topology = step(connect(topology, a, b, medium, ports), p).topology;
  });

  const goals = Array.isArray(r.goals) && r.goals.length > 0 ? r.goals : invalid('goals');
  if (goals.length > AI_LIMITS.goals) invalid('goals', limit(AI_LIMITS.goals));
  // Kennungen vergibt der Import; readTasks prüft jeden Prüfbaustein mit allen Feldern.
  const tasks = readTasks(
    {
      title,
      ...(r.description !== undefined ? { description: str(r.description, 'description', 8000) } : {}),
      ...(r.difficulty !== undefined ? { difficulty: int(r.difficulty, 'difficulty', 1, 5) } : {}),
      ...(r.grading === true ? { grading: true } : {}),
      goals: goals.map((g, i) => {
        if (!isObject(g)) invalid(`goals[${i}]`);
        const goal = g as Record<string, unknown>;
        str(goal.text, `goals[${i}].text`);
        if (goal.hint !== undefined) str(goal.hint, `goals[${i}].hint`);
        return { ...goal, id: `g${i + 1}` };
      }),
    },
    (path) => invalid(path.replace(/^tasks\./, '')),
  );
  return { ok: true, topology, tasks };
}

/** Gerätetypen für die Anleitung. */
export const AI_DEVICE_TYPES = DEVICE_TYPES;
