'use strict';
/**
 * Besucherstatistik für die Website leyonet.ch und Downloadzahlen (Admin-Konsole, Bereich «Website»).
 *
 * Datenschutz (revDSG/DSGVO) und keine Einwilligung nötig, weil nichts auf dem Gerät gespeichert
 * und niemand wiedererkannt wird:
 * - Die Website meldet einen Aufruf mit navigator.sendBeacon: Seite, Herkunftsseite (nur der
 *   Rechnername), Sprache, Zeitzone (ergibt das Land ungefähr) und Gerätegrösse in drei Stufen.
 * - Keine Cookies, kein localStorage, keine Kennung, keine IP-Adresse, keine Browserkennung.
 * - Gespeichert werden nur Tageszähler («am 3.12. 41 Aufrufe von /dc.html»), höchstens 400 Tage.
 * - Browser mit «Do Not Track» oder «Global Privacy Control» melden nichts (siehe site.js).
 *
 * Downloads: Die Installer liegen auf GitHub. Deren Zähler liest der Server über die öffentliche
 * GitHub-Schnittstelle (ohne Anmeldung, höchstens einmal pro Stunde).
 */
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const crypto = require('node:crypto');

/** So lange bleiben Tageszähler erhalten. */
const KEEP_DAYS = 400;
/** Höchstens so viele verschiedene Einträge je Tag und Art; der Rest zählt unter «andere». */
const CAPS = { pages: 300, referrers: 200, countries: 120, langs: 60, devices: 3, clicks: 40 };
const OTHER = '~';
const FLUSH_MS = 60_000;
const GITHUB_TTL_MS = 60 * 60_000;
const GITHUB_RETRY_MS = 5 * 60_000;
const MAX_GITHUB_BYTES = 4 * 1024 * 1024;

/** Ziele von Links auf der Website, die gezählt werden (alles andere wird ignoriert). */
const CLICKS = new Set(['windows-setup', 'windows-msi', 'macos', 'linux-appimage', 'linux-deb', 'linux-rpm', 'html', 'arbeitsblaetter', 'sha256', 'app', 'schaufenster', 'dc', 'github', 'releases']);

/**
 * Zeitzone → Land (ISO 3166). Nur eine Annäherung: Der Browser meldet die Zeitzone des Geräts.
 * Unbekannte Zonen zählen unter ihrem Erdteil («Europe», «America» …).
 */
const ZONES = {
  'Europe/Zurich': 'CH', 'Europe/Vaduz': 'LI', 'Europe/Berlin': 'DE', 'Europe/Busingen': 'DE', 'Europe/Vienna': 'AT',
  'Europe/Paris': 'FR', 'Europe/Monaco': 'MC', 'Europe/Rome': 'IT', 'Europe/San_Marino': 'SM', 'Europe/Vatican': 'VA',
  'Europe/Luxembourg': 'LU', 'Europe/Brussels': 'BE', 'Europe/Amsterdam': 'NL', 'Europe/London': 'GB', 'Europe/Dublin': 'IE',
  'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'Europe/Lisbon': 'PT', 'Europe/Andorra': 'AD', 'Europe/Copenhagen': 'DK',
  'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Helsinki': 'FI', 'Atlantic/Reykjavik': 'IS', 'Europe/Warsaw': 'PL',
  'Europe/Prague': 'CZ', 'Europe/Bratislava': 'SK', 'Europe/Budapest': 'HU', 'Europe/Ljubljana': 'SI', 'Europe/Zagreb': 'HR',
  'Europe/Belgrade': 'RS', 'Europe/Sarajevo': 'BA', 'Europe/Skopje': 'MK', 'Europe/Tirane': 'AL', 'Europe/Podgorica': 'ME',
  'Europe/Bucharest': 'RO', 'Europe/Sofia': 'BG', 'Europe/Athens': 'GR', 'Europe/Istanbul': 'TR', 'Asia/Nicosia': 'CY',
  'Europe/Malta': 'MT', 'Europe/Tallinn': 'EE', 'Europe/Riga': 'LV', 'Europe/Vilnius': 'LT', 'Europe/Kyiv': 'UA', 'Europe/Kiev': 'UA',
  'Europe/Chisinau': 'MD', 'Europe/Minsk': 'BY', 'Europe/Moscow': 'RU',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Phoenix': 'US', 'America/Los_Angeles': 'US',
  'America/Anchorage': 'US', 'Pacific/Honolulu': 'US', 'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR', 'America/Argentina/Buenos_Aires': 'AR',
  'America/Bogota': 'CO', 'America/Lima': 'PE', 'America/Santiago': 'CL',
  'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK', 'Asia/Taipei': 'TW', 'Asia/Singapore': 'SG',
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Dubai': 'AE', 'Asia/Jerusalem': 'IL', 'Asia/Bangkok': 'TH', 'Asia/Jakarta': 'ID',
  'Asia/Manila': 'PH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Karachi': 'PK',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU',
  'Pacific/Auckland': 'NZ', 'Africa/Johannesburg': 'ZA', 'Africa/Cairo': 'EG', 'Africa/Lagos': 'NG', 'Africa/Nairobi': 'KE', 'Africa/Casablanca': 'MA',
};
const CONTINENTS = new Set(['Europe', 'America', 'Asia', 'Africa', 'Australia', 'Pacific', 'Atlantic', 'Indian', 'Antarctica']);

