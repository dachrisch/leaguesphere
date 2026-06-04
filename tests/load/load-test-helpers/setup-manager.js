// tests/load/load-test-helpers/setup-manager.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { fail } from 'k6';

const BASE_URL = __ENV.TARGET_HOST || 'https://stage.leaguesphere.app';

export function fetchPublishedGamedays(cookies, limit = 10) {
  /**
   * Fetch list of published gamedays from API
   * @param {Object} cookies - Authenticated session cookies
   * @param {number} limit - Max gamedays to fetch
   * @returns {Array} Array of gameday objects
   */
  const res = http.get(
    `${BASE_URL}/api/gamedays/?status=PUBLISHED&page_size=${limit}`,
    { cookies: cookies }
  );

  check(res, {
    'gamedays list fetches': (r) => r.status === 200,
  }) || fail(`Failed to fetch gamedays: ${res.status}`);

  const data = res.json('results');
  return data || [];
}

export function fetchGamedayDetail(gameday_id, cookies) {
  /**
   * Fetch detailed gameday info including all games
   * @param {number} gameday_id - Gameday ID
   * @param {Object} cookies - Authenticated session cookies
   * @returns {Object} Gameday detail with games array
   */
  const res = http.get(
    `${BASE_URL}/api/gamedays/${gameday_id}/`,
    { cookies: cookies }
  );

  check(res, {
    'gameday detail fetches': (r) => r.status === 200,
  }) || fail(`Failed to fetch gameday ${gameday_id}: ${res.status}`);

  return res.json();
}

export function fetchGamedayGames(gameday_id, cookies) {
  /**
   * Fetch all games for a gameday
   * @param {number} gameday_id - Gameday ID
   * @param {Object} cookies - Authenticated session cookies
   * @returns {Array} Array of game objects with team info
   */
  const res = http.get(
    `${BASE_URL}/api/gamedays/${gameday_id}/games/`,
    { cookies: cookies }
  );

  check(res, {
    'gameday games fetch': (r) => r.status === 200,
  }) || fail(`Failed to fetch games for gameday ${gameday_id}: ${res.status}`);

  return res.json() || [];
}

export function updateGamedayDateToToday(gameday_id, cookies, csrfToken) {
  /**
   * Update gameday date to today (for fresh test data)
   * @param {number} gameday_id - Gameday ID
   * @param {Object} cookies - Authenticated session cookies
   * @param {string} csrfToken - CSRF token
   * @returns {Object} Updated gameday object
   */
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

  const res = http.put(
    `${BASE_URL}/api/gamedays/${gameday_id}/`,
    JSON.stringify({
      date: dateStr,
      status: 'PUBLISHED',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrfToken,
      },
      cookies: cookies,
    }
  );

  check(res, {
    'gameday date updated': (r) => r.status === 200,
  }) || fail(`Failed to update gameday ${gameday_id}: ${res.status}`);

  return res.json();
}

export function prepareGamedaysForTest(gamedays, cookies, csrfToken, maxGamedays = 5) {
  /**
   * Prepare gamedays for test by:
   * 1. Selecting first N published gamedays
   * 2. Changing date to today
   * 3. Fetching all games for each
   * 4. Assigning performers and spectators
   *
   * @param {Array} gamedays - List of published gamedays
   * @param {Object} cookies - Authenticated session cookies
   * @param {string} csrfToken - CSRF token
   * @param {number} maxGamedays - Max gamedays to use (5-10 recommended)
   * @returns {Array} Prepared gameday objects with game lists and assignments
   */
  const prepared = [];

  for (let i = 0; i < Math.min(gamedays.length, maxGamedays); i++) {
    const gameday = gamedays[i];
    console.log(`Preparing gameday ${i + 1}/${maxGamedays}: ${gameday.id}`);

    // Update date to today
    updateGamedayDateToToday(gameday.id, cookies, csrfToken);
    sleep(0.5);

    // Fetch detailed games list
    const games = fetchGamedayGames(gameday.id, cookies);
    sleep(0.5);

    // Prepare gameday object with games
    prepared.push({
      id: gameday.id,
      name: gameday.name,
      games_count: games.length,
      games: games.map((g) => ({
        id: g.id,
        home: g.gameinfo ? (g.gameresult_set ? g.gameresult_set.find((gr) => gr.isHome)?.team?.name : '') : '',
        away: g.gameinfo ? (g.gameresult_set ? g.gameresult_set.find((gr) => !gr.isHome)?.team?.name : '') : '',
        field: g.field || 'unknown',
        scheduled: g.scheduled || 'unknown',
      })),
      assigned_performer: `performer_${i % 10}`,
      assigned_spectators: Array.from({ length: Math.min(3, 10) }, (_, j) => `spectator_${gameday.id}_${j}`),
    });
  }

  return prepared;
}
