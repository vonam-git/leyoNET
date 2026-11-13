// Aufnahmen für das Wiki: Standbild (Echtzeit, nach dem ersten Durchlauf) oder Zeitlupe als Bildfolge.
const { chromium } = require('playwright');
const fs = require('fs');
// Aufruf (Server läuft auf Port 4300, siehe docs/entwicklung.md):
//   node scripts/wiki/aufnahme.cjs <ordner> <demo1,demo2,…> still 5
//   node scripts/wiki/aufnahme.cjs <ordner> arpPing,nat anim 16
const [, , out, list, mode, secs = "14"] = process.argv;
const base = process.env.LEYONET_URL ?? "http://localhost:4300";
(async () => {
  const b = await chromium.launch();
  for (const theme of ['light', 'dark']) for (const id of list.split(',')) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: mode === 'still' ? 2 : 1, locale: 'de-CH', colorScheme: theme });
    await ctx.addInitScript((t) => { try { localStorage.setItem('netzwerk-simulator.theme', t); localStorage.setItem('netzwerk-simulator.panels', JSON.stringify({ left: false, right: false, bottom: false })); } catch {} }, theme);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log(id, 'PAGEERROR', e.message));
    await p.goto(`${base}/?schaufenster=${id}`);
    await p.waitForTimeout(200);
    await p.addStyleTag({ content: '.desktop, .desktop-window, .toast, .toasts, .banner, .tour, .avatar, .grip, .sim-controls, .floor-bar { display: none !important; } .selected, .selection { outline: none !important; }' });
    await p.evaluate(() => window.dispatchEvent(new Event('resize')));
    const canvas = p.locator('.canvas');
    if (mode === 'still') {
      await p.waitForTimeout(Number(secs) * 1000);
      await canvas.screenshot({ path: `${out}/${id}-${theme}.png` });
    } else {
      await p.getByLabel('Tempo').selectOption('slow').catch(() => {});
      await p.addStyleTag({ content: '.sim-controls { display: none !important; }' });
      const dir = `${out}/${id}-${theme}`;
      fs.mkdirSync(dir, { recursive: true });
      const end = Date.now() + Number(secs) * 1000;
      let i = 0;
      while (Date.now() < end) {
        await canvas.screenshot({ path: `${dir}/${String(i++).padStart(4, '0')}-${Date.now()}.png` });
        await p.waitForTimeout(60);
      }
    }
    await ctx.close();
  }
  await b.close();
})();
