/**
 * Welche Dialoge und Seitenbereiche offen sind. Als gemeinsamer Zustand, damit
 * Menüs, Tastenkürzel und die Befehlssuche sie gleichermassen öffnen können.
 */
export type DialogName =
  | 'about'
  | 'snapshots'
  | 'rack'
  | 'privacy'
  | 'feedback'
  | 'admin'
  | 'session'
  | 'catalog'
  | 'review'
  | 'exam'
  | 'taskEditor'
  | 'features'
  | 'shortcuts'
  | 'palette'
  | 'ipcalc'
  | 'vlans'
  | 'costs'
  | 'demos'
  | 'avatar'
  | 'save';

/** Werte, die der IP-Rechner übernehmen kann (z.B. in das Formular eines Rechners). */
export interface IpCalcTarget {
  ip?: string;
  mask?: string;
  /** Wird mit den gewählten Werten aufgerufen. */
  apply?: (values: { ip: string; mask: string; gateway: string; network: string }) => void;
}

/** So viele Geräte-Fenster höchstens; das älteste schliesst beim nächsten. */
export const MAX_DEVICE_WINDOWS = 6;

export interface DeviceWindowState {
  key: number;
  id: string;
  tab: string;
  x: number;
  y: number;
  z: number;
}

class Dialogs {
  open = $state<DialogName | null>(null);
  ipcalc = $state.raw<IpCalcTarget>({});
  /** Hilfe-Seitenleiste mit dem gewählten Thema. */
  help = $state<string | null>(null);
  /**
   * Fenster mit den erweiterten Einstellungen von Geräten. Mehrere können
   * gleichzeitig offen sein; jedes lässt sich verschieben. `z` bestimmt die
   * Reihenfolge (das zuletzt benutzte liegt oben).
   */
  deviceWindows = $state<DeviceWindowState[]>([]);
  #z = 1;
  #key = 0;

  /** Erweiterte Einstellungen öffnen; ist das Gerät schon offen, kommt sein Fenster nach vorne. */
  showDevice(id: string, tab?: string) {
    const open = this.deviceWindows.find((w) => w.id === id);
    if (open) {
      open.z = ++this.#z;
      if (tab) open.tab = tab;
      return;
    }
    const last = this.deviceWindows.at(-1);
    const n = this.deviceWindows.length;
    if (n >= MAX_DEVICE_WINDOWS) this.deviceWindows.shift();
    this.deviceWindows.push({ key: ++this.#key, id, tab: tab ?? last?.tab ?? 'general', x: 120 + (n % 6) * 32, y: 70 + (n % 6) * 28, z: ++this.#z });
  }

  /** ◀ ▶: dasselbe Fenster zeigt ein anderes Gerät (ein zweites Fenster für dieses Gerät schliesst). */
  switchDevice(key: number, id: string) {
    const w = this.deviceWindows.find((x) => x.key === key);
    if (!w) return;
    this.deviceWindows = this.deviceWindows.filter((x) => x.key === key || x.id !== id);
    w.id = id;
    w.z = ++this.#z;
  }

  focusDevice(key: number) {
    const w = this.deviceWindows.find((x) => x.key === key);
    if (w && w.z !== this.#z) w.z = ++this.#z;
  }

  closeDevice(key?: number) {
    this.deviceWindows = key === undefined ? [] : this.deviceWindows.filter((w) => w.key !== key);
  }

  show(name: DialogName) {
    this.open = name;
  }

  close() {
    this.open = null;
  }

  ipCalculator(target: IpCalcTarget = {}) {
    this.ipcalc = target;
    this.open = 'ipcalc';
  }

  showHelp(topic = 'overview') {
    this.help = topic;
  }

  closeHelp() {
    this.help = null;
  }
}

export const dialogs = new Dialogs();
