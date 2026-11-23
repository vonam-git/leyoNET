import { untrack } from 'svelte';
import { evaluateTasks } from '../core';
import { t } from '../i18n';
import { editor } from './state/editor.svelte';
import { examMode } from './state/exam.svelte';
import { session } from './state/session.svelte';
import { showcase } from './state/showcase.svelte';
import { simStore } from './state/sim.svelte';
import { progressOf, taskView } from './state/taskView.svelte';
import { verbund } from './state/verbund.svelte';

/**
 * Klassen im Unterricht (Webversion):
 * - Fortschritt der Lernenden wird von selbst bestimmt (kurz nach jeder Änderung und wenn sich
 *   der Verbund ändert) und mit dem Lebenszeichen gemeldet; niemand muss «Prüfen» oder «Abgeben».
 * - Die Lehrperson sieht beim Ansehen oder Bearbeiten einer Session gleich, welche Ziele grün sind.
 * - Solange die Lehrperson eine Session bearbeitet, sehen die Lernenden nur zu und bekommen
 *   danach ihren Stand.
 * Muss beim Aufbau einer Komponente aufgerufen werden (benutzt $effect).
 */

/** Nach einer Änderung so lange warten, bevor der Fortschritt neu bestimmt wird. */
export const PROGRESS_DELAY_MS = 3000;
/** Nur der Verbund hat sich geändert (andere Standorte): höchstens so oft neu bestimmen. */
export const PROGRESS_VERBUND_MS = 20_000;

export function setupClassLive() {
  session.onRemote = (p) => {
    editor.replace(p.topology, { undoable: false, tasks: p.tasks ?? null, snapshots: p.snapshots ?? [] });
    editor.notify(t('classLive.teacherChanged'));
  };

  // Lehrperson bearbeitet: Lernende sehen nur zu (nicht beim eigenen Ansehen oder in einer Vorführung).
  $effect(() => {
    const editing = session.teacherEditing;
    untrack(() => {
      if (session.watching || showcase.active) return;
      if (editing) editor.setMode('design');
      editor.viewOnly = editing;
    });
  });

  // Fortschritt der eigenen Klassen-Session.
  let lastRun = 0;
  let lastKey: unknown = null;
  $effect(() => {
    const { topology, tasks } = editor;
    const v = verbund.version;
    const inClass = !!session.classCode && !session.watching && !examMode.active && !session.teacherEditing;
    if (!inClass) return;
    if (!tasks || tasks.noSelfCheck || tasks.goals.length === 0) {
      session.progress = null;
      return;
    }
    const own = topology !== lastKey;
    // Nur der Verbund ist neu: nicht bei jeder Abfrage rechnen.
    if (!own && Date.now() - lastRun < PROGRESS_VERBUND_MS) return;
    const timer = setTimeout(
      () => {
        lastRun = Date.now();
        lastKey = topology;
        try {
          session.progress = progressOf(evaluateTasks(verbund.simTopology(topology), tasks, simStore.sim?.getPacketLog() ?? []));
        } catch {
          /* beim nächsten Mal */
        }
      },
      own ? PROGRESS_DELAY_MS : 0,
    );
    void v;
    return () => clearTimeout(timer);
  });

  // Lehrperson sieht einer Klassen-Session zu: Ziele gleich prüfen und anzeigen (für die Fehlersuche am Beamer).
  $effect(() => {
    const { topology, tasks } = editor;
    const w = session.watching;
    if (!w || !w.classCode || !tasks || tasks.goals.length === 0) return;
    void topology;
    const timer = setTimeout(() => untrack(() => taskView.check(tasks)), 600);
    return () => clearTimeout(timer);
  });
}
