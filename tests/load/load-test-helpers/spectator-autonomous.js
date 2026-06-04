// tests/load/load-test-helpers/spectator-autonomous.js

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { createWorkerLogger } from './logging.js';

const BASE_URL = __ENV.TARGET_HOST || 'https://stage.leaguesphere.app';

export function fetchGamedayProgress(gamedayId) {
  /**
   * GET /api/progress/gamedays/{id}/ - Fetch gameday progress (anonymous, no auth)
   * @param {number} gamedayId - Gameday ID
   * @returns {Object|null} Gameday progress data or null if 404
   */
  const res = http.get(`${BASE_URL}/api/progress/gamedays/${gamedayId}/`);

  // Handle 404 (gameday archived/not found)
  if (res.status === 404) {
    return null;
  }

  // Check successful fetch
  check(res, {
    'gameday progress fetch succeeds': (r) => r.status === 200,
  });

  // Return parsed JSON on success
  if (res.status === 200) {
    try {
      return res.json();
    } catch (e) {
      // Defensive: handle empty or malformed response body
      return null;
    }
  }

  return null;
}

export function detectGameStateChanges(previousGames, currentGames) {
  /**
   * Compare game states and detect changes (state transitions, score changes)
   * @param {Array} previousGames - Previous game state array
   * @param {Array} currentGames - Current game state array
   * @returns {Array} Array of change objects with: game_id, event, timestamp, optional home_fh/home_sh
   */
  const changes = [];

  // Build map of current games by ID for efficient lookup
  const currentGamesMap = {};
  if (currentGames && Array.isArray(currentGames)) {
    currentGames.forEach((game) => {
      if (game && game.id) {
        currentGamesMap[game.id] = game;
      }
    });
  }

  // If no previous games, just return (first poll)
  if (!previousGames || !Array.isArray(previousGames) || previousGames.length === 0) {
    return changes;
  }

  // Compare each previous game with current state
  previousGames.forEach((prevGame) => {
    if (!prevGame || !prevGame.id) {
      return;
    }

    const currGame = currentGamesMap[prevGame.id];
    if (!currGame) {
      return; // Game no longer exists
    }

    const timestamp = new Date().toISOString();

    // Detect game_started: gameStarted transitions false → true
    const prevStarted = prevGame.gameStarted === true;
    const currStarted = currGame.gameStarted === true;
    if (!prevStarted && currStarted) {
      changes.push({
        game_id: prevGame.id,
        event: 'game_started',
        timestamp,
      });
    }

    // Detect game_finished: gameFinished transitions false → true
    const prevFinished = prevGame.gameFinished === true;
    const currFinished = currGame.gameFinished === true;
    if (!prevFinished && currFinished) {
      changes.push({
        game_id: prevGame.id,
        event: 'game_finished',
        timestamp,
      });
    }

    // Detect score_changed: gameresult.fh or .sh differs
    // Handle nested gameresult structures (could be array or object)
    let prevFh = null;
    let prevSh = null;
    let currFh = null;
    let currSh = null;

    if (prevGame.gameresult) {
      if (Array.isArray(prevGame.gameresult) && prevGame.gameresult.length > 0) {
        prevFh = prevGame.gameresult[0].fh;
        prevSh = prevGame.gameresult[0].sh;
      } else if (typeof prevGame.gameresult === 'object') {
        prevFh = prevGame.gameresult.fh;
        prevSh = prevGame.gameresult.sh;
      }
    }

    if (currGame.gameresult) {
      if (Array.isArray(currGame.gameresult) && currGame.gameresult.length > 0) {
        currFh = currGame.gameresult[0].fh;
        currSh = currGame.gameresult[0].sh;
      } else if (typeof currGame.gameresult === 'object') {
        currFh = currGame.gameresult.fh;
        currSh = currGame.gameresult.sh;
      }
    }

    if ((prevFh !== currFh || prevSh !== currSh) && (currFh !== null || currSh !== null)) {
      changes.push({
        game_id: prevGame.id,
        event: 'score_changed',
        timestamp,
        home_fh: currFh,
        home_sh: currSh,
      });
    }
  });

  return changes;
}

