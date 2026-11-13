/**
 * Darstellung von Rahmen und Paketen im leyoNET-Stil, gemeinsam für App und Wiki:
 * OSI-Schichten mit Feldern (wie die Paketdetails), Verschachtelung (Kapselung), Kopf nach Norm
 * (Bitraster bzw. Byteband) und Hex-Ansicht. Die Funktionen liefern einen einfachen Baum (VNode);
 * die App zeichnet ihn mit Tree.svelte, das Wiki schreibt ihn mit toHtml() als statisches HTML.
 * Texte sind immer Text (nie HTML); toHtml() maskiert alles. Aussehen: src/ui/aufbau.css.
 */
import { FORMATS, encapsulation, formatOf, readFormat, type Dissection, type FieldValue, type FormatField, type FrameFormat, type OsiLayer, type WireLayer } from '../core';
import { protocolClass } from './packets';

export interface VNode {
  tag: string;
  cls?: string;
  text?: string;
  title?: string;
  attrs?: Record<string, string>;
  children?: VNode[];
}

export type Translate = (key: string, params?: Record<string, string | number>) => string;

const el = (tag: string, cls: string | undefined, children: (VNode | string | false | null | undefined)[] = [], extra: Partial<VNode> = {}): VNode => ({
  tag,
  ...(cls ? { cls } : {}),
  ...extra,
  children: children.filter((c): c is VNode | string => !!c || c === '').map((c) => (typeof c === 'string' ? { tag: '#text', text: c } : c)),
});
const text = (s: string): VNode => ({ tag: '#text', text: s });

export const OSI_ORDER: readonly OsiLayer[] = [7, 6, 5, 4, 3, 2, 1];
/** Farbe der Schicht als Klasse (die Website erlaubt keine style-Attribute: CSP style-src 'self'). */
const osiClass = (n: number) => `lx-o${n}`;
/** Lage im Raster als Klassen (Zeile, Zeilenspanne, Spalte, Spaltenspanne); siehe aufbau.css. */
const pos = (row: number, col: number, colSpan = 1, rowSpan = 1) => `lx-r${row}${rowSpan > 1 ? ` lx-rsp${rowSpan}` : ''} lx-c${col} lx-s${colSpan}`;

/** Feldname übersetzen; ohne Übersetzung bleibt der Filtername (wie in Wireshark). */
function fieldLabel(t: Translate, key: string): string {
  const s = t(`field.${key}`);
  return s === `field.${key}` ? key : s;
}

// --- OSI-Schichten (wie die Paketdetails) -------------------------------------------

/**
 * Schichten 7 bis 1 mit Protokoll, Feldern, Text und Hinweis. Jedes Feld trägt seine Lage
 * (data-start, data-len), damit ein Klick oder Zeigen die Bytes in der Hex-Ansicht markiert.
 */
export function osiLayersView(wire: Dissection, t: Translate, options: { showEmpty: boolean; formats?: boolean }): VNode {
  const hasUpper = wire.layers.some((l) => l.osi >= 4);
  const rows = OSI_ORDER.flatMap((n) => {
    const layers = wire.layers.filter((l) => l.osi === n);
    if (!options.showEmpty && layers.length === 0) return [];
    return [
      el('div', `lx-osi${layers.length === 0 ? ' empty' : ''}`, [
        el('div', 'lx-osi-label', [el('strong', undefined, [String(n)]), el('span', undefined, [t(`osi.${n}.name`)])], { title: t(`osi.${n}.tip`) }),
        el('div', 'lx-osi-body', [
          layers.length === 0 && el('span', 'lx-muted', [t(n >= 5 && n <= 6 && hasUpper ? 'wire.inApplication' : 'wire.emptyLayer')]),
          ...layers.map((layer) =>
            el('details', undefined, [
              el('summary', undefined, [layer.protocol, layer.length > 0 && el('span', 'lx-muted', [` · ${t('wire.bytes', { n: layer.length })}`])], { attrs: span(layer) }),
              layer.fields.length > 0 &&
                el(
                  'dl',
                  undefined,
                  layer.fields.flatMap((f) => [
                    el('dt', undefined, [el('button', 'lx-field', [fieldLabel(t, f.key)], { title: f.key, attrs: { type: 'button', ...span(f) } })]),
                    el('dd', undefined, [f.value]),
                  ]),
                ),
              layer.text !== undefined && el('pre', undefined, [layer.text.replace(/\r\n/g, '↵\n')]),
              layer.note && el('p', 'lx-note', [t(`wire.${layer.note}`)]),
              options.formats && normDetails(wire, layer, t),
            ], { attrs: { open: '' } }),
          ),
        ]),
      ], { cls: `lx-osi${layers.length === 0 ? ' empty' : ''} ${osiClass(n)}` }),
    ];
  });
  return el('div', 'lx-osi-stack', rows);
}

