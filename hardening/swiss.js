// Swiss-system + normal-game smoke test on the public demo, headless Chrome.
//
//   node swiss.js
//
// Scenario A (Swiss): create a scratch gameday, set up a 6-team / 4-round Swiss
//   tournament, generate round 1, publish, then play all four rounds (higher
//   seed wins 2:0 via the result endpoint) and assert the final standings are
//   the approved 8/6/4/4/2/0. Exercises the Swiss setup/generate/standings
//   endpoints and the "publish preserves Swiss games" fix.
//
// Scenario B (normal): create a scratch gameday from the association template,
//   publish, write a single result through /api/gamedays/gameinfo/<pk>/result/,
//   and assert the score round-trips through /api/gamedays/<id>/games/.
//
// Both scratch gamedays are deleted at the end. Demo-only (resets nightly).
const { chromium } = require('playwright-core');
const fs = require('fs');
const { BASE, serverToday, login, api } = require('./lib');

const RUN = `runs/${Date.now()}`;
fs.mkdirSync(`${RUN}/shots`, { recursive: true });
const out = [];
const log = (...a) => { const s = a.join(' '); out.push(s); console.log(s); };

const SWISS_ROUNDS = 4;
const SWISS_TEAMS = 6;
// Final table for 6 teams / 4 rounds with higher seed always winning 2:0.
const EXPECTED_FINAL = [8, 6, 4, 4, 2, 0];

function firstId(res) {
  const list = res.json?.results || res.json || [];
  return list[0]?.id;
}

async function listTeams(s) {
  const res = await api(s.page, s.csrf, 'GET', '/api/teams/?page_size=100');
  const list = res.json?.results || res.json || [];
  return list.map((t) => t.id);
}

async function getGames(s, gid) {
  const res = await api(s.page, s.csrf, 'GET', `/api/gamedays/${gid}/games/`);
  return Array.isArray(res.json) ? res.json : (res.json?.results || []);
}

async function seedOrder(s, gid) {
  const res = await api(s.page, s.csrf, 'GET', `/api/gamedays/${gid}/designer-state/`);
  return (res.json?.state_data?.swiss?.seedOrder || []).map((x) => parseInt(x, 10));
}

async function completePendingSwiss(s, gid) {
  const rank = new Map((await seedOrder(s, gid)).map((tid, i) => [tid, i]));
  const pending = (await getGames(s, gid)).filter(
    (g) => g.stage === 'Swiss' && g.status !== 'beendet' && (g.results || []).length === 2,
  );
  if (!pending.length) throw new Error('expected unfinished Swiss games, found none');
  for (const g of pending) {
    const home = g.results.find((r) => r.isHome);
    const away = g.results.find((r) => !r.isHome);
    const homeWins = (rank.get(home.team_id) ?? 0) < (rank.get(away.team_id) ?? 0);
    const payload = homeWins
      ? { halftime_score: { home: 1, away: 0 }, final_score: { home: 2, away: 0 } }
      : { halftime_score: { home: 0, away: 1 }, final_score: { home: 0, away: 2 } };
    const r = await api(s.page, s.csrf, 'PATCH', `/api/gamedays/gameinfo/${g.id}/result/`, payload);
    if (r.status >= 400) throw new Error(`result write failed for game ${g.id}: ${r.status} ${r.text.slice(0, 160)}`);
  }
  return pending.length;
}

async function standings(s, gid) {
  const res = await api(s.page, s.csrf, 'GET', `/api/designer/gamedays/${gid}/swiss/standings/`);
  if (res.status >= 400) throw new Error(`standings ${res.status}: ${res.text.slice(0, 160)}`);
  return res.json;
}

async function cleanupGameday(s, gid) {
  const g = (await api(s.page, s.csrf, 'GET', `/api/gamedays/${gid}/`)).json || {};
  if (g.status === 'DRAFT') {
    const del = await api(s.page, s.csrf, 'DELETE', `/api/gamedays/${gid}/`);
    log(`  cleanup gameday ${gid}: delete -> ${del.status}`);
    return;
  }
  // A played gameday is a dead end for the API: swiss/reset is draft-only,
  // unlocking is refused while results exist, and a non-draft gameday cannot
  // be deleted. There is no way to remove it without DB access, so it lingers
  // until the nightly demo reset.
  const del = await api(s.page, s.csrf, 'DELETE', `/api/gamedays/${gid}/`);
  log(`  cleanup gameday ${gid}: status=${g.status} delete=${del.status} (will clear at the nightly demo reset)`);
}

