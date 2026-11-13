import { describe, expect, it } from 'vitest';
import { FORMATS, encapsulation, formatOf, headerBytes, readFormat, type FieldValue } from '../core';
import de from '../i18n/de.json';
import en from '../i18n/en.json';
import { setLocale, t } from '../i18n';
import { encapsulationView, formatView, layerValues, osiLayersView, toHtml, type VNode } from './aufbau';
import { EXAMPLE_IDS, frameExample } from './frameExamples';

setLocale('de');
const value = (values: FieldValue[], id: string) => values.find((v) => v.field.id === id)?.value;

describe('Aufbau nach Norm', () => {
  it('jedes Feld hat Namen und Bedeutung in beiden Sprachen', () => {
    const missing: string[] = [];
    for (const lang of [de, en] as Record<string, string>[])
      for (const format of Object.values(FORMATS))
        for (const f of format.fields) for (const key of [`fmt.f.${f.id}`, `fmt.${format.id}.${f.id}`, `fmt.pdu.${format.pdu}`]) if (!lang[key]) missing.push(key);
    expect([...new Set(missing)]).toEqual([]);
  });

  it('feste Felder ergeben ganze Bytes; Bitraster gehen in 32-Bit-Zeilen auf', () => {
    for (const format of Object.values(FORMATS)) {
      expect(Number.isInteger(headerBytes(format)), format.id).toBe(true);
      if (format.layout === 'bits') {
        // Felder vor dem ersten variablen Feld füllen ganze Zeilen.
        const fixed = format.fields.slice(0, format.fields.findIndex((f) => f.bits === 0) >>> 0).reduce((n, f) => n + f.bits, 0);
        expect(fixed % 32, format.id).toBe(0);
      }
    }
  });

  it('jedes Beispiel aus den Demos lässt sich lesen; die Werte stimmen mit der Kodierung überein', () => {
    for (const id of EXAMPLE_IDS) {
      const { entry, wire } = frameExample(id);
      const frame = entry.frame;
      for (const layer of wire.layers) {
        const found = layerValues(wire, layer);
        if (!found) continue;
        const { format, values } = found;
        expect(headerBytes(format), `${id}/${format.id}`).toBeLessThanOrEqual(layer.length);
        const v = (f: string) => value(values, f);
        switch (format.id) {
          case 'ethernet2':
          case 'ethernet2q':
          case 'ieee8023':
            expect(v('dstMac')).toBe(frame.dst.toLowerCase());
            expect(v('srcMac')).toBe(frame.src.toLowerCase());
            expect(v('fcs')).toBe(layer.fields.find((f) => f.key === 'eth.fcs')!.value.split(' ')[0]);
            expect(layer.length).toBeGreaterThanOrEqual(64);
            if (format.id === 'ethernet2q') {
              expect(v('tpid')).toBe('0x8100');
              expect(parseInt(v('tci')!, 16) & 0xfff).toBe(frame.vlan);
            }
            if (format.id === 'ieee8023') expect([v('dsap'), v('ssap'), v('control')]).toEqual(['0x42', '0x42', '0x03']);
            break;
          case 'wlan':
            expect(v('addr2')).toBe(frame.src.toLowerCase());
            // IEEE 802.11: Zahlen mit dem niederwertigsten Byte zuerst.
            expect(v('duration')).toBe('314');
            expect(v('seqControl')).toBe('0x0010');
            expect(v('fcs')).toBe(layer.fields.find((f) => f.key === 'wlan.fcs')!.value.split(' ')[0]);
            break;
          case 'ppp':
            expect([v('address'), v('pppControl'), v('pppProtocol')]).toEqual(['0xff', '0x03', '0x0021']);
            break;
          case 'ipv4':
            expect([v('version'), v('ihl')]).toEqual(['4', '5']);
            expect(Number(v('totalLength'))).toBe(layer.length);
            expect(frame.payload.kind === 'ipv4' && [v('srcIp'), v('dstIp'), Number(v('ttl'))]).toEqual(frame.payload.kind === 'ipv4' && [frame.payload.src, frame.payload.dst, frame.payload.ttl]);
            break;
          case 'ipv6':
            expect(v('version')).toBe('6');
            expect(Number(v('payloadLength'))).toBe(layer.length - 40);
            expect(v('nextHeader')).toBe('17');
            break;
          case 'udp':
            expect(Number(v('udpLength'))).toBe(layer.length);
            break;
          case 'tcp': {
            const inner = wire.layers.find((l) => l.protocol === 'HTTP')!;
            expect(Number(v('dataOffset')) * 4).toBe(inner.start - layer.start);
            expect(v('tcpFlags')).toContain('ACK');
            expect(Number(v('dstPort'))).toBe(80);
            break;
          }
          case 'icmp':
            expect(['0', '8']).toContain(v('icmpType'));
            break;
          case 'arp':
            expect(v('oper')).toBe('1');
            expect(v('tha')).toBe('00:00:00:00:00:00');
            break;
        }
      }
    }
  });

  it('jedes Format kommt in einem Beispiel vor (ausser dem reinen Tag)', () => {
    const seen = new Set<string>();
    for (const id of EXAMPLE_IDS) for (const layer of frameExample(id).wire.layers) if (formatOf(layer)) seen.add(formatOf(layer)!.id);
    for (const f of Object.keys(FORMATS)) if (f !== 'dot1q' && f !== 'tcp') expect(seen, f).toContain(f);
    expect(seen).toContain('tcp');
  });

  it('Verschachtelung: Kopf + Nutzdaten + Anhang ergeben die Schicht, die Nutzdaten die nächste Schicht', () => {
    for (const id of EXAMPLE_IDS) {
      const { wire } = frameExample(id);
      const rows = encapsulation(wire);
      expect(rows[0]!.osi, id).toBe(1);
      expect(rows[0]!.payload).toBe(wire.bytes.length);
      for (let i = 1; i < rows.length - 1; i++) {
        const next = rows[i + 1]!;
        expect(rows[i]!.payload, `${id}: ${rows[i]!.protocol}`).toBe(next.header + next.payload + next.trailer);
      }
      expect(rows[1]!.header + rows[1]!.payload + rows[1]!.trailer).toBe(wire.bytes.length);
    }
    // Ethernet: Präambel, SFD und Pause auf Schicht 1, FCS als Anhang auf Schicht 2.
    const http = encapsulation(frameExample('http').wire);
    expect([http[0]!.phyBefore, http[0]!.phyAfter, http[1]!.header, http[1]!.trailer]).toEqual([8, 12, 14, 4]);
    expect(http.map((r) => r.protocol).slice(1)).toEqual(['Ethernet II', 'IPv4', 'TCP', 'HTTP']);
    expect(http.at(-1)!.data).toBe(true);
  });

  it('IPv4-Kopf: Werte an der richtigen Bit-Stelle (Flags DF, Fragment-Offset)', () => {
    const { wire } = frameExample('http');
    const ip = wire.layers.find((l) => l.protocol === 'IPv4')!;
    const values = readFormat(FORMATS.ipv4, wire.bytes, ip);
    expect(values.find((x) => x.field.id === 'ttl')!.bitStart).toBe(ip.start * 8 + 64);
    expect(values.find((x) => x.field.id === 'srcIp')!.bitStart).toBe(ip.start * 8 + 96);
    expect(value(values, 'fragmentOffset')).toBe('0');
  });
});