/** Bots, Vorschau-Dienste und automatisierte Browser zählen nicht. */
const BOT = /bot|crawl|spider|slurp|scrape|preview|headless|lighthouse|pagespeed|monitor|uptime|curl|wget|python|java\/|go-http|node-fetch|axios|facebookexternalhit|embedly|whatsapp|telegram|discord|skype/i;

const PATH = /^\/[A-Za-z0-9/._-]{0,160}$/;
const HOST = /^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/;
const LANG = /^[a-z]{2,3}$/;
const ZONE = /^[A-Za-z]+(\/[A-Za-z0-9_+-]+){1,2}$/;

function dayOf(now = Date.now()) {
  // Schweizer Kalendertag, damit ein Tag um Mitternacht in Zürich beginnt.
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function emptyDay() {
  return { views: 0, visits: 0, app: 0, pages: {}, referrers: {}, countries: {}, langs: {}, devices: {}, clicks: {} };
}

function bump(map, key, cap) {
  if (!(key in map) && Object.keys(map).length >= cap) key = OTHER;
  map[key] = (map[key] || 0) + 1;
}

/** Herkunftsseite auf den Rechnernamen kürzen; Suchmaschinen zusammenfassen. */
function normalizeReferrer(raw, ownHosts) {
  if (typeof raw !== 'string' || !raw) return null;
  let host = raw.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  if (!HOST.test(host)) return null;
  if (ownHosts.has(host) || ownHosts.has(`www.${host}`)) return null;
  if (/(^|\.)google\.[a-z.]+$/.test(host)) host = 'google';
  else if (/(^|\.)bing\.com$/.test(host)) host = 'bing';
  else if (/(^|\.)duckduckgo\.com$/.test(host)) host = 'duckduckgo';
  else if (/(^|\.)ecosia\.org$/.test(host)) host = 'ecosia';
  else if (/(^|\.)search\.brave\.com$/.test(host)) host = 'brave';
  return host;
}

function normalizePath(raw) {
  if (typeof raw !== 'string') return null;
  let p = raw.split(/[?#]/)[0];
  if (!PATH.test(p) || p.includes('..')) return null;
  p = p.replace(/\/index\.html$/, '/');
  return p || '/';
}

function countryOf(zone) {
  if (typeof zone !== 'string' || !ZONE.test(zone)) return null;
  if (ZONES[zone]) return ZONES[zone];
  const continent = zone.split('/')[0];
  return CONTINENTS.has(continent) ? continent : null;
}

/** Welche Downloads zu welcher Plattform gehören (für die Zusammenfassung). */
function platformOf(name) {
  const n = name.toLowerCase();
  if (/\.(exe|msi)$/.test(n)) return 'windows';
  if (/\.dmg$|\.app\.tar\.gz$/.test(n) || n.includes('macos')) return 'macos';
  if (/\.(appimage|deb|rpm)$/.test(n)) return 'linux';
  if (/\.html$/.test(n)) return 'html';
  if (/arbeitsbl/.test(n)) return 'worksheets';
  return 'other';
}

function createSiteStats({ dataDir, origins, githubRepo, fetchJson = httpsJson, now = () => Date.now() }) {
  const dir = path.join(dataDir, 'stats');
  const file = path.join(dir, 'website.json');
  const allowed = new Set(origins);
  const ownHosts = new Set([...allowed].map((o) => {
    try {
      return new URL(o).hostname;
    } catch {
      return '';
    }
  }));
  let days = {};
  try {
    const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (loaded && typeof loaded.days === 'object') days = loaded.days;
  } catch {
    // noch keine Statistik
  }
  let dirty = false;

  function today() {
    const key = dayOf(now());
    if (!days[key]) days[key] = emptyDay();
    return days[key];
  }

  function prune() {
    const oldest = dayOf(now() - KEEP_DAYS * 86_400_000);
    for (const key of Object.keys(days)) if (key < oldest) delete days[key];
  }

  function flush() {
    if (!dirty) return;
    dirty = false;
    prune();
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ days }), { mode: 0o600 });
      fs.renameSync(tmp, file);
    } catch (error) {
      dirty = true;
      console.error('Statistik speichern:', error && error.message);
    }
  }
  const timer = setInterval(flush, FLUSH_MS);
  timer.unref();

  /** Darf diese Anfrage gezählt werden? (Website von der richtigen Adresse, kein Bot) */
  function accepts(req) {
    if (!allowed.has(String(req.headers.origin || ''))) return false;
    if (BOT.test(String(req.headers['user-agent'] || ''))) return false;
    // Vorab geladene Seiten (Prefetch, Prerender) sind keine Besuche.
    if (/prefetch|prerender/i.test(String(req.headers['sec-purpose'] || req.headers.purpose || ''))) return false;
    return true;
  }

  /** Eine Meldung der Website zählen. Unbrauchbares wird still ignoriert. */
  function record(body) {
    if (!body || typeof body !== 'object') return false;
    const d = today();
    if (body.e === 'click') {
      if (typeof body.c !== 'string' || !CLICKS.has(body.c)) return false;
      bump(d.clicks, body.c, CAPS.clicks);
      dirty = true;
      return true;
    }
    if (body.e !== 'view') return false;
    const page = normalizePath(body.p);
    if (!page) return false;
    d.views++;
    bump(d.pages, page, CAPS.pages);
    if (body.n === 1) {
      d.visits++;
      const ref = normalizeReferrer(body.r, ownHosts);
      bump(d.referrers, ref || '-', CAPS.referrers);
      const country = countryOf(body.z);
      bump(d.countries, country || '?', CAPS.countries);
      const lang = typeof body.l === 'string' && LANG.test(body.l) ? body.l : '?';
      bump(d.langs, lang, CAPS.langs);
      const device = body.w === 'm' || body.w === 't' || body.w === 'd' ? body.w : 'd';
      bump(d.devices, device, CAPS.devices);
    }
    dirty = true;
    return true;
  }

  /** Aufruf der Web-App (app.leyonet.ch), vom Server selbst gezählt. */
  function countApp(req) {
    if (BOT.test(String(req.headers['user-agent'] || ''))) return;
    if (/prefetch|prerender/i.test(String(req.headers['sec-purpose'] || req.headers.purpose || ''))) return;
    today().app++;
    dirty = true;
  }

  function report(count) {
    const n = Math.min(KEEP_DAYS, Math.max(1, Math.floor(Number(count) || 30)));
    const list = [];
    const totals = { views: 0, visits: 0, app: 0, clicks: 0 };
    const sum = { pages: {}, referrers: {}, countries: {}, langs: {}, devices: {}, clicks: {} };
    for (let i = n - 1; i >= 0; i--) {
      const key = dayOf(now() - i * 86_400_000);
      const d = days[key] || emptyDay();
      const clicks = Object.values(d.clicks).reduce((a, b) => a + b, 0);
      list.push({ day: key, views: d.views, visits: d.visits, app: d.app || 0, clicks });
      totals.views += d.views;
      totals.visits += d.visits;
      totals.app += d.app || 0;
      totals.clicks += clicks;
      for (const kind of Object.keys(sum)) for (const [k, v] of Object.entries(d[kind] || {})) sum[kind][k] = (sum[kind][k] || 0) + v;
    }
    const top = (map, limit = 50) =>
      Object.entries(map)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([key, value]) => ({ key, value }));
    return {
      days: n,
      from: list[0].day,
      to: list[list.length - 1].day,
      totals,
      daily: list,
      top: { pages: top(sum.pages), referrers: top(sum.referrers), countries: top(sum.countries), langs: top(sum.langs), devices: top(sum.devices), clicks: top(sum.clicks) },
      origins: [...allowed],
    };
  }

  // --- Downloads auf GitHub ----------------------------------------------------------
  let github = null;
  let githubAt = 0;
  let githubPending = null;

  async function downloads() {
    if (!githubRepo) return { disabled: true };
    const t = now();
    if (github && t - githubAt < (github.error ? GITHUB_RETRY_MS : GITHUB_TTL_MS)) return github;
    if (!githubPending) {
      githubPending = (async () => {
        try {
          const releases = await fetchJson(`https://api.github.com/repos/${githubRepo}/releases?per_page=100`);
          if (!Array.isArray(releases)) throw new Error('unerwartete Antwort');
          const list = releases
            .filter((r) => r && !r.draft && typeof r.tag_name === 'string')
            .map((r) => ({
              tag: String(r.tag_name).slice(0, 40),
              published: typeof r.published_at === 'string' ? r.published_at : null,
              prerelease: !!r.prerelease,
              assets: (Array.isArray(r.assets) ? r.assets : [])
                .filter((a) => a && typeof a.name === 'string' && Number.isInteger(a.download_count))
                .map((a) => ({ name: a.name.slice(0, 80), count: a.download_count, platform: platformOf(a.name) })),
            }));
          const platforms = {};
          let total = 0;
          for (const r of list) for (const a of r.assets) {
            platforms[a.platform] = (platforms[a.platform] || 0) + a.count;
            total += a.count;
          }
          github = { repo: githubRepo, fetched: now(), total, platforms, releases: list.slice(0, 30) };
        } catch (error) {
          github = { repo: githubRepo, fetched: now(), error: 'unreachable', ...(github && !github.error ? { stale: github } : {}) };
          console.error('GitHub-Downloads:', error && error.message);
        }
        githubAt = now();
        githubPending = null;
        return github;
      })();
    }
    return githubPending;
  }

  return { accepts, record, countApp, report, downloads, flush, _days: () => days };
}

/** Öffentliche GitHub-Schnittstelle lesen (ohne Anmeldung, mit Zeit- und Grössenlimit). */
function httpsJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'leyoNET-Admin', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, timeout: 8000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let size = 0;
      const chunks = [];
      res.on('data', (c) => {
        size += c.length;
        if (size > MAX_GITHUB_BYTES) {
          req.destroy(new Error('zu gross'));
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(error);
        }
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Zeitüberschreitung')));
    req.on('error', reject);
  });
}

module.exports = { createSiteStats, normalizeReferrer, normalizePath, countryOf, platformOf, dayOf, CLICKS, KEEP_DAYS };
