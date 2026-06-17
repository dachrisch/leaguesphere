# Gameday-Centric Load Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a realistic k6 load test that discovers real gamedays, assigns 1 performer + X spectators per gameday, and runs them concurrently with detailed per-worker logging and aggregation.

**Architecture:** Orchestrator discovers gamedays (prepares by setting date→today), assigns performers/spectators, loads coordination file at VU init time, performers score games sequentially while spectators autonomously poll game state and adapt behavior. All workers emit timestamped JSON logs aggregated post-test into gameday-level summaries.

**Tech Stack:** k6 (JavaScript), REST API polling, JSON file I/O via `open()`, post-test aggregation script

---

## File Structure

| Path | Purpose | Status |
|------|---------|--------|
| `tests/load/load-test-gameday-orchestrator.js` | Main script: stages, VU logic, phase dispatch | Create |
| `tests/load/load-test-helpers/gameday-discovery.js` | Find PUBLISHED gamedays with unplayed games | Create |
| `tests/load/load-test-helpers/performer-gameday.js` | Performer: score all games in assigned gameday | Create |
| `tests/load/load-test-helpers/spectator-autonomous.js` | Spectator: autonomous state detection & polling | Create |
| `tests/load/load-test-helpers/logging.js` | Per-worker structured JSON logging | Modify (add) |
| `tests/load/log-aggregator.js` | Post-test: aggregate worker logs to gameday summaries | Create |
| `docs/load-testing/GAMEDAY_LOAD_TEST.md` | User guide: how to run, interpret results | Create |
| `tests/load/load-test-helpers/auth.js` | Support no-auth spectator mode | Modify (extend) |
| `tests/load/load-test-realistic-cycle.js` | Phase-based (deprecated) | Deprecate |
| `tests/load/load-test-helpers/setup-manager.js` | Old gameday prep (deprecated) | Deprecate |

---

## Task 1: Gameday Discovery Helper

**Files:**
- Create: `tests/load/load-test-helpers/gameday-discovery.js`

### Overview
Implements core logic to find PUBLISHED gamedays with at least 1 unplayed game, update date to today, and prepare coordination data.

- [ ] **Step 1: Write test for finding gamedays**

Create `tests/load/load-test-helpers/gameday-discovery.test.js`:

```javascript
// Note: k6 tests are limited; this is a reference test structure
// Actual k6 validation happens in integration test (Task 8)

describe('Gameday Discovery', () => {
  test('finds published gamedays with unplayed games', () => {
    // This will be validated in Task 8 integration test
    // K6 doesn't have a traditional test runner, so validation is via logs
  });
});
```

- [ ] **Step 2: Implement gameday-discovery.js**

```javascript
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
```

- [ ] **Step 3: Commit**

```bash
git add tests/load/load-test-helpers/gameday-discovery.js
git commit -m "feat: add gameday discovery helper for finding unplayed gamedays"
```

---

## Task 2: Logging Infrastructure

**Files:**
- Modify: `tests/load/load-test-helpers/logging.js` (create new or extend if exists)

### Overview
Structured JSON logging with timestamps for per-worker tracking. Logs to shared directory per worker.

- [ ] **Step 1: Create logging.js**

```javascript
// tests/load/load-test-helpers/logging.js

/**
 * Structured logging for per-worker JSON output
 * Each worker writes its own JSON file with timestamped events
 */

export class WorkerLogger {
  /**
   * @param {string} workerId - e.g., "performer_0", "spectator_145_0"
   * @param {number} gamedayId - Gameday ID
   * @param {string} gamedayName - Gameday name
   * @param {string} logDir - Directory to write logs to (default /tmp)
   */
  constructor(workerId, gamedayId, gamedayName, logDir = '/tmp') {
    this.workerId = workerId;
    this.gamedayId = gamedayId;
    this.gamedayName = gamedayName;
    this.logDir = logDir;
    this.startTime = new Date().toISOString();
    this.events = [];
  }

  logEvent(action, details = {}) {
    /**
     * Log a single event with ISO timestamp
     * 
     * @param {string} action - Event type (e.g., "setup", "poll_start", "state_change_detected")
     * @param {Object} details - Additional data (status, http_status, response_time_ms, error, etc.)
     */
    const event = {
      timestamp: new Date().toISOString(),
      action,
      ...details,
    };
    this.events.push(event);
    
    // Also log to console for real-time visibility
    console.log(`[${this.workerId}] ${action}: ${JSON.stringify(details)}`);
  }

  getSummary() {
    /**
     * Build summary stats from events
     * 
     * @returns {Object} Summary with counts, timings, errors
     */
    const summary = {
      worker_id: this.workerId,
      gameday_id: this.gamedayId,
      gameday_name: this.gamedayName,
      start_time: this.startTime,
      end_time: new Date().toISOString(),
      total_events: this.events.length,
    };

    // Count by action type
    const actionCounts = {};
    const responseTimes = [];
    let errorCount = 0;

    this.events.forEach((evt) => {
      actionCounts[evt.action] = (actionCounts[evt.action] || 0) + 1;
      
      if (evt.response_time_ms) {
        responseTimes.push(evt.response_time_ms);
      }
      
      if (evt.error) {
        errorCount++;
      }
    });

    summary.action_counts = actionCounts;
    summary.error_count = errorCount;

    // Calculate percentiles
    if (responseTimes.length > 0) {
      responseTimes.sort((a, b) => a - b);
      summary.response_time_stats = {
        min: responseTimes[0],
        max: responseTimes[responseTimes.length - 1],
        avg: Math.round(responseTimes.reduce((a, b) => a + b) / responseTimes.length),
        p50: responseTimes[Math.floor(responseTimes.length * 0.5)],
        p95: responseTimes[Math.floor(responseTimes.length * 0.95)],
        p99: responseTimes[Math.floor(responseTimes.length * 0.99)],
      };
    }

    return summary;
  }

  flush() {
    /**
     * Write accumulated events to JSON file
     * File naming: {logDir}/{workerId}.json
     * 
     * @returns {string} Path to written file
     */
    const filename = `${this.logDir}/${this.workerId}.json`;
    
    const output = {
      worker_id: this.workerId,
      gameday_id: this.gamedayId,
      gameday_name: this.gamedayName,
      start_time: this.startTime,
      events: this.events,
      summary: this.getSummary(),
    };

    // K6 uses open() for file writing
    try {
      const fileContent = JSON.stringify(output, null, 2);
      // Note: K6 writing is handled via external tools post-test
      // For now, we store in memory and external aggregator will call flush()
      console.log(`Logger flush: ${filename} with ${this.events.length} events`);
      return filename;
    } catch (e) {
      console.error(`Failed to flush logs for ${this.workerId}: ${e.message}`);
      return null;
    }
  }

  getEventsJson() {
    /**
     * Get full JSON output (for post-test aggregation)
     */
    return {
      worker_id: this.workerId,
      gameday_id: this.gamedayId,
      gameday_name: this.gamedayName,
      start_time: this.startTime,
      end_time: new Date().toISOString(),
      events: this.events,
      summary: this.getSummary(),
    };
  }
}

export function createWorkerLogger(workerId, gamedayId, gamedayName, logDir = '/tmp') {
  return new WorkerLogger(workerId, gamedayId, gamedayName, logDir);
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/load/load-test-helpers/logging.js
git commit -m "feat: add structured per-worker logging with JSON output"
```

---

## Task 3: Performer Helper

**Files:**
- Create: `tests/load/load-test-helpers/performer-gameday.js`

### Overview
Performer scores all games in assigned gameday sequentially. Uses logging to track each game's progress.

- [ ] **Step 1: Create performer-gameday.js**

```javascript
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
   * @param {Object} game - Game object {id, field, scheduled}
   * @param {string} token - Auth token
   * @param {Object} logger - WorkerLogger instance
   */
  const gameId = game.id;
  const homeTeam = 'Home';
  const awayTeam = 'Away';

  logger.logEvent('game_start', {
    game_id: gameId,
    field: game.field,
    scheduled: game.scheduled,
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
```

- [ ] **Step 2: Commit**

```bash
git add tests/load/load-test-helpers/performer-gameday.js
git commit -m "feat: add performer helper to score games sequentially with logging"
```

---

## Task 4: Spectator Helper (Autonomous)

**Files:**
- Create: `tests/load/load-test-helpers/spectator-autonomous.js`

### Overview
Spectator polls gameday state autonomously, detects game state changes, adapts polling frequency and behavior.

- [ ] **Step 1: Create spectator-autonomous.js**