export function shouldWander(wanderChance = 0.2) {
  /**
   * Determine if spectator should wander to random gameday (stochastic behavior)
   * @param {number} wanderChance - Probability of wandering (0.0-1.0, default 0.2)
   * @returns {boolean} True if should wander
   */
  return Math.random() < wanderChance;
}

export function spectatorVU(coordinationData, gamedayId) {
  /**
   * Main spectator VU: Autonomous polling with state detection and behavior adaptation
   * - Anonymous (no auth required)
   * - Adaptive polling: 3.5s idle → 1.5s when game running
   * - Wander: 20% chance every 5 polls to check random gameday
   * - State changes trigger behavior (game started/finished)
   *
   * @param {Object} coordinationData - Coordination data with gamedays array
   * @param {number} gamedayId - Primary gameday ID to watch
   */
  // Spectator identification
  const spectatorIndex = __VU % 1000;
  const logger = createWorkerLogger(
    `spectator_${gamedayId}_${spectatorIndex}`,
    gamedayId,
    'Spectator watching gameday'
  );

  logger.logEvent('spectator_start', {
    spectator_index: spectatorIndex,
    gameday_id: gamedayId,
    primary_gameday: gamedayId,
  });

  // Polling configuration
  let pollingIntervalMs = 3500; // Default: 3.5 seconds
  let lastGames = null;
  let pollCount = 0;
  let gamesWatched = 0;
  const maxPolls = 250; // ~250 * 3.5s ≈ 14-15 minutes

  // Main polling loop
  while (pollCount < maxPolls) {
    // Wander logic: 20% chance every 5 polls to check random gameday
    let currentGamedayId = gamedayId;
    if (pollCount > 0 && pollCount % 5 === 0 && shouldWander(0.2)) {
      if (
        coordinationData &&
        coordinationData.gamedays &&
        Array.isArray(coordinationData.gamedays) &&
        coordinationData.gamedays.length > 0
      ) {
        const randomGameday =
          coordinationData.gamedays[
            Math.floor(Math.random() * coordinationData.gamedays.length)
          ];
        if (randomGameday && randomGameday.id) {
          currentGamedayId = randomGameday.id;
          logger.logEvent('wander', {
            from_gameday: gamedayId,
            to_gameday: currentGamedayId,
          });
        }
      }
    }

    // Poll gameday progress
    const startTime = Date.now();
    const gamedayProgress = fetchGamedayProgress(currentGamedayId);
    const responseTime = Date.now() - startTime;

    if (gamedayProgress === null) {
      // No data (404 or error)
      logger.logEvent('poll_no_data', {
        poll_no: pollCount + 1,
        gameday_id: currentGamedayId,
        response_time_ms: responseTime,
      });
      sleep((pollingIntervalMs + Math.random() * 1000) / 1000);
      pollCount++;
      continue;
    }

    // Successful poll
    logger.logEvent('poll_complete', {
      poll_no: pollCount + 1,
      gameday_id: currentGamedayId,
      response_time_ms: responseTime,
      game_count: gamedayProgress.games ? gamedayProgress.games.length : 0,
    });

    // Detect state changes
    if (gamedayProgress.games) {
      const changes = detectGameStateChanges(lastGames, gamedayProgress.games);

      for (const change of changes) {
        logger.logEvent('state_change_detected', {
          game_id: change.game_id,
          event: change.event,
          home_fh: change.home_fh,
          home_sh: change.home_sh,
        });

        // Adapt polling frequency based on game state
        if (change.event === 'game_started') {
          // Game started: increase polling frequency
          pollingIntervalMs = 1500; // 1.5s for active game
          gamesWatched++;
        } else if (change.event === 'game_finished') {
          // Game finished: return to normal frequency
          pollingIntervalMs = 3500; // Back to 3.5s
        }
      }

      // Update last games state
      lastGames = gamedayProgress.games;
    }

    // Sleep with jitter
    sleep((pollingIntervalMs + Math.random() * 1000) / 1000);
    pollCount++;
  }

  // Polling loop complete
  logger.logEvent('spectator_complete', {
    total_polls: pollCount,
    games_watched: gamesWatched,
    primary_gameday: gamedayId,
  });

  // Store logger in global for post-test aggregation
  if (!__GLOBAL.spectatorLoggers) {
    __GLOBAL.spectatorLoggers = [];
  }
  __GLOBAL.spectatorLoggers.push(logger);
}
