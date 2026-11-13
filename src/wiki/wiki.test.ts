import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { buildWiki } from './build';
import { render } from './markdown';

setLocale('de');
const root = process.cwd();
const out = join(root, 'website/httpdocs/wiki');
const GENERATED = /\.html$|^suche\.js$/;
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };

describe('Wiki', () => {
  const build = buildWiki(root, version);

  it('Quellen sind vollständig und alle Verweise stimmen (Hilfe, Demos, Übungen, Normen, Protokolle)', () => {
    expect(build.errors).toEqual([]);
  });

  it('erzeugte Seiten sind aktuell (neu erzeugen: npm run wiki)', () => {
    if (process.env.WIKI === '1') {
      mkdirSync(out, { recursive: true });
      for (const f of readdirSync(out)) if (GENERATED.test(f) && !build.files.has(f)) unlinkSync(join(out, f));
      for (const [f, text] of build.files) writeFileSync(join(out, f), text);
    }
    for (const [f, text] of build.files) {
      expect(existsSync(join(out, f)), `${f} fehlt – npm run wiki`).toBe(true);
      expect(readFileSync(join(out, f), 'utf8') === text, `${f} veraltet – npm run wiki`).toBe(true);
    }
    const stale = readdirSync(out).filter((f) => GENERATED.test(f) && !build.files.has(f));
    expect(stale, 'alte Seiten – npm run wiki').toEqual([]);
  });

  it('Seiten laden nur eigene Dateien und verlinken nur auf erlaubte Ziele', () => {
    const allowed = /^(https:\/\/((app|beta)\.)?leyonet\.ch|https:\/\/github\.com\/vonam-git\/leyoNET|https:\/\/www\.rfc-editor\.org\/rfc\/rfc\d+$|https:\/\/www\.patreon\.com\/cw\/vonam$|mailto:)/;
    for (const [f, text] of build.files) {
      if (!f.endsWith('.html')) continue;
      for (const [, src] of text.matchAll(/<(?:script|link(?! rel="canonical")|img)[^>]+(?:src|href)="([^"]+)"/g)) expect(src!, `${f}: ${src}`).not.toMatch(/^(https?:)?\/\//);
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

  it('Markdown maskiert HTML und lehnt fremde Adressen ab', () => {
    const errors: string[] = [];
    const links = { wiki: () => null, error: (m: string) => errors.push(m) };
    expect(render('<script>alert(1)</script> **fett**', links).html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt; <strong>fett</strong></p>');
    render('[x](javascript:alert(1)) [[gibtsnicht]]', links);
    expect(errors).toHaveLength(2);
  });
});