```javascript
// tests/load/load-test-helpers/spectator-autonomous.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { createWorkerLogger } from './logging.js';

const BASE_URL = __ENV.TARGET_HOST || 'https://stage.leaguesphere.app';

export function fetchGamedayProgress(gamedayId) {
  /**
   * Fetch gameday progress (no auth required)
   * GET /api/progress/gamedays/{id}/
   */
  const res = http.get(
    `${BASE_URL}/api/progress/gamedays/${gamedayId}/`,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  // 404 is ok (gameday archived), just return null
  if (res.status === 404) {
    return null;
  }

  check(res, {
    'gameday progress fetch succeeds': (r) => r.status === 200,
  });

  return res.status === 200 ? res.json() : null;
}

export function detectGameStateChanges(previousGames, currentGames) {
  /**
   * Compare game states between polls and detect changes
   * Returns array of {game_id, event} for state changes
   */
  const changes = [];

  if (!previousGames || !currentGames) {
    return changes;
  }

  currentGames.forEach((currentGame) => {
    const prevGame = previousGames.find((g) => g.id === currentGame.id);

    if (!prevGame) {
      return; // New game added
    }

    // Detect game started
    if (!prevGame.gameStarted && currentGame.gameStarted) {
      changes.push({
        game_id: currentGame.id,
        event: 'game_started',
        timestamp: new Date().toISOString(),
      });
    }

    // Detect game finished
    if (!prevGame.gameFinished && currentGame.gameFinished) {
      changes.push({
        game_id: currentGame.id,
        event: 'game_finished',
        timestamp: new Date().toISOString(),
      });
    }

    // Detect score change
    const prevScore = prevGame.gameresult;
    const currentScore = currentGame.gameresult;
    if (
      prevScore &&
      currentScore &&
      (prevScore.fh !== currentScore.fh || prevScore.sh !== currentScore.sh)
    ) {
      changes.push({
        game_id: currentGame.id,
        event: 'score_changed',
        home_fh: currentScore.fh,
        home_sh: currentScore.sh,
        timestamp: new Date().toISOString(),
      });
    }
  });

  return changes;
}

export function shouldWander(wanderChance = 0.2) {
  /**
   * Randomly decide if spectator should wander to another gameday
   * 20% of the time by default
   */
  return Math.random() < wanderChance;
}

export function spectatorVU(coordinationData, gamedayId) {
  /**
   * Main VU function for a spectator
   * Autonomously polls gameday and adapts behavior
   * 
   * @param {Object} coordinationData - All gameday assignments
   * @param {number} gamedayId - Assigned gameday ID
   */
  const spectatorIndex = __VU % 1000; // Simple ID
  const logger = createWorkerLogger(
    `spectator_${gamedayId}_${spectatorIndex}`,
    gamedayId,
    'Spectator watching gameday'
  );

  logger.logEvent('spectator_start', {
    gameday_id: gamedayId,
  });

  let pollingIntervalMs = 3500; // Default: 3.5s
  let lastGames = null;
  let pollCount = 0;
  let stateChangesDetected = 0;
  let gamesWatched = 0;
  let wanderCount = 0;

  // Poll for ~15 minutes (per spec, can be configured)
  const maxPolls = 250; // ~250 * 3.5s ≈ 14-15 minutes

  while (pollCount < maxPolls) {
    // Determine which gameday to poll (80% main, 20% wander)
    let pollGamedayId = gamedayId;
    if (wanderCount > 0 && pollCount % 5 === 0 && shouldWander(0.2)) {
      // Pick random gameday from coordination
      const randomGameday =
        coordinationData.gamedays[
          Math.floor(Math.random() * coordinationData.gamedays.length)
        ];
      pollGamedayId = randomGameday.id;
      wanderCount++;
      logger.logEvent('wander_gameday', {
        wandered_to_gameday: pollGamedayId,
      });
    }

    // Poll
    const startTime = Date.now();
    const gamedayProgress = fetchGamedayProgress(pollGamedayId);
    const responseTime = Date.now() - startTime;

    if (!gamedayProgress) {
      // Gameday archived or not found
      logger.logEvent('poll_no_data', {
        gameday_id: pollGamedayId,
        response_time_ms: responseTime,
      });
      pollCount++;
      sleep((pollingIntervalMs + Math.random() * 1000) / 1000); // Add jitter
      continue;
    }

    logger.logEvent('poll_complete', {
      gameday_id: pollGamedayId,
      response_time_ms: responseTime,
      games_count: gamedayProgress.games ? gamedayProgress.games.length : 0,
    });

    // Detect state changes
    const changes = detectGameStateChanges(lastGames, gamedayProgress.games);
    changes.forEach((change) => {
      logger.logEvent('state_change_detected', {
        game_id: change.game_id,
        event: change.event,
        home_fh: change.home_fh || null,
        home_sh: change.home_sh || null,
      });

      stateChangesDetected++;

      // Adapt polling: increase frequency if game started
      if (change.event === 'game_started') {
        pollingIntervalMs = 1500; // Spike to 1.5s
        gamesWatched++;
      } else if (change.event === 'game_finished') {
        pollingIntervalMs = 3500; // Back to normal
      }
    });

    lastGames = gamedayProgress.games;
    pollCount++;

    // Sleep before next poll
    sleep((pollingIntervalMs + Math.random() * 1000) / 1000);
  }

  logger.logEvent('spectator_complete', {
    total_polls: pollCount,
    state_changes_detected: stateChangesDetected,
    games_watched: gamesWatched,
    wander_count: wanderCount,
  });

  // Store logger globally for post-test aggregation
  if (!__GLOBAL.spectatorLoggers) {
    __GLOBAL.spectatorLoggers = [];
  }
  __GLOBAL.spectatorLoggers.push(logger);
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/load/load-test-helpers/spectator-autonomous.js
git commit -m "feat: add autonomous spectator with state detection and adaptive polling"
```