/** Kopf nach Norm mit den echten Werten, zugeklappt unter der Schicht. */
function normDetails(wire: Dissection, layer: WireLayer, t: Translate): VNode | null {
  const found = layerValues(wire, layer);
  if (!found) return null;
  return el('details', 'lx-norm', [el('summary', undefined, [t('fmt.norm', { norms: found.format.norms.join(', ') })]), formatView(found.format, t, found.values)]);
}

const span = (item: { start: number; length: number }): Record<string, string> => (item.length > 0 ? { 'data-start': String(item.start), 'data-len': String(item.length) } : {});

/** Hex-Ansicht: 16 Bytes je Zeile, jedes Byte mit data-i (für die Markierung). */
export function hexView(bytes: ArrayLike<number>, label: string): VNode {
  const lines: VNode[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const slice = Array.from({ length: Math.min(16, bytes.length - offset) }, (_, i) => bytes[offset + i]!);
    lines.push(
      el('div', 'lx-hex-line', [
        el('span', 'lx-offset', [offset.toString(16).padStart(4, '0')]),
        el('span', 'lx-hex-bytes', slice.map((b, i) => el('span', undefined, [b.toString(16).padStart(2, '0')], { attrs: { 'data-i': String(offset + i) } }))),
        el('span', 'lx-ascii', slice.map((b, i) => el('span', undefined, [b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '·'], { attrs: { 'data-i': String(offset + i) } }))),
      ]),
    );
  }
  return el('div', 'lx-hex', lines, { attrs: { role: 'group', 'aria-label': label } });
}

/** Bytes markieren (App und Wiki rufen das beim Zeigen auf ein Feld auf). */
export function markBytes(root: ParentNode, start: number, length: number) {
  for (const node of root.querySelectorAll<HTMLElement>('[data-i]')) {
    const i = Number(node.dataset.i);
    node.classList.toggle('hl', i >= start && i < start + length);
  }
}

// --- Verschachtelung ------------------------------------------------------------------

/**
 * Treppe der Kapselung: oben die Anwendungsdaten, darunter jede Schicht mit ihrem Kopf, den
 * Nutzdaten (= die Zeile darüber) und gegebenenfalls dem Anhang (FCS), unten Schicht 1.
 */
export function encapsulationView(wire: Dissection, t: Translate): VNode {
  const rows = encapsulation(wire);
  const n = rows.length;
  const cells: VNode[] = [];
  rows.forEach((row, i) => {
    const r = n - i;
    const next = rows[i + 1];
    const format = formatOf(row);
    const pdu = format && !row.data ? t(`fmt.pdu.${format.pdu}`) : t(`fmt.pdu.layer${row.osi}`);
    cells.push(el('div', `lx-encap-label ${osiClass(row.osi)} ${pos(r, 1)}`, [el('strong', undefined, [String(row.osi)]), el('span', undefined, [pdu])], { title: t(`osi.${row.osi}.name`) }));
    const head = row.osi === 1 ? row.phyBefore : row.header;
    if (head) cells.push(el('div', `lx-encap-head ${osiClass(row.osi)} ${pos(r, i + 2)}`, [el('span', 'lx-encap-name', [row.osi === 1 ? t('fmt.encap.preamble') : row.protocol]), el('span', 'lx-encap-size', [t('fmt.bytes', { n: head })])]));
    const payloadText = row.osi === 1 ? t('fmt.encap.frame', { n: row.payload }) : next ? t('fmt.encap.payload', { n: row.payload, protocol: next.protocol }) : row.payload ? t('fmt.encap.data', { n: row.payload }) : '';
    // Nutzdaten reichen genau über die Zeile darüber (Kopf bis Anhang der nächsten Schicht).
    if (payloadText) cells.push(el('div', `lx-encap-payload${next ? '' : ' data'} ${osiClass(next?.osi ?? row.osi)} ${pos(r, i + 3, 2 * n + 2 - i - (i + 3))}`, [payloadText]));
    const tail = row.osi === 1 ? row.phyAfter : row.trailer;
    if (tail) cells.push(el('div', `lx-encap-head${row.osi === 1 ? ' gap' : ''} ${osiClass(row.osi)} ${pos(r, 2 * n + 2 - i)}`, [el('span', 'lx-encap-name', [row.osi === 1 ? t('fmt.encap.gap') : trailerName(wire, row)]), el('span', 'lx-encap-size', [t('fmt.bytes', { n: tail })])]));
  });
  return el('div', 'lx-scroll', [el('div', `lx-encap lx-n${n}`, cells, { attrs: { role: 'img', 'aria-label': rows.map((r) => r.protocol).join(' › ') } })]);
}

function trailerName(wire: Dissection, row: { protocol: string }) {
  const layer = wire.layers.find((l) => l.protocol === row.protocol);
  const last = layer?.fields.at(-1)?.key ?? '';
  return /fcs$/.test(last) ? 'FCS' : 'Trailer';
}

// --- Kopf nach Norm -----------------------------------------------------------------

/** Länge eines Felds: im Bitraster in Bit (wie die RFCs), im Byteband in Byte (wie IEEE 802.3). */
const sizeText = (t: Translate, f: FormatField, layout: 'bits' | 'bytes' | 'table', bits?: number) => {
  if (f.bits === 0) return f.size ? t('fmt.bytesRange', { range: f.size }) : t('fmt.variable');
  const b = bits ?? f.bits;
  const inBits = t(b === 1 ? 'fmt.bit' : 'fmt.bitsN', { n: b });
  if (layout === 'bits' || b % 8 !== 0) return inBits;
  if (layout === 'table' && b >= 16) return `${inBits} (${t('fmt.bytes', { n: b / 8 })})`;
  return b >= 16 || layout === 'bytes' ? t('fmt.bytes', { n: b / 8 }) : inBits;
};

/**
 * Felder eines Formats als Bitraster (32 Bit je Zeile, wie in den RFCs) oder als Byteband
 * (wie IEEE 802.3). Mit `values` stehen die echten Werte eines Rahmens in den Feldern.
 */
export function formatView(format: FrameFormat, t: Translate, values?: FieldValue[], options: { allOptional?: boolean } = {}): VNode {
  // Mit Werten fehlen optionale Felder, die dieser Rahmen nicht hat; im Wiki bleiben sie (gestrichelt) stehen.
  const skip = (f: FormatField, v?: FieldValue) => !!values && !!f.optional && !v?.bits && !options.allOptional;
  const valueOf = (f: FormatField) => values?.find((v) => v.field === f);
  const cellChildren = (f: FormatField, v?: FieldValue) => [
    el('span', 'lx-f-name', [t(`fmt.f.${f.id}`)]),
    el('span', 'lx-f-size', [sizeText(t, f, format.layout, v?.bits)]),
    // Im Band nur echte Werte; feste Bitmuster der Schicht 1 stehen in der Tabelle.
    (v?.value ?? f.fixed) !== undefined && !(format.layout === 'bytes' && f.phy) && el('span', 'lx-f-value', [v?.value ?? f.fixed!]),
  ];
  const attrs = (v?: FieldValue): Record<string, string> => (v?.bitStart !== undefined && v.bits ? { 'data-start': String(Math.floor(v.bitStart / 8)), 'data-len': String(Math.ceil(v.bits / 8)) } : {});
  const head = el('div', 'lx-format-head', [
    el('span', `lx-tag proto-${protocolClass(format.protocol)}`, [format.protocol]),
    el('span', 'lx-muted', [`${t(`fmt.pdu.${format.pdu}`)} · ${format.norms.join(', ')}`]),
  ]);
  if (format.layout === 'bytes') {
    const items = format.fields.map((f) => {
      const v = valueOf(f);
      if (skip(f, v)) return null;
      const bytes = f.bits ? f.bits / 8 : 24;
      return el('div', undefined, cellChildren(f, v), {
        cls: `lx-byte lx-g${Math.round(Math.min(Math.max(bytes, 2), 24))}${f.phy ? ' phy lx-o1' : f.framing ? ' phy' : ''}${f.payload ? ' payload' : ''}${f.optional ? ' optional' : ''}`,
        title: t(`fmt.${format.id}.${f.id}`),
        attrs: attrs(v),
      });
    });
    return el('figure', `lx-format ${osiClass(format.osi)}`, [head, el('div', 'lx-scroll', [el('div', `lx-band ${osiClass(format.osi)}`, items)]), el('figcaption', 'lx-muted', [t('fmt.legend.bytes')])]);
  }
  // Bitraster: Felder über Zeilengrenzen werden geteilt; ganze Zeilen am Stück zusammengefasst.
  const cells: VNode[] = [];
  let bit = 0;
  for (const f of format.fields) {
    const v = valueOf(f);
    if (skip(f, v)) continue;
    const cls = `lx-bit${f.payload ? ' payload' : ''}${f.optional ? ' optional' : ''}`;
    const common = { title: t(`fmt.${format.id}.${f.id}`), attrs: attrs(v) };
    if (f.bits === 0) {
      // Variabel: eine ganze Zeile (Optionen, Daten).
      if (bit % 32) bit += 32 - (bit % 32);
      cells.push(el('div', `${cls} ${pos(bit / 32 + 2, 1, 32)}`, cellChildren(f, v), common));
      bit += 32;
      continue;
    }
    let left = f.bits;
    let first = true;
    while (left > 0) {
      const col = bit % 32;
      if (col === 0 && left >= 64) {
        const rows = Math.floor(left / 32);
        cells.push(el('div', `${cls} ${pos(bit / 32 + 2, 1, 32, rows)}`, cellChildren(f, v), common));
        bit += rows * 32;
        left -= rows * 32;
        first = false;
        continue;
      }
      const width = Math.min(32 - col, left);
      cells.push(el('div', `${cls}${first ? '' : ' cont'} ${pos(Math.floor(bit / 32) + 2, col + 1, width)}`, first ? cellChildren(f, v) : [el('span', 'lx-f-name', [t(`fmt.f.${f.id}`)]), el('span', 'lx-f-size', [t('fmt.continued')])], common));
      bit += width;
      left -= width;
      first = false;
    }
  }
  const ruler = [0, 4, 8, 12, 16, 20, 24, 28].map((n) => el('span', `lx-ruler ${pos(1, n + 1, 4)}`, [String(n)]));
  return el('figure', `lx-format ${osiClass(format.osi)}`, [head, el('div', 'lx-scroll', [el('div', `lx-bits ${osiClass(format.osi)}`, [...ruler, ...cells])]), el('figcaption', 'lx-muted', [t('fmt.legend.bits')])]);
}

/** Tabelle der Felder mit Länge, Wert und Bedeutung (Wiki, und als Hilfe in der App). */
export function fieldTableView(format: FrameFormat, t: Translate, values?: FieldValue[]): VNode {
  const rows = format.fields.map((f) => {
    const v = values?.find((x) => x.field === f);
    return el('tr', f.phy || f.framing ? 'phy' : undefined, [
      el('td', undefined, [t(`fmt.f.${f.id}`), f.phy && el('span', 'lx-muted', [` (${t('fmt.layer1')})`]), f.framing && el('span', 'lx-muted', [` (${t('fmt.framing')})`]), f.optional && el('span', 'lx-muted', [` (${t('fmt.optional')})`])]),
      el('td', 'lx-nowrap', [sizeText(t, f, format.layout === 'bits' ? 'table' : 'bytes')]),
      el('td', 'lx-mono', [v?.value ?? f.fixed ?? '']),
      el('td', undefined, [t(`fmt.${format.id}.${f.id}`)]),
    ]);
  });
  return el('div', 'table-wrap', [
    el('table', 'lx-fields', [
      el('thead', undefined, [el('tr', undefined, ['fmt.table.field', 'fmt.table.size', 'fmt.table.value', 'fmt.table.meaning'].map((k) => el('th', undefined, [t(k)])))]),
      el('tbody', undefined, rows),
    ]),
  ]);
}