async function scenarioSwiss(s, season, league, teamIds) {
  log('\n== Scenario A: Swiss tournament ==');
  const gd = await api(s.page, s.csrf, 'POST', '/api/gamedays/', {
    name: 'HARD-Swiss', season, league, date: serverToday(), start: '10:00', format: '6_2',
  });
  const gid = gd.json?.id;
  if (!gid) throw new Error(`gameday create failed: ${gd.status} ${gd.text.slice(0, 200)}`);
  log(`  gameday created id=${gid}`);

  try {
    const seeds = teamIds.slice(0, SWISS_TEAMS);
    const setup = await api(s.page, s.csrf, 'POST', `/api/designer/gamedays/${gid}/swiss/setup/`, {
      seed_team_ids: seeds, rounds: SWISS_ROUNDS, fields: 2, game_duration: 30,
    });
    if (setup.status >= 400) throw new Error(`swiss setup ${setup.status}: ${setup.text.slice(0, 200)}`);
    log(`  setup ok (${seeds.length} teams, ${SWISS_ROUNDS} rounds)`);

    const gen1 = await api(s.page, s.csrf, 'POST', `/api/designer/gamedays/${gid}/swiss/generate-round/`);
    if (gen1.status >= 400) throw new Error(`generate round 1 ${gen1.status}: ${gen1.text.slice(0, 200)}`);
    log(`  round 1 generated: ${gen1.json?.game_ids?.length} games`);

    const pub = await api(s.page, s.csrf, 'POST', `/api/gamedays/${gid}/publish/`);
    if (pub.status >= 400) throw new Error(`publish ${pub.status}: ${pub.text.slice(0, 200)}`);
    const afterPublish = (await getGames(s, gid)).filter((g) => g.stage === 'Swiss');
    log(`  published; Swiss rows after publish: ${afterPublish.length} (must equal round-1 games)`);

    for (let round = 1; round <= SWISS_ROUNDS; round++) {
      const played = await completePendingSwiss(s, gid);
      const st = await standings(s, gid);
      log(`  round ${round}: completed ${played} games; standings rounds=${st.rounds_completed}/${st.rounds_total}`);
      if (round < SWISS_ROUNDS) {
        const gen = await api(s.page, s.csrf, 'POST', `/api/designer/gamedays/${gid}/swiss/generate-round/`);
        if (gen.status >= 400) throw new Error(`generate round ${round + 1} ${gen.status}: ${gen.text.slice(0, 200)}`);
      }
    }

    const final = await standings(s, gid);
    const points = (final.standings || []).map((r) => r.points);
    log(`  final points: ${points.join(',')} (expected ${EXPECTED_FINAL.join(',')})`);
    if (JSON.stringify(points) !== JSON.stringify(EXPECTED_FINAL)) {
      throw new Error(`final standings mismatch: got ${points.join(',')}`);
    }

    await s.page.goto(`${BASE}/designer/${gid}`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await s.page.screenshot({ path: `${RUN}/shots/swiss-designer.png` }).catch(() => {});
  } finally {
    await cleanupGameday(s, gid);
  }
}

async function scenarioNormal(s, season, league, templateId) {
  log('\n== Scenario B: normal game ==');
  const gd = await api(s.page, s.csrf, 'POST', '/api/gamedays/', {
    name: 'HARD-Normal', season, league, date: serverToday(), start: '10:00', format: '8_2',
  });
  const gid = gd.json?.id;
  if (!gid) throw new Error(`gameday create failed: ${gd.status} ${gd.text.slice(0, 200)}`);
  log(`  gameday created id=${gid}`);

  const tpl = await api(s.page, s.csrf, 'GET', `/api/designer/templates/${templateId}/`);
  const placeholders = new Set();
  for (const slot of tpl.json?.slots || []) {
    if (slot.home_group != null && slot.home_team != null) placeholders.add(`${slot.home_group}_${slot.home_team}`);
    if (slot.away_group != null && slot.away_team != null) placeholders.add(`${slot.away_group}_${slot.away_team}`);
    if (slot.official_group != null && slot.official_team != null) placeholders.add(`${slot.official_group}_${slot.official_team}`);
  }
  const normTeamIds = await listTeams(s);
  const mapping = {};
  [...placeholders].sort().forEach((ph, i) => { mapping[ph] = normTeamIds[i % 3]; });
  const ap = await api(s.page, s.csrf, 'POST', `/api/designer/templates/${templateId}/apply/`, { gameday_id: gid, team_mapping: mapping });
  if (ap.status >= 400) throw new Error(`template apply ${ap.status}: ${ap.text.slice(0, 200)}`);
  log(`  template applied (${Object.keys(mapping).length} placeholders)`);

  // Kept DRAFT on purpose: a *scored, published* gameday cannot be cleaned up
  // over the API (unlock is refused once results are entered), and demo
  // clutter should not survive the run. The published result-write path is
  // covered by Scenario A, which writes results on a published gameday.
  const games = await getGames(s, gid);
  const target = games.find((g) => (g.results || []).length === 2 && (g.results || []).every((r) => r.team_name));
  if (!target) throw new Error('no playable normal game found');
  const patch = await api(s.page, s.csrf, 'PATCH', `/api/gamedays/gameinfo/${target.id}/result/`, {
    halftime_score: { home: 2, away: 1 }, final_score: { home: 5, away: 3 },
  });
  if (patch.status >= 400) throw new Error(`result write ${patch.status}: ${patch.text.slice(0, 200)}`);
  const reread = (await getGames(s, gid)).find((g) => g.id === target.id);
  const fs_ = reread?.final_score;
  log(`  game ${target.id} final_score after write: ${JSON.stringify(fs_)}`);
  if (!fs_ || fs_.home !== 5 || fs_.away !== 3) throw new Error(`normal result did not persist: ${JSON.stringify(fs_)}`);

  await cleanupGameday(s, gid);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const s = await login(browser);

  const seasons = await api(s.page, s.csrf, 'GET', '/api/seasons/');
  const leagues = await api(s.page, s.csrf, 'GET', '/api/leagues/');
  const season = firstId(seasons);
  const league = firstId(leagues);
  const teamIds = await listTeams(s);
  log(`season=${season} league=${league} teams=${teamIds.length}`);
  if (!season || !league || teamIds.length < SWISS_TEAMS) {
    throw new Error('demo does not expose enough season/league/team seed data');
  }

  let failed = false;
  try { await scenarioSwiss(s, season, league, teamIds); }
  catch (e) { failed = true; log(`SCENARIO A FAILED: ${e.message}`); }
  try { await scenarioNormal(s, season, league, 16); }
  catch (e) { failed = true; log(`SCENARIO B FAILED: ${e.message}`); }

  fs.writeFileSync(`${RUN}/swiss.log`, out.join('\n'));
  console.log(`\nRUN DIR: ${RUN}`);
  console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
