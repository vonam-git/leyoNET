/* leyonet.ch – kleine Skripte ohne Bibliotheken und ohne Anfragen nach aussen. */
(() => {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
      b.setAttribute('aria-label', dark ? 'Helles Design' : 'Dunkles Design');
      b.title = dark ? 'Helles Design' : 'Dunkles Design';
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

  /* --- Hero: Ping über einen Router, wie in der Simulation ------------------------- */
  const X = { pc: 66, sw: 240, r: 410, srv: 551 };
  const FRAMES = [
    { proto: 'arp', from: 'PC 1', to: 'Switch 1', info: 'Wer hat 192.168.1.1? Sag es 192.168.1.10', hops: [['pc', 'sw'], ['sw', 'r']] },
    { proto: 'arp', from: 'Router 1', to: 'Switch 1', info: '192.168.1.1 ist bei 02:00:00:00:02:00', hops: [['r', 'sw'], ['sw', 'pc']] },
    { proto: 'icmp', from: 'PC 1', to: 'Switch 1', info: 'Echo-Anfrage an 192.168.2.20', hops: [['pc', 'sw'], ['sw', 'r']] },
    { proto: 'arp', from: 'Router 1', to: 'Server', info: 'Wer hat 192.168.2.20? Sag es 192.168.2.1', hops: [['r', 'srv']] },
    { proto: 'arp', from: 'Server', to: 'Router 1', info: '192.168.2.20 ist bei 02:00:00:00:04:00', hops: [['srv', 'r']] },
    { proto: 'icmp', from: 'Router 1', to: 'Server', info: 'Echo-Anfrage an 192.168.2.20, TTL 63', hops: [['r', 'srv']] },
    { proto: 'icmp', from: 'Server', to: 'Router 1', info: 'Echo-Antwort an 192.168.1.10', hops: [['srv', 'r']] },
    { proto: 'icmp', from: 'Router 1', to: 'Switch 1', info: 'Echo-Antwort an 192.168.1.10, TTL 63', hops: [['r', 'sw'], ['sw', 'pc']] },
  ];
  const REPLY = 'Antwort von 192.168.2.20: Bytes=32 Zeit=4ms TTL=63';

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
      img.src = `img/${name}-1x.webp`;
      img.srcset = `img/${name}-1x.webp 1440w, img/${name}.webp 2880w`;
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
    const LEVELS = { offline: 'nicht verbunden', connected: 'angeschlossen', online: 'online', services: 'Dienste erreichbar', done: 'fertig' };
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
    const target = (to) => (to === 0 ? 'Zentrale' : to === -1 ? 'alle' : nameOf(to));

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
})();
