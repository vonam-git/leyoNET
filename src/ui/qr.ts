/**
 * QR-Code (ISO/IEC 18004) für die Einrichtung der Zwei-Faktor-Anmeldung: Die Authenticator-App
 * liest die Adresse «otpauth://…» vom Bildschirm. Eigene, kleine Umsetzung ohne fremde Pakete:
 * Byte-Modus, Fehlerkorrektur M, Versionen 1 bis 10 (bis 213 Bytes), Maske mit der kleinsten
 * Strafpunktzahl. Läuft nur im Browser der Lehrperson, nichts geht übers Netz.
 */

/** Je Version (1–10), Fehlerkorrektur M: Codewörter total, Korrekturwörter je Block, Anzahl Blöcke. */
const TABLE: readonly [number, number, number][] = [
  [26, 10, 1],
  [44, 16, 1],
  [70, 26, 1],
  [100, 18, 2],
  [134, 24, 2],
  [172, 16, 4],
  [196, 18, 4],
  [242, 22, 4],
  [292, 22, 5],
  [346, 26, 5],
];

// --- Galois-Feld GF(256) mit dem Polynom x^8 + x^4 + x^3 + x^2 + 1 ---------------------
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
}
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!);

/** Reed-Solomon: Korrekturwörter für einen Block. */
function correction(data: number[], degree: number): number[] {
  // Generator (x - α^0)(x - α^1)…, höchster Koeffizient (1) weggelassen.
  let gen = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j]!;
      next[j + 1] ^= mul(gen[j]!, EXP[i]!);
    }
    gen = next;
  }
  const rest = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ rest.shift()!;
    rest.push(0);
    for (let j = 0; j < degree; j++) rest[j] ^= mul(gen[j + 1]!, factor);
  }
  return rest;
}

function alignment(version: number, size: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < count; pos -= step) out.splice(1, 0, pos);
  return out;
}

/** QR-Code als Raster (true = dunkel), ohne Ruhezone. Wirft bei zu langem Text. */
export function qrMatrix(text: string): boolean[][] {
  const bytes = [...new TextEncoder().encode(text)];
  let version = 0;
  for (let v = 1; v <= TABLE.length; v++) {
    const [total, ec, blocks] = TABLE[v - 1]!;
    const capacity = (total - ec * blocks) * 8;
    if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= capacity) {
      version = v;
      break;
    }
  }
  if (!version) throw new Error('qrTooLong');
  const [total, ecLen, blockCount] = TABLE[version - 1]!;
  const dataLen = total - ecLen * blockCount;
  const size = version * 4 + 17;

  // Daten: Modus «Byte», Länge, Bytes, Abschluss, Füllbytes.
  const bits: number[] = [];
  const put = (value: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, dataLen * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < dataLen; pad ^= 0xec ^ 0x11) data.push(pad);

  // In Blöcke teilen (kurze zuerst), Korrektur je Block, dann verschränken.
  const short = Math.floor(dataLen / blockCount);
  const longCount = dataLen % blockCount;
  const blocks: number[][] = [];
  const ecc: number[][] = [];
  for (let b = 0, at = 0; b < blockCount; b++) {
    const len = short + (b >= blockCount - longCount ? 1 : 0);
    const block = data.slice(at, at + len);
    at += len;
    blocks.push(block);
    ecc.push(correction(block, ecLen));
  }
  const codewords: number[] = [];
  for (let i = 0; i <= short; i++) for (const block of blocks) if (i < block.length) codewords.push(block[i]!);
  for (let i = 0; i < ecLen; i++) for (const e of ecc) codewords.push(e[i]!);

  // Raster mit Funktionsmustern.
  const grid = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    grid[y]![x] = dark;
    fixed[y]![x] = true;
  };
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ] as const) {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
  }
  const align = alignment(version, size);
  for (const ay of align)
    for (const ax of align) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === size - 7) || (ax === size - 7 && ay === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  // Platz für Format- und Versionsinformation reservieren.
  const format = (mask: number) => {
    const value = mask; // Fehlerkorrektur M = 00
    let rem = value;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((value << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((f >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  format(0);
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const v = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((v >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }

  // Codewörter im Zickzack von rechts unten einsetzen.
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (fixed[y]![x] || i >= codewords.length * 8) continue;
        grid[y]![x] = ((codewords[i >>> 3]! >>> (7 - (i & 7))) & 1) === 1;
        i++;
      }
  }

  // Maske mit den wenigsten Strafpunkten wählen.
  const masks: ((x: number, y: number) => boolean)[] = [
    (x, y) => (x + y) % 2 === 0,
    (_, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const apply = (m: number) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y]![x] && masks[m]!(x, y)) grid[y]![x] = !grid[y]![x];
  };
  let best = 0;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    apply(m);
    format(m);
    const score = penalty(grid);
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
    apply(m);
  }
  apply(best);
  format(best);
  return grid;
}

/** Strafpunkte nach der Norm: lange Reihen, 2×2-Flächen, Muster wie Suchmarken, Verhältnis hell/dunkel. */
function penalty(grid: boolean[][]): number {
  const size = grid.length;
  let score = 0;
  const lines = (get: (a: number, b: number) => boolean) => {
    for (let a = 0; a < size; a++) {
      let run = 1;
      for (let b = 1; b <= size; b++) {
        if (b < size && get(a, b) === get(a, b - 1)) run++;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      for (let b = 0; b + 10 < size; b++) {
        const p = Array.from({ length: 11 }, (_, k) => get(a, b + k));
        const finder = [true, false, true, true, true, false, true];
        const left = p.slice(0, 4).every((v) => !v) && finder.every((v, k) => p[4 + k] === v);
        const right = finder.every((v, k) => p[k] === v) && p.slice(7).every((v) => !v);
        if (left || right) score += 40;
      }
    }
  };
  lines((y, x) => grid[y]![x]!);
  lines((x, y) => grid[y]![x]!);
  for (let y = 0; y + 1 < size; y++)
    for (let x = 0; x + 1 < size; x++) {
      const c = grid[y]![x];
      if (c === grid[y]![x + 1] && c === grid[y + 1]![x] && c === grid[y + 1]![x + 1]) score += 3;
    }
  const dark = grid.reduce((s, row) => s + row.filter(Boolean).length, 0);
  score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return score;
}

/** Pfad für ein SVG (je dunkles Feld ein Quadrat), Ruhezone 4 Felder. Nur Zahlen, kein fremder Text. */
export function qrPath(grid: boolean[][]): { d: string; size: number } {
  const quiet = 4;
  let d = '';
  grid.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x + quiet} ${y + quiet}h1v1h-1z`)));
  return { d, size: grid.length + quiet * 2 };
}
