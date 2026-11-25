/* leyonet.ch – kleine Skripte ohne Bibliotheken. Einzige Anfrage nach aussen: die anonyme
   Besucherzählung an app.leyonet.ch (siehe ganz unten und die Datenschutzerklärung). */
(() => {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Sprache der Seite (de oder en); dieselbe Datei für beide Fassungen.
  const EN = document.documentElement.lang.startsWith('en');
  const L = (de, en) => (EN ? en : de);

  /* --- Hell/Dunkel: folgt dem System, der Schalter wechselt für diese Seite ------------
     Ohne Speicherung (keine Cookies, nichts im Browser abgelegt): beim nächsten Besuch gilt wieder
     die Einstellung des Systems. */
  const root = document.documentElement;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : systemDark.matches);
  const themeListeners = [];
  const applyTheme = () => {
    const dark = isDark();
    root.classList.toggle('theme-dark', dark);
    for (const b of document.querySelectorAll('.theme-toggle')) {
      b.setAttribute('aria-pressed', String(dark));
      const label = dark ? L('Helles Design', 'Light theme') : L('Dunkles Design', 'Dark theme');
      b.setAttribute('aria-label', label);
      b.title = label;
    }
    themeListeners.forEach((f) => f());
  };
  for (const b of document.querySelectorAll('.theme-toggle')) {
    b.hidden = false;
    b.addEventListener('click', () => {
      root.dataset.theme = isDark() ? 'light' : 'dark';
      applyTheme();
    });
  }
  systemDark.addEventListener('change', () => {
    if (!root.dataset.theme) applyTheme();
  });

  /* --- Handy: Menü hinter einem Knopf (ohne Skript bleibt die wischbare Zeile) ---------- */
  const top = document.querySelector('header.top');
  const nav = top?.querySelector('nav');
  if (top && nav) {
    nav.id ||= 'hauptmenue';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'menu-toggle';
    toggle.hidden = true; // zeigt erst die Gestaltung (site.css) auf dem Handy
    toggle.setAttribute('aria-controls', nav.id);
    toggle.setAttribute('aria-expanded', 'false');
    const bars = document.createElement('span');
    bars.className = 'bars';
    bars.setAttribute('aria-hidden', 'true');
    bars.append(...[0, 1, 2].map(() => document.createElement('i')));
    const label = document.createElement('span');
    label.className = 'menu-label';
    label.textContent = L('Menü', 'Menu');
    toggle.append(bars, label);
    toggle.setAttribute('aria-label', L('Menü', 'Menu'));
    const after = top.querySelector('.wiki-badge') || top.querySelector('.brand');
    after.after(toggle);
    top.classList.add('js-menu');
    const set = (open) => {
      top.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', () => set(!top.classList.contains('menu-open')));
    nav.addEventListener('click', (e) => {
      if (e.target.closest('a')) set(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && top.classList.contains('menu-open')) {
        set(false);
        toggle.focus();
      }
    });
    document.addEventListener('click', (e) => {
      if (top.classList.contains('menu-open') && !top.contains(e.target)) set(false);
    });
  }

  /* --- Kontakt: Nachricht im eigenen E-Mail-Programm öffnen (nichts geht an den Server) ---- */
  const contact = document.querySelector('form.contact');
  const user = contact?.dataset.user ?? '';
  const domain = contact?.dataset.domain ?? '';
  // Nur eine eingetragene, schlichte Adresse (keine Platzhalter, keine Zusätze wie ?cc=).
  if (contact && /^[\w.+-]+$/.test(user) && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    contact.hidden = false;
    contact.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(contact);
      const from = String(data.get('absender') || '').trim();
      const body = `${String(data.get('nachricht') || '').trim()}${from ? `\n\n${from}` : ''}`;
      const subject = `leyoNET: ${data.get('thema')}`;
      const to = `${user}@${domain}`;
      location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    });
  }

  /* --- leyoNET DC: Film im Kopf anhalten/abspielen; bei «weniger Bewegung» steht er still ------- */
  for (const film of document.querySelectorAll('.dc-film')) {
    const video = film.querySelector('video');
    const button = film.querySelector('.dc-play');
    if (!video || !button) continue;
    const show = () => {
      const playing = !video.paused;
      button.textContent = playing ? '❚❚' : '▶';
      button.setAttribute('aria-label', playing ? button.dataset.labelPause : button.dataset.labelPlay);
      button.title = button.getAttribute('aria-label');
    };
    if (reduced) {
      video.removeAttribute('autoplay');
      video.pause();
    }
    button.addEventListener('click', () => (video.paused ? video.play().catch(() => {}) : video.pause()));
    video.addEventListener('play', show);
    video.addEventListener('pause', show);
    show();
  }

  /* --- Schulung: ein Video nach dem anderen, Kapitel zum Anspringen -------------------------------
     Ohne Skript stehen alle drei Videos untereinander. Nichts wird gespeichert. */
  const lernVideos = [...document.querySelectorAll('.lern-video')];
  if (lernVideos.length) {
    document.body.classList.add('lern-js');
    const links = document.querySelectorAll('a[data-video]');
    const cards = document.querySelectorAll('.lern-card');
    const select = (n, play) => {
      if (!lernVideos.some((a) => a.dataset.video === n)) return;
      for (const a of lernVideos) {
        const on = a.dataset.video === n;
        a.classList.toggle('on', on);
        const v = a.querySelector('video');
        if (!on) v.pause();
        else if (play) v.play().catch(() => {});
      }
      for (const c of cards) {
        if (c.dataset.video === n) c.setAttribute('aria-current', 'true');
        else c.removeAttribute('aria-current');
      }
    };
    for (const a of links) {
      a.addEventListener('click', (event) => {
        event.preventDefault();
        history.replaceState(null, '', a.getAttribute('href'));
        select(a.dataset.video, true);
        if (a.classList.contains('lern-next')) document.querySelector('.lern-cards').scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
      });
    }
    for (const a of lernVideos) {
      const v = a.querySelector('video');
      const buttons = [...a.querySelectorAll('.lern-chapters button')];
      for (const b of buttons) {
        b.addEventListener('click', () => {
          const go = () => {
            v.currentTime = Number(b.dataset.t);
            v.play().catch(() => {});
          };
          if (v.readyState > 0) go();
          else {
            v.addEventListener('loadedmetadata', go, { once: true });
            v.load();
          }
        });
      }
      // Laufendes Kapitel hervorheben; am Ende den Knopf zum nächsten Video.
      v.addEventListener('timeupdate', () => {
        let current = null;
        for (const b of buttons) if (v.currentTime >= Number(b.dataset.t)) current = b;
        for (const b of buttons) {
          if (b === current) b.setAttribute('aria-current', 'true');
          else b.removeAttribute('aria-current');
        }
      });
      v.addEventListener('ended', () => {
        a.classList.add('done');
        for (const c of cards) if (c.dataset.video === a.dataset.video) c.classList.add('seen');
      });
    }
    const fromHash = () => /^#video-(\d)$/.exec(location.hash)?.[1];
    select(fromHash() ?? '1', false);
    window.addEventListener('hashchange', () => fromHash() && select(fromHash(), false));
  }

  /* --- Hero: Ping über einen Router, wie in der Simulation ------------------------- */
  const X = { pc: 66, sw: 240, r: 410, srv: 551 };
  const FRAMES = [
    { proto: 'arp', from: 'PC 1', to: 'Switch 1', info: L('Wer hat 192.168.1.1? Sag es 192.168.1.10', 'Who has 192.168.1.1? Tell 192.168.1.10'), hops: [['pc', 'sw'], ['sw', 'r']] },
    { proto: 'arp', from: 'Router 1', to: 'Switch 1', info: L('192.168.1.1 ist bei 02:00:00:00:02:00', '192.168.1.1 is at 02:00:00:00:02:00'), hops: [['r', 'sw'], ['sw', 'pc']] },
    { proto: 'icmp', from: 'PC 1', to: 'Switch 1', info: L('Echo-Anfrage an 192.168.2.20', 'Echo request to 192.168.2.20'), hops: [['pc', 'sw'], ['sw', 'r']] },
    { proto: 'arp', from: 'Router 1', to: 'Server', info: L('Wer hat 192.168.2.20? Sag es 192.168.2.1', 'Who has 192.168.2.20? Tell 192.168.2.1'), hops: [['r', 'srv']] },
    { proto: 'arp', from: 'Server', to: 'Router 1', info: L('192.168.2.20 ist bei 02:00:00:00:04:00', '192.168.2.20 is at 02:00:00:00:04:00'), hops: [['srv', 'r']] },
    { proto: 'icmp', from: 'Router 1', to: 'Server', info: L('Echo-Anfrage an 192.168.2.20, TTL 63', 'Echo request to 192.168.2.20, TTL 63'), hops: [['r', 'srv']] },
    { proto: 'icmp', from: 'Server', to: 'Router 1', info: L('Echo-Antwort an 192.168.1.10', 'Echo reply to 192.168.1.10'), hops: [['srv', 'r']] },
    { proto: 'icmp', from: 'Router 1', to: 'Switch 1', info: L('Echo-Antwort an 192.168.1.10, TTL 63', 'Echo reply to 192.168.1.10, TTL 63'), hops: [['r', 'sw'], ['sw', 'pc']] },
  ];
  const REPLY = L('Antwort von 192.168.2.20: Bytes=32 Zeit=4ms TTL=63', 'Reply from 192.168.2.20: bytes=32 time=4ms TTL=63');

  const sim = document.querySelector('.sim');
  if (sim) {
    const rows = sim.querySelector('.rows');
    const dot = sim.querySelector('.packet');
    const consoleText = sim.querySelector('.console-text');

    const row = (frame, i, fresh) => {
      const li = document.createElement('li');
      if (fresh) li.className = 'new';
      const cells = [
        ['nr', String(i + 1)],
        ['', `${frame.from} → ${frame.to}`],
        ['', ''],
        ['', frame.info],
      ];
      cells.forEach(([cls, text], c) => {
        const span = document.createElement('span');
        if (cls) span.className = cls;
        if (c === 2) {
          const tag = document.createElement('span');
          tag.className = `proto proto-${frame.proto}`;
          tag.textContent = frame.proto.toUpperCase();
          span.append(tag);
        } else span.textContent = text;
        li.append(span);
      });
      rows.append(li);
    };

    const showAll = () => {
      rows.textContent = '';
      FRAMES.forEach((f, i) => row(f, i, false));
      consoleText.textContent = `ping 192.168.2.20  ${REPLY}`;
    };

    if (reduced) {
      showAll();
    } else {
      const HOP_MS = 520;
      const GAP_MS = 260;
      let running = false;
      let visible = true;

      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const move = (from, to, proto) =>
        new Promise((resolve) => {
          dot.setAttribute('class', `packet ${proto}`);
          dot.setAttribute('opacity', '1');
          const start = performance.now();
          const step = (now) => {
            const t = Math.min(1, (now - start) / HOP_MS);
            const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
            dot.setAttribute('cx', String(X[from] + (X[to] - X[from]) * e));
            if (t < 1) requestAnimationFrame(step);
            else resolve();
          };
          requestAnimationFrame(step);
        });

      const loop = async () => {
        if (running) return;
        running = true;
        while (visible) {
          rows.textContent = '';
          consoleText.textContent = '';
          const command = 'ping 192.168.2.20';
          for (let i = 1; i <= command.length; i++) {
            consoleText.textContent = command.slice(0, i);
            await wait(45);
          }
          await wait(400);
          for (let i = 0; i < FRAMES.length; i++) {
            const frame = FRAMES[i];
            row(frame, i, true);
            for (const [a, b] of frame.hops) await move(a, b, frame.proto);
            dot.setAttribute('opacity', '0');
            await wait(GAP_MS);
          }
          consoleText.textContent = REPLY;
          await wait(6000);
        }
        running = false;
      };

      // Nur laufen, solange der Ausschnitt sichtbar ist.
      const io = new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (visible) loop();
      });
      io.observe(sim);
    }
  }

  /* --- Ansichten umschalten --------------------------------------------------------- */
  const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
  const panel = document.getElementById('panel-views');
  if (tabs.length && panel) {
    const img = panel.querySelector('img');
    // Pfad der Bilder wie im HTML (img/ bzw. ../img/ auf der englischen Seite).
    const base = img.getAttribute('src').replace(/[^/]*$/, '');
    const caption = panel.querySelector('figcaption');
    let current = tabs[0];
    const select = (tab, focus) => {
      current = tab;
      for (const t of tabs) {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      }
      // Bildschirmfotos gibt es hell und dunkel (das Dashboard ist immer dunkel).
      const name = tab.dataset.img + (isDark() && tab.dataset.dark !== 'same' ? '-dark' : '');
      img.src = `${base}${name}-1x.webp`;
      img.srcset = `${base}${name}-1x.webp 1440w, ${base}${name}.webp 2880w`;
      img.alt = tab.dataset.caption;
      caption.textContent = tab.dataset.caption;
      panel.setAttribute('aria-labelledby', tab.id);
      if (focus) tab.focus();
    };
    themeListeners.push(() => select(current, false));
    tabs.forEach((tab, i) => {
      tab.tabIndex = i === 0 ? 0 : -1;
      tab.addEventListener('click', () => select(tab, false));
      tab.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        select(tabs[(i + d + tabs.length) % tabs.length], true);
      });
    });
  }

  /* --- Klassen-Verbund: Standorte gehen nacheinander online, Nachrichten fliegen ------ */
  const show = document.querySelector('.verbund-show');
  if (show) {
    const LEVELS = EN
      ? { offline: 'not connected', connected: 'connected', online: 'online', services: 'services reachable', done: 'done' }
      : { offline: 'nicht verbunden', connected: 'angeschlossen', online: 'online', services: 'Dienste erreichbar', done: 'fertig' };
    const sites = [...show.querySelectorAll('.vb-site')];
    const links = [...show.querySelectorAll('.vb-link')];
    const counter = show.querySelector('.vb-online');
    const msg = show.querySelector('.vb-msg');
    const ticker = show.querySelector('.vb-ticker');
    const nameOf = (seat) => sites[seat - 1].querySelector('.vb-name').textContent;
    const pos = (seat) => {
      const l = links[seat - 1];
      return { x: Number(l.getAttribute('x2')), y: Number(l.getAttribute('y2')) };
    };
    const HUB = { x: 400, y: 250 };
    const set = (seat, level) => {
      sites[seat - 1].setAttribute('class', `vb-site ${level}`);
      links[seat - 1].setAttribute('class', `vb-link ${level}`);
      sites[seat - 1].querySelector('.vb-state').textContent = LEVELS[level];
      counter.textContent = String(sites.filter((s) => /online|services|done/.test(s.getAttribute('class'))).length);
    };
    const note = (text) => {
      const li = document.createElement('li');
      li.textContent = text;
      ticker.prepend(li);
      while (ticker.children.length > 3) ticker.lastElementChild.remove();
    };
    // Ablauf: [Zeitpunkt in ms, Platz, Stufe] bzw. [Zeitpunkt, Absender, 'msg', Empfänger (0 = Zentrale)]
    const STEPS = [
      [600, 1, 'connected'], [1400, 2, 'connected'], [2000, 1, 'online'], [2600, 4, 'connected'], [3200, 2, 'online'],
      [3800, 1, 'msg', 0], [4400, 5, 'connected'], [5000, 4, 'online'], [5600, 1, 'services'], [6200, 6, 'connected'],
      [6800, 3, 'connected'], [7400, 5, 'online'], [8000, 2, 'msg', 4], [8600, 6, 'online'], [9200, 8, 'connected'],
      [9800, 4, 'services'], [10400, 3, 'online'], [11000, 8, 'online'], [11600, 1, 'done'], [12200, 7, 'connected'],
      [12800, 6, 'services'], [13400, 5, 'msg', -1], [14000, 7, 'online'], [14600, 4, 'done'], [15400, 8, 'services'],
    ];
    const fly = (from, to) =>
      new Promise((resolve) => {
        const a = pos(from);
        const b = to > 0 ? pos(to) : HUB;
        msg.setAttribute('opacity', '1');
        const start = performance.now();
        const step = (now) => {
          const t = Math.min(1, (now - start) / 1400);
          const [p, q, k] = to > 0 && t >= 0.5 ? [HUB, b, (t - 0.5) * 2] : [a, to > 0 ? HUB : b, to > 0 ? t * 2 : t];
          msg.setAttribute('cx', String(p.x + (q.x - p.x) * k));
          msg.setAttribute('cy', String(p.y + (q.y - p.y) * k));
          if (t < 1) requestAnimationFrame(step);
          else {
            msg.setAttribute('opacity', '0');
            resolve();
          }
        };
        requestAnimationFrame(step);
      });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const target = (to) => (to === 0 ? L('Zentrale', 'Head office') : to === -1 ? L('alle', 'everyone') : nameOf(to));

    if (reduced) {
      // Ohne Bewegung: Endzustand zeigen.
      for (const [, seat, level] of STEPS) if (level !== 'msg') set(seat, level);
    } else {
      let running = false;
      let visible = false;
      const loop = async () => {
        if (running) return;
        running = true;
        while (visible) {
          sites.forEach((_, i) => set(i + 1, 'offline'));
          ticker.textContent = '';
          let now = 0;
          for (const [at, seat, level, to] of STEPS) {
            await wait(at - now);
            now = at;
            if (level === 'msg') {
              note(`✉ ${nameOf(seat)} → ${target(to)}`);
              void fly(seat, to);
            } else {
              set(seat, level);
              note(`${level === 'connected' ? '＋' : '▲'} ${nameOf(seat)}: ${LEVELS[level]}`);
            }
          }
          await wait(6000);
        }
        running = false;
      };
      const io = new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (visible) loop();
      });
      io.observe(show);
    }
  }

  applyTheme();

  /* --- Zähler: einmal hochzählen, wenn sie ins Bild kommen -------------------------- */
  const counters = [...document.querySelectorAll('[data-count]')];
  if (counters.length && !reduced) {
    const run = (el) => {
      const target = Number(el.dataset.count);
      const suffix = el.dataset.suffix || '';
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / 1400);
        const value = Math.round(target * (1 - (1 - t) ** 3));
        el.textContent = `${value}${t === 1 ? suffix : ''}`;
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          run(e.target);
        }
      },
      { threshold: 0.6 },
    );
    counters.forEach((el) => {
      el.textContent = '0';
      io.observe(el);
    });
  }

  /* --- Anonyme Besucherzählung ---------------------------------------------------------
     Meldet an den eigenen Server (app.leyonet.ch) nur: welche Seite, beim ersten Aufruf eines
     Besuchs zusätzlich die Herkunftsseite (nur der Rechnername), Sprache, Zeitzone (ergibt das
     Land ungefähr) und ob Handy, Tablet oder Computer. Keine Cookies, nichts im Browser
     gespeichert, keine Kennung; der Server speichert nur Tageszähler und keine IP-Adressen.
     Bei «Do Not Track» oder «Global Privacy Control» wird nichts gemeldet. */
  const STATS_URL = 'https://app.leyonet.ch/api/hit';
  const optOut = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  const counting = !optOut && /^(www\.)?leyonet\.ch$/.test(location.hostname) && typeof navigator.sendBeacon === 'function';
  const report = (data) => {
    if (!counting) return;
    try {
      navigator.sendBeacon(STATS_URL, JSON.stringify(data));
    } catch {
      /* Zählung ist unwichtig */
    }
  };
  if (counting) {
    let host = '';
    try {
      host = document.referrer ? new URL(document.referrer).hostname : '';
    } catch {
      host = '';
    }
    const nav = performance.getEntriesByType?.('navigation')?.[0];
    const repeat = nav && (nav.type === 'reload' || nav.type === 'back_forward');
    // Neuer Besuch: von aussen oder direkt aufgerufen (nicht von einer anderen Seite von leyonet.ch).
    const fresh = !repeat && !/(^|\.)leyonet\.ch$/.test(host);
    const view = { e: 'view', p: location.pathname };
    if (fresh) {
      const width = Math.min(window.screen?.width || innerWidth, innerWidth || 9999);
      Object.assign(view, {
        n: 1,
        r: host,
        l: (navigator.language || '').slice(0, 2).toLowerCase(),
        z: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        w: width < 700 ? 'm' : width < 1100 ? 't' : 'd',
      });
    }
    // Erst wenn die Seite sichtbar ist (nicht beim Vorladen im Hintergrund).
    if (document.visibilityState === 'visible') report(view);
    else document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && report(view), { once: true });
  }
  /** Klicks auf Downloads und die Apps zählen (nur das Ziel, z.B. «windows-setup»). */
  const targetOf = (href) => {
    const m = /\/releases\/latest\/download\/([^/?#]+)$/.exec(href);
    if (m) {
      const file = m[1].toLowerCase();
      if (file.endsWith('-setup.exe')) return 'windows-setup';
      if (file.endsWith('.msi')) return 'windows-msi';
      if (file.endsWith('.dmg')) return 'macos';
      if (file.endsWith('.appimage')) return 'linux-appimage';
      if (file.endsWith('.deb')) return 'linux-deb';
      if (file.endsWith('.rpm')) return 'linux-rpm';
      if (file === 'leyonet.html') return 'html';
      if (file.startsWith('leyonet-arbeitsbl')) return 'arbeitsblaetter';
      if (file.startsWith('sha256')) return 'sha256';
      return null;
    }
    if (/^https:\/\/app\.leyonet\.ch\/\?schaufenster/.test(href)) return 'schaufenster';
    if (/^https:\/\/app\.leyonet\.ch\//.test(href)) return 'app';
    if (/^https:\/\/dc\.leyonet\.ch\//.test(href)) return 'dc';
    if (/^https:\/\/github\.com\/vonam-git\/leyonet\/releases\/?$/i.test(href)) return 'releases';
    if (/^https:\/\/github\.com\/vonam-git\/leyonet\/?$/i.test(href)) return 'github';
    return null;
  };
  if (counting) {
    document.addEventListener('click', (event) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      const target = link ? targetOf(link.href) : null;
      if (target) report({ e: 'click', c: target });
    });
  }
})();
