/**
 * Rechenzentrum nach dem Leaf-Spine-Modell: zwei Spines, drei Leafs (Layer-3-Switches).
 * Underlay: jede Leaf–Spine-Verbindung ist ein eigenes /30-Netz (Transfer-VLAN mit SVI),
 * eBGP zwischen Leafs (AS 65001–65003) und Spines (AS 65000) verteilt die Loopbacks.
 * Overlay: VXLAN (RFC 7348) verlängert VLAN 10 (Web) und VLAN 20 (Datenbank) über das
 * geroutete Netz. Genutzt vom Katalog (Übung) und vom Demo-Netz.
 */
import {
  addVniPeer,
  configureHost,
  connect,
  createVlan,
  loopbackId,
  setBgp,
  setLoopback,
  setPortVlan,
  setSvi,
  setVlanDef,
  setVniVlan,
  setVxlanSource,
  type Topology,
} from '../core';
import { Start, unwrap } from './catalogKit';

export const DC = {
  spines: [
    { name: 'Spine 1', loopback: '10.255.0.1', asn: 65000 },
    { name: 'Spine 2', loopback: '10.255.0.2', asn: 65000 },
  ],
  leafs: [
    { name: 'Leaf 1', loopback: '10.255.0.11', asn: 65001 },
    { name: 'Leaf 2', loopback: '10.255.0.12', asn: 65002 },
    { name: 'Leaf 3', loopback: '10.255.0.13', asn: 65003 },
  ],
  /** Server: Leaf (0-basiert), Port, VLAN, Adresse. */
  servers: [
    { name: 'Web 1', leaf: 0, port: 0, vlan: 10, ip: '192.168.10.11' },
    { name: 'Web 2', leaf: 1, port: 0, vlan: 10, ip: '192.168.10.12' },
    { name: 'DB 1', leaf: 1, port: 1, vlan: 20, ip: '192.168.20.11' },
    { name: 'DB 2', leaf: 2, port: 0, vlan: 20, ip: '192.168.20.12' },
  ],
  vnis: [
    { vni: 10010, vlan: 10, leafs: [0, 1] },
    { vni: 10020, vlan: 20, leafs: [1, 2] },
  ],
} as const;

/** Leaf-Port zum Spine s (6 = port7, 7 = port8), Spine-Port zum Leaf l (l = port l+1). */
const leafPort = (s: number) => 6 + s;
/** Transfer-VLAN und Netz zwischen Spine s und Leaf l: VLAN 1xy, 10.<s+1>.<l+1>.0/30, Spine .1, Leaf .2. */
const transfer = (s: number, l: number) => ({ vlan: 100 + (s + 1) * 10 + (l + 1), spine: `10.${s + 1}.${l + 1}.1`, leaf: `10.${s + 1}.${l + 1}.2` });

const id = (t: Topology, name: string) => t.devices.find((d) => d.name === name)!.id;

/** Verkabelt, Transfernetze und Loopbacks adressiert, Server im richtigen VLAN; ohne BGP und VXLAN. */
export function datacenterUnderlay(): Topology {
  const s = new Start();
  DC.spines.forEach((sp, i) => s.add('l3switch', sp.name, -220 + i * 440, -260));
  DC.leafs.forEach((lf, i) => s.add('l3switch', lf.name, -440 + i * 440, 40));
  DC.servers.forEach((sv, i) => s.add('server', sv.name, -560 + i * 340, 280));
  DC.spines.forEach((sp, si) => DC.leafs.forEach((lf, li) => s.apply((t, n) => unwrap(connect(t, n(lf.name), n(sp.name), 'tp', { a: leafPort(si), b: li })).topology)));
  for (const sv of DC.servers) s.apply((t, n) => unwrap(connect(t, n(sv.name), n(DC.leafs[sv.leaf]!.name), 'tp', { b: sv.port })).topology);
  s.area('Spine (Underlay, BGP AS 65000)', 'purple', -480, -340, 960, 160).area('Leaf (VTEPs)', 'blue', -620, -40, 1240, 160);
  let t = s.topology;
  DC.spines.forEach((sp, si) => {
    t = unwrap(setLoopback(t, id(t, sp.name), 0, sp.loopback, '32'));
    DC.leafs.forEach((lf, li) => {
      const tr = transfer(si, li);
      for (const [dev, port, ip] of [
        [sp.name, li, tr.spine],
        [lf.name, leafPort(si), tr.leaf],
      ] as const) {
        t = unwrap(createVlan(t, id(t, dev), tr.vlan));
        t = unwrap(setPortVlan(t, id(t, dev), port, tr.vlan));
        t = unwrap(setSvi(t, id(t, dev), tr.vlan, ip, '30'));
      }
    });
  });
  for (const lf of DC.leafs) t = unwrap(setLoopback(t, id(t, lf.name), 0, lf.loopback, '32'));
  for (const sv of DC.servers) {
    const leaf = DC.leafs[sv.leaf]!.name;
    t = unwrap(createVlan(t, id(t, leaf), sv.vlan));
    t = unwrap(setPortVlan(t, id(t, leaf), sv.port, sv.vlan));
    t = unwrap(configureServer(t, sv.name, sv.ip));
  }
  t = unwrap(setVlanDef(t, { id: 10, name: 'WEB', color: 'green' }));
  return unwrap(setVlanDef(t, { id: 20, name: 'DATENBANK', color: 'orange' }));
}

const configureServer = (t: Topology, name: string, ip: string) => configureHost(t, id(t, name), { ip, mask: '24' });

/** eBGP-Underlay: Leafs mit beiden Spines, jeder kündigt seine Loopback an. */
export function datacenterBgp(topology: Topology): Topology {
  let t = topology;
  DC.spines.forEach((sp, si) => {
    t = unwrap(setBgp(t, id(t, sp.name), { asn: sp.asn, routerId: sp.loopback, neighbors: DC.leafs.map((lf, li) => ({ ip: transfer(si, li).leaf, remoteAs: lf.asn })), networks: [{ network: sp.loopback, mask: '255.255.255.255' }] }));
  });
  DC.leafs.forEach((lf, li) => {
    t = unwrap(setBgp(t, id(t, lf.name), { asn: lf.asn, routerId: lf.loopback, neighbors: DC.spines.map((sp, si) => ({ ip: transfer(si, li).spine, remoteAs: sp.asn })), networks: [{ network: lf.loopback, mask: '255.255.255.255' }] }));
  });
  return t;
}

/** VXLAN-Overlay: Loopback als Quelle, VNIs auf den beteiligten Leafs mit den anderen VTEPs. */
export function datacenterVxlan(topology: Topology): Topology {
  let t = topology;
  for (const v of DC.vnis) {
    for (const li of v.leafs) {
      const leaf = DC.leafs[li]!;
      t = unwrap(setVxlanSource(t, id(t, leaf.name), loopbackId(0)));
      t = unwrap(setVniVlan(t, id(t, leaf.name), v.vni, v.vlan));
      for (const other of v.leafs) if (other !== li) t = unwrap(addVniPeer(t, id(t, leaf.name), v.vni, DC.leafs[other]!.loopback));
    }
  }
  return t;
}

export const datacenter = () => datacenterVxlan(datacenterBgp(datacenterUnderlay()));