describe('Darstellung (App und Wiki)', () => {
  const walk = (n: VNode, f: (n: VNode) => void) => {
    f(n);
    (n.children ?? []).forEach((c) => walk(c, f));
  };

  it('keine style-Attribute und keine Ereignis-Attribute (Website: CSP style-src self)', () => {
    const { wire } = frameExample('vlan');
    const trees = [osiLayersView(wire, t, { showEmpty: true, formats: true }), encapsulationView(wire, t), ...Object.values(FORMATS).map((f) => formatView(f, t))];
    for (const tree of trees) {
      const html = toHtml(tree);
      expect(html).not.toMatch(/\sstyle=/);
      expect(html).not.toMatch(/\son[a-z]+=/);
      walk(tree, (n) => expect(Object.keys(n.attrs ?? {}).every((k) => /^(data-(start|len|i)|type|open|role|aria-label|reversed)$/.test(k)), n.tag).toBe(true));
    }
  });

  it('toHtml maskiert Texte und Attribute', () => {
    expect(toHtml({ tag: 'p', title: '"x"', children: [{ tag: '#text', text: '<script>alert(1)</script> & co' }] })).toBe('<p title="&quot;x&quot;">&lt;script&gt;alert(1)&lt;/script&gt; &amp; co</p>');
  });

  it('Kopf nach Norm im Bitraster: IPv6-Adressen über vier ganze Zeilen', () => {
    const html = toHtml(formatView(FORMATS.ipv6, t));
    expect(html).toContain('lx-r4 lx-rsp4 lx-c1 lx-s32');
    expect(html).toContain('lx-r8 lx-rsp4 lx-c1 lx-s32');
  });
});
