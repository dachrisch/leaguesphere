// tests/load/load-test-helpers/gameday-discovery.js

import http from 'k6/http';
import { check, fail } from 'k6';

const BASE_URL = __ENV.TARGET_HOST || 'https://stage.leaguesphere.app';

export function findGamedaysWithUnplayedGames(token, limit = 20) {
  /**
   * Find PUBLISHED gamedays that have at least 1 game with status != COMPLETED
   *
   * @param {string} token - Authentication token
   * @param {number} limit - Max gamedays to query
   * @returns {Array} Array of gameday objects {id, name, date, start, season, league}
   */
  const res = http.get(
    `${BASE_URL}/api/gamedays/?status=PUBLISHED&page_size=${limit}`,
    {
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  check(res, {
    'gamedays list fetch succeeds': (r) => r.status === 200,
  }) || fail(`Failed to fetch gamedays: ${res.status} ${res.body}`);

  const data = res.json('results');
  return data || [];
}

export function fetchGamedayGames(gamedayId, token) {
  /**
   * Fetch all games for a gameday
   *
   * @param {number} gamedayId - Gameday ID
   * @param {string} token - Authentication token
   * @returns {Array} Array of game objects {id, field, scheduled, status, gameStarted, gameFinished}
   */
  const res = http.get(
    `${BASE_URL}/api/gamedays/${gamedayId}/games/`,
    {
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  check(res, {
    'gameday games fetch succeeds': (r) => r.status === 200,
  }) || fail(`Failed to fetch games for gameday ${gamedayId}: ${res.status}`);

  return res.json() || [];
}

export function hasUnplayedGames(games) {
  /**
   * Check if game array has at least 1 game that hasn't been completed
   *
   * @param {Array} games - Array of game objects
   * @returns {boolean} True if at least 1 game has status != COMPLETED
   */
  return games.some((game) => game.status !== 'COMPLETED');
}

export function updateGamedayDateToToday(gamedayId, token) {
  /**
   * Update gameday date to today (required: games can only be scored on today's gameday)
   *
   * @param {number} gamedayId - Gameday ID
   * @param {string} token - Authentication token
   * @returns {Object} Updated gameday object
   */
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

  const res = http.put(
    `${BASE_URL}/api/gamedays/${gamedayId}/`,
    JSON.stringify({
      date: dateStr,
      status: 'PUBLISHED',
    }),
    {
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  check(res, {
    'gameday date update succeeds': (r) => r.status === 200,
  }) || fail(`Failed to update gameday ${gamedayId} date: ${res.status} ${res.body}`);

  return res.json() || {};
}

export function prepareGamedayForTest(gameday, token, maxGamedaysToTest = 5) {
  /**
   * Prepare a single gameday for test:
   * 1. Fetch its games
   * 2. Check if it has unplayed games
   * 3. Update date to today
   * 4. Return prepared object with game list
   *
   * @param {Object} gameday - Gameday object from API
   * @param {string} token - Authentication token
   * @param {number} maxGamedaysToTest - Limit for testing (unused here, for future scaling)
   * @returns {Object|null} Prepared gameday object or null if no unplayed games
   */
  // Fetch games for this gameday
  const games = fetchGamedayGames(gameday.id, token);

  // Check if it has unplayed games
  if (!hasUnplayedGames(games)) {
    console.log(`  Gameday ${gameday.id} has no unplayed games, skipping`);
    return null;
  }

  // Update date to today
  updateGamedayDateToToday(gameday.id, token);

  // Return prepared object
  return {
    id: gameday.id,
    name: gameday.name,
    date: new Date().toISOString().split('T')[0],
    start: gameday.start || '18:00',
    status: 'PUBLISHED',
    season: gameday.season,
    league: gameday.league,
    games_count: games.length,
    games: games.map((g) => ({
      id: g.id,
      field: g.field || 'unknown',
      scheduled: g.scheduled || 'unknown',
      status: g.status || 'PUBLISHED',
    })),
  };
}
