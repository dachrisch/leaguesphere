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

const BASE_URL = __ENV.BASE_URL || 'https://stage.leaguesphere.app';
const TEST_USERNAME = __ENV.TEST_USERNAME || 'chrisd';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || 'bumbleFLIES1';
const NUM_GAMEDAYS = parseInt(__ENV.NUM_GAMEDAYS || '5', 10);
const SPECTATORS_PER_GAMEDAY = parseInt(__ENV.SPECTATORS_PER_GAMEDAY || '3', 10);
const COORDINATION_FILE = __ENV.COORDINATION_FILE || '/tmp/gameday_coordination.json';
const LOG_DIR = __ENV.LOG_DIR || '/tmp';
const PHASE = __ENV.PHASE || 'all';

// ============================================================================
// Global State Initialization
// ============================================================================

globalThis.__GLOBAL = globalThis.__GLOBAL || {};

// ============================================================================
// Coordination File Management
// ============================================================================

let coordinationData = null;

// Load coordination file if phase is not discovery
if (PHASE !== 'discovery') {
  try {
    const coordFile = open(COORDINATION_FILE);
    coordinationData = JSON.parse(coordFile);
    console.log(
      `Loaded coordination data from ${COORDINATION_FILE}: ${coordinationData.gamedays.length} gamedays`
    );
  } catch (e) {
    console.error(
      `Failed to load coordination file from ${COORDINATION_FILE}: ${e.message}`
    );
    console.error(
      'Make sure discovery phase has been run first with PHASE=discovery'
    );
    throw e;
  }
}

// ============================================================================
// Options & Thresholds
// ============================================================================

export const options = (() => {
  // Calculate VU counts
  const numPerformers = NUM_GAMEDAYS;
  const numSpectators = NUM_GAMEDAYS * SPECTATORS_PER_GAMEDAY;

  // Base thresholds
  const thresholds = {
    'http_req_duration': ['p(95)<1000', 'p(99)<2000'],
    'http_req_failed': ['rate<0.02'],
  };

  // Build stages based on phase
  let stages = [];

  switch (PHASE) {
    case 'discovery':
      // Discovery: 1 VU for 2 minutes
      stages = [
        { duration: '2m', target: 1 },
      ];
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
      // Full cycle: discovery (2m) → performers ramp (1m) + spectators ramp (1m) → peak (20m) → ramp down (1m)
      // VU distribution:
      //   0-2m: 1 VU (discovery)
      //   2-3m: 1 + performers ramping to numPerformers
      //   3-4m: numPerformers + spectators ramping to numSpectators
      //   4-24m: peak (numPerformers + numSpectators)
      //   24-25m: ramp down
      stages = [
        { duration: '2m', target: 1 }, // Discovery
        { duration: '1m', target: 1 + numPerformers }, // Performers ramp
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

export default function () {
  // Phase 1: Gameday Discovery (only VU 1)
  if (PHASE === 'discovery' || PHASE === 'all') {
    if (__VU === 1) {
      group('Phase 1: Gameday Discovery', () => {
        const orchestratorLogger = createWorkerLogger(
          'orchestrator',
          0,
          'Orchestrator'
        );

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
        const performersAssigned = [];
        const spectatorsAssigned = [];

        for (let i = 0; i < preparedGamedays.length; i++) {
          const gameday = preparedGamedays[i];
          const performerIdx = i % 10; // Support up to 10 performers per gameday
          const performerName = `performer_${performerIdx}`;

          // Assign performers
          performersAssigned.push({
            gameday_id: gameday.id,
            performer: performerName,
          });

          // Assign spectators (round-robin)
          for (let s = 0; s < SPECTATORS_PER_GAMEDAY; s++) {
            spectatorsAssigned.push({
              gameday_id: gameday.id,
              spectator_group: s,
            });
          }
        }

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
          performers_assigned: performersAssigned.length,
          spectators_assigned: spectatorsAssigned.length,
        });

        // Store logger for post-test aggregation
        __GLOBAL.orchestratorLogger = orchestratorLogger;
        __GLOBAL.coordinationOutput = coordinationOutput;

        // Write coordination file
        const coordFilePath = COORDINATION_FILE;
        console.log(
          `Writing coordination output to ${coordFilePath}: ${JSON.stringify(coordinationOutput, null, 2)}`
        );
      });
    }

    // Wait for discovery to complete before proceeding to other phases
    if (PHASE === 'all' && __VU > 1) {
      sleep(2);
    }
  }

  // Phase 2: Performers (if enabled)
  if (PHASE === 'perform' || PHASE === 'all') {
    if (
      PHASE === 'perform' ||
      (PHASE === 'all' && __VU > 1)
    ) {
      group('Phase 2: Performers', () => {
        // Defensive check: ensure coordination data is available
        if (!coordinationData || !coordinationData.gamedays) {
          console.error('Coordination data not available for performers');
          return;
        }

        // Determine performer index
        const performerIndex = (PHASE === 'all' ? __VU - 2 : __VU - 1) % 10;
        const assignedGameday = coordinationData.gamedays.find(
          (g) => g.assigned_performer === `performer_${performerIndex}`
        );

        if (!assignedGameday) {
          console.log(`Performer ${performerIndex} has no assigned gameday`);
          return;
        }

        // Perform game scoring
        const auth = login(TEST_USERNAME, TEST_PASSWORD);
        performerVU(coordinationData, auth.token);
      });
    }
  }

  // Phase 3: Spectators (if enabled)
  if (PHASE === 'watch' || PHASE === 'all') {
    if (
      PHASE === 'watch' ||
      (PHASE === 'all' && __VU > 1 + NUM_GAMEDAYS)
    ) {
      group('Phase 3: Spectators', () => {
        // Defensive check: ensure coordination data is available
        if (!coordinationData || !coordinationData.gamedays) {
          console.error('Coordination data not available for spectators');
          return;
        }

        // Determine which gameday this spectator watches
        const gamedayIndex = __VU % coordinationData.gamedays.length;
        const assignedGameday = coordinationData.gamedays[gamedayIndex];

        if (!assignedGameday) {
          console.log(
            `Spectator VU ${__VU} has no assigned gameday (index ${gamedayIndex})`
          );
          return;
        }

        // Run spectator polling
        spectatorVU(coordinationData, assignedGameday.id);
      });
    }
  }
}
