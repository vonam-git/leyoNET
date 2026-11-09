/**
 * Baukasten für Katalog-Übungen: Startnetze mit denselben Operationen wie
 * der Editor bauen, Lernziele und Aufgaben aus den Sprachdateien.
 */
import {
  addArea,
  addDevice,
  addStaticRoute,
  configureHost,
  connect,
  emptyTopology,
  setDhcpServer,
  setDnsServerEnabled,
  setInterfaceAddress,
  setInterfaceCount,
  setInterfaceNat,
  setPortVlan,
  setWebServerEnabled,
  saveWebFile,
  type Check,
  type DeviceOptions,
  type DeviceType,
  type Medium,
  type Goal,
  type Result,
  type TagColor,
  type TaskSet,
  type Topology,
  configureHost6,
  setCgnatAddress,
  setInterfaceIpv6,
  setIpMode,
  setDefaultGateway,
} from '../core';
import { t } from '../i18n';

export interface CatalogEntry {
  id: string;
  stars: 1 | 2 | 3 | 4 | 5;
  /** Funktionen, die die Aufgabe braucht (werden beim Start eingeschaltet). */
  features?: string[];
  /** Empfohlenes Profil (Lehrjahr). */
  level?: number;
  /** Reihe, z.B. «m117» (Modul 117); der Katalog filtert danach. */
  series?: string;
  /** Name des Arbeitsblatts (PDF) zur Übung, z.B. «M06C_M117_UE03_Router01». */
  sheet?: string;
  build(): { topology: Topology; tasks: TaskSet };
}

/** Name des automatisch erzeugten Arbeitsblatts einer Übung ohne Modulreihe. */
export const generalSheet = (id: string) => `Uebung_${id}`;

export function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
}

/** Kleiner Baukasten für Startnetze. */
export class Start {
  topology = emptyTopology();
  #ids = new Map<string, string>();

  add(type: DeviceType, name: string, x: number, y: number, options: DeviceOptions = {}): this {
    const { topology, id } = unwrap(addDevice(this.topology, type, name, { x, y }, options));
    this.topology = topology;
    this.#ids.set(name, id);
    return this;
  }

  id(name: string): string {
    return this.#ids.get(name)!;
  }

  link(a: string, b: string, medium: Medium = 'tp'): this {
    this.topology = unwrap(connect(this.topology, this.id(a), this.id(b), medium)).topology;
    return this;
  }

  /** Router mit Adressen in CIDR-Schreibweise, z.B. ["192.168.1.1/24", "10.0.0.1/30"]. */
  router(name: string, x: number, y: number, addresses: string[], type: 'router' | 'internet' = 'router'): this {
    this.add(type, name, x, y);
    if (addresses.length > 2) this.topology = unwrap(setInterfaceCount(this.topology, this.id(name), addresses.length));
    addresses.forEach((cidr, index) => {
      const [ip, prefix] = cidr.split('/');
      this.topology = unwrap(setInterfaceAddress(this.topology, this.id(name), index, ip!, prefix!));
    });
    return this;
  }

  route(router: string, network: string, mask: string, gateway: string): this {
    this.topology = unwrap(addStaticRoute(this.topology, this.id(router), { network, mask, gateway }));
    return this;
  }

  nat(router: string, index: number): this {
    this.topology = unwrap(setInterfaceNat(this.topology, this.id(router), index, true));
    return this;
  }

  web(server: string, page: string): this {
    let next = unwrap(setWebServerEnabled(this.topology, this.id(server), true));
    next = unwrap(saveWebFile(next, this.id(server), { path: '/index.html', content: page }));
    this.topology = next;
    return this;
  }

  host(name: string, ip: string, mask: string, gateway?: string, dns?: string): this {
    this.topology = unwrap(configureHost(this.topology, this.id(name), { ip, mask, ...(gateway ? { gateway } : {}), ...(dns ? { dns } : {}) }));
    return this;
  }

  /** Farbiger Bereich (Dokumentation), optional mit Netz. */
  area(title: string, color: TagColor, x: number, y: number, width: number, height: number, network?: string): this {
    this.topology = unwrap(addArea(this.topology, { title, color, x, y, width, height, ...(network ? { network } : {}) })).topology;
    return this;
  }

  apply(change: (t: Topology, id: (name: string) => string) => Topology): this {
    this.topology = change(this.topology, (n) => this.id(n));
    return this;
  }
}

export function goal(key: string, n: number, check: Check, params: Record<string, string | number> = {}): Goal {
  const hintKey = `catalog.${key}.hint${n}`;
  const hint = t(hintKey, params);
  return { id: `ziel-${n}`, text: t(`catalog.${key}.goal${n}`, params), check, ...(hint !== hintKey ? { hint } : {}) };
}

export function task(key: string, stars: number, goals: Goal[]): TaskSet {
  return { title: t(`catalog.${key}.title`), description: t(`catalog.${key}.description`), difficulty: stars, goals };
}
