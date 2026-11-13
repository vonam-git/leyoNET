import { t } from '../../i18n';
import { DEMOS, type Demo } from '../demos';
import { openDemo } from '../demoRunner';
import { editor } from './editor.svelte';
import { simStore } from './sim.svelte';
import { closeDesktop } from './desktop.svelte';
import { ui } from './ui.svelte';

/**
 * Schaufenster («?schaufenster» oder «?schaufenster=<Demo>»): eine Demo zum Anschauen, die immer
 * läuft. Das Netz ist schreibgeschützt, die Simulation wiederholt die Aktionen der Demo in einer
 * Schleife, und nichts wird gespeichert (weder im Browser noch auf dem Server). Für Werbung,
 * Messestand und Info-Bildschirm.
 */
export const SHOWCASE_DEFAULT = 'rzVerbund';
/** Pause zwischen zwei Durchläufen (Simulationszeit). */
const GAP_MS = 6000;

class Showcase {
  active = $state(false);
  demo = $state<Demo | null>(null);
  #timer: ReturnType<typeof setInterval> | null = null;
  #ran = new Set<number>();

  /** Demo aus der Adresse, sonst null. Unbekannte Namen fallen auf das Standard-Schaufenster. */
  fromUrl(href = typeof location === 'undefined' ? '' : location.href): Demo | null {
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return null;
    }
    if (!url.searchParams.has('schaufenster')) return null;
    const wanted = url.searchParams.get('schaufenster') ?? '';
    return DEMOS.find((d) => d.id === wanted) ?? DEMOS.find((d) => d.id === SHOWCASE_DEFAULT) ?? null;
  }

  start(demo: Demo) {
    this.stop();
    this.active = true;
    this.demo = demo;
    // Mehr Platz für das Netz: Gerätespalte und Paketliste zu (nur für diesen Besuch, nicht gespeichert).
    ui.panels = { ...ui.panels, left: false, bottom: false };
    openDemo(demo, true);
    editor.viewOnly = true;
    setTimeout(() => editor.fit(), 300);
    editor.notify(t('showcase.started', { title: t(`demo.${demo.id}.title`) }));
    // Weitere Durchläufe ohne Desktop-Fenster: Pakete fliessen, wer schaut, wird nicht gestört.
    const period = demo.until + GAP_MS;
    let base = period;
    let pending: Demo['actions'] = [];
    this.#timer = setInterval(() => {
      const sim = simStore.sim;
      if (!editor.acting || !sim) return;
      // Simulation neu gestartet (z.B. nach einem Blick in den Entwurf): Schleife von vorne.
      if (sim.now < base - period) {
        base = period;
        pending = [];
        this.#ran.clear();
      }
      if (pending.length === 0 && sim.now >= base + period) base += period;
      // Nach dem ersten Durchlauf die Desktop-Fenster schliessen: freie Sicht auf das Netz.
      if (sim.now >= demo.until && sim.now < demo.until + 300) closeDesktop();
      if (pending.length === 0 && sim.now >= base && sim.now < base + period && !this.#ran.has(base)) {
        pending = [...demo.actions].sort((a, b) => a.at - b.at);
        this.#ran.add(base);
      }
      while (pending.length > 0 && sim.now >= base + pending[0]!.at) {
        const action = pending.shift()!;
        const device = editor.topology.devices.find((d) => d.name === action.device);
        if (!device) continue;
        if ('command' in action) simStore.runCommand(device.id, action.command);
        else if ('browse' in action) simStore.browse(device.id, action.browse);
        else if ('mail' in action) simStore.sendMail(device.id, action.mail);
        else simStore.fetchMail(device.id);
      }
    }, 200);
  }

  stop() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    this.#ran.clear();
  }

  /** Schaufenster verlassen: ohne Parameter neu laden (eigener Stand kommt zurück). */
  leave() {
    const url = new URL(location.href);
    url.searchParams.delete('schaufenster');
    location.href = url.toString();
  }
}

export const showcase = new Showcase();
