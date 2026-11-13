/**
 * Kleiner Markdown-Übersetzer für das Wiki (eigene Umsetzung, ohne fremde Pakete).
 * Unterstützt: ## und ### Überschriften, Absätze, Aufzählungen (- und 1.), Hinweise (> ),
 * Codeblöcke (```), Tabellen (| a | b |), **fett**, *kursiv*, `Code`, [Text](Adresse)
 * und Wiki-Verweise [[seite]] bzw. [[seite|Text]]. Alles wird maskiert, HTML im Text ist Text.
 */

export interface LinkResolver {
  /** Wiki-Verweis auflösen: Titel und Datei, oder null (dann Fehler beim Bauen). */
  wiki(slug: string): { title: string; href: string } | null;
  /** Fehler melden (unbekannter Verweis, verbotene Adresse …). */
  error(message: string): void;
}

export const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Adresse erlaubt? Nur https, mailto, relative Wiki-Dateien und Anker. */
function safeHref(href: string): boolean {
  return /^(https:\/\/|mailto:|#|[\w-]+\.html(#[\w-]+)?$|\.\.\/)/.test(href) && !/["<>\s]/.test(href);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function inline(text: string, links: LinkResolver): string {
  const out: string[] = [];
  const re = /`([^`]+)`|\*\*(.+?)\*\*|\*([^*\s][^*]*?)\*|\[\[([\w-]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push(escapeHtml(text.slice(last, m.index)));
    if (m[1] !== undefined) out.push(`<code>${escapeHtml(m[1])}</code>`);
    else if (m[2] !== undefined) out.push(`<strong>${inline(m[2], links)}</strong>`);
    else if (m[3] !== undefined) out.push(`<em>${inline(m[3], links)}</em>`);
    else if (m[4] !== undefined) {
      const target = links.wiki(m[4]);
      if (!target) links.error(`Unbekannter Wiki-Verweis [[${m[4]}]]`);
      out.push(`<a href="${escapeHtml(target?.href ?? '#')}">${escapeHtml(m[5] ?? target?.title ?? m[4])}</a>`);
    } else {
      const href = m[7]!;
      if (!safeHref(href)) links.error(`Adresse nicht erlaubt: ${href}`);
      out.push(`<a href="${escapeHtml(href)}">${inline(m[6]!, links)}</a>`);
    }
    last = m.index + m[0].length;
  }
  out.push(escapeHtml(text.slice(last)));
  return out.join('');
}

export interface Heading {
  level: 2 | 3;
  text: string;
  id: string;
}

/** Markdown in HTML; liefert auch die Überschriften (für das Inhaltsverzeichnis). */
export function render(markdown: string, links: LinkResolver): { html: string; headings: Heading[] } {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  const headings: Heading[] = [];
  const used = new Set<string>();
  let i = 0;
  const isBlockStart = (l: string) => /^(#{2,3} |- |\d+\. |> |```|\|)/.test(l) || l.trim() === '';
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === '') {
      i++;
      continue;
    }
    const h = /^(#{2,3}) (.+)$/.exec(line);
    if (h) {
      const level = h[1]!.length as 2 | 3;
      let id = slugify(h[2]!);
      while (used.has(id)) id += '-2';
      used.add(id);
      headings.push({ level, text: h[2]!, id });
      html.push(`<h${level} id="${id}">${inline(h[2]!, links)}</h${level}>`);
      i++;
      continue;
    }
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) body.push(lines[i++]!);
      i++;
      html.push(`<pre class="code${lang ? ` lang-${escapeHtml(lang)}` : ''}"><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }
    if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.startsWith('|')) {
        rows.push(
          lines[i]!
            .trim()
            .replace(/^\||\|$/g, '')
            .split('|')
            .map((c) => c.trim()),
        );
        i++;
      }
      const [head, sep, ...body] = rows;
      if (!head || !sep || !sep.every((c) => /^:?-+:?$/.test(c))) links.error('Tabelle ohne Trennzeile');
      html.push(
        `<div class="table-wrap"><table><thead><tr>${head!.map((c) => `<th>${inline(c, links)}</th>`).join('')}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c, links)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      );
      continue;
    }
    if (/^(- |\d+\. )/.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\d+\. /.test(lines[i]!) : lines[i]!.startsWith('- '))) {
        let item = lines[i]!.replace(/^(- |\d+\. )/, '');
        i++;
        // Fortsetzungszeilen (eingerückt) gehören zum Punkt.
        while (i < lines.length && /^ {2,}\S/.test(lines[i]!)) item += ' ' + lines[i++]!.trim();
        items.push(`<li>${inline(item, links)}</li>`);
      }
      html.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    if (line.startsWith('> ')) {
      const body: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('> ')) body.push(lines[i++]!.slice(2));
      html.push(`<aside class="callout">${render(body.join('\n'), links).html}</aside>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && !isBlockStart(lines[i]!)) para.push(lines[i++]!.trim());
    if (para.length === 0) {
      // Zeile, die wie ein Block beginnt, aber keiner ist: als Absatz.
      para.push(lines[i++]!.trim());
    }
    html.push(`<p>${inline(para.join(' '), links)}</p>`);
  }
  return { html: html.join('\n'), headings };
}
