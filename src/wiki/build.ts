/**
 * Wiki für leyonet.ch/wiki/: Crashkurs für Lehrpersonen und Theorie zu jedem Gerät und Protokoll.
 *
 * Quellen: Markdown unter docs/wiki/<bereich>/<seite>.md mit Kopfzeilen (siehe docs/wiki/README.md).
 * Dazu kommen automatisch aus dem Projekt: die F1-Hilfe (gleicher Text wie in der App), Demo-Netze
 * mit Link ins Schaufenster, passende Übungen aus dem Katalog, Normen aus docs/normen.json und
 * die Vereinfachungen aus docs/protokolle.md. So bleibt das Wiki beim Stand der App; fehlt etwas
 * oder stimmt ein Verweis nicht, schlägt der Test (und damit npm run release) fehl.
 *
 * Erzeugt statische Seiten in website/httpdocs/wiki/ (siehe wiki.test.ts, «npm run wiki»).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import de from '../i18n/de.json';
import { CATALOG } from '../ui/catalog';
import { generalSheet } from '../ui/catalogKit';
import { DEMOS } from '../ui/demos';
import { HELP_GROUPS, HELP_TOPICS, parseHelp, type HelpPart } from '../ui/help';
import { FORMATS, readFormat, type FormatId } from '../core';
import { setLocale, t } from '../i18n';
import { encapsulationView, fieldTableView, formatView, hexView, layerValues, osiLayersView, osiOverviewView, toHtml } from '../ui/aufbau';
import { frameExample, type ExampleId } from '../ui/frameExamples';
import { escapeHtml, render, type Heading, type LinkResolver } from './markdown';

export const AREAS = [
  { id: 'lehrpersonen', title: 'Crashkurs für Lehrpersonen', lead: 'In kurzen Schritten vom ersten Netz bis zur Prüfung und zum Klassen-Verbund.' },
  { id: 'grundlagen', title: 'Grundlagen', lead: 'Schichtenmodell, Adressen, Routing und Netzwerkdesign: das Fundament für alles Weitere.' },
  { id: 'geraete', title: 'Geräte', lead: 'Jedes Gerät aus dem Shop: wozu es dient, was es kann und wie man es in leyoNET einrichtet.' },
  { id: 'protokolle', title: 'Protokolle', lead: 'Jedes Protokoll mit Ablauf, Aufbau der Pakete, Beispiel zum Ansehen und Norm.' },
] as const;
export type AreaId = (typeof AREAS)[number]['id'];

export interface WikiPage {
  slug: string;
  area: AreaId;
  title: string;
  kurz: string;
  order: number;
  schicht?: string;
  hilfe: string[];
  demos: string[];
  uebungen: string[];
  normen: string[];
  protokolle: string[];
  verwandt: string[];
  body: string;
  file: string;
}

const APP = 'https://app.leyonet.ch/';
const REPO = 'https://github.com/vonam-git/leyoNET';
const texts = de as Record<string, string>;

/** Kopfzeilen zwischen --- und ---: «schlüssel: wert» oder «schlüssel: [a, b]». */
export function parseFrontmatter(text: string, file: string): { data: Record<string, string | string[]>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text.replace(/\r\n/g, '\n'));
  if (!m) throw new Error(`${file}: Kopfzeilen (---) fehlen`);
  const data: Record<string, string | string[]> = {};
  for (const line of m[1]!.split('\n')) {
    if (!line.trim()) continue;
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (!kv) throw new Error(`${file}: Kopfzeile unlesbar: ${line}`);
    const value = kv[2]!.trim();
    // Listen mit Komma; «protokolle» mit Semikolon (die Zeilennamen enthalten selbst Kommas).
    data[kv[1]!] = value.startsWith('[')
      ? value
          .replace(/^\[|\]$/g, '')
          .split(kv[1] === 'protokolle' ? ';' : ',')
          .map((s) => s.trim())
          .filter(Boolean)
      : value;
  }
  return { data, body: text.replace(/\r\n/g, '\n').slice(m[0].length) };
}

export function loadPages(root: string): WikiPage[] {
  const pages: WikiPage[] = [];
  for (const area of AREAS) {
    const dir = join(root, 'docs/wiki', area.id);
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
      const file = `docs/wiki/${area.id}/${name}`;
      const { data, body } = parseFrontmatter(readFileSync(join(dir, name), 'utf8'), file);
      const list = (k: string) => (Array.isArray(data[k]) ? (data[k] as string[]) : data[k] ? [data[k] as string] : []);
      const str = (k: string) => {
        const v = data[k];
        if (typeof v !== 'string' || !v) throw new Error(`${file}: «${k}» fehlt`);
        return v;
      };
      pages.push({
        slug: name.replace(/\.md$/, ''),
        area: area.id,
        title: str('titel'),
        kurz: str('kurz'),
        order: Number(data.reihenfolge ?? 50),
        ...(typeof data.schicht === 'string' ? { schicht: data.schicht } : {}),
        hilfe: list('hilfe'),
        demos: list('demos'),
        uebungen: list('uebungen'),
        normen: list('normen'),
        protokolle: list('protokolle'),
        verwandt: list('verwandt'),
        body,
        file,
      });
    }
  }
  return pages.sort((a, b) => AREAS.findIndex((x) => x.id === a.area) - AREAS.findIndex((x) => x.id === b.area) || a.order - b.order || a.title.localeCompare(b.title, 'de'));
}

interface Norm {
  id: string;
  title: string;
  href?: string;
  current?: string;
}

function loadNorms(root: string): Map<string, Norm> {
  const registry = JSON.parse(readFileSync(join(root, 'docs/normen.json'), 'utf8')) as {
    rfc: Record<string, { titel: string }>;
    weitere: { id: string; aktuell?: string; verwendung: string; auch?: string[] }[];
  };
  const norms = new Map<string, Norm>();
  for (const [n, r] of Object.entries(registry.rfc)) norms.set(`RFC ${n}`, { id: `RFC ${n}`, title: r.titel, href: `https://www.rfc-editor.org/rfc/rfc${n}` });
  for (const w of registry.weitere) {
    const norm: Norm = { id: w.id, title: w.verwendung, ...(w.aktuell ? { current: w.aktuell } : {}) };
    norms.set(w.id, norm);
    for (const alias of w.auch ?? []) norms.set(alias, { ...norm, id: alias });
  }
  return norms;
}

/** Zeilen der Übersicht in docs/protokolle.md: Protokoll → Schicht, Standard, Vereinfachung. */
function loadProtocolTable(root: string): Map<string, { layer: string; standard: string; simplification: string }> {
  const rows = new Map<string, { layer: string; standard: string; simplification: string }>();
  for (const line of readFileSync(join(root, 'docs/protokolle.md'), 'utf8').split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length !== 6 || cells[1] === 'Schicht' || cells[1]!.startsWith('-')) continue;
    rows.set(cells[2]!, { layer: cells[1]!, standard: cells[3]!, simplification: cells[4]! });
  }
  return rows;
}

const STARS = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

export interface WikiBuild {
  files: Map<string, string>;
  errors: string[];
  pages: WikiPage[];
}

export function buildWiki(root: string, version: string): WikiBuild {
  const errors: string[] = [];
  const pages = loadPages(root);
  const norms = loadNorms(root);
  const protocolRows = loadProtocolTable(root);
  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  const byHelp = new Map<string, WikiPage>();
  for (const p of pages) for (const h of p.hilfe) if (!byHelp.has(h)) byHelp.set(h, p);
  const files = new Map<string, string>();
  const index = readFileSync(join(root, 'website/httpdocs/index.html'), 'utf8');
  const logo = /<svg viewBox="30 50 470 100"[\s\S]*?<\/svg>/.exec(index)?.[0] ?? 'leyoNET';
  const v = `?v=${version}`;
  setLocale('de');

  // Farben und Aufbau: dieselben Stylesheets wie die App (src/ui), damit alles gleich aussieht.
  for (const css of ['farben', 'aufbau']) files.set(`${css}.css`, `/* Kopie von src/ui/${css}.css (erzeugt mit npm run wiki) – nicht von Hand ändern. */\n${readFileSync(join(root, `src/ui/${css}.css`), 'utf8')}`);

  // --- Prüfungen der Kopfzeilen ------------------------------------------------------
  const seen = new Set<string>();
  for (const p of pages) {
    if (seen.has(p.slug)) errors.push(`${p.file}: Seite doppelt`);
    seen.add(p.slug);
    for (const h of p.hilfe) if (!HELP_TOPICS.includes(h)) errors.push(`${p.file}: unbekanntes Hilfethema «${h}»`);
    for (const d of p.demos) if (!DEMOS.some((x) => x.id === d)) errors.push(`${p.file}: unbekannte Demo «${d}»`);
    for (const u of p.uebungen) if (!CATALOG.some((x) => x.id === u)) errors.push(`${p.file}: unbekannte Übung «${u}»`);
    for (const n of p.normen) if (!norms.has(n)) errors.push(`${p.file}: Norm «${n}» fehlt in docs/normen.json`);
    for (const r of p.protokolle) if (!protocolRows.has(r)) errors.push(`${p.file}: Zeile «${r}» fehlt in docs/protokolle.md`);
    for (const s of p.verwandt) if (!bySlug.has(s)) errors.push(`${p.file}: verwandte Seite «${s}» gibt es nicht`);
  }
  // Abdeckung: jedes Gerät, jede Demo und jedes Hilfethema hat eine Wiki-Seite.
  for (const topic of HELP_GROUPS.find((g) => g.id === 'devices')!.topics) if (!byHelp.has(topic)) errors.push(`Gerät ohne Wiki-Seite: ${topic}`);
  for (const d of DEMOS) if (!pages.some((p) => p.demos.includes(d.id))) errors.push(`Demo ohne Wiki-Seite: ${d.id}`);
  for (const topic of HELP_TOPICS) if (!byHelp.has(topic)) errors.push(`Hilfethema ohne Wiki-Seite: ${topic}`);

  // --- Bilder (wiki/bilder, erzeugt mit scripts/wiki/bilder.py) -------------------------
  const sizesFile = join(root, 'website/httpdocs/wiki/bilder/masse.json');
  const sizes = (existsSync(sizesFile) ? JSON.parse(readFileSync(sizesFile, 'utf8')) : {}) as Record<string, [number, number]>;
  const has = (name: string) => !!sizes[name] && existsSync(join(root, `website/httpdocs/wiki/bilder/${name}.webp`));
  /** Bild hell und dunkel (je nach Design), animiert mit Standbild bei «weniger Bewegung». */
  const figure = (name: string, alt: string, caption?: string): string | null => {
    if (!has(name)) return null;
    const anim = has(`${name}-anim`);
    const one = (dark: boolean) => {
      const still = dark && has(`${name}-dark`) ? `${name}-dark` : name;
      const moving = anim ? (dark && has(`${name}-anim-dark`) ? `${name}-anim-dark` : `${name}-anim`) : null;
      const [w, h] = sizes[moving ?? still]!;
      const img = `<img src="bilder/${moving ?? still}.webp" width="${w}" height="${h}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`;
      return `<picture class="${dark ? 'img-dark' : 'img-light'}">${moving ? `<source media="(prefers-reduced-motion: reduce)" srcset="bilder/${still}.webp">` : ''}${img}</picture>`;
    };
    return `<figure class="shot-figure${anim ? ' animated' : ''}">${one(false)}${has(`${name}-dark`) ? one(true) : ''}${caption || anim ? `<figcaption>${anim ? '<span class="badge">Zeitlupe</span> ' : ''}${escapeHtml(caption ?? alt)}</figcaption>` : ''}</figure>`;
  };

  const links = (file: string): LinkResolver => ({
    image: (name, alt) => figure(name, alt, alt),
    wiki: (slug) => {
      const p = bySlug.get(slug);
      return p ? { title: p.title, href: `${p.slug}.html` } : null;
    },
    error: (message) => errors.push(`${file}: ${message}`),
  });

  // --- Hilfe-Text der App als HTML ----------------------------------------------------
  const helpParts = (parts: HelpPart[]) =>
    parts
      .map((part) => {
        if (part.kind === 'text') return escapeHtml(part.text);
        if (part.kind === 'bold') return `<strong>${escapeHtml(part.text)}</strong>`;
        if (part.kind === 'code') return `<code>${escapeHtml(part.text)}</code>`;
        const target = byHelp.get(part.topic);
        const title = texts[`help.${part.topic}.title`] ?? part.topic;
        return target ? `<a href="${target.slug}.html">${escapeHtml(title)}</a>` : escapeHtml(title);
      })
      .join('');
  const helpHtml = (topic: string) =>
    parseHelp(texts[`help.${topic}.body`] ?? '')
      .map((b) => (b.kind === 'p' ? `<p>${helpParts(b.parts)}</p>` : `<ul>${b.items.map((i) => `<li>${helpParts(i)}</li>`).join('')}</ul>`))
      .join('\n');

  // --- Rahmen jeder Seite -----------------------------------------------------------
  const nav = (current?: WikiPage) =>
    `<nav class="wiki-nav" aria-label="Wiki-Inhalt">
      <form class="wiki-search" role="search" action="index.html">
        <label class="visually-hidden" for="wiki-q">Im Wiki suchen</label>
        <input id="wiki-q" name="q" type="search" placeholder="Suchen, z.B. «OSPF» oder «Trunk»" autocomplete="off">
        <ol class="wiki-hits" hidden></ol>
      </form>
      ${AREAS.map(
        (a) => `<details class="wiki-group"${!current || current.area === a.id ? ' open' : ''}>
        <summary>${escapeHtml(a.title)}</summary>
        <ul>${pages
          .filter((p) => p.area === a.id)
          .map((p) => `<li><a href="${p.slug}.html"${p === current ? ' aria-current="page"' : ''}>${escapeHtml(p.title)}</a></li>`)
          .join('')}</ul>
      </details>`,
      ).join('\n      ')}
    </nav>`;

  const frame = (o: { title: string; description: string; path: string; body: string }) => `<!doctype html>
<html lang="de-CH">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(o.title)}</title>
  <meta name="description" content="${escapeHtml(o.description)}">
  <link rel="canonical" href="https://leyonet.ch/wiki/${o.path}">
  <link rel="icon" href="../favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="../css/site.css${v}">
  <link rel="stylesheet" href="farben.css${v}">
  <link rel="stylesheet" href="aufbau.css${v}">
  <link rel="stylesheet" href="wiki.css${v}">
  <script src="../js/site.js${v}" defer></script>
  <script src="suche.js${v}" defer></script>
  <script src="wiki.js${v}" defer></script>
</head>
<body class="wiki">
  <a class="skip" href="#inhalt">Zum Inhalt</a>
  <header class="top">
    <div class="wrap top-row">
      <a class="brand" href="../index.html" aria-label="leyoNET Startseite">
        ${logo}
      </a>
      <a class="wiki-badge" href="index.html">Wiki</a>
      <nav aria-label="Hauptnavigation">
        <ul>
          ${AREAS.map((a) => `<li><a href="index.html#${a.id}">${escapeHtml(a.id === 'lehrpersonen' ? 'Crashkurs' : a.title)}</a></li>`).join('\n          ')}
        </ul>
      </nav>
      <button class="theme-toggle" type="button" aria-label="Dunkles Design" aria-pressed="false" hidden>
        <svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>
        <svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>
      </button>
      <a class="btn btn-ink btn-small" href="${APP}">Im Browser starten</a>
    </div>
  </header>
${o.body}
  <footer class="foot">
    <div class="wrap foot-row">
      <p>leyoNET Wiki · Stand Version ${escapeHtml(version)} · Texte unter derselben Lizenz wie leyoNET (AGPL-3.0).</p>
      <ul>
        <li><a href="${REPO}">GitHub</a></li>
        <li><a href="https://www.patreon.com/cw/vonam">Patreon</a></li>
        <li><a href="../impressum.html#kontakt">Kontakt</a></li>
        <li><a href="../impressum.html">Impressum</a></li>
        <li><a href="../datenschutz.html">Datenschutz</a></li>
      </ul>
    </div>
  </footer>
</body>
</html>
`;

  // --- Ganze Listen für Platzhalter (immer aktuell aus der App) ---------------------
  const SERIES: Record<string, string> = { '': 'Allgemein', m117: 'Modul 117', m129: 'Modul 129', m145: 'Modul 145' };
  const pageFor = (entry: (typeof CATALOG)[number]) => pages.find((pg) => pg.uebungen.includes(entry.id));
  const catalogTable = () =>
    Object.entries(SERIES)
      .map(([series, title]) => {
        const entries = CATALOG.filter((e) => (e.series ?? '') === series);
        if (!entries.length) return '';
        return `<h3>${escapeHtml(title)}</h3><div class="table-wrap"><table><thead><tr><th>Sterne</th><th>Übung</th><th>Theorie</th></tr></thead><tbody>${entries
          .map((e) => {
            const page = pageFor(e);
            return `<tr><td><span class="stars" aria-label="${e.stars} von 5 Sternen">${STARS(e.stars)}</span></td><td>${escapeHtml(e.build().tasks.title)}${e.verbund ? ' <span class="muted">(Klassen-Verbund)</span>' : ''}</td><td>${page ? `<a href="${page.slug}.html">${escapeHtml(page.title)}</a>` : ''}</td></tr>`;
          })
          .join('')}</tbody></table></div>`;
      })
      .join('\n');
  const demoTable = () =>
    `<div class="table-wrap"><table><thead><tr><th>Demo</th><th>Theorie</th><th></th></tr></thead><tbody>${DEMOS.map((d) => {
      const page = pages.find((pg) => pg.demos.includes(d.id));
      return `<tr><td>${escapeHtml(texts[`demo.${d.id}.title`] ?? d.id)}</td><td>${page ? `<a href="${page.slug}.html">${escapeHtml(page.title)}</a>` : ''}</td><td><a href="${APP}?schaufenster=${d.id}">Live ansehen</a></td></tr>`;
    }).join('')}</tbody></table></div>`;

  // --- Rahmen und Pakete aus den Demos (wie in den Paketdetails der App) ---------------
  const EXAMPLE_FOR: Record<FormatId, ExampleId> = { ethernet2: 'http', ethernet2q: 'vlan', dot1q: 'vlan', ieee8023: 'stp', wlan: 'wlan', ppp: 'ppp', arp: 'arp', ipv4: 'http', ipv6: 'ipv6', icmp: 'vlan', tcp: 'http', udp: 'ipv6' };
  const exampleCaption = (id: ExampleId) => {
    const ex = frameExample(id);
    const title = texts[`demo.${ex.demo}.title`] ?? ex.demo;
    return `Echter Rahmen aus der Demo <a href="${APP}?schaufenster=${ex.demo}">«${escapeHtml(title)}»</a> (Nr. ${ex.entry.id}, ${ex.wire.bytes.length} Byte), so zeigt ihn auch die Paketliste in leyoNET.`;
  };
  const encapFigure = (id: ExampleId) =>
    `<figure class="lx-figure lx-steps">${toHtml(encapsulationView(frameExample(id).wire, t))}<figcaption>${exampleCaption(id)}</figcaption></figure>`;
  const packetFigure = (id: ExampleId) => {
    const { wire } = frameExample(id);
    return `<figure class="lx-figure lx-packet">${toHtml(osiLayersView(wire, t, { showEmpty: true }))}<p class="lx-muted lx-packet-hint">Zeige auf ein Feld: Die Bytes leuchten unten in der Hex-Ansicht auf.</p>${toHtml(hexView(wire.bytes, 'Bytes (hex)'))}<figcaption>${exampleCaption(id)}</figcaption></figure>`;
  };
  const formatFigure = (id: FormatId) => {
    const format = FORMATS[id];
    const ex = frameExample(EXAMPLE_FOR[id]);
    let values = null;
    if (id === 'dot1q') {
      const eth = ex.wire.layers.find((l) => l.protocol === 'Ethernet II + 802.1Q')!;
      values = readFormat(format, ex.wire.bytes, { start: eth.start + 12, length: 4 });
    } else {
      const layer = ex.wire.layers.find((l) => layerValues(ex.wire, l)?.format.id === id);
      if (!layer) throw new Error(`kein ${id} im Beispiel ${ex.id}`);
      values = layerValues(ex.wire, layer)!.values;
    }
    return `<figure class="lx-figure">${toHtml(formatView(format, t, values, { allOptional: true }))}${toHtml(fieldTableView(format, t, values))}<figcaption>Werte: ${exampleCaption(ex.id)}</figcaption></figure>`;
  };

  // --- Seiten -----------------------------------------------------------------------
  pages.forEach((p, i) => {
    const area = AREAS.find((a) => a.id === p.area)!;
    const rendered = render(p.body, links(p.file));
    const headings = rendered.headings;
    const html = rendered.html.replace(/<p>\{\{(\w+)(?: ([\w-]+))?\}\}<\/p>/g, (_, name: string, arg?: string) => {
      if (name === 'katalog') return catalogTable();
      if (name === 'demos') return demoTable();
      try {
        if (name === 'osi') return toHtml(osiOverviewView(t));
        if (name === 'aufbau' && arg) return encapFigure(arg as ExampleId);
        if (name === 'paket' && arg) return packetFigure(arg as ExampleId);
        if (name === 'format' && arg && arg in FORMATS) return formatFigure(arg as FormatId);
      } catch (e) {
        errors.push(`${p.file}: {{${name} ${arg}}}: ${(e as Error).message}`);
        return '';
      }
      errors.push(`${p.file}: unbekannter Platzhalter {{${name}}}`);
      return '';
    });
    const sections: { id: string; title: string; html: string }[] = [];
    if (p.hilfe.length) {
      sections.push({
        id: 'in-leyonet',
        title: 'So geht es in leyoNET',
        html: `<p class="muted">Derselbe Text wie in der Hilfe der App (Taste F1).</p>\n${p.hilfe
          .map((h) => `<div class="help-block"><h3>${escapeHtml(texts[`help.${h}.title`] ?? h)}</h3>\n${helpHtml(h)}</div>`)
          .join('\n')}`,
      });
    }
    if (p.demos.length) {
      sections.push({
        id: 'beispiel',
        title: 'Beispiel ansehen',
        html: `<ul class="cards">${p.demos
          .map((id) => {
            const demo = DEMOS.find((d) => d.id === id)!;
            const title = texts[`demo.${id}.title`] ?? id;
            const shot = p.body.includes(`](${id})`) ? '' : figure(id, `Demo «${title}» in leyoNET`, has(`${id}-anim`) ? `So sieht es in der Simulation aus: Jeder Punkt ist ein Rahmen auf dem Kabel.` : undefined) ?? '';
            return `<li class="card">${shot}<strong>${escapeHtml(title)}</strong><p>${escapeHtml(texts[`demo.${id}.text`] ?? '')}</p><p class="muted">${escapeHtml(texts[`demo.${id}.show`] ?? '')}</p><p class="card-actions"><a class="btn btn-small btn-ink" href="${APP}?schaufenster=${id}">Live ansehen</a> <a class="link" href="${REPO}/blob/main/docs/beispiele/${demo.file}">Projektdatei</a></p></li>`;
          })
          .join('')}</ul><p class="muted">«Live ansehen» öffnet das Netz in leyoNET, die Simulation läuft in einer Schleife. In der App findest du es unter Datei → Demo-Netze, ${p.demos.some((id) => DEMOS.find((d) => d.id === id)?.tour?.length) ? 'mit Führung Schritt für Schritt.' : 'zum Vorführen.'}</p>`,
      });
    }
    if (p.uebungen.length) {
      sections.push({
        id: 'ueben',
        title: 'Üben',
        html: `<ul class="exercises">${p.uebungen
          .map((id) => {
            const entry = CATALOG.find((e) => e.id === id)!;
            const { tasks } = entry.build();
            const sheet = entry.sheet ?? generalSheet(entry.id);
            return `<li><span class="stars" aria-label="${entry.stars} von 5 Sternen">${STARS(entry.stars)}</span> <strong>${escapeHtml(tasks.title)}</strong> <span class="muted">· ${tasks.goals.length} Ziele${entry.verbund ? ' · Klassen-Verbund' : ''}</span> · <a class="link" href="${REPO}/blob/main/docs/arbeitsblaetter/${encodeURIComponent(sheet)}.pdf">Arbeitsblatt</a></li>`;
          })
          .join('')}</ul><p class="muted">In leyoNET unter Werkzeuge → Aufgaben-Katalog. Jede Übung prüft sich selbst.</p>`,
      });
    }
    if (p.protokolle.length) {
      sections.push({
        id: 'vereinfachungen',
        title: 'Was leyoNET vereinfacht',
        html: `<div class="table-wrap"><table><thead><tr><th>Protokoll</th><th>Schicht</th><th>Vereinfachung in der Simulation</th></tr></thead><tbody>${p.protokolle
          .filter((r) => protocolRows.has(r))
          .map((r) => {
            const row = protocolRows.get(r)!;
            return `<tr><td>${escapeHtml(r)}</td><td>${escapeHtml(row.layer)}</td><td>${escapeHtml(row.simplification === '–' ? 'keine' : row.simplification).replace(/`([^`]+)`/g, '<code>$1</code>')}</td></tr>`;
          })
          .join('')}</tbody></table></div>`,
      });
    }
    if (p.normen.length) {
      sections.push({
        id: 'normen',
        title: 'Normen',
        html: `<ul class="norms">${p.normen
          .map((n) => {
            const norm = norms.get(n)!;
            const label = norm.href ? `<a href="${norm.href}">${escapeHtml(n)}</a>` : `<strong>${escapeHtml(n)}</strong>`;
            return `<li>${label} – ${escapeHtml(norm.title)}${norm.current && norm.current !== n ? ` <span class="muted">(aktuelle Ausgabe: ${escapeHtml(norm.current)})</span>` : ''}</li>`;
          })
          .join('')}</ul>`,
      });
    }
    if (p.verwandt.length) {
      sections.push({
        id: 'weiter',
        title: 'Weiterlesen',
        html: `<ul class="related">${p.verwandt.map((s) => `<li><a href="${s}.html">${escapeHtml(bySlug.get(s)?.title ?? s)}</a> <span class="muted">${escapeHtml(bySlug.get(s)?.kurz ?? '')}</span></li>`).join('')}</ul>`,
      });
    }
    const toc: Heading[] = [...headings.filter((h) => h.level === 2), ...sections.map((s) => ({ level: 2 as const, text: s.title, id: s.id }))];
    const prev = pages[i - 1];
    const next = pages[i + 1];
    const body = `  <div class="wrap wiki-layout">
    ${nav(p)}
    <main id="inhalt" class="wiki-main">
      <p class="crumbs"><a href="index.html">Wiki</a> › <a href="index.html#${area.id}">${escapeHtml(area.title)}</a></p>
      <h1>${escapeHtml(p.title)}</h1>
      <p class="lead">${escapeHtml(p.kurz)}</p>
      ${p.schicht || p.normen.length ? `<dl class="facts">${p.schicht ? `<div><dt>Schicht</dt><dd>${escapeHtml(p.schicht)}</dd></div>` : ''}${p.normen.length ? `<div><dt>Norm</dt><dd>${escapeHtml(p.normen.slice(0, 3).join(', '))}${p.normen.length > 3 ? ' …' : ''}</dd></div>` : ''}${p.demos.length ? `<div><dt>Beispiel</dt><dd><a href="#beispiel">${p.demos.length === 1 ? 'Demo ansehen' : `${p.demos.length} Demos`}</a></dd></div>` : ''}</dl>` : ''}
      ${toc.length > 2 ? `<nav class="toc" aria-label="Auf dieser Seite"><strong>Auf dieser Seite</strong><ol>${toc.map((h) => `<li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`).join('')}</ol></nav>` : ''}
      <article class="prose">
${html}
${sections.map((s) => `<section aria-labelledby="${s.id}"><h2 id="${s.id}">${escapeHtml(s.title)}</h2>\n${s.html}</section>`).join('\n')}
      </article>
      <nav class="pager" aria-label="Blättern">
        ${prev ? `<a class="prev" href="${prev.slug}.html"><span class="muted">Zurück</span>${escapeHtml(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a class="next" href="${next.slug}.html"><span class="muted">Weiter</span>${escapeHtml(next.title)}</a>` : '<span></span>'}
      </nav>
      <p class="edit muted">Fehler gefunden oder eine Idee? <a href="${REPO}/blob/develop/${p.file}">Quelltext dieser Seite</a> auf GitHub.</p>
    </main>
  </div>`;
    files.set(`${p.slug}.html`, frame({ title: `${p.title} – leyoNET Wiki`, description: p.kurz, path: `${p.slug}.html`, body }));
  });

  // --- Startseite -------------------------------------------------------------------
  const start = `  <div class="wrap wiki-layout">
    ${nav()}
    <main id="inhalt" class="wiki-main">
      <h1>leyoNET Wiki</h1>
      <p class="lead">Netzwerktechnik zum Nachschlagen – mit Beispielen, die man in leyoNET sofort ansehen und ausprobieren kann. Für Lernende vom ersten Lehrjahr bis zur Fachhochschule, und ein Crashkurs für Lehrpersonen.</p>
      <div class="wiki-start-actions"><a class="btn btn-ink" href="crashkurs.html">Crashkurs für Lehrpersonen</a> <a class="btn" href="osi-modell.html">Mit den Grundlagen beginnen</a> <a class="btn" href="${APP}?schaufenster">Schaufenster ansehen</a></div>
      ${AREAS.map(
        (a) => `<section class="wiki-area" id="${a.id}" aria-labelledby="${a.id}-h">
        <h2 id="${a.id}-h">${escapeHtml(a.title)}</h2>
        <p class="muted">${escapeHtml(a.lead)}</p>
        <ul class="area-list">${pages
          .filter((p) => p.area === a.id)
          .map((p) => `<li><a href="${p.slug}.html"><strong>${escapeHtml(p.title)}</strong><span>${escapeHtml(p.kurz)}</span></a></li>`)
          .join('')}</ul>
      </section>`,
      ).join('\n      ')}
    </main>
  </div>`;
  files.set('index.html', frame({ title: 'leyoNET Wiki – Netzwerktechnik mit Beispielen', description: 'Crashkurs für Lehrpersonen und Theorie zu jedem Netzwerkgerät und Protokoll, mit Beispielen zum Ansehen in leyoNET und Links zu den Normen.', path: '', body: start }));

  // --- Suche (Daten als Skript, ohne Abruf) -------------------------------------------
  const plain = (md: string) =>
    md
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\[\[([\w-]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([\w-]+)\]\]/g, (_, s: string) => bySlug.get(s)?.title ?? s)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#*`|>_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const search = pages.map((p) => ({ t: p.title, u: `${p.slug}.html`, a: AREAS.find((a) => a.id === p.area)!.title, k: p.kurz, x: plain(p.body).slice(0, 1200) }));
  files.set('suche.js', `/* Suchdaten des Wikis, erzeugt von src/wiki/build.ts – nicht von Hand ändern. */\nwindow.LEYONET_WIKI = ${JSON.stringify(search)};\n`);

  return { files, errors, pages };
}
