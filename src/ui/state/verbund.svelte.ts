import { federate, parseProject, siteName, type Federation, type Topology } from '../../core';
import { api, session } from './session.svelte';
import { examMode } from './exam.svelte';
import { editor } from './editor.svelte';
import { t } from '../../i18n';

/**
 * Klassen-Verbund im Browser der Lernenden: holt alle paar Sekunden die Infrastruktur der
 * Lehrperson und (falls freigegeben) die anderen Standorte und setzt sie für die Simulation mit
 * dem eigenen Netz zusammen. Gespeichert wird weiterhin nur das eigene Netz.
 */

export interface SiteStatus {
  level: 'offline' | 'connected' | 'online' | 'services' | 'done';
  goals: number;
  total: number;
}

interface RemoteSite {
  seat: number;
  label: string;
  updated: number;
  topology: Topology | null;
}

interface VerbundResponse {
  enabled: boolean;
  label?: string;
  shareSites?: boolean;
  showMap?: boolean;
  infraUpdated?: number;
  infra?: unknown;
  sites?: { seat: number; label: string; updated: number; project?: unknown }[];
  status?: Record<string, SiteStatus>;
  statusTime?: number;
  now?: number;
}

export interface VerbundMessage {
  id: number;
  time: number;
  from: number;
  fromLabel: string;
  to: number;
  subject: string;
  text: string;
}

const POLL_MS = 8000;

const toTopology = (project: unknown): Topology | null => {
  if (!project) return null;
  const parsed = parseProject(JSON.stringify(project));
  return parsed.ok ? parsed.topology : null;
};

class VerbundStore {
  enabled = $state(false);
  shareSites = $state(false);
  showMap = $state(false);
  label = $state('');
  infra = $state.raw<Topology | null>(null);
  sites = $state.raw<RemoteSite[]>([]);
  status = $state.raw<Record<string, SiteStatus>>({});
  messages = $state.raw<VerbundMessage[]>([]);
  /** Zähler: ändert sich, wenn neue Daten da sind (für abgeleitete Werte). */
  version = $state(0);
  /** Neue Nachrichten an den eigenen Standort seit dem letzten Öffnen der Karte. */
  unread = $state(0);
  #since = 0;
  #loaded = false;
  #timer: ReturnType<typeof setInterval> | undefined;
  #class: string | null = null;
  #cache: { own: Topology; version: number; result: Federation } | null = null;

  /** Im Verbund (Klasse mit freigegebenem Verbund, keine Prüfung). */
  get active(): boolean {
    return this.enabled && !!session.classCode && !!session.site && !examMode.active;
  }

  /** Polling an die Klasse anpassen (von App.svelte aufgerufen, wenn sich die Klasse ändert). */
  follow(classCode: string | null, enabled: boolean) {
    if (classCode === this.#class && (!!this.#timer === enabled)) return;
    this.#stop();
    this.#class = classCode;
    if (!classCode || !enabled) return;
    void this.refresh();
    this.#timer = setInterval(() => void this.refresh(), POLL_MS);
  }

  #stop() {
    clearInterval(this.#timer);
    this.#timer = undefined;
    this.#since = 0;
    this.#loaded = false;
    this.enabled = false;
    this.infra = null;
    this.sites = [];
    this.status = {};
    this.messages = [];
    this.unread = 0;
    this.#cache = null;
  }

  async refresh() {
    const code = this.#class;
    if (!code) return;
    try {
      const data = await api<VerbundResponse>('GET', `classes/${encodeURIComponent(code)}/verbund?since=${this.#since}`);
      if (code !== this.#class) return;
      this.enabled = data.enabled;
      if (!data.enabled) return;
      this.label = data.label ?? '';
      this.shareSites = !!data.shareSites;
      this.showMap = !!data.showMap;
      if (data.infra !== undefined) this.infra = toTopology(data.infra);
      const known = new Map(this.sites.map((s) => [s.seat, s]));
      this.sites = (data.sites ?? []).map((s) => ({
        seat: s.seat,
        label: s.label,
        updated: s.updated,
        topology: s.project !== undefined ? toTopology(s.project) : this.shareSites ? (known.get(s.seat)?.topology ?? null) : null,
      }));
      this.status = data.status ?? {};
      if (data.now) this.#since = data.now;
      const after = this.messages.at(-1)?.id ?? 0;
      // Zwei Abfragen können sich überholen: nur wirklich neue übernehmen.
      const fresh = (await api<VerbundMessage[]>('GET', `classes/${encodeURIComponent(code)}/messages?after=${after}`)).filter((m) => m.id > (this.messages.at(-1)?.id ?? 0));
      if (fresh.length) {
        // Beim ersten Laden nicht melden, nur danach neu eingetroffene an mich oder an alle.
        const seat = session.site?.seat;
        if (this.#loaded && seat) {
          const mine = fresh.filter((m) => m.from !== seat && (m.to === seat || m.to === -1));
          if (mine.length) this.unread += mine.length;
          const last = mine.at(-1);
          if (last) editor.notify(t('verbund.msg.incoming', { from: siteName(last.from, last.fromLabel), subject: last.subject }));
        }
        this.messages = [...this.messages, ...fresh].slice(-200);
      }
      this.#loaded = true;
      this.version++;
    } catch {
      /* offline oder Klasse abgelaufen: beim nächsten Mal wieder */
    }
  }

  /** Netz für die Simulation: eigenes Netz plus Infrastruktur und andere Standorte. */
  federation(own: Topology): Federation | null {
    if (!this.active || !this.infra) return null;
    const c = this.#cache;
    if (c && c.own === own && c.version === this.version) return c.result;
    const seat = session.site!.seat;
    const others = this.sites.filter((s) => s.seat !== seat && s.topology).map((s) => ({ seat: s.seat, label: s.label, topology: s.topology! }));
    const result = federate(this.infra, [{ seat, label: session.site!.label, topology: own, own: true }, ...others]);
    this.#cache = { own, version: this.version, result };
    return result;
  }

  simTopology(own: Topology): Topology {
    return this.federation(own)?.topology ?? own;
  }

  /** Eigener Name im Verbund. */
  get ownName(): string {
    return session.site ? siteName(session.site.seat, session.site.label) : '';
  }

  async send(to: number, subject: string, text: string) {
    if (!this.#class || !session.code) return;
    await api('POST', `classes/${encodeURIComponent(this.#class)}/messages`, { session: session.code, to, subject, text }, undefined, session.writerHeaders());
    await this.refresh();
  }
}

export const verbund = new VerbundStore();
