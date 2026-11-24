import { SessionStore, type IdentifyStatus } from './state/session.svelte';

/**
 * «Erkennen» für die Lehrperson: wie lange der Bildschirm der Lernenden blinkt (einstellbar,
 * im Browser gemerkt) und was der Knopf gerade zeigt: wird zugestellt, blinkt noch n s, nicht erreicht.
 * Der Stand kommt vom Server, der weiss, wann die Lernenden den Auftrag abgeholt haben.
 */

export const IDENTIFY_CHOICES = [5, 6, 7, 8, 9, 10] as const;
export const IDENTIFY_DEFAULT = 7;
const KEY = 'netzwerk-simulator.identifySeconds';
/** So oft fragt der Knopf nach dem Stand (nur solange ein Auftrag läuft). */
const POLL_MS = 1000;
/** Länger wartet der Server nicht auf die Lernenden (siehe server/app.cjs IDENTIFY_MS) plus Reserve. */
const GIVE_UP_MS = 15_000;
/** «Nicht erreicht» so lange stehen lassen. */
const MISSED_MS = 4000;

function load(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return (IDENTIFY_CHOICES as readonly number[]).includes(n) ? n : IDENTIFY_DEFAULT;
  } catch {
    return IDENTIFY_DEFAULT;
  }
}

type Run = { phase: 'pending' | 'shown' | 'missed'; until: number };

class IdentifyControl {
  seconds = $state(load());
  runs = $state<Record<string, Run>>({});
  now = $state(Date.now());
  #timer: ReturnType<typeof setInterval> | undefined;

  setSeconds(n: number) {
    if (!(IDENTIFY_CHOICES as readonly number[]).includes(n)) return;
    this.seconds = n;
    try {
      localStorage.setItem(KEY, String(n));
    } catch {
      /* nur für diesen Tab */
    }
  }

  active(code: string): boolean {
    const r = this.runs[code];
    return !!r && r.until > this.now;
  }

  /** Text für den Knopf, oder null (dann «Erkennen»). */
  label(code: string): { phase: Run['phase']; left: number } | null {
    const r = this.runs[code];
    if (!r || r.until <= this.now) return null;
    return { phase: r.phase, left: Math.max(1, Math.ceil((r.until - this.now) / 1000)) };
  }

  /** Auftrag schicken und den Stand verfolgen, bis das Blinken vorbei ist. */
  async start(admin: string, code: string): Promise<void> {
    await SessionStore.signal(admin, code, 'identify', this.seconds);
    const started = Date.now();
    this.#set(code, { phase: 'pending', until: started + GIVE_UP_MS });
    this.#tick();
    while (this.runs[code] && this.runs[code]!.phase === 'pending') {
      await new Promise((r) => setTimeout(r, POLL_MS));
      let status: IdentifyStatus;
      try {
        status = await SessionStore.identifyStatus(admin, code);
      } catch {
        if (Date.now() - started > GIVE_UP_MS) break;
        continue;
      }
      if (status.state === 'shown' && status.left) this.#set(code, { phase: 'shown', until: Date.now() + status.left });
      else if (status.state === 'missed' || status.state === 'none' || Date.now() - started > GIVE_UP_MS) break;
      else if (status.state === 'done') {
        this.#drop(code);
        return;
      }
    }
    if (this.runs[code]?.phase === 'pending') this.#set(code, { phase: 'missed', until: Date.now() + MISSED_MS });
  }

  #set(code: string, run: Run) {
    this.runs = { ...this.runs, [code]: run };
    this.now = Date.now();
  }

  #drop(code: string) {
    const { [code]: _, ...rest } = this.runs;
    this.runs = rest;
  }

  #tick() {
    if (this.#timer) return;
    this.#timer = setInterval(() => {
      this.now = Date.now();
      for (const [code, r] of Object.entries(this.runs)) if (r.until <= this.now) this.#drop(code);
      if (Object.keys(this.runs).length === 0) {
        clearInterval(this.#timer);
        this.#timer = undefined;
      }
    }, 250);
  }
}

export const identify = new IdentifyControl();
