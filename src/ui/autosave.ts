/**
 * Formulare speichern ohne «Übernehmen»: Sobald ein Feld verlassen wird
 * (Tab, Klick daneben, Enter) oder eine Auswahl ändert, wird gespeichert.
 *
 * `save(quiet)` speichert und meldet, ob es geklappt hat. Solange man im
 * selben Formular weiterarbeitet, wird leise versucht (`quiet = true`): Ein
 * halb ausgefülltes Formular (z.B. Adresse ohne Maske) zeigt noch keinen
 * Fehler. Verlässt man das Formular, wird der Fehler angezeigt.
 *
 * Verwendung: <form use:autosave={save} onsubmit={(e) => (e.preventDefault(), save(false))}>
 */
export type SaveFn = (quiet: boolean) => boolean | void;

const TEXT = /^(text|search|email|url|tel|password|number|)$/;

function isText(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  return (el instanceof HTMLInputElement && TEXT.test(el.type)) || el instanceof HTMLTextAreaElement;
}

export function autosave(form: HTMLFormElement, save: SaveFn) {
  let current = save;
  let pending = false;

  const run = (quiet: boolean) => {
    if (!pending) return;
    const ok = current(quiet);
    if (ok !== false) pending = false;
  };

  const oninput = (event: Event) => {
    if (isText(event.target)) pending = true;
  };
  // Auswahlfelder, Kontrollkästchen und Optionsfelder speichern sofort.
  const onchange = (event: Event) => {
    if (isText(event.target)) return;
    pending = true;
    run(true);
  };
  const onfocusout = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    run(!!next && form.contains(next));
  };
  const onkeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement) || !isText(event.target)) return;
    event.preventDefault();
    pending = true;
    run(false);
  };

  form.addEventListener('input', oninput);
  form.addEventListener('change', onchange);
  form.addEventListener('focusout', onfocusout);
  form.addEventListener('keydown', onkeydown);
  return {
    update(next: SaveFn) {
      current = next;
    },
    destroy() {
      form.removeEventListener('input', oninput);
      form.removeEventListener('change', onchange);
      form.removeEventListener('focusout', onfocusout);
      form.removeEventListener('keydown', onkeydown);
    },
  };
}
