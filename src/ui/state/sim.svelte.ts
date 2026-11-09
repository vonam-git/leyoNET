import { Simulation, type Topology } from '../../core';
import { unpackPlan, type UnpackPlan } from '../osiSteps';

/** Längster Zeitschritt pro Bild, damit ein Tab im Hintergrund nicht Minuten "nachholt". */
const MAX_FRAME_MS = 100;
const CLOCK_REFRESH_MS = 200;
/** In der Zeitlupe: kurze Pause zwischen zwei Übertragungen, bevor die Uhr zum nächsten Ereignis springt. */
const IDLE_PAUSE_MS = 250;
/** Längere Wartezeiten (z.B. DHCP-Erneuerung nach 30 Minuten) werden nicht übersprungen, sondern laufen in Echtzeit. */
const MAX_SKIP_MS = 2000;

export type Speed = 'realtime' | 'slow' | 'slower';

/** Echte Millisekunden pro virtueller Millisekunde, solange Rahmen unterwegs sind. */
const SLOWDOWN: Record<Speed, number> = { realtime: 1, slow: 300, slower: 1000 };

/**
 * Verbindet die Simulation mit der Oberfläche: Im Simulation läuft die
 * virtuelle Zeit, im Entwurfsmodus ist sie angehalten. In der Zeitlupe
 * laufen Übertragungen verlangsamt, Wartezeiten dazwischen werden
 * übersprungen, damit man jedem Rahmen folgen kann.
 * Komponenten lesen `tick`, um bei Änderungen neu zu zeichnen.
 */
/** Einzelschritt: Ein ankommender Rahmen wird Schicht für Schicht ausgepackt (siehe osiSteps.ts). */
export interface Unpacking extends UnpackPlan {
  entryId: number;
  deviceId: string;
  /** Aktuell gezeigte Schicht (Index in `layers`). */
  index: number;
}

/**
 * Eingaben während der Simulation (Befehle, Pings, Topologie-Änderungen …).
 * Zusammen mit der Topologie beim Start lässt sich so jeder frühere Zustand
 * exakt wiederherstellen: Die Simulation ist deterministisch.
 */
type Input = { events: number; at: number; apply: (sim: Simulation) => void };

/** Ab so vielen Ereignissen wird «Schritt zurück» zu langsam und ist gesperrt. */
const MAX_REPLAY_EVENTS = 200_000;

class SimStore {
  tick = $state(0);
  unpacking = $state.raw<Unpacking | null>(null);
  speed = $state<Speed>('realtime');
  paused = $state(false);
  #sim: Simulation | null = null;
  #generation = -1;
  #frame = 0;
  #last = 0;
  #lastRefresh = 0;
  #idleSince = 0;
  /** Topologie beim Start und alle Eingaben seither. */
  #start: Topology | null = null;
  #inputs: Input[] = [];
  /** Verarbeitete Ereignisse seit dem Start. */
  events = $state(0);

  get sim(): Simulation | null {
    return this.#sim;
  }

  activate(topology: Topology, generation: number) {
    if (!this.#sim || generation !== this.#generation) {
      this.#begin(topology);
      this.#generation = generation;
    } else if (topology !== this.#sim.topology) {
      this.#record((sim) => sim.updateTopology(topology));
    }
    this.tick++;
    if (!this.#frame) {
      this.#last = performance.now();
      this.#frame = requestAnimationFrame(this.#loop);
    }
  }

  deactivate() {
    this.unpacking = null;
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
  }

