import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Website leyonet.ch (website/): keine fremden Ressourcen, Downloads passen zum Desktop-Workflow. */
const root = join(__dirname, '..', '..');
const html = readFileSync(join(root, 'website', 'index.html'), 'utf8');
const workflow = readFileSync(join(root, '.github', 'workflows', 'desktop.yml'), 'utf8');

describe('Website leyonet.ch', () => {
  it('lädt nichts von fremden Servern und hat keine Skripte', () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<iframe|<form/i);
    // src= nur lokal (Logo), keine externen Bilder, Schriften oder Stile.
    for (const [, url] of html.matchAll(/\ssrc="([^"]+)"/g)) expect(url).not.toMatch(/^(https?:)?\/\//);
    for (const [, url] of html.matchAll(/<link[^>]+href="([^"]+)"/g)) expect(url).not.toMatch(/^(https?:)?\/\//);
    expect(html).toContain("default-src 'none'");
  });

  it('verlinkt nur bekannte Ziele', () => {
    const allowed = /^(#|\.\/|https:\/\/(app\.)?leyonet\.ch|https:\/\/github\.com\/vonam-git\/leyoNET|https:\/\/www\.gnu\.org\/licenses\/)/;
    for (const [, url] of html.matchAll(/href="([^"]+)"/g)) if (!/\.svg$/.test(url!)) expect(url, url).toMatch(allowed);
  });

  it('jeder Download hat im Workflow einen festen Dateinamen', () => {
    const files = [...html.matchAll(/releases\/latest\/download\/([^"]+)"/g)].map((m) => m[1]!);
    expect(files.length).toBeGreaterThanOrEqual(7);
    for (const f of files) expect(workflow, f).toContain(f);
  });
});
