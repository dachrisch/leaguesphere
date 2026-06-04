#!/usr/bin/env node

/**
 * Setup Gameday for Today
 *
 * Finds a published gameday and changes its date to TODAY
 * so the e2e test can work with it.
 *
 * Usage:
 *   node setup-gameday-for-today.js --password=PASSWORD
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

function makeRequest(method, path, data = null, cookies = {}, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, TARGET_HOST);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'User-Agent': 'setup-gameday/1.0',
        'Accept': 'application/json',
        'Cookie': Object.entries(cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join('; '),
        ...headers,
      },
    };

    let body = null;
    if (data) {
      if (headers['Content-Type'] === 'application/x-www-form-urlencoded') {
        body = Object.entries(data)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&');
      } else {
        body = typeof data === 'string' ? data : JSON.stringify(data);
      }
      options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
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
        resolve({ status: res.statusCode, body: responseBody, cookies: newCookies });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  console.log('🔧 Setting up gameday for TODAY\n');

  // Login
  console.log('1️⃣  Logging in as ' + TEST_USERNAME);
  let cookies = {};

  const loginPageRes = await makeRequest('GET', '/login/', null, cookies);
  const csrfMatch = loginPageRes.body.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/);
  if (!csrfMatch) {
    console.error('❌ Failed to extract CSRF token');
    process.exit(1);
  }

  Object.assign(cookies, loginPageRes.cookies);
  const csrfToken = csrfMatch[1];

  const loginRes = await makeRequest('POST', '/login/', {
    username: TEST_USERNAME,
    password: TEST_PASSWORD,
    csrfmiddlewaretoken: csrfToken,
  }, cookies);

  Object.assign(cookies, loginRes.cookies);
  console.log('✅ Logged in\n');

  // Get today's date
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  console.log(`2️⃣  Today's date: ${todayStr}\n`);

  // Fetch published gamedays
  console.log('3️⃣  Fetching published gamedays...');
  const gamedaysRes = await makeRequest('GET', '/api/gamedays/?status=PUBLISHED&limit=50', null, cookies);

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

  // Find first gameday with games
  let selectedGameday = null;
  let gameCount = 0;

  for (const gameday of gamedaysData.results) {
    const gamesRes = await makeRequest('GET', `/api/gamedays/${gameday.id}/games/`, null, cookies);
    let games;
    try {
      games = JSON.parse(gamesRes.body);
    } catch {
      continue;
    }

    if (Array.isArray(games) && games.length > 0) {
      selectedGameday = gameday;
      gameCount = games.length;
      break;
    }
  }

  if (!selectedGameday) {
    console.error('❌ No gamedays with games found');
    process.exit(1);
  }

  console.log(`✅ Found gameday: ${selectedGameday.name}`);
  console.log(`   Current date: ${selectedGameday.date}`);
  console.log(`   Games: ${gameCount}\n`);

  // Update gameday date to today
  console.log(`4️⃣  Updating gameday date to today (${todayStr})...`);

  const csrfCookie = cookies.csrftoken || csrfToken;
  const updateRes = await makeRequest('PUT', `/api/gamedays/${selectedGameday.id}/`, {
    date: todayStr,
    name: selectedGameday.name,
    status: 'PUBLISHED',
    season: selectedGameday.season,
    league: selectedGameday.league,
    start: selectedGameday.start,
    format: selectedGameday.format,
    address: selectedGameday.address,
  }, {
    ...cookies,
    'X-Csrftoken': csrfCookie,
  });

  if (updateRes.status !== 200) {
    console.error(`❌ Failed to update gameday: ${updateRes.status}`);
    console.error(updateRes.body.substring(0, 500));
    process.exit(1);
  }

  console.log('✅ Gameday date updated to today\n');

  console.log('━'.repeat(70));
  console.log(`\n✨ Setup complete! Games are now available for TODAY.\n`);
  console.log(`Gameday ID: ${selectedGameday.id}`);
  console.log(`Games available: ${gameCount}\n`);
  console.log(`🚀 Next: Run the e2e test:\n`);
  console.log(`   node e2e-game-test.js --gameid=<GAME_ID> --gamedayid=${selectedGameday.id} --password=YOUR_PASSWORD\n`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