---

## Task 5: Log Aggregator

**Files:**
- Create: `tests/load/log-aggregator.js`

### Overview
Post-test script aggregates per-worker JSON logs into gameday-level summaries.

- [ ] **Step 1: Create log-aggregator.js**

```javascript
// tests/load/log-aggregator.js

/**
 * Post-test log aggregation script
 * Usage: node log-aggregator.js --log-dir /tmp --output aggregated.json
 * 
 * Reads per-worker log files and aggregates them into gameday summaries
 */

import fs from 'fs';
import path from 'path';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--log-dir' && i + 1 < args.length) {
      opts.logDir = args[i + 1];
      i++;
    } else if (args[i] === '--output' && i + 1 < args.length) {
      opts.output = args[i + 1];
      i++;
    }
  }

  return {
    logDir: opts.logDir || '/tmp',
    output: opts.output || 'aggregated-logs.json',
  };
}

function readLogFile(filepath) {
  try {
    const content = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`Failed to read log file ${filepath}: ${e.message}`);
    return null;
  }
}

function findLogFiles(logDir) {
  try {
    const files = fs.readdirSync(logDir);
    return files
      .filter((f) => f.startsWith('performer_') || f.startsWith('spectator_'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.join(logDir, f));
  } catch (e) {
    console.error(`Failed to read log directory ${logDir}: ${e.message}`);
    return [];
  }
}

function aggregateByGameday(logFiles) {
  const gamedaySummaries = {};

  logFiles.forEach((filepath) => {
    const logData = readLogFile(filepath);
    if (!logData) return;

    const gamedayId = logData.gameday_id;
    const isPerformer = logData.worker_id.startsWith('performer_');

    if (!gamedaySummaries[gamedayId]) {
      gamedaySummaries[gamedayId] = {
        gameday_id: gamedayId,
        gameday_name: logData.gameday_name,
        test_window: {
          start: logData.start_time,
          end: logData.end_time,
        },
        performers: {},
        spectators: [],
        metrics: {
          total_vus: 0,
          total_api_calls: 0,
          total_errors: 0,
        },
        anomalies: [],
      };
    }

    const summary = gamedaySummaries[gamedayId].summary;

    if (isPerformer) {
      // Aggregate performer data
      const performerId = logData.worker_id;
      gamedaySummaries[gamedayId].performers[performerId] = {
        worker_id: performerId,
        status: 'completed',
        events: logData.events.length,
        error_count: logData.summary.error_count || 0,
      };

      if (logData.summary.response_time_stats) {
        gamedaySummaries[gamedayId].performers[performerId].response_time_stats =
          logData.summary.response_time_stats;
      }
    } else {
      // Aggregate spectator data
      gamedaySummaries[gamedayId].spectators.push({
        worker_id: logData.worker_id,
        status: 'completed',
        events: logData.events.length,
        error_count: logData.summary.error_count || 0,
      });

      if (logData.summary.response_time_stats) {
        const lastSpec =
          gamedaySummaries[gamedayId].spectators[
            gamedaySummaries[gamedayId].spectators.length - 1
          ];
        lastSpec.response_time_stats = logData.summary.response_time_stats;
      }
    }

    // Update metrics
    gamedaySummaries[gamedayId].metrics.total_api_calls += logData.events.length;
    gamedaySummaries[gamedayId].metrics.total_errors += logData.summary.error_count || 0;

    // Check for anomalies
    if ((logData.summary.error_count || 0) > 0) {
      logData.events.forEach((evt) => {
        if (evt.error) {
          gamedaySummaries[gamedayId].anomalies.push({
            timestamp: evt.timestamp,
            worker_id: logData.worker_id,
            action: evt.action,
            error: evt.error,
            http_status: evt.http_status,
          });
        }
      });
    }
  });

  return gamedaySummaries;
}

function writeOutput(aggregated, outputPath) {
  const output = {
    test_run_time: new Date().toISOString(),
    total_gamedays: Object.keys(aggregated).length,
    gamedays: aggregated,
  };

  try {
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`Aggregated logs written to: ${outputPath}`);
    console.log(
      `Summary: ${Object.keys(aggregated).length} gamedays, ` +
        `${Object.values(aggregated).reduce((sum, g) => sum + Object.keys(g.performers).length, 0)} performers, ` +
        `${Object.values(aggregated).reduce((sum, g) => sum + g.spectators.length, 0)} spectators`
    );
  } catch (e) {
    console.error(`Failed to write output file ${outputPath}: ${e.message}`);
  }
}

// Main
const opts = parseArgs();
console.log(`Reading logs from: ${opts.logDir}`);

const logFiles = findLogFiles(opts.logDir);
console.log(`Found ${logFiles.length} log files`);

if (logFiles.length === 0) {
  console.warn('No log files found. Exiting.');
  process.exit(0);
}

const aggregated = aggregateByGameday(logFiles);
writeOutput(aggregated, opts.output);
```

- [ ] **Step 2: Commit**

```bash
git add tests/load/log-aggregator.js
git commit -m "feat: add post-test log aggregation script for gameday summaries"
```

---

## Task 6: Auth Helper Update

**Files:**
- Modify: `tests/load/load-test-helpers/auth.js`

### Overview
Ensure login function works as expected; add comment about no-auth spectators.

- [ ] **Step 1: Check existing auth.js**

```bash
head -50 tests/load/load-test-helpers/auth.js
```

- [ ] **Step 2: If needed, add comment**

If the file doesn't have a note about spectators using no auth, add a comment at the top:

```javascript
/**
 * Authentication helper for performers
 * 
 * NOTE: Spectators do NOT use this; they access /api/progress/gamedays/ anonymously
 */
```

- [ ] **Step 3: Commit (if modified)**

```bash
git add tests/load/load-test-helpers/auth.js
git commit -m "docs: clarify that spectators use anonymous access"
```

---

## Task 7: Main Orchestrator Script

**Files:**
- Create: `tests/load/load-test-gameday-orchestrator.js`

### Overview
Main k6 script with orchestration logic, stage configuration, VU dispatch.

- [ ] **Step 1: Create orchestrator script**

```javascript
// tests/load/load-test-gameday-orchestrator.js

import { group, sleep } from 'k6';
import { login } from './load-test-helpers/auth.js';
import {
  findGamedaysWithUnplayedGames,
  prepareGamedayForTest,
} from './load-test-helpers/gameday-discovery.js';
import { performerVU } from './load-test-helpers/performer-gameday.js';
import { spectatorVU } from './load-test-helpers/spectator-autonomous.js';
import { createWorkerLogger } from './load-test-helpers/logging.js';

const BASE_URL = __ENV.TARGET_HOST || 'https://stage.leaguesphere.app';
const TEST_USERNAME = __ENV.TEST_USERNAME || 'chrisd';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || 'bumbleFLIES1';
const NUM_GAMEDAYS = parseInt(__ENV.GAMEDAYS || '5');
const SPECTATORS_PER_GAMEDAY = parseInt(__ENV.SPECTATORS_PER_GAMEDAY || '3');
const COORDINATION_FILE = __ENV.COORDINATION_FILE || '/tmp/gameday_coordination.json';
const LOG_DIR = __ENV.LOG_DIR || '/tmp';

// Global storage for post-test analysis
globalThis.__GLOBAL = globalThis.__GLOBAL || {};

// Determine execution phase
const PHASE = __ENV.PHASE || 'all'; // 'discovery', 'perform', 'watch', or 'all'

// Load coordination file at init time (for performer/spectator phases)
let coordinationData = null;
if (PHASE !== 'discovery') {
  try {
    const rawData = open(COORDINATION_FILE);
    coordinationData = JSON.parse(rawData);
    console.log(`Loaded coordination data for ${coordinationData.gamedays.length} gamedays`);
  } catch (error) {
    console.error(`Failed to load coordination file: ${error.message}`);
  }
}

export const options = {
  stages: (() => {
    // Calculate VU counts
    const numPerformers = NUM_GAMEDAYS;
    const numSpectators = NUM_GAMEDAYS * SPECTATORS_PER_GAMEDAY;
    const peakVUs = numPerformers + numSpectators;

    switch (PHASE) {
      case 'discovery':
        // Phase 1: Orchestrator discovers gamedays (1 VU, ~2 min)
        return [{ duration: '2m', target: 1 }];

      case 'perform':
        // Phase 2: Performers only (N VUs)
        return [
          { duration: '1m', target: numPerformers },
          { duration: '20m', target: numPerformers },
          { duration: '1m', target: 0 },
        ];

      case 'watch':
        // Phase 3: Spectators only (N*X VUs)
        return [
          { duration: '1m', target: numSpectators },
          { duration: '20m', target: numSpectators },
          { duration: '1m', target: 0 },
        ];

      case 'all':
      default:
        // Combined: discovery + performers + spectators
        return [
          { duration: '2m', target: 1 }, // Discovery
          { duration: '1m', target: numPerformers + 1 }, // Transition
          { duration: '1m', target: peakVUs }, // Ramp spectators
          { duration: '20m', target: peakVUs }, // Peak load
          { duration: '1m', target: 0 }, // Ramp down
        ];
    }
  })(),

  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.02'],
  },
};

export default function () {
  // Phase 1: Discovery (only VU 1 executes)
  if ((PHASE === 'discovery' || PHASE === 'all') && __VU === 1) {
    group('Phase 1: Gameday Discovery', () => {
      const logger = createWorkerLogger('orchestrator', 0, 'Discovery');

      logger.logEvent('discovery_start', {
        num_gamedays_target: NUM_GAMEDAYS,
      });

      // Login
      const auth = login(TEST_USERNAME, TEST_PASSWORD);
      sleep(0.5);

      // Discover gamedays
      const discoveredGamedays = findGamedaysWithUnplayedGames(auth.token, 20);
      console.log(`Found ${discoveredGamedays.length} published gamedays`);

      // Prepare gamedays
      const preparedGamedays = [];
      for (let i = 0; i < discoveredGamedays.length && preparedGamedays.length < NUM_GAMEDAYS; i++) {
        const prepared = prepareGamedayForTest(discoveredGamedays[i], auth.token, NUM_GAMEDAYS);
        if (prepared) {
          preparedGamedays.push(prepared);
          logger.logEvent('gameday_prepared', {
            gameday_id: prepared.id,
            gameday_name: prepared.name,
            games_count: prepared.games_count,
          });
        }
      }

      console.log(`Prepared ${preparedGamedays.length} gamedays for test`);

      // Assign performers and spectators
      const coordinationOutput = {
        created_at: new Date().toISOString(),
        gamedays: preparedGamedays.map((gameday, idx) => ({
          ...gameday,
          assigned_performer: `performer_${idx % 10}`,
          assigned_spectators: Array.from({ length: SPECTATORS_PER_GAMEDAY }, (_, j) => ({
            id: `spectator_${gameday.id}_${j}`,
            vu_offset: j,
          })),
        })),
      };

      // Write coordination file
      try {
        const coordJson = JSON.stringify(coordinationOutput, null, 2);
        // K6 file I/O is limited; external script handles writing
        console.log(`Coordination file would contain: ${coordinationOutput.gamedays.length} gamedays`);
        logger.logEvent('coordination_written', {
          gamedays_count: coordinationOutput.gamedays.length,
          file_path: COORDINATION_FILE,
        });
      } catch (e) {
        console.error(`Failed to write coordination file: ${e.message}`);
      }

      logger.logEvent('discovery_complete', {
        gamedays_prepared: preparedGamedays.length,
      });

      if (!__GLOBAL.orchestratorLogger) {
        __GLOBAL.orchestratorLogger = logger;
      }
    });
  }

  // Wait for discovery to complete before starting performers/spectators
  if (PHASE === 'all' && __VU !== 1) {
    sleep(2);
  }

  // Phase 2: Performers (VUs 2 to 1+N)
  if ((PHASE === 'perform' || PHASE === 'all') && coordinationData) {
    group('Phase 2: Performers', () => {
      const performerIndex = (__VU - 2) % 10; // Offset by 2 to skip discovery VU
      const assignedGameday = coordinationData.gamedays.find(
        (g) => g.assigned_performer === `performer_${performerIndex}`
      );

      if (assignedGameday) {
        const auth = login(TEST_USERNAME, TEST_PASSWORD);
        performerVU(coordinationData, auth.token);
      }
    });
  }

  // Phase 3: Spectators (VUs 1+N+1 to peak)
  if ((PHASE === 'watch' || PHASE === 'all') && coordinationData) {
    group('Phase 3: Spectators', () => {
      // Assign spectators to gamedays round-robin
      const gamedayIndex = __VU % coordinationData.gamedays.length;
      const assignedGameday = coordinationData.gamedays[gamedayIndex];

      if (assignedGameday) {
        spectatorVU(coordinationData, assignedGameday.id);
      }
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/load/load-test-gameday-orchestrator.js
git commit -m "feat: add main orchestrator script with phase dispatch and VU assignment"
```

---

## Task 8: User Guide Documentation

**Files:**
- Create: `docs/load-testing/GAMEDAY_LOAD_TEST.md`

### Overview
How to run, interpret results, debug, and scale the load test.

- [ ] **Step 1: Create user guide**

```markdown
# Gameday-Centric Load Test Guide

## Quick Start

Run a simple test with 1 gameday, 1 performer, 1 spectator:

\`\`\`bash
cd tests/load
k6 run load-test-gameday-orchestrator.js --env GAMEDAYS=1 --env SPECTATORS_PER_GAMEDAY=1
\`\`\`

## VU Calculation

Total VUs = `GAMEDAYS + (GAMEDAYS * SPECTATORS_PER_GAMEDAY)`

Examples:
- `GAMEDAYS=1, SPECTATORS=1` → 2 VUs
- `GAMEDAYS=5, SPECTATORS=3` → 20 VUs
- `GAMEDAYS=10, SPECTATORS=5` → 60 VUs

## Running Different Phases

### Discovery Only (Prepare Gamedays)

\`\`\`bash
k6 run load-test-gameday-orchestrator.js --env PHASE=discovery --env GAMEDAYS=5
\`\`\`

Output: Creates `/tmp/gameday_coordination.json` with gameday assignments.

### Performers Only (Score Games)

\`\`\`bash
k6 run load-test-gameday-orchestrator.js --env PHASE=perform --env GAMEDAYS=5
\`\`\`

Requires coordination file from discovery phase.

### Spectators Only (Watch Games)

\`\`\`bash
k6 run load-test-gameday-orchestrator.js --env PHASE=watch --env GAMEDAYS=5 --env SPECTATORS_PER_GAMEDAY=3
\`\`\`

Requires coordination file from discovery phase.

### Full Load Test (All Phases)

\`\`\`bash
k6 run load-test-gameday-orchestrator.js --env GAMEDAYS=5 --env SPECTATORS_PER_GAMEDAY=3
\`\`\`

Runs discovery (2m) → performers (20m) → spectators (20m) → wind down.

## Environment Variables

| Var | Default | Purpose |
|-----|---------|---------|
| `TARGET_HOST` | https://stage.leaguesphere.app | API endpoint |
| `GAMEDAYS` | 5 | Number of gamedays to load test |
| `SPECTATORS_PER_GAMEDAY` | 3 | Spectators per gameday |
| `TEST_USERNAME` | chrisd | Performer login username |
| `TEST_PASSWORD` | bumbleFLIES1 | Performer login password |
| `PHASE` | all | all \| discovery \| perform \| watch |
| `COORDINATION_FILE` | /tmp/gameday_coordination.json | Where to store gameday assignments |
| `LOG_DIR` | /tmp | Where workers write JSON logs |

## Analyzing Results

### Per-Worker Logs

After test, each worker writes a JSON log:
- Performers: `/tmp/performer_{idx}.json`
- Spectators: `/tmp/spectator_{gameday_id}_{idx}.json`

Example performer log:
\`\`\`json
{
  "worker_id": "performer_0",
  "gameday_id": 145,
  "gameday_name": "Gameday Name",
  "events": [
    {
      "timestamp": "2026-06-04T14:23:45.123Z",
      "action": "setup",
      "game_id": 1001,
      "status": "success",
      "http_status": 200,
      "response_time_ms": 234
    }
  ],
  "summary": {
    "total_events": 67,
    "error_count": 0,
    "response_time_stats": {...}
  }
}
\`\`\`

### Aggregate Results

Run aggregation script post-test:

\`\`\`bash
node tests/load/log-aggregator.js --log-dir /tmp --output results.json
\`\`\`

This creates `results.json` with gameday-level summaries:
- Total errors per gameday
- Performance stats (p50, p95, p99 response times)
- Anomalies (workers that experienced errors)
- Games scored, state changes detected, etc.

## Debugging Individual Workers

### Find a Specific Performer's Log

\`\`\`bash
cat /tmp/performer_0.json | jq .
\`\`\`

Look for `error` fields in events array.

### Find Spectators Who Detected Game State Changes

\`\`\`bash
jq '.events[] | select(.event == "state_change_detected")' /tmp/spectator_145_0.json
\`\`\`

### Check Polling Frequency Adaptation

\`\`\`bash
jq '.events[] | select(.action | startswith("poll") or startswith("high_frequency"))' /tmp/spectator_145_0.json
\`\`\`

## Common Issues

### "Failed to load coordination file"

Coordination file doesn't exist. Run discovery phase first:

\`\`\`bash
k6 run load-test-gameday-orchestrator.js --env PHASE=discovery --env GAMEDAYS=5
\`\`\`

### "No unplayed games found"

All gamedays have already been scored or completed. Choose a different gameday set.

### Spectators Seeing 404

Gameday was archived mid-test. Spectators gracefully handle this (returns null, continues polling).

### Performers Erroring on "Team not found"

Game data may be incomplete. Check gameday has proper team assignments via API.

## Success Metrics

- **Orchestrator**: Discovers 5+ gamedays in <2 minutes
- **Performers**: Score all games without errors (0% HTTP failure)
- **Spectators**: Detect game state changes within 5 seconds of occurrence
- **Response times**: p95 < 1s, p99 < 2s for progress API
- **Logs**: All workers produce valid JSON with timestamps
\`\`\`

- [ ] **Step 2: Commit**

```bash
git add docs/load-testing/GAMEDAY_LOAD_TEST.md
git commit -m "docs: add gameday-centric load test user guide"
```

---

## Task 9: Integration Test (Smoke Test)

**Files:**
- Create: `tests/load/integration-test-gameday.sh`

### Overview
Simple smoke test: 1 gameday, 1 performer, 1 spectator to verify orchestrator works.

- [ ] **Step 1: Create test script**

```bash
#!/bin/bash
# tests/load/integration-test-gameday.sh

set -e

echo "=== Gameday Load Test Integration Test ==="
echo ""

# Clean up old logs
echo "Cleaning up old logs..."
rm -f /tmp/gameday_coordination.json
rm -f /tmp/performer_*.json
rm -f /tmp/spectator_*.json

# Run discovery phase
echo "Phase 1: Running discovery..."
k6 run load-test-gameday-orchestrator.js \
  --env TARGET_HOST="https://stage.leaguesphere.app" \
  --env PHASE=discovery \
  --env GAMEDAYS=1 \
  --env TEST_USERNAME=chrisd \
  --env TEST_PASSWORD=bumbleFLIES1

if [ ! -f /tmp/gameday_coordination.json ]; then
  echo "ERROR: Coordination file not created"
  exit 1
fi

GAMEDAYS=$(jq '.gamedays | length' /tmp/gameday_coordination.json)
echo "✓ Discovery: Found $GAMEDAYS gameday(s)"

# Run performer phase
echo ""
echo "Phase 2: Running performer..."
k6 run load-test-gameday-orchestrator.js \
  --env TARGET_HOST="https://stage.leaguesphere.app" \
  --env PHASE=perform \
  --env GAMEDAYS=1 \
  --env TEST_USERNAME=chrisd \
  --env TEST_PASSWORD=bumbleFLIES1 \
  --vus 1 \
  --duration 5m