  #begin(topology: Topology) {
    this.#sim = new Simulation(topology);
    this.#start = topology;
    this.#inputs = [];
    this.events = 0;
    this.unpacking = null;
  }

  /** Eingabe ausführen und für das Zurückspulen merken. */
  #record(apply: (sim: Simulation) => void) {
    const sim = this.#sim;
    if (!sim) return;
    this.#inputs.push({ events: this.events, at: sim.now, apply });
    apply(sim);
    this.tick++;
  }

  /** Simulation neu starten (Zeit 0) mit dem aktuellen Netz; angehalten bleibt angehalten. */
  reset(topology: Topology) {
    this.#begin(topology);
    this.tick++;
  }

  get canStepBack(): boolean {
    return !!this.unpacking || (this.events > 0 && this.events <= MAX_REPLAY_EVENTS);
  }

  /**
   * Einzelschritt zurück: zuerst das Auspacken eines Rahmens rückwärts, sonst
   * den Ablauf vom Start bis ein Ereignis vor jetzt wiederholen.
   */
  stepBack() {
    this.paused = true;
    const current = this.unpacking;
    if (current) {
      this.unpacking = current.index > 0 ? { ...current, index: current.index - 1 } : null;
      this.tick++;
      return;
    }
    if (!this.#start || this.events === 0 || this.events > MAX_REPLAY_EVENTS) return;
    this.#replay(this.events - 1);
    this.tick++;
  }

  #replay(target: number) {
    const sim = new Simulation(this.#start!);
    let count = 0;
    const kept: Input[] = [];
    for (const input of this.#inputs) {
      if (input.events > target) break;
      while (count < input.events && sim.step()) count++;
      sim.advanceClock(input.at);
      input.apply(sim);
      kept.push(input);
    }
    while (count < target && sim.step()) count++;
    this.#sim = sim;
    this.#inputs = kept;
    this.events = count;
  }

  togglePause() {
    this.paused = !this.paused;
    if (!this.paused) this.unpacking = null;
  }

  /**
   * Einzelschritt; die Simulation bleibt danach angehalten. Ist das nächste
   * Ereignis die Ankunft eines Rahmens, zeigt jeder Schritt zuerst eine Schicht
   * des Auspackens (OSI-Farben), erst danach verarbeitet das Gerät den Rahmen.
   */
  step() {
    this.paused = true;
    const sim = this.#sim;
    if (!sim) return;
    const current = this.unpacking;
    if (current) {
      if (current.index < current.layers.length - 1) this.unpacking = { ...current, index: current.index + 1 };
      else {
        this.unpacking = null;
        if (sim.step()) this.events++;
      }
      this.tick++;
      return;
    }
    const next = sim.nextEventTime();
    const arriving = next === undefined ? undefined : sim.getInFlight().filter((e) => e.arrives === next).sort((a, b) => a.id - b.id)[0];
    const plan = arriving ? unpackPlan(sim.topology, arriving) : null;
    if (arriving && plan) {
      // Der Rahmen steht nun beim Empfänger; die nächsten Schritte packen ihn aus.
      this.unpacking = { ...plan, entryId: arriving.id, deviceId: arriving.to.device, index: 0 };
    } else if (sim.step()) {
      this.events++;
    }
    this.tick++;
  }

  /** WLAN-Roaming: neue Topologie übernehmen und den Client neu anmelden lassen. */
  roam(topology: Topology, deviceId: string) {
    this.#record((sim) => {
      sim.updateTopology(topology);
      sim.reassociate(deviceId);
    });
  }

  runCommand(deviceId: string, line: string) {
    this.#record((sim) => sim.runCommand(deviceId, line));
  }

  ping(deviceId: string, target: string, vrf?: string) {
    this.#record((sim) => sim.ping(deviceId, target, 1, vrf));
  }

  ssh(deviceId: string, target: string, user: string, password: string) {
    this.#record((sim) => sim.ssh(deviceId, target, user, password));
  }

  sshSend(deviceId: string, line: string) {
    this.#record((sim) => sim.sshSend(deviceId, line));
  }

  sshClose(deviceId: string) {
    this.#record((sim) => sim.sshClose(deviceId));
  }

  browse(deviceId: string, url: string) {
    this.#record((sim) => sim.browse(deviceId, url));
  }

  sendMail(deviceId: string, message: { to: string[]; subject: string; body: string }) {
    this.#record((sim) => sim.sendMail(deviceId, message));
  }

  fetchMail(deviceId: string) {
    this.#record((sim) => sim.fetchMail(deviceId));
  }

  clearPacketLog() {
    this.#record((sim) => sim.clearPacketLog());
  }

  clearConsole(deviceId: string) {
    this.#record((sim) => sim.clearConsole(deviceId));
  }

  #advance(sim: Simulation, elapsed: number, timestamp: number): number {
    if (this.speed === 'realtime') return sim.runUntil(sim.now + elapsed);
    if (sim.getInFlight().length > 0) {
      this.#idleSince = timestamp;
      return sim.runUntil(sim.now + elapsed / SLOWDOWN[this.speed]);
    }
    const next = sim.nextEventTime();
    if (next === undefined || next - sim.now > MAX_SKIP_MS) return sim.runUntil(sim.now + elapsed);
    if (timestamp - this.#idleSince < IDLE_PAUSE_MS) return 0;
    this.#idleSince = timestamp;
    return sim.runUntil(next);
  }

  #loop = (timestamp: number) => {
    const sim = this.#sim;
    if (!sim) return;
    const elapsed = Math.min(timestamp - this.#last, MAX_FRAME_MS);
    this.#last = timestamp;
    const processed = this.paused ? 0 : this.#advance(sim, elapsed, timestamp);
    if (processed > 0) this.events += processed;
    // In der Zeitlupe bewegen sich Rahmen auch ohne neue Ereignisse: jedes Bild zeichnen.
    const animating = this.speed !== 'realtime' && sim.getInFlight().length > 0 && !this.paused;
    if (processed > 0 || animating || timestamp - this.#lastRefresh > CLOCK_REFRESH_MS) {
      this.#lastRefresh = timestamp;
      this.tick++;
    }
    this.#frame = requestAnimationFrame(this.#loop);
  };
}

export const simStore = new SimStore();
