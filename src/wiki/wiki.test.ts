import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { buildWiki } from './build';
import { render } from './markdown';

setLocale('de');
const root = process.cwd();
const out = join(root, 'website/httpdocs/wiki');
const GENERATED = /\.html$|^(en\/)?suche\.js$|^(farben|aufbau)\.css$|^sitemap\.xml$/;
// Erzeugte Dateien in wiki/ und wiki/en/.
const generatedOnDisk = () => ['', 'en/'].flatMap((d) => (existsSync(join(out, d)) ? readdirSync(join(out, d)).map((f) => `${d}${f}`) : [])).filter((f) => GENERATED.test(f));
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };

describe('Wiki', () => {
  const build = buildWiki(root, version);

  it('Quellen sind vollständig und alle Verweise stimmen (Hilfe, Demos, Übungen, Normen, Protokolle)', () => {
    expect(build.errors).toEqual([]);
  });

  it('erzeugte Seiten sind aktuell (neu erzeugen: npm run wiki)', () => {
    if (process.env.WIKI === '1') {
      mkdirSync(join(out, 'en'), { recursive: true });
      for (const f of generatedOnDisk()) if (!build.files.has(f)) unlinkSync(join(out, f));
      for (const [f, text] of build.files) {
        mkdirSync(dirname(join(out, f)), { recursive: true });
        writeFileSync(join(out, f), text);
      }
    }
    for (const [f, text] of build.files) {
      expect(existsSync(join(out, f)), `${f} fehlt – npm run wiki`).toBe(true);
      expect(readFileSync(join(out, f), 'utf8') === text, `${f} veraltet – npm run wiki`).toBe(true);
    }
    const stale = generatedOnDisk().filter((f) => !build.files.has(f));
    expect(stale, 'alte Seiten – npm run wiki').toEqual([]);
  });

  it('Seiten laden nur eigene Dateien und verlinken nur auf erlaubte Ziele', () => {
    const allowed = /^(https:\/\/((app|beta)\.)?leyonet\.ch|https:\/\/github\.com\/vonam-git\/leyoNET|https:\/\/www\.rfc-editor\.org\/rfc\/rfc\d+$|https:\/\/patreon\.com\/leyonet$|mailto:)/;
    for (const [f, text] of build.files) {
      if (!f.endsWith('.html')) continue;
      for (const [, src] of text.matchAll(/<(?:script|link(?! rel="(?:canonical|alternate)")|img)[^>]+(?:src|href)="([^"]+)"/g)) expect(src!, `${f}: ${src}`).not.toMatch(/^(https?:)?\/\//);
      for (const [, href] of text.matchAll(/<a[^>]+href="([^"]+)"/g)) if (/^[a-z]+:/i.test(href!)) expect(href!, `${f}: ${href}`).toMatch(allowed);
      expect(text, f).not.toMatch(/<script>(?!<\/script>)|\son[a-z]+="/);
    }
  });

  it('jede Seite hat Titel, Kurztext und mindestens zwei Abschnitte Inhalt', () => {
    for (const p of build.pages) {
      expect(p.body.match(/^## /gm)?.length ?? 0, p.file).toBeGreaterThanOrEqual(2);
      expect(p.kurz.length, p.file).toBeGreaterThan(20);
    }
  });

  it('jede deutsche Seite gibt es auf Englisch, gegenseitig verlinkt (hreflang, Umschalter)', () => {
    const de = build.pages.filter((p) => p.lang === 'de');
    const en = build.pages.filter((p) => p.lang === 'en');
    expect(en.map((p) => p.slug).sort()).toEqual(de.map((p) => p.slug).sort());
    for (const p of de) {
      const page = build.files.get(`${p.slug}.html`)!;
      expect(page).toContain(`<link rel="alternate" hreflang="en" href="https://leyonet.ch/wiki/en/${p.slug}.html">`);
      expect(page).toContain(`class="lang-switch" href="en/${p.slug}.html"`);
      const other = build.files.get(`en/${p.slug}.html`)!;
      expect(other).toMatch(/<html lang="en">/);
      expect(other).toContain(`class="lang-switch" href="../${p.slug}.html"`);
    }
    // Englische Seiten: kein deutscher Text aus den festen Bausteinen.
    for (const p of en) {
      const html = build.files.get(`en/${p.slug}.html`)!;
      for (const word of ['Weiterlesen', 'Auf dieser Seite', 'So geht es in leyoNET', 'Beispiel ansehen', 'Normen</h2>', 'Zurück']) expect(html, `${p.slug}: ${word}`).not.toContain(word);
    }
    const map = build.files.get('sitemap.xml')!;
    expect(map).toContain('<loc>https://leyonet.ch/wiki/en/osi-modell.html</loc>');
    expect(map).toContain('hreflang="de" href="https://leyonet.ch/wiki/osi-modell.html"');
  });

  it('Geräte-Seiten zeigen das Symbol aus leyoNET, Modul-Seiten ihre Reihe', () => {
    for (const p of build.pages.filter((x) => x.area === 'geraete')) expect(build.files.get(`${p.lang === 'de' ? '' : 'en/'}${p.slug}.html`), p.slug).toContain('class="page-icon"><svg class="dev-icon role-');
    for (const m of ['m117', 'm129', 'm145']) expect(build.files.get(`${m}.html`)).toContain('<th>Arbeitsblatt</th>');
  });

  it('Markdown maskiert HTML und lehnt fremde Adressen ab', () => {
    const errors: string[] = [];
    const links = { wiki: () => null, error: (m: string) => errors.push(m) };
    expect(render('<script>alert(1)</script> **fett**', links).html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt; <strong>fett</strong></p>');
    render('[x](javascript:alert(1)) [[gibtsnicht]]', links);
    expect(errors).toHaveLength(2);
  });
});
