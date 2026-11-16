/**
 * Wiki für leyonet.ch/wiki/ (Deutsch) und leyonet.ch/wiki/en/ (Englisch): Crashkurs für
 * Lehrpersonen, Grundlagen, ICT-Module und Theorie zu jedem Gerät und Protokoll.
 *
 * Quellen: Markdown unter docs/wiki/<bereich>/<seite>.md mit Kopfzeilen (siehe docs/wiki/README.md),
 * die englische Fassung unter docs/wiki/en/<bereich>/<seite>.md (nur Titel, Kurztext und Text; alle
 * übrigen Angaben kommen von der deutschen Seite). Dazu kommen automatisch aus dem Projekt: die
 * F1-Hilfe (gleicher Text wie in der App), Demo-Netze mit Link ins Schaufenster, passende Übungen
 * aus dem Katalog, Normen aus docs/normen.json, die Vereinfachungen aus docs/protokolle.md und die
 * Symbole der Geräte. Fehlt etwas oder stimmt ein Verweis nicht, schlägt der Test (und damit
 * npm run release) fehl.
 *
 * Erzeugt statische Seiten in website/httpdocs/wiki/ (siehe wiki.test.ts, «npm run wiki»).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import de from '../i18n/de.json';
import en from '../i18n/en.json';
import { DEVICE_SPECS, FORMATS, readFormat, type DeviceType, type FormatId } from '../core';
import { setLocale, t } from '../i18n';
import { encapsulationView, fieldTableView, formatView, hexView, layerValues, osiLayersView, osiOverviewView, toHtml } from '../ui/aufbau';
import { CATALOG } from '../ui/catalog';
import { generalSheet } from '../ui/catalogKit';
import { DEMOS } from '../ui/demos';
import { iconSvg } from '../ui/deviceIcons';
import { frameExample, type ExampleId } from '../ui/frameExamples';
import { HELP_GROUPS, HELP_TOPICS, parseHelp, type HelpPart } from '../ui/help';
import { escapeHtml, render, type Heading, type LinkResolver } from './markdown';

export type Lang = 'de' | 'en';
export const LANGS: Lang[] = ['de', 'en'];
type L10n = Record<Lang, string>;

export const AREAS = [
  {
    id: 'lehrpersonen',
    title: { de: 'Crashkurs für Lehrpersonen', en: 'Crash course for teachers' },
    nav: { de: 'Crashkurs', en: 'Crash course' },
    lead: { de: 'In kurzen Schritten vom ersten Netz bis zur Prüfung und zum Klassen-Verbund.', en: 'In short steps from the first network to exams and the class network.' },
  },
  {
    id: 'module',
    title: { de: 'ICT-Module', en: 'Swiss ICT modules' },
    nav: { de: 'Module', en: 'Modules' },
    lead: { de: 'Die Reihen für die Module 117, 129 und 145: Ziele, Theorie und Übungen in der richtigen Reihenfolge.', en: 'The series for the Swiss ICT modules 117, 129 and 145: goals, theory and exercises in the right order.' },
  },
  {
    id: 'grundlagen',
    title: { de: 'Grundlagen', en: 'Basics' },
    nav: { de: 'Grundlagen', en: 'Basics' },
    lead: { de: 'Schichtenmodell, Zahlen und Adressen, Verkabelung, Routing und Netzwerkdesign: das Fundament für alles Weitere, gestützt auf die Normen.', en: 'Layer model, numbers and addresses, cabling, routing and network design: the foundation for everything else, based on the standards.' },
  },
  {
    id: 'geraete',
    title: { de: 'Geräte', en: 'Devices' },
    nav: { de: 'Geräte', en: 'Devices' },
    lead: { de: 'Jedes Gerät aus dem Shop: wozu es dient, was es kann und wie man es in leyoNET einrichtet.', en: 'Every device from the shop: what it is for, what it can do and how to set it up in leyoNET.' },
  },
  {
    id: 'protokolle',
    title: { de: 'Protokolle', en: 'Protocols' },
    nav: { de: 'Protokolle', en: 'Protocols' },
    lead: { de: 'Jedes Protokoll mit Ablauf, Aufbau der Pakete, Beispiel zum Ansehen und Norm.', en: 'Every protocol with its sequence, packet structure, an example to watch and the standard.' },
  },
] as const;
export type AreaId = (typeof AREAS)[number]['id'];

export interface WikiPage {
  slug: string;
  area: AreaId;
  lang: Lang;
  title: string;
  kurz: string;
  order: number;
  schicht?: string;
  /** Gerätetyp für das Symbol (Gerät-Seiten), z.B. «router». */
  symbol?: string;
  /** Reihe des Übungskatalogs (Modul-Seiten), z.B. «m117». */
  reihe?: string;
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
const SITE = 'https://leyonet.ch';
const TEXTS: Record<Lang, Record<string, string>> = { de: de as Record<string, string>, en: en as Record<string, string> };

