/* leyonet.ch – kleine Skripte ohne Bibliotheken und ohne Anfragen nach aussen. */
(() => {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    const select = (tab, focus) => {
      for (const t of tabs) {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      }
      const name = tab.dataset.img;
      img.src = `img/${name}-1x.webp`;
      img.srcset = `img/${name}-1x.webp 1440w, img/${name}.webp 2880w`;
      img.alt = tab.dataset.caption;
      caption.textContent = tab.dataset.caption;
      panel.setAttribute('aria-labelledby', tab.id);
      if (focus) tab.focus();
    };
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
