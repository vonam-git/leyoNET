/** Welche Befehlszeile (Konsole am Gerät) gerade offen ist. */
export const cliWindow = $state<{ deviceId: string | null; generation: number; x?: number; y?: number }>({ deviceId: null, generation: 0 });

export function openCli(deviceId: string) {
  cliWindow.deviceId = deviceId;
  // Neue Sitzung auch beim erneuten Öffnen desselben Geräts.
  cliWindow.generation++;
}

export function closeCli() {
  cliWindow.deviceId = null;
}

/**
 * Befehlsverlauf je Gerät (Pfeil nach oben), nur im Arbeitsspeicher dieser
 * Sitzung: Er bleibt beim Wechsel zwischen Entwurf und Simulation und beim
 * erneuten Öffnen der Konsole erhalten, wird aber nirgends gespeichert.
 */
const histories = new Map<string, string[]>();
export const MAX_HISTORY = 100;
/** Höchstens so viele eingefügte Zeilen auf einmal (Schutz vor riesigen Einfügungen). */
export const MAX_PASTE = 2000;

export function cliHistory(key: string): string[] {
  return histories.get(key) ?? [];
}

export function rememberCommand(key: string, text: string): string[] {
  const next = [...cliHistory(key).filter((h) => h !== text), text].slice(-MAX_HISTORY);
  histories.set(key, next);
  return next;
}

/** Eingefügten Text in einzelne Befehlszeilen zerlegen (leere Zeilen und «!»-Kommentare fallen weg). */
export function pastedLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim() !== '' && !/^\s*!/.test(l));
}