/** Feste Texte der Seiten (Inhalt steht in den Markdown-Dateien). */
const UI = {
  htmlLang: { de: 'de-CH', en: 'en' },
  skip: { de: 'Zum Inhalt', en: 'Skip to content' },
  home: { de: 'leyoNET Startseite', en: 'leyoNET home' },
  mainNav: { de: 'Hauptnavigation', en: 'Main navigation' },
  wikiNav: { de: 'Wiki-Inhalt', en: 'Wiki contents' },
  searchLabel: { de: 'Im Wiki suchen', en: 'Search the wiki' },
  searchPlaceholder: { de: 'Suchen, z.B. «OSPF» oder «Trunk»', en: 'Search, e.g. “OSPF” or “trunk”' },
  dark: { de: 'Dunkles Design', en: 'Dark theme' },
  start: { de: 'Im Browser starten', en: 'Start in the browser' },
  other: { de: 'English version', en: 'Deutsche Fassung' },
  otherShort: { de: 'EN', en: 'DE' },
  footer: { de: 'leyoNET Wiki · Stand Version {v} · Texte unter derselben Lizenz wie leyoNET (AGPL-3.0).', en: 'leyoNET wiki · as of version {v} · texts under the same licence as leyoNET (AGPL-3.0).' },
  contact: { de: 'Kontakt', en: 'Contact' },
  imprint: { de: 'Impressum', en: 'Legal notice' },
  privacy: { de: 'Datenschutz', en: 'Privacy' },
  inLeyonet: { de: 'So geht es in leyoNET', en: 'How to do it in leyoNET' },
  helpNote: { de: 'Derselbe Text wie in der Hilfe der App (Taste F1).', en: 'The same text as in the app’s help (F1 key).' },
  example: { de: 'Beispiel ansehen', en: 'See an example' },
  live: { de: 'Live ansehen', en: 'Watch live' },
  projectFile: { de: 'Projektdatei', en: 'Project file' },
  liveNote: { de: '«Live ansehen» öffnet das Netz in leyoNET, die Simulation läuft in einer Schleife. In der App findest du es unter Datei → Demo-Netze, ', en: '“Watch live” opens the network in leyoNET, the simulation runs in a loop. In the app you find it under File → Demo networks, ' },
  liveTour: { de: 'mit Führung Schritt für Schritt.', en: 'with a step-by-step tour.' },
  livePresent: { de: 'zum Vorführen.', en: 'ready to present.' },
  demoAlt: { de: 'Demo «{title}» in leyoNET', en: 'Demo “{title}” in leyoNET' },
  animCaption: { de: 'So sieht es in der Simulation aus: Jeder Punkt ist ein Rahmen auf dem Kabel.', en: 'This is how it looks in the simulation: every dot is a frame on the cable.' },
  slowmo: { de: 'Zeitlupe', en: 'Slow motion' },
  practise: { de: 'Üben', en: 'Practise' },
  practiseNote: { de: 'In leyoNET unter Werkzeuge → Aufgaben-Katalog. Jede Übung prüft sich selbst.', en: 'In leyoNET under Tools → Exercise catalogue. Every exercise checks itself.' },
  goals: { de: '{n} Ziele', en: '{n} goals' },
  verbund: { de: 'Klassen-Verbund', en: 'class network' },
  sheet: { de: 'Arbeitsblatt', en: 'Worksheet' },
  sheetDe: { de: '', en: ' (German)' },
  stars: { de: '{n} von 5 Sternen', en: '{n} of 5 stars' },
  simplifies: { de: 'Was leyoNET vereinfacht', en: 'What leyoNET simplifies' },
  protocol: { de: 'Protokoll', en: 'Protocol' },
  layer: { de: 'Schicht', en: 'Layer' },
  simplification: { de: 'Vereinfachung in der Simulation', en: 'Simplification in the simulation' },
  none: { de: 'keine', en: 'none' },
  norms: { de: 'Normen', en: 'Standards' },
  current: { de: 'aktuelle Ausgabe', en: 'current edition' },
  related: { de: 'Weiterlesen', en: 'Read on' },
  norm: { de: 'Norm', en: 'Standard' },
  demoOne: { de: 'Demo ansehen', en: 'See demo' },
  demosN: { de: '{n} Demos', en: '{n} demos' },
  device: { de: 'Gerät', en: 'Device' },
  onThisPage: { de: 'Auf dieser Seite', en: 'On this page' },
  back: { de: 'Zurück', en: 'Previous' },
  next: { de: 'Weiter', en: 'Next' },
  pager: { de: 'Blättern', en: 'Page through' },
  edit: { de: 'Fehler gefunden oder eine Idee? <a href="{href}">Quelltext dieser Seite</a> auf GitHub.', en: 'Found a mistake or have an idea? <a href="{href}">Source of this page</a> on GitHub.' },
  series: { de: 'Reihe', en: 'Series' },
  general: { de: 'Allgemein', en: 'General' },
  module: { de: 'Modul {n}', en: 'Module {n}' },
  colStars: { de: 'Sterne', en: 'Stars' },
  colExercise: { de: 'Übung', en: 'Exercise' },
  colTheory: { de: 'Theorie', en: 'Theory' },
  colDemo: { de: 'Demo', en: 'Demo' },
  packetHint: { de: 'Zeige auf ein Feld: Die Bytes leuchten unten in der Hex-Ansicht auf.', en: 'Point at a field: its bytes light up in the hex view below.' },
  hex: { de: 'Bytes (hex)', en: 'Bytes (hex)' },
  exampleCaption: { de: 'Echter Rahmen aus der Demo <a href="{href}">«{title}»</a> (Nr. {nr}, {n} Byte), so zeigt ihn auch die Paketliste in leyoNET.', en: 'Real frame from the demo <a href="{href}">“{title}”</a> (no. {nr}, {n} bytes), exactly as the packet list in leyoNET shows it.' },
  values: { de: 'Werte: ', en: 'Values: ' },
  startTitle: { de: 'leyoNET Wiki – Netzwerktechnik mit Beispielen', en: 'leyoNET wiki – networking with examples' },
  startDesc: { de: 'Crashkurs für Lehrpersonen, Grundlagen nach Norm und Theorie zu jedem Netzwerkgerät und Protokoll, mit Beispielen zum Ansehen im Netzwerksimulator leyoNET.', en: 'Crash course for teachers, basics according to the standards and theory for every network device and protocol, with examples to watch in the leyoNET network simulator.' },
  startLead: { de: 'Netzwerktechnik zum Nachschlagen – mit Beispielen, die man im Netzwerksimulator leyoNET sofort ansehen und ausprobieren kann. Für Lernende vom ersten Lehrjahr bis zur Fachhochschule, mit Reihen für die ICT-Module 117, 129 und 145 und einem Crashkurs für Lehrpersonen.', en: 'Networking for reference – with examples you can watch and try right away in the leyoNET network simulator. For learners from the first year of vocational training to university, with series for the Swiss ICT modules 117, 129 and 145 and a crash course for teachers.' },
  startCrash: { de: 'Crashkurs für Lehrpersonen', en: 'Crash course for teachers' },
  startBasics: { de: 'Mit den Grundlagen beginnen', en: 'Start with the basics' },
  startShow: { de: 'Schaufenster ansehen', en: 'Watch the showcase' },
  pages: { de: '{n} Seiten', en: '{n} pages' },
} satisfies Record<string, L10n>;

