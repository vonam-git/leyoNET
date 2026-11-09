/**
 * Eingabe von Codes wie «ABCD-2345» (Session, Klasse, Prüfungsplatz): Grossbuchstaben,
 * nur Buchstaben und Ziffern, nach vier Zeichen automatisch ein Bindestrich.
 * Beim Löschen wird der Bindestrich nicht sofort wieder angehängt.
 */
export function formatCode(raw: string, deleting = false): string {
  const clean = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  if (clean.length > 4) return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  if (clean.length === 4 && !deleting) return `${clean}-`;
  return clean;
}

/** Svelte-Aktion für ein Eingabefeld; löst nach dem Umformatieren ein «input»-Ereignis für bind:value aus. */
export function codeInput(node: HTMLInputElement) {
  function oninput(event: Event) {
    const deleting = (event as InputEvent).inputType?.startsWith('delete') ?? false;
    const next = formatCode(node.value, deleting);
    if (next === node.value) return;
    node.value = next;
    node.dispatchEvent(new Event('input', { bubbles: true }));
  }
  node.addEventListener('input', oninput);
  return { destroy: () => node.removeEventListener('input', oninput) };
}
