/**
 * Doku-Prüfung bei jedem Release: Stimmen Dokumentation, Hilfe, README und Website noch mit
 * dem Programm überein? Prüft Verweise, Zahlen, Versionen und bekannte Fallstricke. Was sich
 * nicht automatisch prüfen lässt, steht als Liste in docs/doku-pruefung.md.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { describe, expect, it } from 'vitest';
import de from './i18n/de.json';
import en from './i18n/en.json';
import { setLocale } from './i18n';
import { CATALOG } from './ui/catalog';
import { DEMOS } from './ui/demos';
import { HELP_TOPICS } from './ui/help';

setLocale('de');
const root = process.cwd();
const read = (f: string) => readFileSync(join(root, f), 'utf8');

function markdownFiles(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) return name === 'node_modules' ? [] : markdownFiles(rel);
    return name.endsWith('.md') ? [rel] : [];
  });
}
const DOCS = ['README.md', ...markdownFiles('docs')];

describe('Doku-Prüfung', () => {
  it('relative Verweise in README und docs zeigen auf vorhandene Dateien', () => {
    const broken: string[] = [];
    // Wiki-Quellen verlinken relativ zur Website; das prüft src/wiki/wiki.test.ts.
    for (const file of DOCS.filter((f) => !f.startsWith('docs/wiki/'))) {
      const text = read(file).replace(/```[\s\S]*?```/g, '');
      for (const [, target] of [...text.matchAll(/\]\(([^)\s]+)\)|(?:src|srcset|href)="([^"]+)"/g)].map((m) => [m[0], m[1] ?? m[2]] as const)) {
        if (!target || /^(https?:|mailto:|#)/.test(target)) continue;
        const path = target.split('#')[0]!;
        if (!path) continue;
        const resolved = normalize(join(dirname(file), decodeURIComponent(path)));
        if (!existsSync(join(root, resolved))) broken.push(`${file}: ${target}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('jede Datei in docs/ ist von README oder einer anderen Doku aus verlinkt', () => {
    const all = DOCS.map((f) => read(f)).join('\n');
    const orphans = markdownFiles('docs')
      .filter((f) => !f.startsWith('docs/wiki/') && !f.startsWith('docs/releases/') && !f.startsWith('docs/arbeitsblaetter/'))
      .filter((f) => !all.includes(f.replace(/^docs\//, '')) && !all.includes(f.split('/').pop()!));
    expect(orphans).toEqual([]);
  });

  it('jede Beispieldatei in docs/beispiele gehört zu einer Demo', () => {
    const files = readdirSync(join(root, 'docs/beispiele')).filter((f) => f.endsWith('.json'));
    expect(files.filter((f) => !DEMOS.some((d) => d.file === f))).toEqual([]);
  });

  it('Zahlen in Texten stimmen (Übungen, Demos)', () => {
    const texts = [...DOCS, 'website/httpdocs/index.html'].map((f) => [f, read(f)] as const);
    for (const [file, text] of texts) {
      for (const m of text.matchAll(/(über |mehr als )?(\d+)\+? Übungen/g)) expect(CATALOG.length, `${file}: «${m[0]}»`).toBeGreaterThanOrEqual(Number(m[2]));
      for (const m of text.matchAll(/(über |mehr als )(\d+) (fertige Projekte|Demo-Netze|Demos)/g)) expect(DEMOS.length, `${file}: «${m[0]}»`).toBeGreaterThanOrEqual(Number(m[2]));
    }
    const site = read('website/httpdocs/index.html');
    const counter = (label: RegExp) => Number(new RegExp(`<dt>${label.source}[^<]*</dt><dd data-count="(\\d+)"`).exec(site)?.[1]);
    expect(counter(/Übungen/), 'Website: Zähler Übungen').toBeLessThanOrEqual(CATALOG.length);
    expect(counter(/fertige Demo-Netze/), 'Website: Zähler Demos').toBe(DEMOS.length);
  });

  it('Versionen stimmen überein (package.json, Desktop, Website, Release-Text)', () => {
    const { version } = JSON.parse(read('package.json')) as { version: string };
    expect(/^version = "([^"]+)"/m.exec(read('src-tauri/Cargo.toml'))?.[1], 'src-tauri/Cargo.toml').toBe(version);
    expect(/<span data-version>([^<]+)<\/span>/.exec(read('website/httpdocs/index.html'))?.[1], 'Website data-version').toBe(version);
    expect(existsSync(join(root, `docs/releases/v${version}.md`)), `docs/releases/v${version}.md fehlt`).toBe(true);
    expect(read('docs/versionen.md'), 'docs/versionen.md nennt die Version').toContain(`v${version.split('.').slice(0, 2).join('.')}`);
  });

  it('Hilfe: jedes Thema hat Titel und Text in beiden Sprachen, Verweise zeigen auf Themen', () => {
    const missing: string[] = [];
    for (const lang of [de, en] as Record<string, string>[]) {
      for (const topic of HELP_TOPICS) {
        if (!lang[`help.${topic}.title`] || !lang[`help.${topic}.body`]) missing.push(topic);
        for (const [, link] of (lang[`help.${topic}.body`] ?? '').matchAll(/\[\[([\w.]+)\]\]/g)) if (!HELP_TOPICS.includes(link!)) missing.push(`${topic} → [[${link}]]`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('«Bewusst nicht simuliert» nennt nichts, was leyoNET inzwischen kann', () => {
    const section = /## Bewusst nicht simuliert\n([\s\S]*?)(\n## |$)/.exec(read('docs/protokolle.md'))?.[1] ?? '';
    for (const feature of ['IPv6', 'VPN', 'IPsec', 'Link-Aggregation', 'Port-Channel', 'Zugriffslisten', 'ACL', 'VXLAN', 'VRF', 'BGP', 'OSPF']) expect(section, feature).not.toMatch(new RegExp(`(^|[^A-Za-z])${feature}($|[^A-Za-z])`));
  });

  it('die Wiki-Seiten erwähnen keine Funktion, die es nicht gibt (Tastenkürzel und Menüs)', () => {
    // Tastenkürzel im Wiki müssen in der App existieren.
    const shortcuts = read('src/ui/commands.svelte.ts');
    for (const file of markdownFiles('docs/wiki')) {
      for (const m of read(file).matchAll(/Taste \*\*([A-Z])\*\*|\(Taste ([A-Z])\)/g)) {
        const key = m[1] ?? m[2];
        expect(shortcuts, `${file}: Taste ${key}`).toMatch(new RegExp(`keys: \\[[^\\]]*'${key}'`));
      }
    }
  });
});