const fill = (s: string, params: Record<string, string | number> = {}) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));

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

/** Seiten einer Sprache. Englisch: Titel, Kurztext und Text aus docs/wiki/en, der Rest von der deutschen Seite. */
export function loadPages(root: string, lang: Lang = 'de', missing: string[] = []): WikiPage[] {
  const pages: WikiPage[] = [];
  for (const area of AREAS) {
    const dir = join(root, 'docs/wiki', area.id);
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
      const file = `docs/wiki/${area.id}/${name}`;
      const { data, body } = parseFrontmatter(readFileSync(join(dir, name), 'utf8'), file);
      const list = (k: string) => (Array.isArray(data[k]) ? (data[k] as string[]) : data[k] ? [data[k] as string] : []);
      const str = (d: Record<string, string | string[]>, k: string, f: string) => {
        const v = d[k];
        if (typeof v !== 'string' || !v) throw new Error(`${f}: «${k}» fehlt`);
        return v;
      };
      let own = { data, body, file };
      if (lang === 'en') {
        const enFile = `docs/wiki/en/${area.id}/${name}`;
        if (!existsSync(join(root, enFile))) {
          missing.push(enFile);
          continue;
        }
        const parsed = parseFrontmatter(readFileSync(join(root, enFile), 'utf8'), enFile);
        own = { ...parsed, file: enFile };
      }
      pages.push({
        slug: name.replace(/\.md$/, ''),
        area: area.id,
        lang,
        title: str(own.data, 'titel', own.file),
        kurz: str(own.data, 'kurz', own.file),
        order: Number(data.reihenfolge ?? 50),
        ...(typeof data.schicht === 'string' ? { schicht: data.schicht } : {}),
        ...(typeof data.symbol === 'string' ? { symbol: data.symbol } : {}),
        ...(typeof data.reihe === 'string' ? { reihe: data.reihe } : {}),
        hilfe: list('hilfe'),
        demos: list('demos'),
        uebungen: list('uebungen'),
        normen: list('normen'),
        protokolle: list('protokolle'),
        verwandt: list('verwandt'),
        body: own.body,
        file: own.file,
      });
    }
  }
  return pages.sort((a, b) => AREAS.findIndex((x) => x.id === a.area) - AREAS.findIndex((x) => x.id === b.area) || a.order - b.order || a.title.localeCompare(b.title, lang));
}

interface Norm {
  id: string;
  title: string;
  use: string;
  href?: string;
  current?: string;
}

function loadNorms(root: string): Map<string, Norm> {
  const registry = JSON.parse(readFileSync(join(root, 'docs/normen.json'), 'utf8')) as {
    rfc: Record<string, { titel: string; verwendung?: string }>;
    weitere: { id: string; titel?: string; aktuell?: string; verwendung: string; auch?: string[] }[];
  };
  const norms = new Map<string, Norm>();
  for (const [n, r] of Object.entries(registry.rfc)) norms.set(`RFC ${n}`, { id: `RFC ${n}`, title: r.titel, use: r.verwendung ?? '', href: `https://www.rfc-editor.org/rfc/rfc${n}` });
  for (const w of registry.weitere) {
    const norm: Norm = { id: w.id, title: w.titel ?? w.verwendung, use: w.verwendung, ...(w.aktuell ? { current: w.aktuell } : {}) };
    norms.set(w.id, norm);
    for (const alias of w.auch ?? []) norms.set(alias, { ...norm, id: alias });
  }
  return norms;
}

interface ProtocolRow {
  layer: string;
  name: string;
  simplification: string;
}

