// Full tournament lifecycle attempt on a scratch gameday: create -> placeholders
// -> apply template -> publish -> score group games -> check bracket resolution.
// Cleans up its gameday. Usage: node lifecycle.js
const { chromium } = require('playwright-core');
const fs = require('fs');
const { BASE, serverToday, login, api } = require('./lib');

const RUN = `runs/${Date.now()}`;
fs.mkdirSync(RUN, { recursive: true });
const out = [];
const log = (...a) => { const s = a.join(' '); out.push(s); console.log(s); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const s = await login(browser);

  const gd = await api(s.page, s.csrf, 'POST', '/api/gamedays/', { name: 'HARD-Lifecycle', season: 3, league: 1, date: serverToday(), start: '10:00', format: '8_2' });
  const gid = gd.json?.id;
  log('create gameday:', gd.status, 'id=', gid);
  if (!gid) { log('ABORT'); process.exit(1); }

  const tpl = await api(s.page, s.csrf, 'GET', '/api/designer/templates/16/');
  const placeholders = new Set();
  for (const slot of tpl.json?.slots || []) {
    if (slot.home_group != null && slot.home_team != null) placeholders.add(`${slot.home_group}_${slot.home_team}`);
    if (slot.away_group != null && slot.away_team != null) placeholders.add(`${slot.away_group}_${slot.away_team}`);
    if (slot.official_group != null && slot.official_team != null) placeholders.add(`${slot.official_group}_${slot.official_team}`);
  }
  const mapping = {};
  [...placeholders].sort().forEach((ph, i) => { mapping[ph] = [1, 2, 3][i % 3]; });
  log('placeholders:', [...placeholders].sort().join(','), '-> mapping over league teams 1,2,3');

  const ap = await api(s.page, s.csrf, 'POST', '/api/designer/templates/16/apply/', { gameday_id: gid, team_mapping: mapping });
  log('apply:', ap.status, ap.text.slice(0, 200));
  if (ap.status >= 400) {
    log('apply failed (see F10) — skipping scoring. Cleaning up.');
    const g = (await api(s.page, s.csrf, 'GET', `/api/gamedays/${gid}/`)).json;
    await api(s.page, s.csrf, 'PUT', `/api/gamedays/${gid}/`, { date: g.date, name: g.name, status: 'DRAFT', season: g.season, league: g.league, start: g.start, format: g.format });
    await api(s.page, s.csrf, 'DELETE', `/api/gamedays/${gid}/`);
    log('cleanup delete:', 'done');
    fs.writeFileSync(`${RUN}/lifecycle.log`, out.join('\n'));
    console.log(`\nRUN DIR: ${RUN}`);
    await browser.close();
    return;
  }

  let games = ((await api(s.page, s.csrf, 'GET', `/api/gamedays/${gid}/games/`)).json) || [];
  log(`games created: ${games.length}`);

  log('publish:', (await api(s.page, s.csrf, 'PUT', `/api/gamedays/${gid}/`, { date: serverToday(), name: 'HARD-Lifecycle', status: 'PUBLISHED', season: 3, league: 1, start: '10:00', format: '8_2' })).status);

  const placeholderRe = /Gewinner|Verlierer|Winner|Loser|Platz|P[0-9] |Bester|TBD/i;
  const playable = games.filter((g) => (g.results || []).every((r) => r.team_name && !placeholderRe.test(r.team_name)));
  log(`playable games: ${playable.length}/${games.length}`);
  for (const g of playable) {
    const home = g.results.find((r) => r.isHome), away = g.results.find((r) => !r.isHome);
    const winner = (g.id % 2 === 0) ? home : away;
    const loser = (winner === home) ? away : home;
    await api(s.page, s.csrf, 'POST', `/api/gamelog/${g.id}`, { gameId: g.id, team: winner.team_id, half: 1, event: [{ name: 'Touchdown', player: 10 }, { name: '2-Extra-Punkte', player: 10 }] });
    await api(s.page, s.csrf, 'PUT', `/api/game/${g.id}/halftime`, {});
    await api(s.page, s.csrf, 'POST', `/api/gamelog/${g.id}`, { gameId: g.id, team: loser.team_id, half: 2, event: [{ name: 'Touchdown', player: 7 }] });
    const fin = await api(s.page, s.csrf, 'PUT', `/api/game/${g.id}/finalize`, { note: '', hasFinalScoreChanged: false });
    log(`  game${g.id} winner=${winner.team_name}: fin=${fin.status}`);
  }

  games = ((await api(s.page, s.csrf, 'GET', `/api/gamedays/${gid}/games/`)).json) || [];
  log('resolution check:');
  for (const g of games) {
    const rs = (g.results || []).map((r) => `${r.team_name}${r.isHome ? '(H)' : ''}`).join(' vs ');
    log(`  game${g.id} ${g.stage}/${g.standing} [${g.status}] final=${JSON.stringify(g.final_score)}: ${rs}`);
  }

  const g = (await api(s.page, s.csrf, 'GET', `/api/gamedays/${gid}/`)).json;
  await api(s.page, s.csrf, 'PUT', `/api/gamedays/${gid}/`, { date: g.date, name: g.name, status: 'DRAFT', season: g.season, league: g.league, start: g.start, format: g.format });
  log('cleanup delete:', (await api(s.page, s.csrf, 'DELETE', `/api/gamedays/${gid}/`)).status);

  fs.writeFileSync(`${RUN}/lifecycle.log`, out.join('\n'));
  log(`\nRUN DIR: ${RUN}`);
  await browser.close();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });