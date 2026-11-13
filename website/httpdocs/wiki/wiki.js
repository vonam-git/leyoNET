/* leyoNET Wiki: Suche in der Seitenleiste. Daten aus suche.js, ohne Abruf, ohne Speicherung. */
(() => {
  'use strict';
  const data = window.LEYONET_WIKI || [];
  const form = document.querySelector('.wiki-search');
  if (!form) return;
  const input = form.querySelector('input');
  const list = form.querySelector('.wiki-hits');
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const index = data.map((d) => ({ ...d, n: norm(`${d.t} ${d.k} ${d.x}`), nt: norm(d.t) }));

  const show = (q) => {
    list.textContent = '';
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) {
      list.hidden = true;
      return;
    }
    const hits = index
      .filter((d) => words.every((w) => d.n.includes(w)))
      .map((d) => ({ d, score: words.reduce((s, w) => s + (d.nt.includes(w) ? 10 : 0) + (d.nt.startsWith(w) ? 5 : 0), 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    if (!hits.length) {
      const li = document.createElement('li');
      li.textContent = 'Nichts gefunden.';
      li.className = 'muted';
      list.append(li);
    }
    for (const { d } of hits) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = d.u;
      a.textContent = d.t;
      const small = document.createElement('small');
      small.textContent = `${d.a} · ${d.k}`;
      a.append(small);
      li.append(a);
      list.append(li);
    }
    list.hidden = false;
  };

  input.addEventListener('input', () => show(input.value));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const first = list.querySelector('a');
    if (first) location.href = first.href;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      show('');
    } else if (e.key === 'ArrowDown') {
      const first = list.querySelector('a');
      if (first) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  list.addEventListener('keydown', (e) => {
    const links = [...list.querySelectorAll('a')];
    const i = links.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && i < links.length - 1) {
      e.preventDefault();
      links[i + 1].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (i > 0 ? links[i - 1] : input).focus();
    }
  });
  // Suche aus der Adresse (index.html?q=…).
  const q = new URLSearchParams(location.search).get('q');
  if (q) {
    input.value = q;
    show(q);
  }
  // Mit «/» ins Suchfeld.
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement === document.body) {
      e.preventDefault();
      input.focus();
    }
  });
})();

/* Rahmen und Pakete: Bytes markieren und Schritt für Schritt einpacken (wie in der App). */
(() => {
  'use strict';
  // Zeigen oder Fokus auf ein Feld: seine Bytes in der Hex-Ansicht derselben Abbildung markieren.
  for (const figure of document.querySelectorAll('.lx-packet')) {
    let active = null;
    const mark = (e) => {
      const field = e.target.closest('[data-start]');
      if (!field || !figure.contains(field)) return;
      if (active) active.classList.remove('on');
      active = field;
      field.classList.add('on');
      const start = Number(field.dataset.start);
      const end = start + Number(field.dataset.len);
      for (const b of figure.querySelectorAll('[data-i]')) {
        const i = Number(b.dataset.i);
        b.classList.toggle('hl', i >= start && i < end);
      }
    };
    figure.addEventListener('mouseover', mark);
    figure.addEventListener('focusin', mark);
  }

  // Kapselung: Hülle um Hülle einpacken, von den Daten bis zu den Bits auf der Leitung.
  for (const figure of document.querySelectorAll('.lx-steps')) {
    const grid = figure.querySelector('.lx-encap');
    if (!grid) continue;
    const rowOf = (cell) => Number((/\blx-r(\d+)\b/.exec(cell.className) || [])[1] || 0);
    const cells = [...grid.children];
    const rows = Math.max(...cells.map(rowOf));
    let shown = rows;
    const bar = document.createElement('div');
    bar.className = 'lx-steps-bar';
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'btn btn-small btn-ink';
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'btn btn-small';
    all.textContent = 'Alles zeigen';
    const status = document.createElement('span');
    status.className = 'lx-muted';
    status.setAttribute('aria-live', 'polite');
    const update = () => {
      for (const c of cells) c.classList.toggle('later', rowOf(c) > shown);
      next.textContent = shown >= rows ? 'Von vorn einpacken' : 'Nächste Hülle einpacken';
      const label = cells.find((c) => rowOf(c) === shown && c.classList.contains('lx-encap-label'));
      status.textContent = shown >= rows ? '' : `Schicht ${label ? label.textContent.replace(/^(\d)/, '$1 · ') : ''}`;
      all.hidden = shown >= rows;
    };
    next.addEventListener('click', () => {
      shown = shown >= rows ? 1 : shown + 1;
      update();
    });
    all.addEventListener('click', () => {
      shown = rows;
      update();
    });
    bar.append(next, all, status);
    figure.insertBefore(bar, figure.firstChild);
    update();
  }
})();
