import { evaluateTasks, type GoalResult, type TaskSet } from '../../core';
import { t } from '../../i18n';
import { editor } from './editor.svelte';
import { catalogIdOf, progress } from './progress.svelte';
import { verbund } from './verbund.svelte';
import { session } from './session.svelte';
import { simStore } from './sim.svelte';

/**
 * Ergebnisse von «Prüfen» und das grosse Aufgabenfenster. Seitenleiste und
 * Fenster zeigen dieselbe Aufgabe mit denselben Ergebnissen.
 */
class TaskView {
  results = $state<GoalResult[] | null>(null);
  checking = $state(false);
  /** Grosses Fenster offen? Position und Grösse bleiben beim Schliessen erhalten. */
  open = $state(false);
  x = $state(0);
  y = $state(0);
  #placed = false;

  check(tasks: TaskSet) {
    this.checking = true;
    // Kurz warten, damit die Oberfläche «prüft …» zeigen kann; die Prüf-Simulationen laufen synchron.
    setTimeout(() => {
      const results = evaluateTasks(verbund.simTopology(editor.topology), tasks, simStore.sim?.getPacketLog() ?? []);
      this.results = results;
      this.checking = false;
      // Für das Dashboard der Lehrperson: erreichte Lernziele dieser Session.
      session.progress = { goals: results.filter((r) => r.passed).length, total: results.length };
      // Übung aus dem Katalog vollständig gelöst: im Katalog als erledigt zeigen.
      const id = catalogIdOf(tasks);
      if (id && results.length > 0 && results.every((r) => r.passed || r.manual) && progress.mark(id)) editor.notify(t('catalog.doneNotice'));
    }, 20);
  }

  reset() {
    this.results = null;
  }

  show() {
    if (!this.#placed && typeof window !== 'undefined') {
      // Rechts neben der Zeichenfläche, aber nicht über der Seitenleiste.
      this.x = Math.max(16, Math.round(window.innerWidth / 2 - 380));
      this.y = Math.max(56, Math.round(window.innerHeight * 0.08));
      this.#placed = true;
    }
    this.open = true;
  }

  close() {
    this.open = false;
  }

  toggle() {
    if (this.open) this.close();
    else this.show();
  }
}

export const taskView = new TaskView();

/** Grosse Aufgaben (langer Text oder viele Ziele) gleich im Fenster zeigen. */
export function isLargeTask(tasks: TaskSet): boolean {
  return (tasks.description?.length ?? 0) > 280 || tasks.goals.length > 8;
}
