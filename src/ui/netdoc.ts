import { formatIp, getDevice, hasCli, mediumOf, networkOf, parseIp, parseMask, runningConfig, type Device, type Topology } from '../core';
import { t } from '../i18n';
import { interfaceLabel, typeLabel } from './labels';

/**
 * Netzdokumentation aus dem Projekt: Adressplan und Verbindungen als Tabelle für Excel (CSV) und
 * die Konfiguration aller Geräte mit Befehlszeile als Text (wie «show running-config»).
 * Alles entsteht im Browser aus dem aktuellen Netz; nichts geht an einen Server.
 */

/** Zelle für CSV: Semikolon als Trennzeichen (in der Schweiz üblich), Formeln entschärft. */
export function csvCell(value: string | number | undefined): string {
  // Weiche Trennzeichen aus Anzeigetexten (z.B. «Vermittlungs\u00adrechner») gehören nicht in eine Datei.
  let text = value === undefined ? '' : String(value).replace(/\u00ad/g, '');
  // Zellen, die mit = + - @ beginnen, würde Excel als Formel ausführen (CSV-Injektion): mit ' entschärfen.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const row = (cells: (string | number | undefined)[]) => cells.map(csvCell).join(';');

/** Netzadresse «a.b.c.d/n» eines Anschlusses, leer ohne gültige Adresse. */
function networkText(ip?: string, mask?: string): { prefix: string; network: string } {
  const address = ip ? parseIp(ip) : null;
  const prefix = mask ? parseMask(mask) : null;
  if (address === null || prefix === null) return { prefix: '', network: '' };
  return { prefix: `/${prefix}`, network: `${formatIp(networkOf(address, prefix))}/${prefix}` };
}

/** VLAN-Angabe eines Switch-Ports: «Trunk» mit erlaubten VLANs oder die Nummer des Access-VLANs. */
function vlanText(device: Device, index: number): string {
  if (device.type !== 'switch' && device.type !== 'l3switch') return '';
  const port = device.interfaces[index];
  if (!port) return '';
  if (port.trunk) return port.allowedVlans?.length ? `${t('netdoc.trunk')} ${port.allowedVlans.join(',')}` : t('netdoc.trunk');
  return String(port.vlan ?? 1);
}

/**
 * Adressplan (ein Anschluss je Zeile) und Verbindungen (ein Kabel je Zeile) als CSV.
 * Switch-Ports ohne Kabel und ohne Adresse bleiben weg, damit die Tabelle lesbar ist.
 */
export function networkDocCsv(topology: Topology): string {
  const lines: string[] = [];
  const cabled = new Set(topology.cables.flatMap((c) => [`${c.a.device}:${c.a.iface}`, `${c.b.device}:${c.b.iface}`]));
  const devices = [...topology.devices].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  lines.push(row([t('netdoc.addresses')]));
  lines.push(row([t('netdoc.device'), t('netdoc.type'), t('netdoc.port'), t('netdoc.ip'), t('netdoc.mask'), t('netdoc.prefix'), t('netdoc.network'), t('netdoc.gateway'), t('netdoc.dns'), t('netdoc.mac'), t('netdoc.vlan')]));
  for (const device of devices) {
    device.interfaces.forEach((port, index) => {
      if (!port.ip && !cabled.has(`${device.id}:${index}`)) return;
      const net = networkText(port.ip, port.mask);
      const endpoint = device.gateway !== undefined || device.dns !== undefined || device.dhcp;
      lines.push(
        row([
          device.name,
          typeLabel(device.type),
          interfaceLabel(device, index),
          port.ip ?? (device.dhcp ? 'DHCP' : ''),
          port.mask ?? '',
          net.prefix,
          net.network,
          endpoint && index === 0 ? (device.gateway ?? '') : '',
          endpoint && index === 0 ? (device.dns ?? '') : '',
          port.mac,
          vlanText(device, index),
        ]),
      );
    });
  }

  lines.push('');
  lines.push(row([t('netdoc.links')]));
  lines.push(row([t('netdoc.deviceA'), t('netdoc.portA'), t('netdoc.deviceB'), t('netdoc.portB'), t('netdoc.medium')]));
  const links = topology.cables
    .map((cable) => ({ cable, a: getDevice(topology, cable.a.device), b: getDevice(topology, cable.b.device) }))
    .filter((x): x is { cable: (typeof topology.cables)[number]; a: Device; b: Device } => !!x.a && !!x.b)
    .sort((x, y) => x.a.name.localeCompare(y.a.name, undefined, { numeric: true }) || x.cable.a.iface - y.cable.a.iface);
  for (const { cable, a, b } of links) {
    lines.push(row([a.name, interfaceLabel(a, cable.a.iface), b.name, interfaceLabel(b, cable.b.iface), t(`medium.${mediumOf(cable)}`)]));
  }
  return lines.join('\r\n') + '\r\n';
}

/** Konfiguration aller Geräte mit Befehlszeile, je Gerät ein Abschnitt; leer, wenn es keine gibt. */
export function configText(topology: Topology): string {
  const devices = topology.devices.filter((d) => hasCli(d.type)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (devices.length === 0) return '';
  const parts = devices.map((device) => [`! ===== ${device.name} (${typeLabel(device.type).replace(/\u00ad/g, '')}) =====`, ...runningConfig(device), ''].join('\n'));
  return parts.join('\n');
}
