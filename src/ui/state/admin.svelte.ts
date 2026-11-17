/**
 * Admin-Anmeldung der Webversion: nur für diesen Tab. Auf der Seite «/admin» (eigener Tab) liegt
 * das Token im sessionStorage, damit ein Neuladen nicht abmeldet; es endet mit dem Tab und ist
 * für andere Tabs und Seiten nicht sichtbar. Nie in localStorage oder Cookies. Das Token stellt
 * der Server nach dem Admin-Passwort bzw. Zugangsschlüssel (und gegebenenfalls dem zweiten
 * Faktor) aus und beendet es nach einer Stunde ohne Anfrage.
 */
import { isAdminPage } from '../adminPage.svelte';
import { api } from './session.svelte';

const KEY = 'netzwerk-simulator.adminToken';

function initial(): string | null {
  if (!isAdminPage()) return null;
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export const adminToken = $state<{ value: string | null }>({ value: initial() });

/** Token für diesen Tab merken (nur auf der Admin-Seite) bzw. vergessen. */
export function rememberAdminToken(token: string | null) {
  if (!isAdminPage()) return;
  try {
    if (token) sessionStorage.setItem(KEY, token);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Ohne Speicher gilt die Anmeldung bis zum Neuladen.
  }
}

/** Ist die Anmeldung noch gültig? Fragt den Server (das Token allein beweist nichts). */
export async function adminVerified(): Promise<boolean> {
  if (!adminToken.value) return false;
  try {
    await api('GET', 'admin/overview', undefined, adminToken.value);
    return true;
  } catch {
    adminToken.value = null;
    rememberAdminToken(null);
    return false;
  }
}
