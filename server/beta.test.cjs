'use strict';
// Testumgebung (LEYONET_CHANNEL=beta): Kennzeichnung und keine Aufnahme in Suchmaschinen.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-beta-'));
process.env.DATA_DIR = dataDir;
process.env.LEYONET_CHANNEL = 'Beta';
const { createServer } = require('./app.cjs');
let server;
let base;

before(async () => {
  server = createServer();
  await server.ready;
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.closeAllConnections();
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('Beta: Kanal in der Konfiguration, noindex überall, robots.txt sperrt alles', async () => {
  const config = await (await fetch(`${base}/api/config`)).json();
  assert.equal(config.channel, 'beta');
  const page = await fetch(`${base}/`);
  assert.match(page.headers.get('x-robots-tag') || '', /noindex/);
  assert.match(await page.text(), /<meta name="robots" content="noindex, nofollow"/);
  const robots = await (await fetch(`${base}/robots.txt`)).text();
  assert.match(robots, /Disallow: \//);
});
