/**
 * Schaufenster «Rechenzentren-Verbund»: drei Rechenzentren mit unterschiedlichem Aufbau
 * (dreistufig Core/Distribution/Access, zusammengelegter Core/Distribution, Collapsed Core),
 * Racks mit farbigen Ports je VLAN, Uplinks über Glasfaser mit SFP-Modulen, Anschluss über
 * Modems (Glasfaser, Kabel, VDSL) an einen Provider und ein IPsec-Vollnetz zwischen den Standorten.
 *
 * Erzeugt docs/beispiele/rz-verbund.json (siehe showcase.test.ts). Nicht Teil der App.
 */
import {
  addArea,
  addDevice,
  addDnsRecord,
  addStaticRoute,
  addVpnTunnel,
  configureHost,
  connect,
  createVlan,
  setVlanName,
  emptyTopology,
  getDevice,
  saveWebFile,
  setDeviceRack,
  setDnsServerEnabled,
  setInterfaceAddress,
  setInterfaceColor,
  setInterfaceDescription,
  setInterfaceNat,
  setPortTrunk,
  setPortVlan,
  setProjectTitle,
  setSfpModule,
  setSvi,
  setVlanDef,
  setWebServerEnabled,
  type DeviceOptions,
  type DeviceType,
  type Medium,
  type ModemKind,
  type Result,
  type TagColor,
  type Topology,
} from '../core';

