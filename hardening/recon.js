// Read-only inventory of the demo: gamedays, designer templates, games, logins.
// No mutations. Usage: node recon.js
const { chromium } = require('playwright-core');
const fs = require('fs');
const { BASE, login, api } = require('./lib');

const RUN = `runs/${Date.now()}`;
fs.mkdirSync(RUN, { recursive: true });

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const s = await login(browser);
  const out = [];

  const gd = await api(s.page, s.csrf, 'GET', '/api/gamedays/?limit=50');
  out.push(`gamedays (${gd.status}):`);
  for (const g of gd.json?.results || []) out.push(`  ${g.id}: ${g.name} | ${g.date} | ${g.status} | ${g.format}`);

  for (const sharing of ['association', 'personal', 'global']) {
    const t = await api(s.page, s.csrf, 'GET', `/api/designer/templates/?sharing=${sharing}`);
    const list = t.json?.results || t.json || [];
    out.push(`templates sharing=${sharing} (${t.status}):`);
    for (const x of list) out.push(`  ${x.id}: ${x.name} (teams=${x.num_teams})`);
  }

  const games = await api(s.page, s.csrf, 'GET', '/api/gamedays/1/games/');
  out.push(`gameday 1 games (${games.status}, count=${Array.isArray(games.json) ? games.json.length : '?'}):`);
  if (Array.isArray(games.json)) for (const g of games.json.slice(0, 4)) {
    const rs = (g.results || []).map((r) => `${r.team_name}${r.isHome ? '(H)' : ''}`).join(' vs ');
    out.push(`  game${g.id} ${g.field}/${g.scheduled} ${g.stage}/${g.standing} [${g.status}] ${rs}`);
  }

  console.log(out.join('\n'));
  fs.writeFileSync(`${RUN}/recon.txt`, out.join('\n'));
  console.log(`\nRUN DIR: ${RUN}`);
  await browser.close();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });