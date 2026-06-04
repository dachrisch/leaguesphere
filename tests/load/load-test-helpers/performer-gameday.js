// tests/load/load-test-helpers/performer-gameday.js

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { createWorkerLogger } from './logging.js';

const BASE_URL = __ENV.TARGET_HOST || 'https://stage.leaguesphere.app';

export function setupGame(gameId, token, logger) {
  /**
   * PUT /api/game/{game_id}/setup - Initialize game state
   */
  const startTime = Date.now();
  const res = http.put(
    `${BASE_URL}/api/game/${gameId}/setup`,
    JSON.stringify({
      gameinfo: gameId,
      ctResult: 'Gewonnen',
      fhPossession: 'Home',
      direction: 'directionLeft',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${token}`,
      },
    }
  );

  const responseTime = Date.now() - startTime;
  const success = res.status === 200;

  logger.logEvent('setup', {
    game_id: gameId,
    status: success ? 'success' : 'failed',
    http_status: res.status,
    response_time_ms: responseTime,
    error: success ? null : res.body.substring(0, 100),
  });

  check(res, {
    'game setup succeeds': (r) => r.status === 200,
  }) || fail(`Game setup failed: ${res.status}`);

  return success ? res.json() || {} : {};
}

export function setOfficials(gameId, token, logger) {
  /**
   * PUT /api/game/{game_id}/officials - Assign 5 officials
   */
  const startTime = Date.now();
  const res = http.put(
    `${BASE_URL}/api/game/${gameId}/officials`,
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

  const responseTime = Date.now() - startTime;
  const success = res.status === 200;

  logger.logEvent('officials_assigned', {
    game_id: gameId,
    status: success ? 'success' : 'failed',
    http_status: res.status,
    response_time_ms: responseTime,
    error: success ? null : res.body.substring(0, 100),
  });

  check(res, {
    'officials set succeeds': (r) => r.status === 200,
  }) || fail(`Set officials failed: ${res.status}`);

  return success ? res.json() || {} : {};
}

export function recordEvent(gameId, teamName, eventName, half, token, logger) {
  /**
   * POST /api/gamelog/{game_id} - Record a game event
   */
  const startTime = Date.now();
  const res = http.post(
    `${BASE_URL}/api/gamelog/${gameId}`,
    JSON.stringify({
      gameId: gameId,
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

  const responseTime = Date.now() - startTime;
  const success = res.status === 200 || res.status === 201;

  logger.logEvent('event_recorded', {
    game_id: gameId,
    team: teamName,
    event: eventName,
    half: half,
    status: success ? 'success' : 'failed',
    http_status: res.status,
    response_time_ms: responseTime,
    error: success ? null : res.body.substring(0, 100),
  });

  check(res, {
    'event recorded': (r) => r.status === 200 || r.status === 201,
  }) || fail(`Record event failed: ${res.status}`);

  return success ? res.json() || {} : {};
}

export function recordHalftime(gameId, token, logger) {
  /**
   * PUT /api/game/{game_id}/halftime - Mark halftime
   */
  const startTime = Date.now();
  const res = http.put(
    `${BASE_URL}/api/game/${gameId}/halftime`,
    JSON.stringify({}),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${token}`,
      },
    }
  );

  const responseTime = Date.now() - startTime;
  const success = res.status === 200;

  logger.logEvent('halftime_recorded', {
    game_id: gameId,
    status: success ? 'success' : 'failed',
    http_status: res.status,
    response_time_ms: responseTime,
    error: success ? null : res.body.substring(0, 100),
  });

  check(res, {
    'halftime recorded': (r) => r.status === 200,
  }) || fail(`Record halftime failed: ${res.status}`);

  return success ? res.json() || {} : {};
}

export function finalizeGame(gameId, homeTeam, awayTeam, token, logger) {
  /**
   * PUT /api/game/{game_id}/finalize - Mark game complete
   */
  const startTime = Date.now();
  const res = http.put(
    `${BASE_URL}/api/game/${gameId}/finalize`,
    JSON.stringify({
      homeCaptain: homeTeam + ' Captain',
      awayCaptain: awayTeam + ' Captain',
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

  const responseTime = Date.now() - startTime;
  const success = res.status === 200;

  logger.logEvent('game_finalized', {
    game_id: gameId,
    status: success ? 'success' : 'failed',
    http_status: res.status,
    response_time_ms: responseTime,
    error: success ? null : res.body.substring(0, 100),
  });

  check(res, {
    'game finalized': (r) => r.status === 200,
  }) || fail(`Finalize game failed: ${res.status}`);

  return success ? res.json() || {} : {};
}

export function scoreCompleteGame(game, token, logger) {
  /**
   * Score a complete game: setup → officials → H1 events → halftime → H2 events → finalize
   *
   * @param {Object} game - Game object {id, homeTeam, awayTeam, field, scheduled}
   * @param {string} token - Auth token
   * @param {Object} logger - WorkerLogger instance
   */
  const gameId = game.id;

  // Team names are pre-fetched from discovery phase and stored in coordination file
  const homeTeam = game.homeTeam;
  const awayTeam = game.awayTeam;

  logger.logEvent('game_start', {
    game_id: gameId,
    field: game.field,
    scheduled: game.scheduled,
    home_team: homeTeam,
    away_team: awayTeam,
  });

  // Setup
  setupGame(gameId, token, logger);
  sleep(0.5);

  // Officials
  setOfficials(gameId, token, logger);
  sleep(0.5);

  // First Half - 3 events alternating teams
  const firstHalfEvents = ['Touchdown', 'Touchdown', 'Safety'];
  const firstHalfTeams = [homeTeam, awayTeam, homeTeam];

  for (let i = 0; i < firstHalfEvents.length; i++) {
    recordEvent(gameId, firstHalfTeams[i], firstHalfEvents[i], 1, token, logger);
    sleep(0.3);
  }

  // Halftime
  recordHalftime(gameId, token, logger);
  sleep(1);

  // Second Half - 3 events alternating teams
  const secondHalfEvents = ['Touchdown', 'Touchdown', 'Safety'];
  const secondHalfTeams = [homeTeam, awayTeam, homeTeam];

  for (let i = 0; i < secondHalfEvents.length; i++) {
    recordEvent(gameId, secondHalfTeams[i], secondHalfEvents[i], 2, token, logger);
    sleep(0.3);
  }

  // Finalize
  finalizeGame(gameId, homeTeam, awayTeam, token, logger);
  sleep(0.5);

  logger.logEvent('game_complete', {
    game_id: gameId,
    home_team: homeTeam,
    away_team: awayTeam,
    total_events: 6,
  });
}

export function performerVU(coordinationData, token) {
  /**
   * Main VU function for a performer
   * Called once per VU iteration
   *
   * @param {Object} coordinationData - Loaded coordination file
   * @param {string} token - Auth token for performer
   */
  // Determine performer index from VU number
  const performerIndex = (__VU - 1) % 10; // Support up to 10 performers
  const assignedGameday = coordinationData.gamedays.find(
    (g) => g.assigned_performer === `performer_${performerIndex}`
  );

  if (!assignedGameday) {
    console.log(`Performer ${performerIndex} has no assigned gameday`);
    return;
  }

  const logger = createWorkerLogger(
    `performer_${performerIndex}`,
    assignedGameday.id,
    assignedGameday.name
  );

  logger.logEvent('performer_start', {
    gameday_id: assignedGameday.id,
    games_count: assignedGameday.games_count,
  });

  // Score all games in the gameday
  let completedGames = 0;
  assignedGameday.games.forEach((game) => {
    scoreCompleteGame(game, token, logger);
    completedGames++;
    sleep(1); // Brief rest between games
  });

  logger.logEvent('performer_complete', {
    completed_games: completedGames,
  });

  // Store logger globally for post-test aggregation
  if (!__GLOBAL.performerLoggers) {
    __GLOBAL.performerLoggers = [];
  }
  __GLOBAL.performerLoggers.push(logger);
}
