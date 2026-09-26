// Seed-state restore check: prints gamedays + confirms gameday 1 date is the
// seed value (2026-08-24) after a mutation run. Usage: node verify-demo.js
const { chromium } = require('playwright-core');
const { BASE, login, api } = require('./lib');

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const s = await login(browser);
  const gd = await api(s.page, s.csrf, 'GET', '/api/gamedays/?limit=50');
  for (const g of gd.json?.results || []) console.log(`${g.id}: ${g.name} | ${g.date} | ${g.status}`);
  const g1 = (await api(s.page, s.csrf, 'GET', '/api/gamedays/1/')).json;
  console.log(`\ngameday 1 date: ${g1.date} (seed = 2026-08-24; ${g1.date === '2026-08-24' ? 'OK' : 'NOT RESTORED'})`);
  const scratch = (gd.json?.results || []).filter((g) => /HARD/i.test(g.name || ''));
  console.log(`scratch gamedays remaining: ${scratch.length ? scratch.map((g) => g.id).join(',') : 'none'}`);
  await browser.close();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });