#!/usr/bin/env node

/**
 * E2E Game Lifecycle Test
 *
 * Tests a complete game lifecycle from start to finish:
 * 1. Login to staging environment
 * 2. Fetch game details
 * 3. Record first half events
 * 4. Mark halftime
 * 5. Record second half events
 * 6. Finalize game
 *
 * Usage:
 *   node e2e-game-test.js --gameid=9001 --username=chrisd --password=PASSWORD
 *   node e2e-game-test.js --gameid=9001 (uses defaults)
 *
 * Environment variables (can override args):
 *   TARGET_HOST: Base URL (default: https://stage.leaguesphere.app)
 *   TEST_USERNAME: Login username (default: chrisd)
 *   TEST_PASSWORD: Login password
 *   GAME_ID: Game ID to test
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');
const fs = require('fs');

// Parse command-line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace('--', '').split('=');
  acc[key] = value;
  return acc;
}, {});

// Configuration
const TARGET_HOST = process.env.TARGET_HOST || args.target || 'https://stage.leaguesphere.app';
const TEST_USERNAME = process.env.TEST_USERNAME || args.username || 'chrisd';
const TEST_PASSWORD = process.env.TEST_PASSWORD || args.password;
const GAMEDAY_ID = process.env.GAMEDAY_ID || args.gamedayid;
const GAME_ID = process.env.GAME_ID || args.gameid;

if (!TEST_PASSWORD) {
  console.error('ERROR: Password required. Set TEST_PASSWORD env var or use --password=...');
  process.exit(1);
}

if (!GAMEDAY_ID) {
  console.error('ERROR: Gameday ID required. Set GAMEDAY_ID env var or use --gamedayid=...');
  process.exit(1);
}

if (!GAME_ID) {
  console.error('ERROR: Game ID required. Set GAME_ID env var or use --gameid=...');
  process.exit(1);
}

console.log(`🎮 E2E Game Lifecycle Test`);
console.log(`   Target: ${TARGET_HOST}`);
console.log(`   User: ${TEST_USERNAME}`);
console.log(`   Gameday: ${GAMEDAY_ID}`);
console.log(`   Game: ${GAME_ID}`);
console.log();

// ============================================================================
// HTTP Client Wrapper
// ============================================================================

class HTTPClient {
  constructor(baseURL) {
    this.baseURL = baseURL;
    this.cookies = {};
    this.csrfToken = null;
  }

  parseCookies(setCookieHeader) {
    if (!setCookieHeader) return;
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    cookies.forEach(cookie => {
      const parts = cookie.split(';')[0].split('=');
      if (parts.length === 2) {
        const [name, value] = parts;
        this.cookies[name.trim()] = value.trim();
      }
    });
  }

  getCookieHeader() {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  makeRequest(method, path, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseURL);
      const isHTTPS = url.protocol === 'https:';
      const client = isHTTPS ? https : http;

      const options = {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: {
          'User-Agent': 'E2E-Game-Test/1.0',
          'Accept': 'application/json, text/html',
          'Cookie': this.getCookieHeader(),
          ...headers,
        },
      };

      let body = null;
      if (data) {
        if (headers['Content-Type'] === 'application/x-www-form-urlencoded') {
          // URL-encode form data
          body = Object.entries(data)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        } else {
          body = typeof data === 'string' ? data : JSON.stringify(data);
        }
        options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
        options.headers['Content-Length'] = Buffer.byteLength(body);
      }

      const req = client.request(options, (res) => {
        let responseBody = '';
        res.on('data', chunk => responseBody += chunk);
        res.on('end', () => {
          this.parseCookies(res.headers['set-cookie']);
          resolve({
            status: res.status || res.statusCode,
            headers: res.headers,
            body: responseBody,
            json: () => {
              try {
                return JSON.parse(responseBody);
              } catch {
                return null;
              }
            },
          });
        });
      });

      req.on('error', reject);
      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  async get(path, headers = {}) {
    const start = Date.now();
    const res = await this.makeRequest('GET', path, null, headers);
    const duration = Date.now() - start;
    return { ...res, duration };
  }

  async post(path, data, headers = {}) {
    const start = Date.now();
    const csrfToken = this.cookies.csrftoken || this.csrfToken || '';
    const res = await this.makeRequest('POST', path, data, {
      'X-Csrftoken': csrfToken,
      ...headers,
    });
    const duration = Date.now() - start;
    return { ...res, duration };
  }

  async put(path, data, headers = {}) {
    const start = Date.now();
    const csrfToken = this.cookies.csrftoken || this.csrfToken || '';
    const res = await this.makeRequest('PUT', path, data, {
      'X-Csrftoken': csrfToken,
      ...headers,
    });
    const duration = Date.now() - start;
    return { ...res, duration };
  }

  async patch(path, data, headers = {}) {
    const start = Date.now();
    const res = await this.makeRequest('PATCH', path, data, headers);
    const duration = Date.now() - start;
    return { ...res, duration };
  }
}

// ============================================================================
// Test Suite
// ============================================================================

class GameLifecycleTest {
  constructor(client, gameId) {
    this.client = client;
    this.gameId = gameId;
    this.results = [];
    this.gameData = null;
    this.homeTeam = null;
    this.awayTeam = null;
  }

  log(step, status, message, details = {}) {
    const result = { step, status, message, details, timestamp: new Date().toISOString() };
    this.results.push(result);
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : 'ℹ️';
    console.log(`${icon} ${step}: ${message}`);
    if (Object.keys(details).length > 0) {
      console.log(`   ${JSON.stringify(details)}`);
    }
  }

  async step(name, fn) {
    try {
      console.log(`\n[${name}]`);
      await fn.call(this);
    } catch (err) {
      this.log(name, 'FAIL', err.message, { stack: err.stack });
      throw err;
    }
  }

  async run() {
    try {
      await this.step('Login', this.login);
      await this.step('Fetch Game Details', this.fetchGameDetails);
      await this.step('Record First Half Events', this.recordFirstHalf);
      await this.step('Mark Halftime', this.markHalftime);
      await this.step('Record Second Half Events', this.recordSecondHalf);
      await this.step('Finalize Game', this.finalizeGame);

      this.logSummary();
      return { success: true, results: this.results };
    } catch (err) {
      console.error(`\n❌ Test failed: ${err.message}`);
      this.logSummary();
      return { success: false, results: this.results, error: err.message };
    }
  }

  async login() {
    // GET login page to extract CSRF token
    const loginPageRes = await this.client.get('/login/');
    if (loginPageRes.status !== 200) {
      this.log('Login', 'FAIL', `Failed to fetch login page: ${loginPageRes.status}`);
      throw new Error('Login page fetch failed');
    }

    // Extract CSRF token from HTML
    const csrfMatch = loginPageRes.body.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/);
    if (!csrfMatch) {
      this.log('Login', 'FAIL', 'CSRF token not found in login page');
      throw new Error('CSRF token not found');
    }

    this.client.csrfToken = csrfMatch[1];
    this.log('Login', 'INFO', 'CSRF token extracted', { token: this.client.csrfToken.substring(0, 10) + '...' });

    // POST login with form-encoded data
    const loginRes = await this.client.post('/login/', {
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
      csrfmiddlewaretoken: this.client.csrfToken,
    }, {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': `${this.client.baseURL}/login/`,
    });

    if (loginRes.status !== 200 && loginRes.status !== 302) {
      this.log('Login', 'FAIL', `Login failed: ${loginRes.status}`, { body: loginRes.body.substring(0, 200) });
      throw new Error(`Login failed with status ${loginRes.status}`);
    }

    this.log('Login', 'PASS', `Logged in as ${TEST_USERNAME}`, { cookies: Object.keys(this.client.cookies).join(', ') });
  }

  async fetchGameDetails() {
    // Fetch games from the gameday
    const res = await this.client.get(`/api/gamedays/${GAMEDAY_ID}/games/`);
    if (res.status !== 200) {
      this.log('Fetch Games', 'FAIL', `Failed to fetch games: ${res.status}`, { body: res.body.substring(0, 200) });
      throw new Error(`Games fetch failed with status ${res.status}`);
    }

    const gamesList = res.json();
    if (!Array.isArray(gamesList)) {
      this.log('Fetch Games', 'FAIL', 'Failed to parse games response');
      throw new Error('Games response parsing failed');
    }

    // Find our specific game
    this.gameData = gamesList.find(g => g.id === parseInt(this.gameId));
    if (!this.gameData) {
      this.log('Fetch Game', 'FAIL', `Game ${this.gameId} not found in gameday ${GAMEDAY_ID}`);
      throw new Error(`Game ${this.gameId} not found`);
    }

    // Extract team names from results
    const homeResult = this.gameData.results?.find(r => r.isHome);
    const awayResult = this.gameData.results?.find(r => !r.isHome);

    this.homeTeam = homeResult?.team_name;
    this.awayTeam = awayResult?.team_name;

    this.log('Fetch Game', 'PASS', `Fetched game ${this.gameId}`, {
      home_team: this.homeTeam,
      away_team: this.awayTeam,
      status: this.gameData.status,
      scheduled: this.gameData.scheduled,
    });
  }

  async recordFirstHalf() {
    const events = [
      { gameId: parseInt(this.gameId), team: this.homeTeam, event: 'Goal', half: 'FH' },
      { gameId: parseInt(this.gameId), team: this.awayTeam, event: 'Goal', half: 'FH' },
      { gameId: parseInt(this.gameId), team: this.homeTeam, event: 'Goal', half: 'FH' },
    ];

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const res = await this.client.post(`/api/gamelog/${this.gameId}`, event);

      if (res.status !== 201 && res.status !== 200) {
        this.log(`FH Event ${i + 1}`, 'FAIL', `Event recording failed: ${res.status}`, {
          event,
          body: res.body.substring(0, 300),
        });
        throw new Error(`Event recording failed with status ${res.status}`);
      }

      this.log(`FH Event ${i + 1}`, 'PASS', `Recorded: ${event.team} - ${event.event}`, {
        status: res.status,
        duration: `${res.duration}ms`,
      });

      // Realistic spacing between events
      await this.sleep(1000 + Math.random() * 2000);
    }
  }

  async markHalftime() {
    const res = await this.client.put(`/api/game/${this.gameId}/halftime`, {});
    if (res.status !== 200) {
      this.log('Halftime', 'FAIL', `Halftime marking failed: ${res.status}`, { body: res.body.substring(0, 300) });
      throw new Error(`Halftime marking failed with status ${res.status}`);
    }

    this.log('Halftime', 'PASS', 'Halftime marked', { status: res.status });
    await this.sleep(2000); // Halftime break
  }

  async recordSecondHalf() {
    const events = [
      { gameId: parseInt(this.gameId), team: this.homeTeam, event: 'Goal', half: 'SH' },
      { gameId: parseInt(this.gameId), team: this.awayTeam, event: 'Goal', half: 'SH' },
      { gameId: parseInt(this.gameId), team: this.awayTeam, event: 'Goal', half: 'SH' },
    ];

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const res = await this.client.post(`/api/gamelog/${this.gameId}`, event);

      if (res.status !== 201 && res.status !== 200) {
        this.log(`SH Event ${i + 1}`, 'FAIL', `Event recording failed: ${res.status}`, {
          event,
          body: res.body.substring(0, 300),
        });
        throw new Error(`Event recording failed with status ${res.status}`);
      }

      this.log(`SH Event ${i + 1}`, 'PASS', `Recorded: ${event.team} - ${event.event}`, {
        status: res.status,
        duration: `${res.duration}ms`,
      });

      await this.sleep(1000 + Math.random() * 2000);
    }
  }

  async finalizeGame() {
    const res = await this.client.put(`/api/game/${this.gameId}/finalize`, {
      note: 'Game completed by e2e test',
      hasFinalScoreChanged: false
    });

    if (res.status !== 200) {
      this.log('Finalize', 'FAIL', `Game finalization failed: ${res.status}`, { body: res.body.substring(0, 300) });
      throw new Error(`Game finalization failed with status ${res.status}`);
    }

    this.log('Finalize', 'PASS', 'Game finalized', { status: res.status });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  logSummary() {
    console.log('\n' + '='.repeat(70));
    console.log('TEST SUMMARY');
    console.log('='.repeat(70));

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const info = this.results.filter(r => r.status === 'INFO').length;

    console.log(`Total Steps: ${this.results.length}`);
    console.log(`  ✅ Passed: ${passed}`);
    console.log(`  ❌ Failed: ${failed}`);
    console.log(`  ℹ️  Info: ${info}`);
    console.log();

    // Save results to file
    const resultsFile = `/tmp/e2e-game-test-${this.gameId}-${Date.now()}.json`;
    fs.writeFileSync(resultsFile, JSON.stringify(this.results, null, 2));
    console.log(`📝 Results saved to: ${resultsFile}`);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const client = new HTTPClient(TARGET_HOST);
  const test = new GameLifecycleTest(client, GAME_ID);
  const result = await test.run();
  process.exit(result.success ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