function u<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code} ${JSON.stringify(r.error)}`);
  return r.value;
}

/** VLAN-Plan: in allen Rechenzentren dieselben Nummern, je Standort ein eigenes 10.n.0.0/16. */
const VLANS: { id: number; name: string; color: TagColor; third: number }[] = [
  { id: 10, name: 'SERVER', color: 'blue', third: 10 },
  { id: 20, name: 'STORAGE', color: 'purple', third: 20 },
  { id: 30, name: 'BACKUP', color: 'orange', third: 30 },
  { id: 99, name: 'MGMT', color: 'gray', third: 99 },
  { id: 900, name: 'TRANSIT', color: 'yellow', third: 255 },
];
const COLOR = Object.fromEntries(VLANS.map((v) => [v.id, v.color])) as Record<number, TagColor>;
const TRUNK: TagColor = 'teal';
const UPLINK: TagColor = 'red';

interface Site {
  n: number;
  short: string;
  city: string;
  modem: ModemKind;
  layout: 'three-tier' | 'core-dist' | 'collapsed';
  x: number;
  color: TagColor;
  servers: { name: string; vlan: number; host: number; web?: string }[];
}

const SITES: Site[] = [
  {
    n: 1,
    short: 'ZH',
    city: 'Zürich',
    modem: 'fiber',
    layout: 'three-tier',
    x: -1660,
    color: 'blue',
    servers: [
      { name: 'Web ZH', vlan: 10, host: 20, web: 'Zürich' },
      { name: 'DNS ZH', vlan: 10, host: 53 },
      { name: 'NAS ZH', vlan: 20, host: 10 },
      { name: 'Backup ZH', vlan: 30, host: 10 },
      { name: 'Monitoring ZH', vlan: 99, host: 10, web: 'Monitoring' },
    ],
  },
  {
    n: 2,
    short: 'BE',
    city: 'Bern',
    modem: 'cable',
    layout: 'core-dist',
    x: -280,
    color: 'green',
    servers: [
      { name: 'Web BE', vlan: 10, host: 20, web: 'Bern' },
      { name: 'App BE', vlan: 10, host: 30 },
      { name: 'NAS BE', vlan: 20, host: 10 },
      { name: 'Backup BE', vlan: 30, host: 10 },
    ],
  },
  {
    n: 3,
    short: 'BS',
    city: 'Basel',
    modem: 'vdsl',
    layout: 'collapsed',
    x: 800,
    color: 'pink',
    servers: [
      { name: 'Web BS', vlan: 10, host: 20, web: 'Basel' },
      { name: 'Backup BS', vlan: 30, host: 10 },
      { name: 'Monitoring BS', vlan: 99, host: 10 },
    ],
  },
];

const PSK = 'Schaufenster-RZ-2026';
const providerIp = (n: number) => `203.0.113.${4 * n + 1}`;
const wanIp = (n: number) => `203.0.113.${4 * n + 2}`;
const DNS = '10.1.10.53';

class Net {
  t: Topology = emptyTopology();
  ids = new Map<string, string>();
  /** Nächster freier Anschluss je Gerät (Kupfer und SFP getrennt). */
  next = new Map<string, { tp: number; sfp: number }>();

  add(type: DeviceType, name: string, x: number, y: number, options: DeviceOptions = {}) {
    const r = u(addDevice(this.t, type, name, { x, y }, options));
    this.t = r.topology;
    this.ids.set(name, r.id);
    // Switches: VLAN-Datenbank mit Namen wie im VLAN-Plan.
    if (type === 'switch' || type === 'l3switch') {
      for (const v of VLANS) {
        this.t = u(createVlan(this.t, r.id, v.id));
        this.t = u(setVlanName(this.t, r.id, v.id, v.name));
      }
    }
    return this;
  }
  id(name: string) {
    const id = this.ids.get(name);
    if (!id) throw new Error(`unbekannt: ${name}`);
    return id;
  }
  dev(name: string) {
    return getDevice(this.t, this.id(name))!;
  }
  /** Nächster freier Kupfer- oder SFP-Anschluss. */
  port(name: string, fiber: boolean): number {
    const d = this.dev(name);
    const used = this.next.get(name) ?? { tp: 0, sfp: 0 };
    const list = d.interfaces.filter((i) => (fiber ? i.sfpSlot : !i.sfpSlot && !i.serial));
    const iface = list[fiber ? used.sfp : used.tp];
    if (!iface) throw new Error(`kein freier Anschluss an ${name}`);
    this.next.set(name, fiber ? { ...used, sfp: used.sfp + 1 } : { ...used, tp: used.tp + 1 });
    return iface.index;
  }
  /** Kabel mit Beschreibung und Farbe an beiden Enden. */
  link(a: string, b: string, opts: { medium?: Medium; color?: TagColor; descA?: string; descB?: string; sfp?: '10G-SR' | '10G-LR' | '1G-SX' } = {}) {
    const fiber = opts.medium === 'fiber' && !!opts.sfp;
    const pa = this.port(a, fiber);
    const pb = this.port(b, fiber);
    if (fiber) {
      this.t = u(setSfpModule(this.t, this.id(a), pa, opts.sfp!));
      this.t = u(setSfpModule(this.t, this.id(b), pb, opts.sfp!));
    }
    this.t = u(connect(this.t, this.id(a), this.id(b), opts.medium ?? 'tp', { a: pa, b: pb })).topology;
    if (opts.color) {
      this.t = u(setInterfaceColor(this.t, this.id(a), pa, opts.color));
      this.t = u(setInterfaceColor(this.t, this.id(b), pb, opts.color));
    }
    this.t = u(setInterfaceDescription(this.t, this.id(a), pa, opts.descA ?? `→ ${b}`));
    this.t = u(setInterfaceDescription(this.t, this.id(b), pb, opts.descB ?? `→ ${a}`));
    return { pa, pb };
  }
  trunk(a: string, b: string, opts: { medium?: Medium; sfp?: '10G-SR' | '10G-LR' | '1G-SX' } = {}) {
    const { pa, pb } = this.link(a, b, { ...opts, color: TRUNK, descA: `Trunk ${b}`, descB: `Uplink ${a}` });
    this.t = u(setPortTrunk(this.t, this.id(a), pa, true));
    this.t = u(setPortTrunk(this.t, this.id(b), pb, true));
  }
  rack(title: string, color: TagColor, x: number, y: number, members: string[], note?: string) {
    const r = u(addArea(this.t, { kind: 'rack', title, color, x, y, width: 280, height: 200, ...(note ? { note } : {}) }));
    this.t = r.topology;
    for (const m of members) this.t = u(setDeviceRack(this.t, this.id(m), r.id));
  }
  area(title: string, color: TagColor, x: number, y: number, width: number, height: number, extra: { network?: string; note?: string; kind?: 'note'; public?: boolean } = {}) {
    this.t = u(addArea(this.t, { title, color, x, y, width, height, ...extra })).topology;
  }
}

function buildSite(net: Net, s: Site) {
  const { n, short } = s;
  const edge = `Edge ${short}`;
  const modem = `Modem ${short}`;
  const core = `Core ${short}`;
  const x0 = s.x;
  const y0 = -200;
  // Geräte (Position wird im Rack neu gesetzt; die Reihenfolge im Rack folgt y).
  let y = 0;
  const place = () => (y += 10);
  net.add('modem', modem, x0, place(), { modem: s.modem });
  net.add('router', edge, x0, place());
  net.add('l3switch', core, x0, place(), { ports: 8, sfpSlots: 4 });

  // Edge: LAN zum Core (Transit), WAN über das Modem zum Provider.
  net.t = u(setInterfaceAddress(net.t, net.id(edge), 0, `10.${n}.255.1`, '255.255.255.252'));
  net.t = u(setInterfaceAddress(net.t, net.id(edge), 1, wanIp(n), '255.255.255.252'));
  net.t = u(setInterfaceNat(net.t, net.id(edge), 1, true));
  net.t = u(addStaticRoute(net.t, net.id(edge), { network: '0.0.0.0', mask: '0.0.0.0', gateway: providerIp(n) }));
  net.t = u(addStaticRoute(net.t, net.id(edge), { network: `10.${n}.0.0`, mask: '255.255.0.0', gateway: `10.${n}.255.2` }));
  for (const other of SITES.filter((o) => o.n !== n)) {
    net.t = u(addVpnTunnel(net.t, net.id(edge), { name: `${s.city} – ${other.city}`, peer: wanIp(other.n), local: `10.${n}.0.0/16`, remote: `10.${other.n}.0.0/16`, key: PSK }));
  }

  // Core: SVIs je VLAN, Standardroute zur Edge.
  for (const v of VLANS) {
    const ip = v.id === 900 ? `10.${n}.255.2` : `10.${n}.${v.third}.1`;
    net.t = u(setSvi(net.t, net.id(core), v.id, ip, v.id === 900 ? '255.255.255.252' : '255.255.255.0'));
  }
  net.t = u(addStaticRoute(net.t, net.id(core), { network: '0.0.0.0', mask: '0.0.0.0', gateway: `10.${n}.255.1` }));

  // Verkabelung im Core-Rack.
  const transit = net.link(core, edge, { color: COLOR[900], descA: `Transit ${edge} (VLAN 900)`, descB: `Transit ${core}` });
  net.link(edge, modem, { color: UPLINK, descA: `WAN über ${modem}`, descB: `LAN ${edge}` });
  net.t = u(setPortVlan(net.t, net.id(core), transit.pa, 900));

  // Access-Switches und Server.
  const accessNames: string[] = [];
  const distNames: string[] = [];
  if (s.layout === 'three-tier' || s.layout === 'core-dist') {
    for (const k of [1, 2]) {
      const d = `Dist ${k} ${short}`;
      net.add('switch', d, x0, place(), { ports: 8, sfpSlots: 2 });
      distNames.push(d);
      net.trunk(core, d, { medium: 'fiber', sfp: '10G-SR' });
    }
  }
  const groups = s.layout === 'collapsed' ? [s.servers] : [s.servers.filter((x) => x.vlan === 10), s.servers.filter((x) => x.vlan !== 10)];
  groups.forEach((group, k) => {
    const a = `Access ${String.fromCharCode(65 + k)} ${short}`;
    net.add('switch', a, x0, place(), { ports: 8, sfpSlots: 0 });
    accessNames.push(a);
    const upstream = distNames[k] ?? core;
    net.trunk(upstream, a);
    for (const srv of group) {
      net.add('server', srv.name, x0, place(), { variant: 'rack' });
      const ip = `10.${n}.${VLANS.find((v) => v.id === srv.vlan)!.third}.${srv.host}`;
      const gw = `10.${n}.${VLANS.find((v) => v.id === srv.vlan)!.third}.1`;
      net.t = u(configureHost(net.t, net.id(srv.name), { ip, mask: '255.255.255.0', gateway: gw, dns: DNS }));
      const { pa } = net.link(a, srv.name, { color: COLOR[srv.vlan], descA: `${srv.name} (VLAN ${srv.vlan})`, descB: `Uplink ${a}` });
      net.t = u(setPortVlan(net.t, net.id(a), pa, srv.vlan));
      if (srv.web) {
        net.t = u(setWebServerEnabled(net.t, net.id(srv.name), true));
        const page =
          srv.web === 'Monitoring'
            ? `<h1>Monitoring ${s.city}</h1><p>Alle drei Rechenzentren erreichbar: Zürich, Bern und Basel sind über IPsec-Tunnel verbunden.</p><ul><li>RZ Zürich: Glasfaser</li><li>RZ Bern: Kabel (DOCSIS)</li><li>RZ Basel: VDSL</li></ul>`
            : `<h1>Rechenzentrum ${s.city}</h1><p>Diese Seite liegt im VLAN 10 (SERVER) des Rechenzentrums ${s.city}, Netz 10.${n}.10.0/24.</p><p>Erreicht über den IPsec-Tunnel zwischen den Standorten.</p>`;
        net.t = u(saveWebFile(net.t, net.id(srv.name), { path: '/index.html', content: page }));
      }
    }
  });

  // Racks je nach Aufbau (unterschiedlich gross und gegliedert).
  const servers = (g: number) => groups[g]!.map((x) => x.name);
  const racks = s.layout === 'three-tier' ? 4 : s.layout === 'core-dist' ? 3 : 2;
  const width = racks * 300 + 60;
  const rx = (i: number) => x0 + 30 + i * 300;
  const ry = y0 + 60;
  if (s.layout === 'three-tier') {
    net.rack(`Rack ${short}-01 Core`, 'red', rx(0), ry, [modem, edge, core], 'Core-Schicht: Modem, Edge-Router, Layer-3-Core');
    net.rack(`Rack ${short}-02 Distribution`, 'teal', rx(1), ry, distNames, 'Distribution-Schicht, 10G-Glasfaser zum Core');
    net.rack(`Rack ${short}-03 Access A`, 'blue', rx(2), ry, [accessNames[0]!, ...servers(0)], 'Access-Schicht: Server');
    net.rack(`Rack ${short}-04 Access B`, 'purple', rx(3), ry, [accessNames[1]!, ...servers(1)], 'Access-Schicht: Storage, Backup, Management');
  } else if (s.layout === 'core-dist') {
    net.rack(`Rack ${short}-01 Core/Distribution`, 'red', rx(0), ry, [modem, edge, core, ...distNames], 'Core und Distribution in einem Rack');
    net.rack(`Rack ${short}-02 Access A`, 'blue', rx(1), ry, [accessNames[0]!, ...servers(0)]);
    net.rack(`Rack ${short}-03 Access B`, 'purple', rx(2), ry, [accessNames[1]!, ...servers(1)]);
  } else {
    net.rack(`Rack ${short}-01 Collapsed Core`, 'red', rx(0), ry, [modem, edge, core], 'Collapsed Core: Core und Distribution im Layer-3-Switch');
    net.rack(`Rack ${short}-02 Access`, 'blue', rx(1), ry, [accessNames[0]!, ...servers(0)]);
  }

  // Dokumentation: Standort-Bereich und VLAN-Plan.
  const layoutText =
    s.layout === 'three-tier'
      ? 'Dreistufig: Core → Distribution → Access'
      : s.layout === 'core-dist'
        ? 'Zweistufig: Core/Distribution → Access'
        : 'Collapsed Core: Layer-3-Core → Access';
  net.area(`Rechenzentrum ${s.city}`, s.color, x0, y0 - 120, width, 940, {
    network: `10.${n}.0.0/16`,
    note: `${layoutText}. Anschluss: ${s.modem === 'fiber' ? 'Glasfaser' : s.modem === 'cable' ? 'Kabel (DOCSIS)' : 'VDSL'}, WAN ${wanIp(n)}/30.`,
  });
  const plan = VLANS.map((v) => `- **VLAN ${v.id} ${v.name}:** ${v.id === 900 ? `10.${n}.255.0/30` : `10.${n}.${v.third}.0/24`}, Gateway ${v.id === 900 ? `10.${n}.255.1` : `10.${n}.${v.third}.1`}`).join('\n');
  net.area(`VLAN-Plan ${s.city}`, 'gray', x0 + 30, y0 + 530, width - 60, 260, { kind: 'note', note: `${plan}\n\nPortfarben im Rack = VLAN, Türkis = Trunk, Rot = WAN.` });
  return { edge, modem };
}

export function buildShowcase(): Topology {
  const net = new Net();
  net.t = u(setProjectTitle(net.t, 'Rechenzentren-Verbund'));
  for (const v of VLANS) net.t = u(setVlanDef(net.t, { id: v.id, name: v.name, color: v.color }));
  net.add('internet', 'Provider', -100, -720, { ports: 4 });
  SITES.forEach((s, i) => {
    net.t = u(setInterfaceAddress(net.t, net.id('Provider'), i, providerIp(s.n), '255.255.255.252'));
  });
  for (const s of SITES) {
    const { modem } = buildSite(net, s);
    net.link(modem, 'Provider', { medium: s.modem === 'fiber' ? 'fiber' : s.modem === 'cable' ? 'coax' : 'dsl', color: UPLINK, descA: `Zugang ${s.city}`, descB: `Kunde RZ ${s.city}` });
  }
  // Zentrale DNS-Zone in Zürich: Namen aller Standorte.
  const dns = net.id('DNS ZH');
  net.t = u(setDnsServerEnabled(net.t, dns, true));
  for (const [name, ip] of [
    ['web.zuerich.rz.example', '10.1.10.20'],
    ['monitoring.zuerich.rz.example', '10.1.99.10'],
    ['web.bern.rz.example', '10.2.10.20'],
    ['app.bern.rz.example', '10.2.10.30'],
    ['web.basel.rz.example', '10.3.10.20'],
  ] as const) {
    net.t = u(addDnsRecord(net.t, dns, { name, type: 'A', value: ip, ttl: 3600 }));
  }
  net.area('Provider (Internet)', 'yellow', -560, -900, 920, 300, { public: true, note: 'Öffentliche Transfernetze 203.0.113.0/24 (RFC 5737), je Standort ein /30. Zwischen den Rechenzentren laufen IPsec-Tunnel (Vollvermaschung).' });
  net.area('Über dieses Netz', 'gray', -1660, -900, 1000, 300, {
    kind: 'note',
    note: '**Schaufenster leyoNET.** Drei Rechenzentren, drei Bauarten:\n- **Zürich:** dreistufig (Core, Distribution, Access), Glasfaser\n- **Bern:** Core/Distribution zusammen, Kabelmodem\n- **Basel:** Collapsed Core, VDSL\n\nIn der Simulation: Ping, Webseiten und DNS über die VPN-Tunnel. Alle Racks mit Frontplatten: Ansicht → Rack-Ansicht (Taste R).',
  });
  return net.t;
}
