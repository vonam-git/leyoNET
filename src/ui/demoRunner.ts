import { parseProject } from '../core';
import { t } from '../i18n';
import { ensureProjectFeatures } from './actions';
import { demoApp, demoProject, type Demo, type DemoAction } from './demos';
import { errorText } from './labels';
import { closeDesktop, openDesktop } from './state/desktop.svelte';
import { editor } from './state/editor.svelte';
import { simStore } from './state/sim.svelte';

let timer: ReturnType<typeof setInterval> | null = null;

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

/**
 * Demo laden. Mit `present` startet sofort die Simulation, und die Aktionen
 * der Demo laufen zur vorgesehenen Simulationszeit (Ping, Webseite, E-Mail …),
 * jeweils mit geöffnetem Desktop des Geräts, damit die Klasse zusieht.
 */
export function openDemo(demo: Demo, present: boolean) {
  stop();
  const text = demoProject(demo);
  const parsed = text ? parseProject(text) : null;
  if (!parsed?.ok) {
    if (parsed && !parsed.ok) editor.notify(errorText(parsed.error), 'error');
    return;
  }
  if (editor.acting) editor.setMode('design');
  closeDesktop();
  editor.replace(parsed.topology, { undoable: true, tasks: null, snapshots: [] });
  ensureProjectFeatures(t(present ? 'demo.presenting' : 'demo.opened', { title: t(`demo.${demo.id}.title`) }));
  if (!present) return;

  simStore.speed = 'realtime';
  simStore.paused = false;
  editor.setMode('simulation');
  const generation = editor.generation;
  const pending = [...demo.actions].sort((a, b) => a.at - b.at);
  timer = setInterval(() => {
    if (!editor.acting || editor.generation !== generation) return stop();
    const sim = simStore.sim;
    if (!sim) return;
    while (pending.length > 0 && sim.now >= pending[0]!.at) runDemoAction(pending.shift()!);
    if (pending.length === 0) stop();
  }, 100);
}

/** Aktion einer Demo jetzt ausführen (mit geöffnetem Desktop des Geräts). */
export function runDemoAction(action: DemoAction) {
  const device = editor.topology.devices.find((d) => d.name === action.device);
  if (!device) return;
  openDesktop(device.id, demoApp(action));
  editor.select({ kind: 'device', id: device.id });
  if ('command' in action) simStore.runCommand(device.id, action.command);
  else if ('browse' in action) simStore.browse(device.id, action.browse);
  else if ('mail' in action) simStore.sendMail(device.id, action.mail);
  else simStore.fetchMail(device.id);
}
