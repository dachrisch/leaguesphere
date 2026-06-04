// tests/load/load-test-helpers/performers.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { fail } from 'k6';

const BASE_URL = __ENV.TARGET_HOST || 'https://stage.leaguesphere.app';

export function setupGame(game_id, token, csrfToken, homeTeamName) {
  /**
   * PUT /api/game/{game_id}/setup - Initialize game state
   * @param {number} game_id - Game ID
   * @param {string} token - Authentication token
   * @param {string} csrfToken - CSRF token
   * @param {string} homeTeamName - Home team name
   * @returns {Object} Response data
   */
  const res = http.put(
    `${BASE_URL}/api/game/${game_id}/setup`,
    JSON.stringify({
      gameinfo: game_id,
      ctResult: 'Gewonnen',
      fhPossession: homeTeamName,
      direction: 'directionLeft',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${token}`,
      },
    }
  );

  if (res.status >= 400) {
    fail(`Game setup failed: ${res.status} - ${res.body}`);
  }
  console.log(`       └─ setupGame response: status=${res.status}, body length=${res.body.length}`);
  check(res, {
    'game setup succeeds': (r) => r.status === 200,
  }) || fail(`Game setup failed: ${res.status} - ${res.body}`);

  if (!res.body || res.body.length === 0) {
    return {};
  }
  return res.json();
}

export function setOfficials(game_id, token, csrfToken) {
  /**
   * PUT /api/game/{game_id}/officials - Set 5 officials
   * @param {number} game_id - Game ID
   * @param {string} token - Authentication token
   * @param {string} csrfToken - CSRF token
   * @returns {Object} Response data
   */
  const res = http.put(
    `${BASE_URL}/api/game/${game_id}/officials`,
    JSON.stringify([
      { name: '', position: 'Referee', official: null },
      { name: '', position: 'Scorecard Judge', official: null },
      { name: '', position: 'Down Judge', official: null },
      { name: '', position: 'Field Judge', official: null },
      { name: '', position: 'Side Judge', official: null },
    ]),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${token}`,
      },
    }
  );

  if (res.status >= 400) {
    fail(`Set officials failed: ${res.status} - ${res.body}`);
  }
  console.log(`       └─ setOfficials response: status=${res.status}, body length=${res.body.length}`);
  check(res, {
    'officials set succeeds': (r) => r.status === 200,
  }) || fail(`Set officials failed: ${res.status}`);

  if (!res.body || res.body.length === 0) {
    return {};
  }
  return res.json();
}

export function setPossession(game_id, teamName, token, csrfToken) {
  /**
   * PUT /api/game/{game_id}/possession - Set team with possession
   * @param {number} game_id - Game ID
   * @param {string} teamName - Team name
   * @param {string} token - Authentication token
   * @param {string} csrfToken - CSRF token
   * @returns {Object} Response data
   */
  const res = http.put(
    `${BASE_URL}/api/game/${game_id}/possession`,
    JSON.stringify({ team: teamName }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${token}`,
      },
    }
  );

  if (res.status >= 400) {
    fail(`Set possession failed: ${res.status} - ${res.body}`);
  }

  // Debug: log response details
  console.log(`       └─ setPossession response: status=${res.status}, body length=${res.body.length}, body="${res.body.substring(0, 100)}"`);

  check(res, {
    'possession set succeeds': (r) => r.status === 200,
  }) || fail(`Set possession failed: ${res.status}`);

  // Return empty object if no body (API returning 200 with empty body)
  if (!res.body || res.body.length === 0) {
    return {};
  }
  return res.json();
}

export function recordEvent(game_id, teamName, eventName, half, token, csrfToken) {
  /**
   * POST /api/gamelog/{game_id} - Record a game event
   * @param {number} game_id - Game ID
   * @param {string} teamName - Team name
   * @param {string} eventName - Event type (Touchdown, Safety, etc.)
   * @param {number} half - Half (1 or 2)
   * @param {string} token - Authentication token
   * @param {string} csrfToken - CSRF token
   * @returns {Object} Response data (updated gamelog)
   */
  const res = http.post(
    `${BASE_URL}/api/gamelog/${game_id}`,
    JSON.stringify({
      gameId: game_id,
      team: teamName,
      half: half,
      event: [{ name: eventName, player: '1' }],
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${token}`,
      },
    }
  );

  if (res.status >= 400) {
    fail(`Record event failed: ${res.status} - ${res.body}`);
  }
  console.log(`       └─ recordEvent response: status=${res.status}, body length=${res.body.length}`);
  check(res, {
    'event recorded': (r) => r.status === 200 || r.status === 201,
  }) || fail(`Record event failed: ${res.status} - ${res.body}`);

  if (!res.body || res.body.length === 0) {
    return {};
  }
  return res.json();
}

