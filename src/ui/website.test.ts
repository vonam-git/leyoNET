import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Website leyonet.ch (website/httpdocs/): nur eigene Dateien, Downloads passen zum Desktop-Workflow. */
const root = join(__dirname, '..', '..');
const site = join(root, 'website', 'httpdocs');
// Ohne die echten Seiten mit Kontaktdaten (nur lokal bzw. auf dem Server, in .gitignore).
const pages = readdirSync(site).filter((f) => f.endsWith('.html') && f !== 'impressum.html' && f !== 'datenschutz.html');
const read = (f: string) => readFileSync(join(site, f), 'utf8');
const workflow = readFileSync(join(root, '.github', 'workflows', 'desktop.yml'), 'utf8');
const external = /^(https?:)?\/\//;

describe('Website leyonet.ch', () => {
  it.each(pages)('%s lädt nichts von fremden Servern', (page) => {
    const html = read(page);
    for (const [, url] of html.matchAll(/<(?:script|img|source|iframe)[^>]+(?:src|srcset)="([^"]+)"/g)) expect(url, url).not.toMatch(external);
    for (const [, url] of html.matchAll(/<link[^>]+href="([^"]+)"/g)) expect(url, url).not.toMatch(/^(https?:)?\/\/(?!leyonet\.ch\/)/);
    expect(html).not.toMatch(/<iframe|<form/i);
    expect(html).not.toMatch(/<script>(?!\s*<\/script>)/i);
  });

  it.each(pages)('%s verlinkt nur bekannte Ziele', (page) => {
    const allowed = /^(https:\/\/((app|beta)\.)?leyonet\.ch|https:\/\/github\.com\/vonam-git\/leyoNET|https:\/\/www\.gnu\.org\/licenses\/|https:\/\/www\.edoeb\.admin\.ch|https:\/\/www\.hetzner\.com\/|https:\/\/docs\.github\.com\/|https:\/\/www\.patreon\.com\/cw\/vonam$|mailto:)/;
    for (const [, url] of read(page).matchAll(/<a[^>]+href="([^"]+)"/g)) if (external.test(url!)) expect(url, url).toMatch(allowed);
  });

  it.each(pages)('%s: Stil und Skript mit Versionsangabe (Browser laden nach einem Update keine alte Fassung aus dem Cache)', (page) => {
    const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
    const html = read(page);
    for (const [, ref] of html.matchAll(/(?:href|src)="(\/?(?:css|js)\/[^"]+)"/g)) expect(ref, ref).toMatch(new RegExp(`\\?v=${version.replace(/\./g, '\\.')}$`));
    expect(html).toContain('site.css?v=');
  });

  it('Bildschirmfotos der Ansichten gibt es hell und dunkel', () => {
    const html = read('index.html');
    for (const [, name, same] of html.matchAll(/data-img="([\w-]+)"( data-dark="same")?/g)) {
      for (const suffix of same ? [''] : ['', '-dark']) for (const size of ['', '-1x']) expect(() => readFileSync(join(site, 'img', `${name}${suffix}${size}.webp`)), `${name}${suffix}${size}`).not.toThrow();
    }
  });

  it('Skripte nur aus eigenen Dateien, ohne Netzwerkzugriff', () => {
    const js = readFileSync(join(site, 'js', 'site.js'), 'utf8');
    expect(js).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|document\.cookie|localStorage|innerHTML\s*=/);
  });

  it('keine Kontaktdaten im Repo: Impressum und Datenschutz nur als Vorlage mit Platzhaltern', () => {
    expect(pages).toContain('impressum.vorlage.html');
    expect(pages).toContain('datenschutz.vorlage.html');
    for (const page of pages) {
      const html = read(page);
      expect(html, page).not.toMatch(/[\w.-]+(@|\(at\))[\w-]+\.[a-z]{2,}/i);
      expect(html, page).not.toMatch(/\b\d{4} [A-ZÄÖÜ][a-zäöü]+/);
    }
    for (const v of ['impressum', 'datenschutz']) expect(read(`${v}.vorlage.html`)).toContain('[E-Mail-Adresse]');
  });

  it('Sicherheits-Köpfe in .htaccess', () => {
    const ht = readFileSync(join(site, '.htaccess'), 'utf8');
    expect(ht).toMatch(/Content-Security-Policy "default-src 'none'; script-src 'self'/);
    expect(ht).toContain("frame-ancestors 'none'");
    expect(ht).toContain('Strict-Transport-Security');
    expect(ht).toMatch(/vorlage[\s\S]*Require all denied/);
  });

  it('jeder Download hat im Workflow einen festen Dateinamen', () => {
    const files = pages.flatMap((p) => [...read(p).matchAll(/releases\/latest\/download\/([^"]+)"/g)].map((m) => m[1]!));
    expect(files.length).toBeGreaterThanOrEqual(9);
    for (const f of files) expect(workflow, f).toContain(f);
  });
});
