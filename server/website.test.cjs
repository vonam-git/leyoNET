'use strict';
// Website-Statistik (Aufrufe von leyonet.ch, Downloads auf GitHub) in der Admin-Konsole.
// npm run test:server
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-website-'));
process.env.DATA_DIR = dataDir;
process.env.ADMIN_PASSWORD = 'test-admin-passwort';
process.env.STATS_ORIGINS = 'https://leyonet.ch';
process.env.STATS_GITHUB_REPO = 'off';
const { createServer, siteStats } = require('./app.cjs');
const { createSiteStats, normalizeReferrer, normalizePath, countryOf, platformOf } = require('./sitestats.cjs');

let server;
let base;
const SITE = 'https://leyonet.ch';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36';

/** Wie navigator.sendBeacon: POST mit text/plain, Origin der Website. */
function beacon(body, headers = {}) {
  return fetch(`${base}/api/hit`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8', Origin: SITE, 'User-Agent': UA, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

async function login() {
  const res = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-admin-passwort' }) });
  return (await res.json()).token;
}

before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('zählt Aufrufe und Besuche der Website, ohne etwas über die Person zu speichern', async () => {
  const visit = { e: 'view', p: '/dc.html?utm=x#top', n: 1, r: 'www.google.ch', l: 'de', z: 'Europe/Zurich', w: 'm' };
  for (const body of [visit, { e: 'view', p: '/index.html' }, { e: 'click', c: 'windows-setup' }]) {
    const res = await beacon(body);
    assert.equal(res.status, 204);
  }
  siteStats().flush();
  const stored = fs.readFileSync(path.join(dataDir, 'stats', 'website.json'), 'utf8');
  const day = Object.values(JSON.parse(stored).days)[0];
  assert.equal(day.views, 2);
  assert.equal(day.visits, 1);
  assert.deepEqual(day.pages, { '/dc.html': 1, '/': 1 });
  assert.deepEqual(day.referrers, { google: 1 });
  assert.deepEqual(day.countries, { CH: 1 });
  assert.deepEqual(day.devices, { m: 1 });
  assert.deepEqual(day.clicks, { 'windows-setup': 1 });
  // Keine Adresse, keine Browserkennung in der Datei.
  assert.doesNotMatch(stored, /127\.0\.0\.1|Mozilla|Chrome/);
});

test('ignoriert fremde Seiten, Bots, Unsinn und zu viele Meldungen – antwortet aber immer gleich', async () => {
  const before = siteStats().report(1).totals.views;
  const answers = [
    await beacon({ e: 'view', p: '/' }, { Origin: 'https://boese.example' }),
    await beacon({ e: 'view', p: '/' }, { Origin: '' }),
    await beacon({ e: 'view', p: '/' }, { 'User-Agent': 'Googlebot/2.1' }),
    await beacon({ e: 'view', p: '/' }, { 'Sec-Purpose': 'prefetch' }),
    await beacon({ e: 'view', p: 'https://boese.example/' }),
    await beacon({ e: 'view', p: '/../etc/passwd' }),
    await beacon({ e: 'click', c: 'irgendwas' }),
    await beacon('kein json'),
    await beacon('x'.repeat(5000)),
  ];
  for (const res of answers) assert.equal(res.status, 204);
  assert.equal(siteStats().report(1).totals.views, before);
  assert.equal((await fetch(`${base}/api/hit`)).status, 405);
});

test('begrenzt die Zahl verschiedener Einträge pro Tag (kein Volllaufen)', async () => {
  const stats = createSiteStats({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ns-cap-')), origins: [SITE], githubRepo: null });
  for (let i = 0; i < 400; i++) stats.record({ e: 'view', p: `/seite-${i}.html`, n: 1, r: `quelle-${i}.example`, z: 'Europe/Zurich' });
  const day = stats._days()[Object.keys(stats._days())[0]];
  assert.equal(Object.keys(day.pages).length, 301);
  assert.equal(day.pages['~'], 100);
  assert.equal(Object.keys(day.referrers).length, 201);
  assert.equal(day.views, 400);
});

test('Auswertung nur für den Hauptadmin', async () => {
  assert.equal((await fetch(`${base}/api/admin/website`)).status, 401);
  const token = await login();
  const res = await fetch(`${base}/api/admin/website?days=7`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.days, 7);
  assert.equal(data.daily.length, 7);
  assert.ok(data.totals.views >= 2);
  assert.deepEqual(data.downloads, { disabled: true });
  assert.deepEqual(data.top.pages.map((p) => p.key).sort(), ['/', '/dc.html']);
});

test('zählt Aufrufe der Web-App, aber nicht die Admin-Seite', async () => {
  const before = siteStats().report(1).totals.app;
  await fetch(`${base}/`, { headers: { 'User-Agent': UA } });
  await fetch(`${base}/admin`, { headers: { 'User-Agent': UA } });
  await fetch(`${base}/`, { headers: { 'User-Agent': 'curl/8.0' } });
  assert.equal(siteStats().report(1).totals.app, before + 1);
});

test('Downloads von GitHub: zusammengefasst, zwischengespeichert, Fehler ohne Absturz', async () => {
  let calls = 0;
  let fail = false;
  let clock = 1_000_000;
  const stats = createSiteStats({
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ns-gh-')),
    origins: [SITE],
    githubRepo: 'vonam-git/leyoNET',
    now: () => clock,
    fetchJson: async (url) => {
      calls++;
      assert.match(url, /^https:\/\/api\.github\.com\/repos\/vonam-git\/leyoNET\/releases/);
      if (fail) throw new Error('offline');
      return [
        { tag_name: 'v1.9.0', published_at: '2026-11-20T10:00:00Z', assets: [{ name: 'leyoNET-Windows-Setup.exe', download_count: 40 }, { name: 'leyoNET-macOS.dmg', download_count: 7 }, { name: 'leyonet.html', download_count: 3 }] },
        { tag_name: 'v1.8.0', assets: [{ name: 'leyoNET-Linux.AppImage', download_count: 5 }] },
        { tag_name: 'v2.0.0', draft: true, assets: [{ name: 'x.exe', download_count: 99 }] },
      ];
    },
  });
  const first = await stats.downloads();
  assert.equal(first.total, 55);
  assert.deepEqual(first.platforms, { windows: 40, macos: 7, html: 3, linux: 5 });
  assert.equal(first.releases.length, 2);
  await stats.downloads();
  assert.equal(calls, 1, 'innerhalb einer Stunde aus dem Zwischenspeicher');
  clock += 61 * 60_000;
  fail = true;
  const broken = await stats.downloads();
  assert.equal(broken.error, 'unreachable');
  assert.equal(broken.stale.total, 55, 'letzte bekannte Zahlen bleiben sichtbar');
});

test('Hilfsfunktionen', () => {
  const own = new Set(['leyonet.ch']);
  assert.equal(normalizeReferrer('www.Google.de', own), 'google');
  assert.equal(normalizeReferrer('leyonet.ch', own), null);
  assert.equal(normalizeReferrer('schule.example', own), 'schule.example');
  assert.equal(normalizeReferrer('<script>', own), null);
  assert.equal(normalizePath('/wiki/index.html'), '/wiki/');
  assert.equal(normalizePath('/a b'), null);
  assert.equal(countryOf('Europe/Vienna'), 'AT');
  assert.equal(countryOf('Europe/Unbekannt'), 'Europe');
  assert.equal(countryOf('Mars/Olympus'), null);
  assert.equal(platformOf('leyoNET-Linux.rpm'), 'linux');
});
