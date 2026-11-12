/** Bietet Text (oder Bytes, z.B. eine .seb-Datei) als Datei zum Herunterladen an, ohne Server. */
export function downloadText(filename: string, text: string | Uint8Array, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text as BlobPart], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  // Im Dokument klicken: Aus einem offenen modalen Dialog heraus übergehen Browser sonst den Dateinamen.
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };

/**
 * Dateiname aus dem Projektnamen. Nur ASCII: Umlaute ausgeschrieben (Ü → Ue),
 * andere Akzente entfernt, weil Browser Dateinamen mit Sonderzeichen beim
 * Herunterladen teils durch «download» ersetzen.
 */
export function projectFilename(date = new Date(), title?: string): string {
  const safe = (title ?? '')
    .replace(/[äöüÄÖÜß]/g, (c) => UMLAUTS[c]!)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ._-]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.-]+|[.-]+$/g, '');
  if (safe) return `${safe}.json`;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `netzwerk-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}