/** Werte eines Formats zu einer Schicht der Kodierung (oder null, wenn es kein Format gibt). */
export function layerValues(wire: Dissection, layer: WireLayer): { format: FrameFormat; values: FieldValue[] } | null {
  const format = formatOf(layer);
  if (!format) return null;
  const inner = wire.layers.find((l) => l !== layer && l.length > 0 && l.start > layer.start && l.start < layer.start + layer.length);
  return { format, values: readFormat(format, wire.bytes, layer, inner?.start) };
}

// --- OSI-Übersicht mit Protokoll-Tags ------------------------------------------------

/** Protokolle, die leyoNET je Schicht simuliert (Schicht wie in den Paketdetails). */
export const OSI_PROTOCOLS: Partial<Record<OsiLayer, string[]>> = {
  7: ['HTTP', 'DNS', 'DHCP', 'DHCPv6', 'SMTP', 'POP3', 'IMAP', 'SSH', 'RIP', 'RIPng', 'BGP', 'IKEv2'],
  4: ['TCP', 'UDP'],
  3: ['IPv4', 'IPv6', 'ICMP', 'ICMPv6', 'OSPF', 'ESP'],
  2: ['Ethernet II', '802.1Q', 'ARP', 'STP', 'LACP', 'PPP', 'PPPoE', '802.11'],
  1: ['1000BASE-T', '1000BASE-SX/LX', '802.11 PHY', 'DSL', 'DOCSIS', 'GPON', 'LTE'],
};

/** Die sieben Schichten mit Farbe, Dateneinheit und den Protokollen, die leyoNET simuliert. */
export function osiOverviewView(t: Translate, protocols: Partial<Record<OsiLayer, string[]>> = OSI_PROTOCOLS): VNode {
  return el(
    'ol',
    'lx-overview',
    OSI_ORDER.map((n) =>
      el('li', undefined, [
        el('span', 'lx-overview-num', [String(n)]),
        el('span', 'lx-overview-name', [el('strong', undefined, [t(`osi.${n}.name`)]), el('span', 'lx-muted', [t(`fmt.pdu.layer${n}`)])]),
        el('span', 'lx-tags', (protocols[n] ?? []).length ? (protocols[n] ?? []).map((p) => el('span', `lx-tag proto-${protocolClass(p)}`, [p])) : [el('span', 'lx-muted', [t('wire.inApplication')])]),
      ], { cls: osiClass(n), title: t(`osi.${n}.tip`) }),
    ),
    { attrs: { reversed: '' } },
  );
}

// --- HTML für das Wiki ----------------------------------------------------------------

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const VOID = new Set(['br', 'hr', 'img']);

/** Baum als HTML; alle Texte und Attribute maskiert, Tags und Attributnamen nur aus diesem Modul. */
export function toHtml(node: VNode): string {
  if (node.tag === '#text') return escape(node.text ?? '');
  const attrs = [
    node.cls && ` class="${escape(node.cls)}"`,
    node.title && ` title="${escape(node.title)}"`,
    ...Object.entries(node.attrs ?? {}).map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${escape(v)}"`)),
  ].join('');
  if (VOID.has(node.tag)) return `<${node.tag}${attrs}>`;
  return `<${node.tag}${attrs}>${(node.children ?? []).map(toHtml).join('')}${node.text ? escape(node.text) : ''}</${node.tag}>`;
}

export { FORMATS };
