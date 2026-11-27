import type { LbMethod } from '../model/types';
import { flowHash, pickPath } from '../net/routing';
import type { NodeContext } from './simulation';
import { SYSLOG_SEVERITY } from './syslog';
import type { TcpConnection, TcpHandlers, TcpStack } from './tcp';

/**
 * Load Balancer als Reverse Proxy auf Schicht 4 (wie HAProxy im TCP-Modus): Er nimmt jede
 * Verbindung an seinem Port selbst an, baut eine zweite Verbindung zu einem der Server dahinter
 * auf und reicht die Daten in beide Richtungen durch. Die Server sehen darum den Load Balancer
 * als Absender. Health Checks (TCP-Verbindungsaufbau alle 2 s) nehmen ausgefallene Server aus
 * der Verteilung und nach der Erholung wieder auf.
 */

/** Abstand der Health Checks (wie HAProxy «inter 2s»). */
export const LB_CHECK_INTERVAL = 2000;
/** So viele Fehlschläge in Folge, dann gilt ein Server als ausgefallen («fall»). */
export const LB_FALL = 2;
/** So viele Erfolge in Folge, dann ist er wieder dabei («rise»). */
export const LB_RISE = 2;

export interface LbBackendState {
  ip: string;
  port: number;
  up: boolean;
  /** Offene weitergeleitete Verbindungen. */
  active: number;
  /** Bisher zugeteilte Verbindungen. */
  total: number;
}

export interface LoadBalancerState {
  port: number;
  method: LbMethod;
  backends: LbBackendState[];
}

export interface LbHost {
  readonly ctx: NodeContext;
  readonly tcp: TcpStack;
  syslog(severity: number, msgid: string, text: string, params?: Record<string, string>): void;
}

interface Runtime {
  up: boolean;
  ok: number;
  failed: number;
  active: number;
  total: number;
  checking: boolean;
}

export class LoadBalancer {
  #servers = new Map<string, Runtime>();
  #next = 0;
  #checking = false;

  constructor(private readonly host: LbHost) {
    host.tcp.listenAny((conn) => this.#accept(conn));
  }

  get #config() {
    return this.host.ctx.device()?.loadBalancer;
  }

