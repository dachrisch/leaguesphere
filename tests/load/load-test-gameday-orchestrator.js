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
// Coordination File Management
// ============================================================================

let coordinationData = null;

// Load coordination data based on phase
// - 'discover': VU 1 writes the file, other VUs skip
// - 'perform': File must exist from prior discovery run
// - 'all': File created during discovery phase, loaded later by performers
if (PHASE === 'perform' || PHASE === 'watch') {
  // For 'perform' and 'watch' phases, coordination file must exist from prior discovery
  try {
    const coordFile = open(COORDINATION_FILE);
    coordinationData = JSON.parse(coordFile);
    console.log(`✓ Loaded coordination file for ${PHASE} phase`);
  } catch (e) {
    throw new Error(`Coordination file required for ${PHASE} phase but not found at ${COORDINATION_FILE}: ${e.message}`);
  }
}
// For 'discover' phase: coordinationData remains null (VU 1 will write the file)
// For 'all' phase: coordinationData will be null at init time; performers will wait for discovery to complete

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

        // Store logger and coordination output for post-test aggregation
        __GLOBAL.orchestratorLogger = orchestratorLogger;
        __GLOBAL.coordinationOutput = coordinationOutput;

        // Log coordination data for external processing
        // Note: k6 cannot write files during test execution. Use a wrapper script
        // to extract __GLOBAL.coordinationOutput and write it to disk.
        console.log(`COORDINATION_DATA_JSON: ${JSON.stringify(coordinationOutput)}`);
        console.log(
          `Coordination data prepared for export: ${coordinationOutput.gamedays.length} gamedays, ${performersAssigned.length} performers, ${spectatorsAssigned.length} spectators`
        );
      });
    }

    // Other VUs skip discovery phase; VU 1 writes the coordination file
    if (__VU > 1) {
      // VU 1 will write coordination file; other VUs will load it during performers phase
      return;
    }
  }

  // Phase 2: Performers (if enabled)
  if (PHASE === 'perform' || PHASE === 'all') {
    if (
      PHASE === 'perform' ||
      (PHASE === 'all' && __VU > 1)
    ) {
      group('Phase 2: Performers', () => {
        // For 'all' phase: coordination file is created by VU 1 during discovery
        // Other VUs must wait for it to be written
        if (!coordinationData && PHASE === 'all') {
          // Wait for discovery phase to complete (it runs on iteration 1 for VU 1)
          // Max wait: 180 seconds (should complete in ~2 minutes)
          let waitTime = 0;
          while (!coordinationData && waitTime < 180) {
            try {
              const coordFile = open(COORDINATION_FILE);
              coordinationData = JSON.parse(coordFile);
              console.log(`✓ Loaded coordination file after ${waitTime}s delay`);
              break;
            } catch (e) {
              sleep(1);
              waitTime += 1;
            }
          }
        }

        if (!coordinationData || !coordinationData.gamedays) {
          console.error('Coordination data not available for performers (VU ' + __VU + ', iteration ' + __ITER + ')');
          return;
        }

        if (coordinationData.gamedays.length > 0) {
          const firstGameday = coordinationData.gamedays[0];
          const firstGame = firstGameday.games?.[0];
          if (firstGame && (!firstGame.homeTeam || !firstGame.awayTeam)) {
            console.warn(`⚠️ WARNING: Game ${firstGame.id} has missing team names (homeTeam: ${firstGame.homeTeam}, awayTeam: ${firstGame.awayTeam})`);
          } else if (firstGame) {
            console.log(`✓ Coordination data verified: ${coordinationData.gamedays.length} gamedays, first game has teams ${firstGame.homeTeam} vs ${firstGame.awayTeam}`);
          }
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
        // For 'all' phase: coordination file is created by VU 1 during discovery
        // Other VUs must wait for it to be written
        if (!coordinationData && PHASE === 'all') {
          let waitTime = 0;
          while (!coordinationData && waitTime < 180) {
            try {
              const coordFile = open(COORDINATION_FILE);
              coordinationData = JSON.parse(coordFile);
              console.log(`✓ Spectators loaded coordination file after ${waitTime}s delay`);
              break;
            } catch (e) {
              sleep(1);
              waitTime += 1;
            }
          }
        }

        if (!coordinationData || !coordinationData.gamedays) {
          console.error('Coordination data not available for spectators (VU ' + __VU + ', iteration ' + __ITER + ')');
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