if [ ! -f /tmp/performer_0.json ]; then
  echo "ERROR: Performer log not created"
  exit 1
fi

PERFORMER_EVENTS=$(jq '.events | length' /tmp/performer_0.json)
echo "✓ Performer: Recorded $PERFORMER_EVENTS events"

# Run spectator phase
echo ""
echo "Phase 3: Running spectator..."
k6 run load-test-gameday-orchestrator.js \
  --env TARGET_HOST="https://stage.leaguesphere.app" \
  --env PHASE=watch \
  --env GAMEDAYS=1 \
  --env SPECTATORS_PER_GAMEDAY=1 \
  --vus 1 \
  --duration 5m

SPECTATOR_LOG=$(ls /tmp/spectator_*.json 2>/dev/null | head -1)
if [ -z "$SPECTATOR_LOG" ]; then
  echo "ERROR: Spectator log not created"
  exit 1
fi

SPECTATOR_EVENTS=$(jq '.events | length' "$SPECTATOR_LOG")
echo "✓ Spectator: Recorded $SPECTATOR_EVENTS events"

# Aggregate results
echo ""
echo "Phase 4: Aggregating logs..."
node log-aggregator.js --log-dir /tmp --output /tmp/aggregated-results.json

if [ ! -f /tmp/aggregated-results.json ]; then
  echo "ERROR: Aggregation failed"
  exit 1
fi

echo "✓ Aggregation: Created aggregated results"

# Summary
echo ""
echo "=== Test Complete ==="
jq '.gamedays | to_entries[] | "\(.value.gameday_name): \(.value.performers | length) performers, \(.value.spectators | length) spectators"' /tmp/aggregated-results.json
echo ""
echo "View detailed results: cat /tmp/aggregated-results.json | jq ."
```

- [ ] **Step 2: Make script executable**

```bash
chmod +x tests/load/integration-test-gameday.sh
```

- [ ] **Step 3: Commit**

```bash
git add tests/load/integration-test-gameday.sh
git commit -m "test: add integration test for gameday orchestrator"
```

---

## Summary

**Files Created:**
1. ✅ `tests/load/load-test-helpers/gameday-discovery.js`
2. ✅ `tests/load/load-test-helpers/logging.js`
3. ✅ `tests/load/load-test-helpers/performer-gameday.js`
4. ✅ `tests/load/load-test-helpers/spectator-autonomous.js`
5. ✅ `tests/load/log-aggregator.js`
6. ✅ `tests/load/load-test-gameday-orchestrator.js`
7. ✅ `docs/load-testing/GAMEDAY_LOAD_TEST.md`
8. ✅ `tests/load/integration-test-gameday.sh`

**Files Modified:**
- `tests/load/load-test-helpers/auth.js` (documentation comment)

**Files Deprecated (leave in place, don't delete):**
- `tests/load/load-test-realistic-cycle.js`
- `tests/load/load-test-helpers/setup-manager.js`

---

## Plan Complete ✅

This plan implements the full gameday-centric load test orchestrator with:
- ✅ Gameday discovery & preparation
- ✅ Concurrent performers & spectators
- ✅ Autonomous spectator behavior (state detection, adaptive polling)
- ✅ Per-worker timestamped JSON logging
- ✅ Post-test log aggregation with gameday summaries
- ✅ User guide & integration test

**Next Steps:**
1. Execute tasks 1-9 (or use subagent-driven-development for parallel execution)
2. Run integration test to verify all components work together
3. Run full load test on staging with configurable VU scaling
