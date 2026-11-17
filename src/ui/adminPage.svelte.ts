/**
 * Admin-Konsole als eigene Seite: Adresse «/admin» (Webversion) bzw. «dev.html?admin»
 * (Entwicklung). Aus dem Editor öffnet «Admin» diese Seite in einem eigenen Tab und holt einen
 * schon offenen Admin-Tab nach vorne.
 */
export function isAdminPage(): boolean {
  if (typeof location === 'undefined') return false;
  return /^\/admin\/?$/.test(location.pathname) || new URLSearchParams(location.search).has('admin');
}

export function adminUrl(): string {
  return location.pathname.endsWith('.html') ? `${location.pathname}?admin` : '/admin';
}

let tab: Window | null = null;

/** Admin-Konsole im eigenen Tab öffnen bzw. nach vorne holen. */
export function openAdmin() {
  if (tab && !tab.closed) {
    tab.focus();
    return;
  }
  tab = window.open(adminUrl(), 'leyonet-admin');
  // Blockiert (Popup-Sperre): im selben Tab öffnen.
  if (!tab) location.href = adminUrl();
}

/** Auf der Admin-Seite: Konsole oder Editor (Session ansehen, Infrastruktur bearbeiten) zeigen. */
class AdminView {
  view = $state<'console' | 'editor'>('console');
  show() {
    this.view = 'console';
  }
  editor() {
    this.view = 'editor';
  }
}
export const adminView = new AdminView();
