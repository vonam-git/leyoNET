/**
 * Einladung in eine Klasse: «https://app.leyonet.ch/?klasse=WXYZ-6789» öffnet den Dialog «Session»
 * mit eingetragenem Klassencode. Beigetreten wird erst mit «Beitreten» (der Link allein ändert nichts).
 */
export const INVITE_PARAM = 'klasse';

/** Nur Zeichen, die in einem Klassencode vorkommen (Buchstaben, Ziffern, Bindestrich), höchstens 14. */
const CLASS_CODE = /^[A-Za-z0-9-]{4,14}$/;

/** «?klasse=…» lesen und aus der Adresszeile entfernen (beim Neuladen nicht noch einmal). */
export function takeInvite(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get(INVITE_PARAM);
    if (code === null) return null;
    url.searchParams.delete(INVITE_PARAM);
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    return CLASS_CODE.test(code) ? code.toUpperCase() : null;
  } catch {
    return null;
  }
}

/** Link und Einladungstext für eine Klasse (Admin-Konsole, zum Kopieren). */
export function inviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/?${INVITE_PARAM}=${encodeURIComponent(code)}`;
}
