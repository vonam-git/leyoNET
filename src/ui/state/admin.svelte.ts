/**
 * Admin-Anmeldung der Webversion: nur im Speicher dieses Tabs (nicht in localStorage oder
 * Cookies). Das Token stellt der Server nach dem Admin-Passwort bzw. Zugangsschlüssel aus.
 */
import { api } from './session.svelte';

export const adminToken = $state<{ value: string | null }>({ value: null });

/** Ist die Anmeldung noch gültig? Fragt den Server (das Token allein beweist nichts). */
export async function adminVerified(): Promise<boolean> {
  if (!adminToken.value) return false;
  try {
    await api('GET', 'admin/overview', undefined, adminToken.value);
    return true;
  } catch {
    adminToken.value = null;
    return false;
  }
}
