#!/usr/bin/env node

/**
 * Find Available Gamedays & Games on Stage
 *
 * Workflow:
 * 1. Fetch all published gamedays
 * 2. Find one that's not finished (status != "beendet")
 * 3. Get games from that gameday
 * 4. Suggest a game to test
 *
 * Usage:
 *   node find-game-id.js --password=PASSWORD
 */

const https = require('https');
const { URL } = require('url');

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace('--', '').split('=');
  acc[key] = value;
  return acc;
}, {});

const TARGET_HOST = 'https://stage.leaguesphere.app';
const TEST_USERNAME = args.username || 'chrisd';
const TEST_PASSWORD = args.password;

if (!TEST_PASSWORD) {
  console.error('ERROR: Password required. Use --password=YOUR_PASSWORD');
  process.exit(1);
}

function makeRequest(method, path, data = null, cookies = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, TARGET_HOST);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'User-Agent': 'find-game-id/1.0',
        'Cookie': Object.entries(cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join('; '),
      },
    };

    if (data) {
      const body = JSON.stringify(data);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const newCookies = {};
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
          (Array.isArray(setCookie) ? setCookie : [setCookie]).forEach(cookie => {
            const parts = cookie.split(';')[0].split('=');
            if (parts.length === 2) {
              newCookies[parts[0].trim()] = parts[1].trim();
            }
          });
        }
        resolve({ status: res.statusCode, body, cookies: newCookies });
      });
    });

    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function main() {
  console.log('🔍 Finding available gamedays on stage...\n');

  // Login
  console.log('1️⃣  Logging in as ' + TEST_USERNAME);
  let cookies = {};

  // Get CSRF token
  const loginPageRes = await makeRequest('GET', '/login/', null, cookies);
  const csrfMatch = loginPageRes.body.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/);
  if (!csrfMatch) {
    console.error('❌ Failed to extract CSRF token');
    process.exit(1);
  }

  Object.assign(cookies, loginPageRes.cookies);
  const csrfToken = csrfMatch[1];

  // POST login
  const loginRes = await makeRequest('POST', '/login/', {
    username: TEST_USERNAME,
    password: TEST_PASSWORD,
    csrfmiddlewaretoken: csrfToken,
  }, cookies);

  Object.assign(cookies, loginRes.cookies);
  console.log('✅ Logged in\n');

  // Fetch published gamedays
  console.log('2️⃣  Fetching published gamedays...');
  const gamedaysRes = await makeRequest('GET', '/api/gamedays/?status=PUBLISHED', null, cookies);

  let gamedaysData;
  try {
    gamedaysData = JSON.parse(gamedaysRes.body);
  } catch {
    console.error('❌ Failed to parse gamedays response');
    process.exit(1);
  }

  if (!gamedaysData.results || gamedaysData.results.length === 0) {
    console.error('❌ No published gamedays found');
    process.exit(1);
  }

  console.log(`✅ Found ${gamedaysData.results.length} published gameday(s)\n`);

  // Find first gameday with fresh games (Geplant status, no events yet)
  let selectedGameday = null;
  let gamesData = null;

  console.log('3️⃣  Looking for a gameday with fresh games (Geplant)...');
  for (const gameday of gamedaysData.results) {
    // Skip if gameday is finished
    if (gameday.status === 'beendet') continue;

    const gamesRes = await makeRequest('GET', `/api/gamedays/${gameday.id}/games/`, null, cookies);
    let games;
    try {
      games = JSON.parse(gamesRes.body);
    } catch {
      continue;
    }

    // Find games that are ready (Geplant) with no events recorded
    const freshGames = Array.isArray(games)
      ? games.filter(g => g.status === 'Geplant' && (!g.gameStarted || g.gameStarted === null))
      : [];

    if (freshGames.length > 0) {
      selectedGameday = gameday;
      gamesData = freshGames;
      break;
    }
  }

  if (!selectedGameday || !gamesData) {
    console.error('❌ No non-finished gamedays with games found');
    process.exit(1);
  }

  console.log(`✅ Found gameday: ${selectedGameday.name}`);
  console.log(`   Date: ${selectedGameday.date}`);
  console.log(`   Status: ${selectedGameday.status}\n`);

  console.log(`4️⃣  Games in this gameday: ${gamesData.length}\n`);

  // Display games
  console.log('📋 Available Games:');
  console.log('─'.repeat(80));
  gamesData.slice(0, 5).forEach((game, i) => {
    const home = game.results?.find(r => r.isHome);
    const away = game.results?.find(r => !r.isHome);
    console.log(`\n${i + 1}. Game ID: ${game.id}`);
    console.log(`   ${home?.team_name || 'Home'} vs ${away?.team_name || 'Away'}`);
    console.log(`   Time: ${game.scheduled}, Field: ${game.field}`);
    console.log(`   Status: ${game.status}`);
  });

  if (gamesData.length > 5) {
    console.log(`\n... and ${gamesData.length - 5} more game(s)`);
  }

  console.log('\n' + '─'.repeat(80));
  console.log('\n🚀 Run E2E Test:');
  const gameId = gamesData[0].id;
  const gamedayId = selectedGameday.id;
  console.log(`   node e2e-game-test.js --gameid=${gameId} --gamedayid=${gamedayId} --password=YOUR_PASSWORD\n`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