  /** Server der Einstellung mit Port (fehlt er, gilt der des Load Balancers). */
  #backends(): { ip: string; port: number; key: string }[] {
    const config = this.#config;
    return (config?.backends ?? []).map((b) => ({ ip: b.ip, port: b.port ?? config!.port, key: `${b.ip}|${b.port ?? config!.port}` }));
  }

  #runtime(key: string): Runtime {
    let r = this.#servers.get(key);
    if (!r) this.#servers.set(key, (r = { up: true, ok: 0, failed: 0, active: 0, total: 0, checking: false }));
    return r;
  }

  boot() {
    if (!this.#config || this.#config.healthCheck === false || this.#checking) return;
    this.#checking = true;
    const tick = () => {
      const config = this.#config;
      if (!config || config.healthCheck === false) {
        this.#checking = false;
        return;
      }
      for (const b of this.#backends()) this.#check(b);
      this.host.ctx.schedule(LB_CHECK_INTERVAL, tick);
    };
    this.host.ctx.schedule(0, tick);
  }

  /** Health Check: TCP-Verbindungsaufbau zum Dienst; klappt er, gleich wieder schliessen. */
  #check(b: { ip: string; port: number; key: string }) {
    const r = this.#runtime(b.key);
    if (r.checking) return;
    r.checking = true;
    const done = (ok: boolean) => {
      if (!r.checking) return;
      r.checking = false;
      if (ok) {
        r.failed = 0;
        r.ok++;
        if (!r.up && r.ok >= LB_RISE) this.#mark(b, r, true);
      } else {
        r.ok = 0;
        r.failed++;
        if (r.up && r.failed >= LB_FALL) this.#mark(b, r, false);
      }
    };
    const conn = this.host.tcp.connect(b.ip, b.port, {
      onOpen: (c) => {
        done(true);
        c.close();
      },
      onError: () => done(false),
    });
    if (!conn) return done(false);
    // Antwort innerhalb eines Intervalls, sonst gilt der Check als fehlgeschlagen (wie HAProxy «timeout check»).
    this.host.ctx.schedule(LB_CHECK_INTERVAL, () => {
      if (!r.checking || conn.state !== 'SYN_SENT') return;
      done(false);
      conn.fail('timeout');
    });
  }

  #mark(b: { ip: string; port: number }, r: Runtime, up: boolean) {
    r.up = up;
    const params = { server: `${b.ip}:${b.port}` };
    this.host.ctx.print(up ? 'lb.up' : 'lb.down', params);
    this.host.syslog(up ? SYSLOG_SEVERITY.notice : SYSLOG_SEVERITY.warning, up ? 'LBUP' : 'LBDOWN', `backend ${b.ip}:${b.port} is ${up ? 'up' : 'down'}`, params);
  }

  /** Server für eine neue Verbindung nach dem eingestellten Verfahren; `skip` = schon erfolglos versucht. */
  #choose(client: string, skip: Set<string>) {
    const config = this.#config;
    const candidates = this.#backends().filter((b) => this.#runtime(b.key).up && !skip.has(b.key));
    if (!config || !candidates.length) return undefined;
    if (config.method === 'sourceHash') return pickPath(candidates, flowHash(client));
    if (config.method === 'leastConn') {
      const least = Math.min(...candidates.map((b) => this.#runtime(b.key).active));
      const pool = candidates.filter((b) => this.#runtime(b.key).active === least);
      return pool[this.#next++ % pool.length];
    }
    return candidates[this.#next++ % candidates.length];
  }

  #accept(client: TcpConnection): TcpHandlers | null {
    const config = this.#config;
    if (!config || client.local.port !== config.port) return null;
    const first = this.#choose(client.remote.ip, new Set());
    if (!first) {
      this.host.ctx.print('lb.noBackend', { client: client.remote.ip });
      return null;
    }
    // Daten des Clients, bis der Server die Verbindung angenommen hat (für einen zweiten Versuch).
    let early: string[] = [];
    let ended = false;
    let upstream: TcpConnection | null = null;
    let opened = false;
    const tried = new Set<string>();

    const open = (b: { ip: string; port: number; key: string }) => {
      tried.add(b.key);
      const r = this.#runtime(b.key);
      r.active++;
      r.total++;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        r.active--;
      };
      this.host.ctx.print('lb.forward', { client: `${client.remote.ip}:${client.remote.port}`, server: `${b.ip}:${b.port}` });
      upstream = this.host.tcp.connect(b.ip, b.port, {
        onOpen: () => {
          opened = true;
          early = [];
        },
        onData: (_c, data) => client.write(data),
        onEnd: (c) => {
          client.close();
          c.close();
        },
        onClose: finish,
        onError: () => {
          finish();
          if (opened) return client.close();
          // Server antwortet nicht: einmal mit dem nächsten versuchen (wie HAProxy «redispatch»).
          const next = this.#choose(client.remote.ip, tried);
          if (!next) {
            this.host.ctx.print('lb.noBackend', { client: client.remote.ip });
            return client.close();
          }
          open(next);
          for (const data of early) upstream?.write(data);
          if (ended) upstream?.close();
        },
      });
      if (!upstream) {
        finish();
        client.close();
      }
    };

    open(first);
    return {
      onData: (_c, data) => {
        if (!opened) early.push(data);
        upstream?.write(data);
      },
      onEnd: () => {
        ended = true;
        upstream?.close();
      },
      onError: () => upstream?.close(),
    };
  }

  state(): LoadBalancerState | undefined {
    const config = this.#config;
    if (!config) return undefined;
    return {
      port: config.port,
      method: config.method,
      backends: this.#backends().map((b) => {
        const r = this.#runtime(b.key);
        return { ip: b.ip, port: b.port, up: r.up, active: r.active, total: r.total };
      }),
    };
  }
}