/** Zeilen der Übersicht in docs/protokolle.md (Deutsch) bzw. docs/wiki/en/simplifications.md (Englisch). */
function loadProtocolTable(root: string, lang: Lang): Map<string, ProtocolRow> {
  const rows = new Map<string, ProtocolRow>();
  for (const line of readFileSync(join(root, 'docs/protokolle.md'), 'utf8').split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length !== 6 || cells[1] === 'Schicht' || cells[1]!.startsWith('-')) continue;
    rows.set(cells[2]!, { layer: cells[1]!, name: cells[2]!, simplification: cells[4]! });
  }
  if (lang === 'en') {
    for (const line of readFileSync(join(root, 'docs/wiki/en/simplifications.md'), 'utf8').split('\n')) {
      const cells = line.split('|').map((c) => c.trim());
      if (cells.length !== 5 || cells[1] === 'Row (de)' || cells[1]!.startsWith('-')) continue;
      const row = rows.get(cells[1]!);
      if (row) rows.set(cells[1]!, { ...row, name: cells[2]!, simplification: cells[3]! });
    }
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
  const files = new Map<string, string>();
  const norms = loadNorms(root);
  const index = readFileSync(join(root, 'website/httpdocs/index.html'), 'utf8');
  const logo = /<svg viewBox="30 50 470 100"[\s\S]*?<\/svg>/.exec(index)?.[0] ?? 'leyoNET';
  const v = `?v=${version}`;

  // Farben und Aufbau: dieselben Stylesheets wie die App (src/ui), damit alles gleich aussieht.
  for (const css of ['farben', 'aufbau']) files.set(`${css}.css`, `/* Kopie von src/ui/${css}.css (erzeugt mit npm run wiki) – nicht von Hand ändern. */\n${readFileSync(join(root, `src/ui/${css}.css`), 'utf8')}`);

  // --- Bilder (wiki/bilder, erzeugt mit scripts/wiki/bilder.py) -------------------------
  const sizesFile = join(root, 'website/httpdocs/wiki/bilder/masse.json');
  const sizes = (existsSync(sizesFile) ? JSON.parse(readFileSync(sizesFile, 'utf8')) : {}) as Record<string, [number, number]>;
  const has = (name: string) => !!sizes[name] && existsSync(join(root, `website/httpdocs/wiki/bilder/${name}.webp`));

  const all: WikiPage[] = [];
  const sitemap: string[] = [];
  const pagesDe = loadPages(root, 'de');

  for (const lang of LANGS) {
    setLocale(lang);
    const texts = TEXTS[lang];
    const u = (key: keyof typeof UI, params?: Record<string, string | number>) => fill(UI[key][lang], params);
    const missing: string[] = [];
    const pages = lang === 'de' ? pagesDe : loadPages(root, 'en', missing);
    for (const m of missing) errors.push(`Englische Seite fehlt: ${m}`);
    all.push(...pages);
    const protocolRows = loadProtocolTable(root, lang);
    const bySlug = new Map(pages.map((p) => [p.slug, p]));
    const byHelp = new Map<string, WikiPage>();
    for (const p of pages) for (const h of p.hilfe) if (!byHelp.has(h)) byHelp.set(h, p);
    // Pfade: Deutsch in wiki/, Englisch in wiki/en/.
    const prefix = lang === 'de' ? '' : 'en/';
    const wikiRoot = lang === 'de' ? '' : '../';
    const siteRoot = lang === 'de' ? '../' : '../../';
    const otherHref = (slug: string) => (lang === 'de' ? `en/${slug}` : `../${slug}`);
    const urlOf = (l: Lang, slug: string) => `${SITE}/wiki/${l === 'de' ? '' : 'en/'}${slug}`;

    // --- Prüfungen der Kopfzeilen (nur einmal, an den deutschen Seiten) ----------------
    if (lang === 'de') {
      const seen = new Set<string>();
      for (const p of pages) {
        if (seen.has(p.slug)) errors.push(`${p.file}: Seite doppelt`);
        seen.add(p.slug);
        for (const h of p.hilfe) if (!HELP_TOPICS.includes(h)) errors.push(`${p.file}: unbekanntes Hilfethema «${h}»`);
        for (const d of p.demos) if (!DEMOS.some((x) => x.id === d)) errors.push(`${p.file}: unbekannte Demo «${d}»`);
        for (const x of p.uebungen) if (!CATALOG.some((c) => c.id === x)) errors.push(`${p.file}: unbekannte Übung «${x}»`);
        for (const n of p.normen) if (!norms.has(n)) errors.push(`${p.file}: Norm «${n}» fehlt in docs/normen.json`);
        for (const r of p.protokolle) if (!protocolRows.has(r)) errors.push(`${p.file}: Zeile «${r}» fehlt in docs/protokolle.md`);
        for (const s of p.verwandt) if (!bySlug.has(s)) errors.push(`${p.file}: verwandte Seite «${s}» gibt es nicht`);
        if (p.symbol && !(p.symbol in DEVICE_SPECS)) errors.push(`${p.file}: unbekanntes Symbol «${p.symbol}»`);
        if (p.area === 'geraete' && !p.symbol) errors.push(`${p.file}: Gerät ohne «symbol»`);
        if (p.reihe && !CATALOG.some((c) => c.series === p.reihe)) errors.push(`${p.file}: unbekannte Reihe «${p.reihe}»`);
      }
      // Abdeckung: jedes Gerät, jede Demo und jedes Hilfethema hat eine Wiki-Seite.
      for (const topic of HELP_GROUPS.find((g) => g.id === 'devices')!.topics) if (!byHelp.has(topic)) errors.push(`Gerät ohne Wiki-Seite: ${topic}`);
      for (const d of DEMOS) if (!pages.some((p) => p.demos.includes(d.id))) errors.push(`Demo ohne Wiki-Seite: ${d.id}`);
      for (const topic of HELP_TOPICS) if (!byHelp.has(topic)) errors.push(`Hilfethema ohne Wiki-Seite: ${topic}`);
      for (const series of new Set(CATALOG.map((c) => c.series).filter(Boolean))) if (!pages.some((p) => p.reihe === series)) errors.push(`Reihe ohne Modul-Seite: ${series}`);
    } else {
      const extra = readdirSync(join(root, 'docs/wiki/en'), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .flatMap((d) => readdirSync(join(root, 'docs/wiki/en', d.name)).map((f) => `${d.name}/${f.replace(/\.md$/, '')}`));
      for (const e of extra) if (!pagesDe.some((p) => `${p.area}/${p.slug}` === e)) errors.push(`docs/wiki/en/${e}.md: keine deutsche Seite dazu`);
    }

    /** Bild hell und dunkel (je nach Design), animiert mit Standbild bei «weniger Bewegung». */
    const figure = (name: string, alt: string, caption?: string): string | null => {
      if (!has(name)) return null;
      const anim = has(`${name}-anim`);
      const one = (dark: boolean) => {
        const still = dark && has(`${name}-dark`) ? `${name}-dark` : name;
        const moving = anim ? (dark && has(`${name}-anim-dark`) ? `${name}-anim-dark` : `${name}-anim`) : null;
        const [w, h] = sizes[moving ?? still]!;
        const img = `<img src="${wikiRoot}bilder/${moving ?? still}.webp" width="${w}" height="${h}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`;
        return `<picture class="${dark ? 'img-dark' : 'img-light'}">${moving ? `<source media="(prefers-reduced-motion: reduce)" srcset="${wikiRoot}bilder/${still}.webp">` : ''}${img}</picture>`;
      };
      return `<figure class="shot-figure${anim ? ' animated' : ''}">${one(false)}${has(`${name}-dark`) ? one(true) : ''}${caption || anim ? `<figcaption>${anim ? `<span class="badge">${u('slowmo')}</span> ` : ''}${escapeHtml(caption ?? alt)}</figcaption>` : ''}</figure>`;
    };

    const links = (file: string): LinkResolver => ({
      image: (name, alt) => figure(name, alt, alt),
      wiki: (slug) => {
        const p = bySlug.get(slug);
        return p ? { title: p.title, href: `${p.slug}.html` } : null;
      },
      error: (message) => errors.push(`${file}: ${message}`),
    });

    // --- Hilfe-Text der App als HTML --------------------------------------------------
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

    // --- Seitenleiste: Gruppen als Karten, Einträge mit Symbol bzw. Farbe der Schicht ----
    const roleOf = (type: string) => DEVICE_SPECS[type as DeviceType]?.role ?? 'endpoint';
    const marker = (p: WikiPage) => {
      if (p.symbol) return `<span class="nav-icon">${iconSvg(p.symbol, roleOf(p.symbol), 22)}</span>`;
      const layer = /^\d/.exec(p.schicht ?? '')?.[0];
      if (p.area === 'module') return `<span class="nav-tag">${escapeHtml(p.slug.toUpperCase())}</span>`;
      return `<span class="nav-dot${layer ? ` lx-o${layer}` : ''}" aria-hidden="true">${layer ?? ''}</span>`;
    };
    const nav = (current?: WikiPage) =>
      `<nav class="wiki-nav" aria-label="${u('wikiNav')}">
      <form class="wiki-search" role="search" action="index.html">
        <label class="visually-hidden" for="wiki-q">${u('searchLabel')}</label>
        <input id="wiki-q" name="q" type="search" placeholder="${escapeHtml(u('searchPlaceholder'))}" autocomplete="off">
        <ol class="wiki-hits" hidden></ol>
      </form>
      ${AREAS.map((a) => {
        const list = pages.filter((p) => p.area === a.id);
        return `<details class="wiki-group wiki-group-${a.id}"${!current || current.area === a.id ? ' open' : ''}>
        <summary><span>${escapeHtml(a.title[lang])}</span><span class="nav-count">${list.length}</span></summary>
        <ul>${list.map((p) => `<li><a href="${p.slug}.html"${p === current ? ' aria-current="page"' : ''}>${marker(p)}<span class="nav-title">${escapeHtml(p.title)}</span></a></li>`).join('')}</ul>
      </details>`;
      }).join('\n      ')}
    </nav>`;

    const frame = (o: { title: string; description: string; slug: string; body: string }) => {
      const path = o.slug ? `${o.slug}.html` : '';
      const otherLang: Lang = lang === 'de' ? 'en' : 'de';
      return `<!doctype html>
<html lang="${UI.htmlLang[lang]}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(o.title)}</title>
  <meta name="description" content="${escapeHtml(o.description)}">
  <link rel="canonical" href="${urlOf(lang, path)}">
  <link rel="alternate" hreflang="${lang}" href="${urlOf(lang, path)}">
  <link rel="alternate" hreflang="${otherLang}" href="${urlOf(otherLang, path)}">
  <link rel="icon" href="${siteRoot}favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${siteRoot}css/site.css${v}">
  <link rel="stylesheet" href="${wikiRoot}farben.css${v}">
  <link rel="stylesheet" href="${wikiRoot}aufbau.css${v}">
  <link rel="stylesheet" href="${wikiRoot}wiki.css${v}">
  <script src="${siteRoot}js/site.js${v}" defer></script>
  <script src="suche.js${v}" defer></script>
  <script src="${wikiRoot}wiki.js${v}" defer></script>
</head>
<body class="wiki">
  <a class="skip" href="#inhalt">${u('skip')}</a>
  <header class="top">
    <div class="wrap top-row">
      <a class="brand" href="${siteRoot}${lang === 'de' ? '' : 'en/'}" aria-label="${u('home')}">
        ${logo}
      </a>
      <a class="wiki-badge" href="index.html">Wiki</a>
      <nav aria-label="${u('mainNav')}">
        <ul>
          ${AREAS.map((a) => `<li><a href="index.html#${a.id}">${escapeHtml(a.nav[lang])}</a></li>`).join('\n          ')}
        </ul>
      </nav>
      <a class="lang-switch" href="${otherHref(path)}" hreflang="${otherLang}" lang="${otherLang}" title="${u('other')}">${u('otherShort')}</a>
      <button class="theme-toggle" type="button" aria-label="${u('dark')}" aria-pressed="false" hidden>
        <svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>
        <svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>
      </button>
      <a class="btn btn-ink btn-small" href="${APP}">${u('start')}</a>
    </div>
  </header>
${o.body}
  <footer class="foot">
    <div class="wrap foot-row">
      <p>${escapeHtml(u('footer', { v: version }))}</p>
      <ul>
        <li><a href="${REPO}">GitHub</a></li>
        <li><a href="https://patreon.com/leyonet">Patreon</a></li>
        <li><a href="${siteRoot}impressum.html#kontakt">${u('contact')}</a></li>
        <li><a href="${siteRoot}impressum.html"${lang === 'de' ? '' : ' hreflang="de"'}>${u('imprint')}</a></li>
        <li><a href="${siteRoot}datenschutz.html"${lang === 'de' ? '' : ' hreflang="de"'}>${u('privacy')}</a></li>
      </ul>
    </div>
  </footer>
</body>
</html>
`;
    };

    // --- Ganze Listen für Platzhalter (immer aktuell aus der App) -------------------
    const seriesTitle = (series: string) => (series ? u('module', { n: series.replace(/^m/, '') }) : u('general'));
    const pageFor = (entry: (typeof CATALOG)[number]) => pages.find((pg) => pg.uebungen.includes(entry.id) && pg.area !== 'module');
    const sheetLink = (entry: (typeof CATALOG)[number]) => `${REPO}/blob/main/docs/arbeitsblaetter/${encodeURIComponent(entry.sheet ?? generalSheet(entry.id))}.pdf`;
    const exerciseTable = (entries: (typeof CATALOG)[number][], numbered: boolean) =>
      `<div class="table-wrap"><table><thead><tr>${numbered ? '<th>#</th>' : ''}<th>${u('colStars')}</th><th>${u('colExercise')}</th><th>${u('colTheory')}</th>${numbered ? `<th>${u('sheet')}</th>` : ''}</tr></thead><tbody>${entries
        .map((e, i) => {
          const page = pageFor(e);
          return `<tr>${numbered ? `<td>${i + 1}</td>` : ''}<td><span class="stars" aria-label="${u('stars', { n: e.stars })}">${STARS(e.stars)}</span></td><td>${escapeHtml(e.build().tasks.title)}${e.verbund ? ` <span class="muted">(${u('verbund')})</span>` : ''}</td><td>${page ? `<a href="${page.slug}.html">${escapeHtml(page.title)}</a>` : ''}</td>${numbered ? `<td><a class="link" href="${sheetLink(e)}">PDF</a>${u('sheetDe')}</td>` : ''}</tr>`;
        })
        .join('')}</tbody></table></div>`;
    const catalogTable = () =>
      ['', ...new Set(CATALOG.map((e) => e.series ?? '').filter(Boolean))]
        .map((series) => {
          const entries = CATALOG.filter((e) => (e.series ?? '') === series);
          return entries.length ? `<h3>${escapeHtml(seriesTitle(series))}</h3>${exerciseTable(entries, false)}` : '';
        })
        .join('\n');
    const seriesTable = (series: string) => exerciseTable(CATALOG.filter((e) => e.series === series), true);
    const demoTable = () =>
      `<div class="table-wrap"><table><thead><tr><th>${u('colDemo')}</th><th>${u('colTheory')}</th><th></th></tr></thead><tbody>${DEMOS.map((d) => {
        const page = pages.find((pg) => pg.demos.includes(d.id));
        return `<tr><td>${escapeHtml(texts[`demo.${d.id}.title`] ?? d.id)}</td><td>${page ? `<a href="${page.slug}.html">${escapeHtml(page.title)}</a>` : ''}</td><td><a href="${APP}?schaufenster=${d.id}">${u('live')}</a></td></tr>`;
      }).join('')}</tbody></table></div>`;
    const deviceTable = () =>
      `<ul class="device-grid">${pages
        .filter((p) => p.area === 'geraete')
        .map((p) => `<li><a href="${p.slug}.html">${iconSvg(p.symbol!, roleOf(p.symbol!), 56)}<strong>${escapeHtml(p.title)}</strong><span>${escapeHtml(p.kurz)}</span></a></li>`)
        .join('')}</ul>`;

    // --- Rahmen und Pakete aus den Demos (wie in den Paketdetails der App) -------------
    const EXAMPLE_FOR: Record<FormatId, ExampleId> = { ethernet2: 'http', ethernet2q: 'vlan', dot1q: 'vlan', ieee8023: 'stp', wlan: 'wlan', ppp: 'ppp', arp: 'arp', ipv4: 'http', ipv6: 'ipv6', icmp: 'vlan', tcp: 'http', udp: 'ipv6' };
    const exampleCaption = (id: ExampleId) => {
      const ex = frameExample(id);
      return u('exampleCaption', { href: `${APP}?schaufenster=${ex.demo}`, title: escapeHtml(texts[`demo.${ex.demo}.title`] ?? ex.demo), nr: ex.entry.id, n: ex.wire.bytes.length });
    };
    const encapFigure = (id: ExampleId) => `<figure class="lx-figure lx-steps">${toHtml(encapsulationView(frameExample(id).wire, t))}<figcaption>${exampleCaption(id)}</figcaption></figure>`;
    const packetFigure = (id: ExampleId) => {
      const { wire } = frameExample(id);
      return `<figure class="lx-figure lx-packet">${toHtml(osiLayersView(wire, t, { showEmpty: true }))}<p class="lx-muted lx-packet-hint">${u('packetHint')}</p>${toHtml(hexView(wire.bytes, u('hex')))}<figcaption>${exampleCaption(id)}</figcaption></figure>`;
    };
    const formatFigure = (id: FormatId) => {
      const format = FORMATS[id];
      const ex = frameExample(EXAMPLE_FOR[id]);
      let values;
      if (id === 'dot1q') {
        const eth = ex.wire.layers.find((l) => l.protocol === 'Ethernet II + 802.1Q')!;
        values = readFormat(format, ex.wire.bytes, { start: eth.start + 12, length: 4 });
      } else {
        const layer = ex.wire.layers.find((l) => layerValues(ex.wire, l)?.format.id === id);
        if (!layer) throw new Error(`kein ${id} im Beispiel ${ex.id}`);
        values = layerValues(ex.wire, layer)!.values;
      }
      return `<figure class="lx-figure">${toHtml(formatView(format, t, values, { allOptional: true }))}${toHtml(fieldTableView(format, t, values))}<figcaption>${u('values')}${exampleCaption(ex.id)}</figcaption></figure>`;
    };

    // --- Seiten ---------------------------------------------------------------------
    pages.forEach((p, i) => {
      const area = AREAS.find((a) => a.id === p.area)!;
      const rendered = render(p.body, links(p.file));
      const headings = rendered.headings;
      const html = rendered.html.replace(/<p>\{\{(\w+)(?: ([\w-]+))?\}\}<\/p>/g, (_, name: string, arg?: string) => {
        if (name === 'katalog') return catalogTable();
        if (name === 'demos') return demoTable();
        if (name === 'geraete') return deviceTable();
        try {
          if (name === 'reihe' && arg) return seriesTable(arg);
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
          title: u('inLeyonet'),
          html: `<p class="muted">${u('helpNote')}</p>\n${p.hilfe.map((h) => `<div class="help-block"><h3>${escapeHtml(texts[`help.${h}.title`] ?? h)}</h3>\n${helpHtml(h)}</div>`).join('\n')}`,
        });
      }
      if (p.demos.length) {
        sections.push({
          id: 'beispiel',
          title: u('example'),
          html: `<ul class="cards">${p.demos
            .map((id) => {
              const demo = DEMOS.find((d) => d.id === id)!;
              const title = texts[`demo.${id}.title`] ?? id;
              const shot = p.body.includes(`](${id})`) ? '' : (figure(id, u('demoAlt', { title }), has(`${id}-anim`) ? u('animCaption') : undefined) ?? '');
              return `<li class="card">${shot}<strong>${escapeHtml(title)}</strong><p>${escapeHtml(texts[`demo.${id}.text`] ?? '')}</p><p class="muted">${escapeHtml(texts[`demo.${id}.show`] ?? '')}</p><p class="card-actions"><a class="btn btn-small btn-ink" href="${APP}?schaufenster=${id}">${u('live')}</a> <a class="link" href="${REPO}/blob/main/docs/beispiele/${demo.file}">${u('projectFile')}</a></p></li>`;
            })
            .join('')}</ul><p class="muted">${u('liveNote')}${p.demos.some((id) => DEMOS.find((d) => d.id === id)?.tour?.length) ? u('liveTour') : u('livePresent')}</p>`,
        });
      }
      if (p.uebungen.length) {
        sections.push({
          id: 'ueben',
          title: u('practise'),
          html: `<ul class="exercises">${p.uebungen
            .map((id) => {
              const entry = CATALOG.find((e) => e.id === id)!;
              const { tasks } = entry.build();
              return `<li><span class="stars" aria-label="${u('stars', { n: entry.stars })}">${STARS(entry.stars)}</span> <strong>${escapeHtml(tasks.title)}</strong> <span class="muted">· ${u('goals', { n: tasks.goals.length })}${entry.verbund ? ` · ${u('verbund')}` : ''}</span> · <a class="link" href="${sheetLink(entry)}">${u('sheet')}</a>${u('sheetDe')}</li>`;
            })
            .join('')}</ul><p class="muted">${u('practiseNote')}</p>`,
        });
      }
      if (p.protokolle.length) {
        sections.push({
          id: 'vereinfachungen',
          title: u('simplifies'),
          html: `<div class="table-wrap"><table><thead><tr><th>${u('protocol')}</th><th>${u('layer')}</th><th>${u('simplification')}</th></tr></thead><tbody>${p.protokolle
            .filter((r) => protocolRows.has(r))
            .map((r) => {
              const row = protocolRows.get(r)!;
              return `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.layer)}</td><td>${escapeHtml(row.simplification === '–' ? u('none') : row.simplification).replace(/`([^`]+)`/g, '<code>$1</code>')}</td></tr>`;
            })
            .join('')}</tbody></table></div>`,
        });
      }
      if (p.normen.length) {
        sections.push({
          id: 'normen',
          title: u('norms'),
          html: `<ul class="norms">${p.normen
            .map((n) => {
              const norm = norms.get(n)!;
              const label = norm.href ? `<a href="${norm.href}">${escapeHtml(n)}</a>` : `<strong>${escapeHtml(n)}</strong>`;
              return `<li>${label} – ${escapeHtml(norm.title)}${norm.current && norm.current !== n ? ` <span class="muted">(${u('current')}: ${escapeHtml(norm.current)})</span>` : ''}</li>`;
            })
            .join('')}</ul>`,
        });
      }
      if (p.verwandt.length) {
        sections.push({
          id: 'weiter',
          title: u('related'),
          html: `<ul class="related">${p.verwandt.map((s) => `<li><a href="${s}.html">${escapeHtml(bySlug.get(s)?.title ?? s)}</a> <span class="muted">${escapeHtml(bySlug.get(s)?.kurz ?? '')}</span></li>`).join('')}</ul>`,
        });
      }
      const toc: Heading[] = [...headings.filter((h) => h.level === 2), ...sections.map((s) => ({ level: 2 as const, text: s.title, id: s.id }))];
      const prev = pages[i - 1];
      const next = pages[i + 1];
      const facts = [
        p.schicht ? `<div><dt>${u('layer')}</dt><dd>${escapeHtml(p.schicht)}</dd></div>` : '',
        p.normen.length ? `<div><dt>${u('norm')}</dt><dd>${escapeHtml(p.normen.slice(0, 3).join(', '))}${p.normen.length > 3 ? ' …' : ''}</dd></div>` : '',
        p.demos.length ? `<div><dt>${u('example')}</dt><dd><a href="#beispiel">${p.demos.length === 1 ? u('demoOne') : u('demosN', { n: p.demos.length })}</a></dd></div>` : '',
      ].join('');
      const body = `  <div class="wrap wiki-layout">
    ${nav(p)}
    <main id="inhalt" class="wiki-main">
      <p class="crumbs"><a href="index.html">Wiki</a> › <a href="index.html#${area.id}">${escapeHtml(area.title[lang])}</a></p>
      <div class="page-head${p.symbol ? ' with-icon' : ''}">${p.symbol ? `<span class="page-icon">${iconSvg(p.symbol, roleOf(p.symbol), 72)}</span>` : ''}<div><h1>${escapeHtml(p.title)}</h1>
      <p class="lead">${escapeHtml(p.kurz)}</p></div></div>
      ${facts ? `<dl class="facts">${facts}</dl>` : ''}
      ${toc.length > 2 ? `<nav class="toc" aria-label="${u('onThisPage')}"><strong>${u('onThisPage')}</strong><ol>${toc.map((h) => `<li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`).join('')}</ol></nav>` : ''}
      <article class="prose">
${html}
${sections.map((s) => `<section aria-labelledby="${s.id}"><h2 id="${s.id}">${escapeHtml(s.title)}</h2>\n${s.html}</section>`).join('\n')}
      </article>
      <nav class="pager" aria-label="${u('pager')}">
        ${prev ? `<a class="prev" href="${prev.slug}.html"><span class="muted">${u('back')}</span>${escapeHtml(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a class="next" href="${next.slug}.html"><span class="muted">${u('next')}</span>${escapeHtml(next.title)}</a>` : '<span></span>'}
      </nav>
      <p class="edit muted">${u('edit', { href: `${REPO}/blob/develop/${p.file}` })}</p>
    </main>
  </div>`;
      files.set(`${prefix}${p.slug}.html`, frame({ title: `${p.title} – leyoNET Wiki`, description: p.kurz, slug: p.slug, body }));
      sitemap.push(p.slug);
    });

    // --- Startseite -----------------------------------------------------------------
    const start = `  <div class="wrap wiki-layout">
    ${nav()}
    <main id="inhalt" class="wiki-main">
      <h1>leyoNET Wiki</h1>
      <p class="lead">${escapeHtml(u('startLead'))}</p>
      <div class="wiki-start-actions"><a class="btn btn-ink" href="crashkurs.html">${u('startCrash')}</a> <a class="btn" href="osi-modell.html">${u('startBasics')}</a> <a class="btn" href="${APP}?schaufenster">${u('startShow')}</a></div>
      ${AREAS.map(
        (a) => `<section class="wiki-area" id="${a.id}" aria-labelledby="${a.id}-h">
        <h2 id="${a.id}-h">${escapeHtml(a.title[lang])}</h2>
        <p class="muted">${escapeHtml(a.lead[lang])}</p>
        <ul class="area-list">${pages
          .filter((p) => p.area === a.id)
          .map((p) => `<li><a href="${p.slug}.html">${p.symbol ? iconSvg(p.symbol, roleOf(p.symbol), 40) : ''}<span><strong>${escapeHtml(p.title)}</strong><span>${escapeHtml(p.kurz)}</span></span></a></li>`)
          .join('')}</ul>
      </section>`,
      ).join('\n      ')}
    </main>
  </div>`;
    files.set(`${prefix}index.html`, frame({ title: u('startTitle'), description: u('startDesc'), slug: '', body: start }));

    // --- Suche (Daten als Skript, ohne Abruf) -----------------------------------------
    const plain = (md: string) =>
      md
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/\{\{[^}]*\}\}/g, ' ')
        .replace(/\[\[([\w-]+)\|([^\]]+)\]\]/g, '$2')
        .replace(/\[\[([\w-]+)\]\]/g, (_, s: string) => bySlug.get(s)?.title ?? s)
        .replace(/!?\[([^\]]*)\]\([^)]+\)/g, '$1')
        .replace(/[#*`|>_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const search = pages.map((p) => ({ t: p.title, u: `${p.slug}.html`, a: AREAS.find((a) => a.id === p.area)!.title[lang], k: p.kurz, x: plain(p.body).slice(0, 1200) }));
    files.set(`${prefix}suche.js`, `/* Suchdaten des Wikis, erzeugt von src/wiki/build.ts – nicht von Hand ändern. */\nwindow.LEYONET_WIKI = ${JSON.stringify(search)};\n`);
  }
  setLocale('de');

  // --- Sitemap für Suchmaschinen (beide Sprachen, gegenseitig verknüpft) ----------------
  const entry = (slug: string) => {
    const path = slug ? `${slug}.html` : '';
    const alt = LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${SITE}/wiki/${l === 'de' ? '' : 'en/'}${path}"/>`).join('');
    return LANGS.map((l) => `  <url><loc>${SITE}/wiki/${l === 'de' ? '' : 'en/'}${path}</loc>${alt}</url>`).join('\n');
  };
  const slugs = ['', ...new Set(sitemap)];
  files.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Erzeugt von src/wiki/build.ts – nicht von Hand ändern. -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${slugs.map(entry).join('\n')}\n</urlset>\n`);

  return { files, errors, pages: all };
}
