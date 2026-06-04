#!/usr/bin/env node

const https = require('https');
const { URL } = require('url');

const TARGET = 'https://stage.leaguesphere.app/gamedays/';
const USERNAME = 'chrisd';
const PASSWORD = process.argv[2];

if (!PASSWORD) {
  console.error('Usage: node step1-find-game.js PASSWORD');
  process.exit(1);
}

function request(method, path, data = null, cookies = {}, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, TARGET);
    const opts = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
        ...headers,
      },
    };

    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const newCookies = {};
        (res.headers['set-cookie'] || []).forEach(c => {
          const [name, val] = c.split(';')[0].split('=');
          newCookies[name.trim()] = val.trim();
        });
        resolve({ status: res.statusCode, body, cookies: newCookies });
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function main() {
  let cookies = {};

  // Login
  console.log('Logging in...');
  const login1 = await request('GET', '/login/', null, cookies);
  const csrf = login1.body.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/)[1];
  Object.assign(cookies, login1.cookies);

  const loginData = `username=${USERNAME}&password=${PASSWORD}&csrfmiddlewaretoken=${csrf}`;
  const login2 = await request('POST', '/login/', loginData, cookies, {
    'Content-Type': 'application/x-www-form-urlencoded',
  });
  Object.assign(cookies, login2.cookies);
  console.log('✓ Logged in\n');

  // Get gamedays
  console.log('Fetching gamedays...');
  const res = await request('GET', '/api/gamedays/?status=PUBLISHED&limit=100', null, cookies);
  const data = JSON.parse(res.body);

  const today = new Date().toISOString().split('T')[0];
  console.log(`Today: ${today}\n`);

  // Find gameday NOT from today with games
  for (const gd of data.results) {
    if (gd.date === today) continue; // Skip today

    const gamesRes = await request('GET', `/api/gamedays/${gd.id}/games/`, null, cookies);
    const games = JSON.parse(gamesRes.body);

    if (Array.isArray(games) && games.length > 0) {
      const game = games[0];
      console.log('Found:');
      console.log(`  Gameday: ${gd.name}`);
      console.log(`  Date: ${gd.date}`);
      console.log(`  Game ID: ${game.id}`);
      console.log(`  Teams: ${game.results[0].team_name} vs ${game.results[1].team_name}`);
      console.log(`  Status: ${game.status}`);
      return;
    }
  }

  console.log('No gamedays found');
}

main().catch(err => console.error('Error:', err.message));