export function recordHalftime(game_id, token, csrfToken) {
  /**
   * PUT /api/game/{game_id}/halftime - Mark halftime
   * @param {number} game_id - Game ID
   * @param {string} token - Authentication token
   * @param {string} csrfToken - CSRF token
   * @returns {Object} Response data
   */
  const res = http.put(
    `${BASE_URL}/api/game/${game_id}/halftime`,
    JSON.stringify({}),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${token}`,
      },
    }
  );

  if (res.status >= 400) {
    fail(`Record halftime failed: ${res.status} - ${res.body}`);
  }
  console.log(`       └─ recordHalftime response: status=${res.status}, body length=${res.body.length}`);
  check(res, {
    'halftime recorded': (r) => r.status === 200,
  }) || fail(`Record halftime failed: ${res.status}`);

  if (!res.body || res.body.length === 0) {
    return {};
  }
  return res.json();
}

export function finalizeGame(game_id, homeCaptain, awayCaptain, token, csrfToken) {
  /**
   * PUT /api/game/{game_id}/finalize - Mark game complete
   * @param {number} game_id - Game ID
   * @param {string} homeCaptain - Home captain name
   * @param {string} awayCaptain - Away captain name
   * @param {string} token - Authentication token
   * @param {string} csrfToken - CSRF token
   * @returns {Object} Response data
   */
  const res = http.put(
    `${BASE_URL}/api/game/${game_id}/finalize`,
    JSON.stringify({
      homeCaptain: homeCaptain,
      awayCaptain: awayCaptain,
      hasFinalScoreChanged: false,
      note: 'Load test game',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${token}`,
      },
    }
  );

  if (res.status >= 400) {
    fail(`Finalize game failed: ${res.status} - ${res.body}`);
  }
  console.log(`       └─ finalizeGame response: status=${res.status}, body length=${res.body.length}`);
  check(res, {
    'game finalized': (r) => r.status === 200,
  }) || fail(`Finalize game failed: ${res.status}`);

  if (!res.body || res.body.length === 0) {
    return {};
  }
  return res.json();
}

export function performCompleteGame(game, token, csrfToken) {
  /**
   * Score a complete game from setup to finalization
   * Includes:
   * 1. Setup game
   * 2. Set officials
   * 3. First half events (3 events, alternating teams)
   * 4. Halftime break
   * 5. Second half events (3 events, alternating teams)
   * 6. Finalize
   *
   * @param {Object} game - Game object with {id, home, away, ...}
   * @param {string} token - Authentication token
   * @param {string} csrfToken - CSRF token
   */
  const gameId = game.id;
  const homeTeam = game.home || 'Home';
  const awayTeam = game.away || 'Away';

  console.log(`  ◆ Setup game ${gameId}: ${homeTeam} vs ${awayTeam}`);

  // Setup
  setupGame(gameId, token, csrfToken, homeTeam);
  sleep(0.5);
  console.log(`    └─ Setup complete`);

  // Officials
  setOfficials(gameId, token, csrfToken);
  sleep(0.5);
  console.log(`    └─ Officials assigned`);

  // First Half - 3 events alternating teams
  const firstHalfEvents = ['Touchdown', 'Touchdown', 'Safety'];
  const firstHalfTeams = [homeTeam, awayTeam, homeTeam];

  console.log(`    └─ First half events:`);
  for (let i = 0; i < firstHalfEvents.length; i++) {
    setPossession(gameId, firstHalfTeams[i], token, csrfToken);
    sleep(0.3);
    recordEvent(gameId, firstHalfTeams[i], firstHalfEvents[i], 1, token, csrfToken);
    console.log(`       • ${firstHalfTeams[i]}: ${firstHalfEvents[i]}`);
    sleep(0.5); // Spacing between events
  }

  // Halftime break
  recordHalftime(gameId, token, csrfToken);
  sleep(1); // Halftime break simulation
  console.log(`    └─ Halftime`);

  // Second Half - 3 events alternating teams
  const secondHalfEvents = ['Touchdown', 'Touchdown', 'Safety'];
  const secondHalfTeams = [homeTeam, awayTeam, homeTeam];

  console.log(`    └─ Second half events:`);
  for (let i = 0; i < secondHalfEvents.length; i++) {
    setPossession(gameId, secondHalfTeams[i], token, csrfToken);
    sleep(0.3);
    recordEvent(gameId, secondHalfTeams[i], secondHalfEvents[i], 2, token, csrfToken);
    console.log(`       • ${secondHalfTeams[i]}: ${secondHalfEvents[i]}`);
    sleep(0.5); // Spacing between events
  }

  // Finalize
  finalizeGame(gameId, homeTeam + ' Captain', awayTeam + ' Captain', token, csrfToken);
  sleep(0.5);
  console.log(`    └─ Finalized: ${homeTeam} vs ${awayTeam}`);
}
