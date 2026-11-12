import type { CatalogEntry } from './catalogKit';
import { session, type CatalogVisibility } from './state/session.svelte';
import { ui } from './state/ui.svelte';

/**
 * Welche Übungen der Katalog zeigt. Lokal (Einzeldatei, Desktop): alle ausser Verbund-Aufgaben.
 * In der Webversion: ohne die vom Hauptadmin ausgeblendeten Übungen und Reihen und ohne die,
 * die die Lehrperson für ihre Klasse ausgeblendet hat. Verbund-Aufgaben nur in einer Klasse mit
 * freigegebenem Verbund (und wenn der Hauptadmin sie erlaubt).
 */
export function catalogVisible(entry: CatalogEntry): boolean {
  if (!ui.online) return !entry.verbund;
  const global = session.config?.catalog;
  const own = session.classSettings?.catalog;
  const hiddenBy = (v: CatalogVisibility | undefined) => !!v && (v.hidden.includes(entry.id) || (!!entry.series && v.hiddenSeries.includes(entry.series)));
  if (hiddenBy(global) || hiddenBy(own)) return false;
  if (entry.verbund) return global?.verbund !== false && own?.verbund !== false && !!session.classSettings?.verbund.enabled;
  return true;
}
