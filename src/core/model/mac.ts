export const MAC_PATTERN = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

/**
 * Deterministische MAC-Adresse aus Gerätenummer und Interface-Index.
 * Präfix 02:00 = lokal administriert, kollidiert also nie mit echten Herstellern.
 */
export function macFor(deviceSeq: number, ifaceIndex: number): string {
  const bytes = [0x02, 0x00, (deviceSeq >> 16) & 0xff, (deviceSeq >> 8) & 0xff, deviceSeq & 0xff, ifaceIndex & 0xff];
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(':');
}

/**
 * Schreibweisen vereinheitlichen: 02-00-00-00-01-01, 0200.0000.0101 (Cisco),
 * 020000000101 und 2:0:0:0:1:1 werden zu 02:00:00:00:01:01. Ungültig: null.
 */
export function normalizeMac(raw: string): string | null {
  const text = raw.trim().toUpperCase();
  let bytes: string[] | null = null;
  if (/^[0-9A-F]{1,2}([:-][0-9A-F]{1,2}){5}$/.test(text)) bytes = text.split(/[:-]/).map((b) => b.padStart(2, '0'));
  else if (/^[0-9A-F]{4}\.[0-9A-F]{4}\.[0-9A-F]{4}$/.test(text)) bytes = text.replace(/\./g, '').match(/../g);
  else if (/^[0-9A-F]{12}$/.test(text)) bytes = text.match(/../g);
  return bytes ? bytes.join(':') : null;
}

/** Ab Werk vergebene Adresse (02:00:…)? Sonst von Hand gesetzt. */
export const isFactoryMac = (mac: string, deviceSeq: number, ifaceIndex: number) => mac === macFor(deviceSeq, ifaceIndex);
