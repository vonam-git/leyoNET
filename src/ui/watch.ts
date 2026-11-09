import { parseProject, serializeProject } from '../core';
import { t } from '../i18n';
import { editor } from './state/editor.svelte';
import { session } from './state/session.svelte';

/**
 * Lehrperson sieht einer Session zu (Übung begleiten, Prüfung überwachen): Der eigene
 * Stand wird zur Seite gelegt, die fremde Session nur angezeigt und alle paar Sekunden
 * neu geladen. Nichts wird gespeichert; «Beenden» holt den eigenen Stand zurück.
 */
let own: string | null = null;

export async function startWatch(code: string, admin?: string, label?: string): Promise<boolean> {
  if (!session.watching) own = serializeProject(editor.topology, editor.tasks, editor.snapshots);
  editor.setMode('design');
  editor.viewOnly = true;
  await session.watch(code, (p) => editor.replace(p.topology, { undoable: false, tasks: p.tasks ?? null, snapshots: p.snapshots ?? [] }), admin, label);
  const error = session.watching?.error;
  if (error && session.watching?.updated === null) {
    stopWatch();
    editor.notify(t(`session.error.${error === 'unknownSession' || error === 'offline' || error === 'rateLimited' ? error : 'other'}`), 'error');
    return false;
  }
  return true;
}

export function stopWatch() {
  session.stopWatch();
  editor.viewOnly = false;
  const parsed = own ? parseProject(own) : null;
  own = null;
  if (parsed?.ok) editor.replace(parsed.topology, { undoable: false, tasks: parsed.tasks ?? null, snapshots: parsed.snapshots ?? [] });
}

