import { loadAvatar, saveAvatar, type AvatarConfig } from '../avatar';
import { openDemo, runDemoAction } from '../demoRunner';
import type { Demo, TourStep } from '../demos';
import { dialogs } from './dialogs.svelte';
import { editor } from './editor.svelte';
import { simStore } from './sim.svelte';

/**
 * Geführte Demo: Ein Avatar als Lehrperson erklärt einen Testfall Schritt für
 * Schritt. Jeder Schritt kann den Modus wechseln, die Simulation anhalten,
 * eine Aktion auslösen, ein Gerät hervorheben oder ein Geräte-Fenster öffnen.
 */
class Tour {
  avatar = $state<AvatarConfig>(loadAvatar());
  demo = $state.raw<Demo | null>(null);
  step = $state(0);
  /** Hervorgehobenes Gerät (ID). */
  highlight = $state<string | null>(null);
  #generation = -1;

  get steps(): TourStep[] {
    return this.demo?.tour ?? [];
  }

  get active(): boolean {
    return this.demo !== null;
  }

  setAvatar(change: Partial<AvatarConfig>) {
    this.avatar = { ...this.avatar, ...change };
    saveAvatar(this.avatar);
  }

  start(demo: Demo) {
    if (!demo.tour?.length) return;
    dialogs.closeDevice();
    openDemo(demo, false);
    this.demo = demo;
    this.#generation = editor.generation;
    this.step = 0;
    this.#apply(0, true);
  }

  next() {
    if (this.step < this.steps.length - 1) this.go(this.step + 1, true);
    else this.stop();
  }

  back() {
    if (this.step > 0) this.go(this.step - 1, false);
  }

  go(n: number, forward: boolean) {
    // Ein anderes Projekt geladen: Führung beenden.
    if (editor.generation !== this.#generation) return this.stop();
    this.step = n;
    this.#apply(n, forward);
  }

  stop() {
    this.demo = null;
    this.highlight = null;
  }

  #id(name: string | undefined): string | null {
    return name ? (editor.topology.devices.find((d) => d.name === name)?.id ?? null) : null;
  }

  #apply(n: number, forward: boolean) {
    const step = this.steps[n];
    if (!step) return;
    if (step.sim === true && !editor.acting) {
      simStore.speed = 'realtime';
      editor.setMode('simulation');
    } else if (step.sim === false && editor.acting) {
      editor.setMode('design');
    }
    if (step.pause !== undefined) simStore.paused = step.pause;
    this.highlight = this.#id(step.highlight);
    if (step.window) {
      const id = this.#id(step.window.device);
      if (id) dialogs.showDevice(id, step.window.tab);
    }
    const action = step.action;
    if (forward && action) {
      // Die Simulation startet erst im nächsten Durchlauf der Oberfläche.
      const run = (tries: number) => {
        if (simStore.sim && editor.acting) runDemoAction(action);
        else if (tries > 0) setTimeout(() => run(tries - 1), 100);
      };
      run(20);
    }
  }
}

export const tour = new Tour();
