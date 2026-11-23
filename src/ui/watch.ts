import { parseProject, serializeProject } from '../core';
import { t } from '../i18n';
import { editor } from './state/editor.svelte';
import { session } from './state/session.svelte';

/**
 * Lehrperson sieht einer Session zu (Übung begleiten, Prüfung überwachen) oder bearbeitet eine
 * Session ihrer Klasse: Der eigene Stand wird zur Seite gelegt, die fremde Session angezeigt.
 * Beim Ansehen wird sie alle paar Sekunden neu geladen und nichts gespeichert. Beim Bearbeiten
 * (nur mit Admin-Anmeldung, nur Klassen) gehen die Änderungen an die Session; die Lernenden
 * sehen solange nur zu. «Beenden» holt den eigenen Stand zurück.
 */
let own: string | null = null;

export async function startWatch(code: string, admin?: string, label?: string, edit = false): Promise<boolean> {
  if (!session.watching) own = serializeProject(editor.topology, editor.tasks, editor.snapshots);
  editor.setMode('design');
  editor.viewOnly = !edit;
  session.onEditConflict = () => editor.notify(t('classLive.edit.conflict'), 'error');
  session.onEditIdle = () => {
    editor.viewOnly = true;
    editor.notify(t('classLive.edit.idle'));
  };
  await session.watch(code, (p) => editor.replace(p.topology, { undoable: edit, tasks: p.tasks ?? null, snapshots: p.snapshots ?? [] }), admin, label, edit);
  const error = session.watching?.error;
  if (error && session.watching?.updated === null) {
    await stopWatch();
    editor.notify(t(`session.error.${error === 'unknownSession' || error === 'offline' || error === 'rateLimited' ? error : 'other'}`), 'error');
    return false;
  }
  return true;
}

export async function stopWatch() {
  await session.stopWatch();
  editor.viewOnly = false;
  const parsed = own ? parseProject(own) : null;
  own = null;
  if (parsed?.ok) editor.replace(parsed.topology, { undoable: false, tasks: parsed.tasks ?? null, snapshots: parsed.snapshots ?? [] });
}
