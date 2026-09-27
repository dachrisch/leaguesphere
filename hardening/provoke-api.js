// API 4xx/5xx provocation matrix against the demo (admin session).
// Repro for hardening findings F1/F2/F4/F10. Usage: node provoke-api.js
const { chromium } = require('playwright-core');
const fs = require('fs');
const { BASE, serverToday, login, api, makeRunner } = require('./lib');

const RUN = `runs/${Date.now()}`;
fs.mkdirSync(`${RUN}/shots`, { recursive: true });

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const s = await login(browser);
  const runner = makeRunner();
  runner.attach(s.page);

  await runner.run('G1', 'gamelog invalid event/half -> 500? (F1)', async (r) => {
    const badEvent = await api(s.page, s.csrf, 'POST', '/api/gamelog/1', { gameId: 1, team: 'Phoenix United', event: 'NotARealEventXYZ', half: 'FH' });
    const badHalf = await api(s.page, s.csrf, 'POST', '/api/gamelog/1', { gameId: 1, team: 'Phoenix United', event: 'Goal', half: 'XX' });
    r.detail = `badEvent->${badEvent.status} | badHalf->${badHalf.status} (BUG if 500; expected 400)`;
  }, RUN);

  await runner.run('G2', 'halftime/finalize/possession unknown game -> 500? (F2)', async (r) => {
    const fin = await api(s.page, s.csrf, 'PUT', '/api/game/999999/finalize', { note: 'x' });
    const ht = await api(s.page, s.csrf, 'PUT', '/api/game/999999/halftime', {});
    const poss = await api(s.page, s.csrf, 'PUT', '/api/game/999999/possession', { team: 'x' });
    r.detail = `finalize->${fin.status} | halftime->${ht.status} | possession->${poss.status} (BUG if 500; expected 404)`;
  }, RUN);

  await runner.run('G3', 'possession persists arbitrary team (F4)', async (r) => {
    const p = await api(s.page, s.csrf, 'PUT', '/api/game/1/possession', { team: 'Not A Real Team XYZ' });
    await api(s.page, s.csrf, 'PUT', '/api/game/1/possession', { team: null });
    r.detail = `bogus possession->${p.status} (200 = accepted; expected 400), reverted to null`;
  }, RUN);

  await runner.run('G4', 'apply association template -> 500? (F10)', async (r) => {
    const gd = await api(s.page, s.csrf, 'POST', '/api/gamedays/', { name: 'HARD-Provoke', season: 3, league: 1, date: serverToday(), start: '10:00', format: '8_2' });
    const gid = gd.json?.id;
    if (!gid) { r.detail = 'gameday create failed: ' + gd.status; return; }
    const tpl = await api(s.page, s.csrf, 'GET', '/api/designer/templates/16/');
    const placeholders = new Set();
    for (const slot of tpl.json?.slots || []) {
      if (slot.home_group != null && slot.home_team != null) placeholders.add(`${slot.home_group}_${slot.home_team}`);
      if (slot.away_group != null && slot.away_team != null) placeholders.add(`${slot.away_group}_${slot.away_team}`);
      if (slot.official_group != null && slot.official_team != null) placeholders.add(`${slot.official_group}_${slot.official_team}`);
    }
    const mapping = {};
    [...placeholders].sort().forEach((ph, i) => { mapping[ph] = [1, 2, 3][i % 3]; });
    const ap = await api(s.page, s.csrf, 'POST', '/api/designer/templates/16/apply/', { gameday_id: gid, team_mapping: mapping });
    const val = await api(s.page, s.csrf, 'GET', '/api/designer/templates/16/validate/');
    r.detail = `apply->${ap.status} (BUG if 500; expected 400 naming official-less slots) | validate->${val.status}`;
    // cleanup
    const g = (await api(s.page, s.csrf, 'GET', `/api/gamedays/${gid}/`)).json;
    await api(s.page, s.csrf, 'PUT', `/api/gamedays/${gid}/`, { date: g.date, name: g.name, status: 'DRAFT', season: g.season, league: g.league, start: g.start, format: g.format });
    await api(s.page, s.csrf, 'DELETE', `/api/gamedays/${gid}/`);
  }, RUN);

  await runner.run('G5', 'manual-result then log rescore wipes scores (F9)', async (r) => {
    // game 2 of gameday 1 (seed final 3-3, zero TeamLogs). Set a manual final via result patch.
    const patch = await api(s.page, s.csrf, 'PATCH', '/api/gameinfo/2/result/', { final_score: { home: 3, away: 3 } });
    const before = await api(s.page, s.csrf, 'GET', '/api/gamelog/2');
    const log = await api(s.page, s.csrf, 'POST', '/api/gamelog/2', { gameId: 2, team: 1, half: 1, event: [{ name: 'Touchdown', player: 5 }] });
    // find + delete that entry to observe the rescore
    let seq = null;
    for (const side of ['home', 'away']) for (const half of ['firsthalf', 'secondhalf'])
      for (const e of (log.json?.[side]?.[half]?.entries || [])) seq = Math.max(seq || 0, e.sequence);
    let del = null;
    if (seq) del = await api(s.page, s.csrf, 'DELETE', '/api/gamelog/2', { sequence: seq });
    const after = await api(s.page, s.csrf, 'GET', '/api/gamedays/1/games/');
    const g2 = (after.json || []).find((g) => g.id === 2);
    r.detail = `result patch->${patch.status} | log POST->${log.status} | DELETE seq ${seq}->${del ? del.status : 'n/a'} | game2 after: ${g2 ? g2.status + ' final=' + JSON.stringify(g2.final_score) : '?'} (seed was 3-3; BUG if rescore wiped it)`;
  }, RUN);

  console.log(runner.results.map((r) => `${r.status} ${r.id}: ${r.detail}`).join('\n'));
  fs.writeFileSync(`${RUN}/results.json`, JSON.stringify(runner.results, null, 2));
  console.log(`\nRUN DIR: ${RUN}`);
  await browser.close();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });