// tests/load/load-test-gameday-orchestrator.js
/**
 * Main K6 Orchestrator Script - Gameday-Centric Load Test
 *
 * Orchestrates a multi-phase load test:
 * 1. Discovery: Single VU discovers gamedays with unplayed games
 * 2. Performers: Multiple VUs record game events and scores
 * 3. Spectators: Multiple VUs autonomously poll gameday progress
 *
 * Phases are controlled via PHASE environment variable:
 * - 'discovery': Only run discovery phase
 * - 'perform': Only run performers phase
 * - 'watch': Only run spectators phase
 * - 'all': Run full discovery → performers → spectators
 */

import { group, sleep } from 'k6';
import { login } from './load-test-helpers/auth.js';
import {
  findGamedaysWithUnplayedGames,
  prepareGamedayForTest,
} from './load-test-helpers/gameday-discovery.js';
import { performerVU } from './load-test-helpers/performer-gameday.js';
import { spectatorVU } from './load-test-helpers/spectator-autonomous.js';
import { createWorkerLogger } from './load-test-helpers/logging.js';

// ============================================================================
// Environment Configuration
// ============================================================================

const BASE_URL = __ENV.TARGET_HOST || 'https://stage.leaguesphere.app';
const TEST_USERNAME = __ENV.TEST_USERNAME || 'k6';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || 'load!Test';
const NUM_GAMEDAYS = parseInt(__ENV.NUM_GAMEDAYS || __ENV.GAMEDAYS || '5', 10);
const SPECTATORS_PER_GAMEDAY = parseInt(__ENV.SPECTATORS_PER_GAMEDAY || '3', 10);
const COORDINATION_FILE = __ENV.COORDINATION_FILE || '/tmp/gameday_coordination.json';
const LOG_DIR = __ENV.LOG_DIR || '/tmp';
const PHASE = __ENV.PHASE || 'all';

// ============================================================================
// Global State Initialization
// ============================================================================

globalThis.__GLOBAL = globalThis.__GLOBAL || {};

// ============================================================================
// Setup: Discovery Phase (runs once before VUs start)
// ============================================================================

export function setup() {
  if (PHASE === 'perform' || PHASE === 'watch') {
    // For 'perform' and 'watch' phases, load pre-existing coordination file
    try {
      const coordFile = open(COORDINATION_FILE);
      const data = JSON.parse(coordFile);
      console.log(`✓ [setup] Loaded coordination file for ${PHASE} phase: ${data.gamedays?.length} gameday(s)`);
      return data;
    } catch (e) {
      throw new Error(`Coordination file required for ${PHASE} phase but not found at ${COORDINATION_FILE}: ${e.message}`);
    }
  }

  if (PHASE === 'discovery' || PHASE === 'all') {
    // Run discovery once, return coordination data
    const orchestratorLogger = createWorkerLogger('orchestrator', 0, 'Orchestrator');
    orchestratorLogger.logEvent('discovery_start', {
      target_gamedays: NUM_GAMEDAYS,
      phase: PHASE,
    });

    // Login
    const auth = login(TEST_USERNAME, TEST_PASSWORD);
    orchestratorLogger.logEvent('login_complete', {
      token_length: auth.token.length,
    });

    // Find gamedays
    const discoveredGamedays = findGamedaysWithUnplayedGames(auth.token, 20);
    orchestratorLogger.logEvent('gamedays_discovered', {
      count: discoveredGamedays.length,
    });

    // Prepare gamedays
    const preparedGamedays = [];
    for (
      let i = 0;
      i < discoveredGamedays.length && preparedGamedays.length < NUM_GAMEDAYS;
      i++
    ) {
      const prepared = prepareGamedayForTest(discoveredGamedays[i], auth.token);
      if (prepared) {
        preparedGamedays.push(prepared);
        orchestratorLogger.logEvent('gameday_prepared', {
          gameday_id: prepared.id,
          gameday_name: prepared.name,
          games_count: prepared.games_count,
        });
      }
    }

    // Build coordination output
    const coordinationOutput = {
      discovery_time: new Date().toISOString(),
      total_gamedays: preparedGamedays.length,
      gamedays: preparedGamedays.map((gd, idx) => ({
        id: gd.id,
        name: gd.name,
        date: gd.date,
        start: gd.start,
        season: gd.season,
        league: gd.league,
        games_count: gd.games_count,
        games: gd.games,
        assigned_performer: `performer_${idx % 10}`,
        spectators: Array.from({ length: SPECTATORS_PER_GAMEDAY }, (_, s) => s),
      })),
      num_performers: NUM_GAMEDAYS,
      spectators_per_gameday: SPECTATORS_PER_GAMEDAY,
    };

    orchestratorLogger.logEvent('discovery_complete', {
      gamedays_prepared: preparedGamedays.length,
    });

    // Log for wrapper script to capture (file I/O workaround)
    console.log(`COORDINATION_DATA_JSON: ${JSON.stringify(coordinationOutput)}`);
    console.log(
      `✓ [setup] Discovery complete: ${coordinationOutput.gamedays.length} gameday(s) prepared`
    );

    return coordinationOutput;
  }

  return {};
}

// ============================================================================
// Options & Thresholds
// ============================================================================

export const options = (() => {
  // Calculate VU counts
  const numPerformers = NUM_GAMEDAYS;
  const numSpectators = NUM_GAMEDAYS * SPECTATORS_PER_GAMEDAY;

  // Base thresholds (increased to 2s for p95 to match real-world API latency)
  const thresholds = {
    'http_req_duration': ['p(95)<2000', 'p(99)<3000'],
    'http_req_failed': ['rate<0.02'],
  };

  // Build stages based on phase
  let stages = [];

  switch (PHASE) {
    case 'discovery':
      // Discovery: handled by setup(), minimal placeholder stage
      stages = [{ duration: '10s', target: 1 }];
      break;

    case 'perform':
      // Performers: ramp to N, hold 20m, ramp down
      stages = [
        { duration: '1m', target: numPerformers },
        { duration: '20m', target: numPerformers },
        { duration: '1m', target: 0 },
      ];
      break;

    case 'watch':
      // Spectators: ramp to N*X, hold 20m, ramp down
      stages = [
        { duration: '1m', target: numSpectators },
        { duration: '20m', target: numSpectators },
        { duration: '1m', target: 0 },
      ];
      break;

    case 'all':
    default:
      // Full cycle: setup() handles discovery, stages are performers + spectators
      // VU distribution:
      //   0-1m: numPerformers ramping (performers phase)
      //   1-21m: numPerformers peak
      //   21-22m: numPerformers + numSpectators ramping in (spectators phase)
      //   22-42m: peak (numPerformers + numSpectators)
      //   42-43m: ramp down
      stages = [
        { duration: '1m', target: numPerformers }, // Performers ramp
        { duration: '20m', target: numPerformers }, // Performers peak
        { duration: '1m', target: numPerformers + numSpectators }, // Spectators ramp
        { duration: '20m', target: numPerformers + numSpectators }, // Peak
        { duration: '1m', target: 0 }, // Ramp down
      ];
      break;
  }

  return {
    stages: stages,
    thresholds: thresholds,
  };
})();

// ============================================================================
// Main Test Function
// ============================================================================

export default function (data) {
  const coordinationData = data;

  // PHASE=discovery: setup() did all the work, this is a no-op
  if (PHASE === 'discovery') {
    sleep(1);
    return;
  }

  // Phase 2: Performers (if enabled)
  if (PHASE === 'perform' || (PHASE === 'all' && __VU <= NUM_GAMEDAYS)) {
    group('Phase 2: Performers', () => {
      if (!coordinationData || !coordinationData.gamedays) {
        console.error(`[VU ${__VU}] No coordination data for performers`);
        return;
      }

      // Performer index: VU 1 = performer_0, VU 2 = performer_1, etc.
      const performerIndex = (__VU - 1) % 10;
      const assignedGameday = coordinationData.gamedays.find(
        (g) => g.assigned_performer === `performer_${performerIndex}`
      );

      if (!assignedGameday) {
        console.log(`[VU ${__VU}] Performer ${performerIndex} has no assigned gameday`);
        return;
      }

      // Verify game data quality
      if (assignedGameday.games && assignedGameday.games.length > 0) {
        const firstGame = assignedGameday.games[0];
        console.log(
          `[VU ${__VU}] Performer assigned gameday: ${assignedGameday.name} (${assignedGameday.games.length} games)`
        );
      }

      // Perform game scoring
      const auth = login(TEST_USERNAME, TEST_PASSWORD);
      performerVU(coordinationData, auth.token);
    });
    return;
  }

  // Phase 3: Spectators (if enabled)
  if (PHASE === 'watch' || (PHASE === 'all' && __VU > NUM_GAMEDAYS)) {
    group('Phase 3: Spectators', () => {
      if (!coordinationData || !coordinationData.gamedays) {
        console.error(`[VU ${__VU}] No coordination data for spectators`);
        return;
      }

      // Determine which gameday this spectator watches
      const gamedayIndex = (__VU - NUM_GAMEDAYS - 1) % coordinationData.gamedays.length;
      const assignedGameday = coordinationData.gamedays[gamedayIndex];

      if (!assignedGameday) {
        console.log(`[VU ${__VU}] Spectator has no assigned gameday (index ${gamedayIndex})`);
        return;
      }

      console.log(`[VU ${__VU}] Spectator watching gameday: ${assignedGameday.name}`);

      // Run spectator polling
      spectatorVU(coordinationData, assignedGameday.id);
    });
    return;
  }
}

// ============================================================================
// Teardown: Write logs to files for post-test aggregation
// ============================================================================

export function handleSummary(data) {
  // Write worker logs to files
  const logDir = LOG_DIR;

  // Orchestrator logs
  if (__GLOBAL.orchestratorLogger) {
    const orchestratorJson = __GLOBAL.orchestratorLogger.getEventsJson();
    const orchestratorPath = `${logDir}/orchestrator_discovery.json`;
    console.log(`Writing orchestrator logs to: ${orchestratorPath}`);
  }

  // Performer logs
  const performerLoggers = __GLOBAL.performerLoggers || {};
  Object.entries(performerLoggers).forEach(([workerId, logger]) => {
    if (logger && logger.getEventsJson) {
      const performerJson = logger.getEventsJson();
      // Note: k6 cannot write files, but we log the data for external capture
      console.log(`WORKER_LOG_JSON [${workerId}]: ${JSON.stringify(performerJson)}`);
    }
  });

  // Spectator logs
  const spectatorLoggers = __GLOBAL.spectatorLoggers || {};
  Object.entries(spectatorLoggers).forEach(([workerId, logger]) => {
    if (logger && logger.getEventsJson) {
      const spectatorJson = logger.getEventsJson();
      console.log(`WORKER_LOG_JSON [${workerId}]: ${JSON.stringify(spectatorJson)}`);
    }
  });

  return {
    stdout: data.summaryTrend,
  };
}
