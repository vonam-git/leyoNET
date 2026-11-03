import type { TaskSet } from '../../core';
import { locale } from '../../i18n';
import { CATALOG } from '../catalog';

/**
 * Erledigte Übungen aus dem Aufgaben-Katalog: Katalog-Kennung → Zeitpunkt, an dem
 * «Prüfen» zum ersten Mal alle Ziele erfüllt hat. Nur im Browser (localStorage),
 * keine Personendaten; «Fortschritt zurücksetzen» löscht die Liste.
 */
const KEY = 'netzwerk-simulator.catalogDone';

function load(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY);
    const value = raw ? (JSON.parse(raw) as unknown) : null;
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'number')) as Record<string, number>;
  } catch {
    return {};
  }
}

let titles: { locale: string; map: Map<string, string> } | null = null;

/** Katalog-Kennung einer geladenen Aufgabe (über den Titel in der aktuellen Sprache). */
export function catalogIdOf(tasks: TaskSet | null | undefined): string | null {
  if (!tasks || tasks.exam) return null;
  if (titles?.locale !== locale()) titles = { locale: locale(), map: new Map(CATALOG.map((e) => [e.build().tasks.title, e.id])) };
  return titles.map.get(tasks.title) ?? null;
}

class Progress {
  done = $state<Record<string, number>>(typeof localStorage !== 'undefined' ? load() : {});

  #save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.done));
    } catch {
      // ohne Speicher gilt die Liste bis zum Neuladen
    }
  }

  /** Als erledigt markieren; true = neu erledigt. */
  mark(id: string): boolean {
    if (this.done[id]) return false;
    this.done = { ...this.done, [id]: Date.now() };
    this.#save();
    return true;
  }

  reset() {
    this.done = {};
    try {
      localStorage.removeItem(KEY);
    } catch {
      // egal
    }
  }
}

export const progress = new Progress();
