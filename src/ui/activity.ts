/**
 * Tätigkeit der Person zwischen Tabs derselben Seite melden (BroadcastChannel, nur im Browser,
 * ohne Speicher und ohne Netz). Die Admin-Konsole läuft oft in einem eigenen Tab neben dem Editor:
 * Wer im Editor arbeitet, soll in der Konsole nicht wegen «Untätigkeit» abgemeldet werden.
 */
const CHANNEL = 'leyonet-activity';
const THROTTLE_MS = 15_000;
let channel: BroadcastChannel | null = null;
let last = 0;

function open(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === 'undefined') return channel;
  try {
    channel = new BroadcastChannel(CHANNEL);
  } catch {
    channel = null;
  }
  return channel;
}

/** Eingabe in diesem Tab (höchstens alle 15 s weitergegeben). */
export function reportActivity(now = Date.now()) {
  if (now - last < THROTTLE_MS) return;
  last = now;
  open()?.postMessage({ kind: 'activity' });
}

/** Tätigkeit in einem anderen Tab; liefert eine Funktion zum Abmelden. */
export function onActivity(fn: () => void): () => void {
  const c = open();
  if (!c) return () => undefined;
  const handler = (event: MessageEvent) => {
    if (event.data && typeof event.data === 'object' && (event.data as { kind?: unknown }).kind === 'activity') fn();
  };
  c.addEventListener('message', handler);
  return () => c.removeEventListener('message', handler);
}
