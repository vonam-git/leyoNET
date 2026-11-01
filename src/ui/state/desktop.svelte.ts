/**
 * Simulierte Desktops der Endgeräte (nur in der Simulation). Mehrere können
 * offen sein; minimierte erscheinen in der Taskleiste unten und lassen sich
 * mit einem Klick wieder hervorholen. Das vorderste Fenster ist `active`.
 */
export interface DesktopWindow {
  deviceId: string;
  app: string;
  minimized: boolean;
  /** Position nach dem Verschieben (Pixel im Zeichenbereich); ohne Angabe gestaffelt oben rechts. */
  x?: number;
  y?: number;
}

export const desktops = $state<{ windows: DesktopWindow[]; active: string | null }>({ windows: [], active: null });

/** Öffnet den Desktop (oder holt ihn nach vorne); `app` wählt die Anwendung. */
export function openDesktop(deviceId: string, app?: string) {
  const existing = desktops.windows.find((w) => w.deviceId === deviceId);
  if (existing) {
    existing.minimized = false;
    if (app) existing.app = app;
  } else {
    desktops.windows.push({ deviceId, app: app ?? 'terminal', minimized: false });
  }
  desktops.active = deviceId;
}

/** Schliesst einen Desktop; ohne Angabe alle (z.B. beim Wechsel in den Entwurf). */
export function closeDesktop(deviceId?: string) {
  desktops.windows = deviceId ? desktops.windows.filter((w) => w.deviceId !== deviceId) : [];
  if (!deviceId || desktops.active === deviceId) desktops.active = topmost();
}

export function minimizeDesktop(deviceId: string) {
  const w = desktops.windows.find((x) => x.deviceId === deviceId);
  if (w) w.minimized = true;
  if (desktops.active === deviceId) desktops.active = topmost();
}

/** Taskleiste: minimierten Desktop zeigen, den vordersten minimieren, sonst nach vorne holen. */
export function toggleDesktop(deviceId: string) {
  const w = desktops.windows.find((x) => x.deviceId === deviceId);
  if (!w) return;
  if (!w.minimized && desktops.active === deviceId) minimizeDesktop(deviceId);
  else openDesktop(deviceId);
}

function topmost(): string | null {
  for (let i = desktops.windows.length - 1; i >= 0; i--) if (!desktops.windows[i]!.minimized) return desktops.windows[i]!.deviceId;
  return null;
}
