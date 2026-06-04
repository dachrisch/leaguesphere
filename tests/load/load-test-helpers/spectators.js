// tests/load/load-test-helpers/spectators.js

import http from 'k6/http';
import { check, sleep, fail } from 'k6';

const BASE_URL = __ENV.TARGET_HOST || 'https://stage.leaguesphere.app';

const ENDPOINTS = [
  '/leaguetable/dffl/',
  '/api/gamedays/',
  '/officials/team/all/list/',
];

export function viewGamedayDetail(gameday_id, token) {
  /**
   * GET /api/gamedays/{gameday_id}/ - View gameday overview
   * @param {number} gameday_id - Gameday ID
   * @param {string} token - Authentication token
   * @returns {Object} Response
   */
  const res = http.get(
    `${BASE_URL}/api/gamedays/${gameday_id}/`,
    { headers: { Authorization: `Token ${token}` } }
  );

  if (res.status >= 400) {
    fail(`Gameday view failed: ${res.status} - ${res.body}`);
  }
  check(res, {
    'gameday view succeeds': (r) => r.status === 200,
  });

  return res;
}

export function viewGameLog(game_id, token) {
  /**
   * GET /api/gamelog/{game_id} - View live game scores
   * @param {number} game_id - Game ID
   * @param {string} token - Authentication token
   * @returns {Object} Response with current game state
   */
  const res = http.get(
    `${BASE_URL}/api/gamelog/${game_id}`,
    { headers: { Authorization: `Token ${token}` } }
  );

  if (res.status >= 400) {
    fail(`Game log view failed: ${res.status} - ${res.body}`);
  }
  check(res, {
    'game log view succeeds': (r) => r.status === 200,
  });

  return res;
}

export function viewLeagueTable(token) {
  /**
   * GET /leaguetable/dffl/ - View league standings
   * @param {string} token - Authentication token
   * @returns {Object} Response
   */
  const res = http.get(
    `${BASE_URL}/leaguetable/dffl/`,
    { headers: { Authorization: `Token ${token}` } }
  );

  if (res.status >= 400) {
    fail(`League table view failed: ${res.status} - ${res.body}`);
  }
  check(res, {
    'league table view succeeds': (r) => r.status === 200,
  });

  return res;
}

export function browseRandomEndpoint(token) {
  /**
   * Randomly browse one of the public endpoints (wandering behavior)
   * @param {string} token - Authentication token
   */
  const endpoint = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
  const res = http.get(`${BASE_URL}${endpoint}`, { headers: { Authorization: `Token ${token}` } });

  if (res.status >= 500) {
    fail(`Browse failed: ${res.status} - ${res.body}`);
  }
  check(res, {
    'browse succeeds': (r) => r.status === 200 || r.status === 404,
  });

  return res;
}

export function spectatorWatchGame(gameday_id, gameIds, token, waveArrivalTime) {
  /**
   * Simulate a spectator watching a game:
   * 1. Arrive at waveArrivalTime (min offset)
   * 2. View gameday overview
   * 3. Poll game logs every 2-3s
   * 4. Occasionally wander to other endpoints (20% of time)
   * 5. Continue for 5-10 minutes
   *
   * @param {number} gameday_id - Gameday ID
   * @param {Array} gameIds - Array of game IDs to watch
   * @param {string} token - Authentication token
   * @param {number} waveArrivalTime - Minutes into test before arriving (5, 10, 20)
   */
  // Arrive at wave time
  sleep(waveArrivalTime * 60);

  // View gameday overview
  viewGamedayDetail(gameday_id, token);
  sleep(1);

  // Poll games for 5-10 minutes (300-600 seconds)
  const pollDuration = 300 + Math.random() * 300;
  const pollIntervals = [];

  for (let t = 0; t < pollDuration; t += 2 + Math.random() * 2) {
    pollIntervals.push(t);
  }

  let pollCount = 0;
  for (const t of pollIntervals) {
    // 20% chance to wander
    if (Math.random() < 0.2) {
      browseRandomEndpoint(token);
    } else {
      // Poll a random game from the gameday
      const gameId = gameIds[Math.floor(Math.random() * gameIds.length)];
      viewGameLog(gameId, token);
      pollCount++;
    }

    sleep(0.5 + Math.random() * 1);
  }

  // Final view of league table
  viewLeagueTable(token);
  console.log(`    └─ Spectator polling complete: ${pollCount} game polls over ${Math.round(pollDuration / 60)}min`);
}
