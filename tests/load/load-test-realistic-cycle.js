// load-test-realistic-cycle.js

import { group, sleep } from 'k6';
import { login } from './load-test-helpers/auth.js';
import { fetchPublishedGamedays, prepareGamedaysForTest } from './load-test-helpers/setup-manager.js';
import { performCompleteGame } from './load-test-helpers/performers.js';
import { spectatorWatchGame } from './load-test-helpers/spectators.js';

const BASE_URL = __ENV.TARGET_HOST || 'https://stage.leaguesphere.app';
const TEST_USERNAME = __ENV.TEST_USERNAME || 'chrisd';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || 'bumbleFLIES1';
const MAX_GAMEDAYS = parseInt(__ENV.MAX_GAMEDAYS || '5');
const COORDINATION_FILE = __ENV.COORDINATION_FILE || '/tmp/gameday_assignments.json';

// Determine execution phase
const executionPhase = __ENV.PHASE || 'all'; // 'setup', 'performers', 'spectators', 'all'

// Load coordination file at init time using open()
let coordinationData = null;
if (executionPhase !== 'setup') {
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
    switch (executionPhase) {
      case 'setup':
        // Phase 1: Setup (1 VU for 3 minutes)
        return [{ duration: '3m', target: 1 }];

      case 'performers':
        // Phase 2: Performers (5-10 VUs for 20 minutes)
        return [
          { duration: '1m', target: 5 },   // Ramp to 5
          { duration: '18m', target: 10 }, // Ramp to 10
          { duration: '1m', target: 0 },   // Ramp down
        ];

      case 'spectators':
        // Phase 3: Spectators (wave arrivals over 20 minutes)
        return [
          { duration: '5m', target: 30 },  // Wave 1: 20-30 arrive
          { duration: '4m', target: 100 }, // Wave 2: Peak load 100
          { duration: '8m', target: 100 }, // Wave 2: Hold at peak
          { duration: '3m', target: 50 },  // Wave 3: Games finishing
          { duration: '1m', target: 0 },   // Ramp down
        ];

      case 'all':
      default:
        // Combined: 55 minutes total (all three phases)
        return [
          { duration: '3m', target: 1 },
          { duration: '1m', target: 6 },
          { duration: '18m', target: 110 },
          { duration: '8m', target: 110 },
          { duration: '1m', target: 50 },
          { duration: '24m', target: 0 },
        ];
    }
  })(),

  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<3000'],
    http_req_failed: ['rate<0.02'],
  },
};

export default function () {
  let auth = null;

  // ============================================================
  // PHASE 1: SETUP MANAGER (Only 1 VU executes this)
  // ============================================================
  if (executionPhase === 'all' || executionPhase === 'setup') {
    if (__VU === 1) {
      group('Phase 1: Setup Manager', () => {
        console.log('=== Phase 1: Setup Manager ===');

        // Login
        auth = login(TEST_USERNAME, TEST_PASSWORD);
        sleep(0.5);

        // Fetch published gamedays
        const gamedays = fetchPublishedGamedays(auth.token, 10);
        console.log(`Found ${gamedays.length} published gamedays`);

        // Prepare gamedays (change dates, fetch games, assign performers/spectators)
        const prepared = prepareGamedaysForTest(gamedays, auth.token, auth.csrfToken, MAX_GAMEDAYS);
        console.log(`Prepared ${prepared.length} gamedays for test`);

        // Log all prepared games
        let totalGames = 0;
        prepared.forEach((gameday, idx) => {
          console.log(`\n[Gameday ${idx + 1}] ID: ${gameday.id}, Name: ${gameday.name}, Games: ${gameday.games.length}`);
          gameday.games.forEach((game) => {
            console.log(`  ├─ Game ${game.id}: ${game.home} vs ${game.away}`);
            totalGames++;
          });
        });
        console.log(`\nTotal games prepared: ${totalGames}`);

        // Write coordination file as JSON
        const coordinationJson = JSON.stringify({
          timestamp: new Date().toISOString(),
          gamedays: prepared,
        }, null, 2);

        console.log(`\nCoordination data (would be written to ${COORDINATION_FILE}):`);
        console.log(JSON.stringify(prepared, null, 2));
      });
    } else {
      // Other VUs in Phase 1 just wait
      sleep(180); // Wait 3 minutes for Phase 1 to complete
    }
  }

  // Wait for all VUs to sync at start of Phase 2
  if (executionPhase === 'all') {
    sleep(2);
  }

  // ============================================================
  // PHASE 2: PERFORMERS (5-10 VUs execute this)
  // ============================================================
  if (executionPhase === 'all' || executionPhase === 'performers') {
    group('Phase 2: Performers', () => {
      console.log(`=== Phase 2: Performer ${__VU} ===`);

      // Login if not already authenticated
      if (!auth || !auth.token) {
        auth = login(TEST_USERNAME, TEST_PASSWORD);
      }

      // Use coordination data loaded at init time
      if (!coordinationData) {
        console.error('No coordination data available for Phase 2');
        return;
      }

      const gamedays = coordinationData.gamedays;

      // Assign performers: performer_0 → VU 1, performer_1 → VU 2, etc.
      const performerIndex = (__VU - 1) % 10;
      const assignedGameday = gamedays.find((g) => g.assigned_performer === `performer_${performerIndex}`);

      if (!assignedGameday) {
        console.log(`Performer ${performerIndex} has no assigned gameday`);
        return;
      }

      console.log(`\n=== Performer ${performerIndex} (VU ${__VU}) scoring gameday ${assignedGameday.id} (${assignedGameday.games.length} games) ===`);

      // Score each game in sequence
      let completedCount = 0;
      for (const game of assignedGameday.games) {
        console.log(`[Performer ${performerIndex}] Processing game ${game.id}: ${game.home} vs ${game.away}`);
        performCompleteGame(game, auth.token, auth.csrfToken);
        completedCount++;
        console.log(`[Performer ${performerIndex}] ✓ Game ${game.id} completed (${completedCount}/${assignedGameday.games.length})`);
        sleep(1); // Brief rest between games
      }

      console.log(`[Performer ${performerIndex}] All ${completedCount} games completed for gameday ${assignedGameday.id}`);
    });
  }

  // ============================================================
  // PHASE 3: SPECTATORS (50-100 VUs execute this)
  // ============================================================
  if (executionPhase === 'all' || executionPhase === 'spectators') {
    group('Phase 3: Spectators', () => {
      // Login if not already authenticated
      if (!auth || !auth.token) {
        auth = login(TEST_USERNAME, TEST_PASSWORD);
      }

      // Use coordination data loaded at init time
      if (!coordinationData) {
        console.error('No coordination data available for Phase 3');
        return;
      }

      const gamedays = coordinationData.gamedays;

      // Assign spectators to gamedays (round-robin)
      const gamedayIndex = ((__VU - 100) % gamedays.length);
      const assignedGameday = gamedays[gamedayIndex];

      if (!assignedGameday) {
        console.log(`Spectator ${__VU} has no assigned gameday`);
        return;
      }

      const gameIds = assignedGameday.games.map((g) => g.id);
      const waveArrivalTime = calculateWaveArrival(__VU);

      console.log(`[Spectator ${__VU}] Wave arrival in ${waveArrivalTime} min, gameday ${assignedGameday.id} (${gameIds.length} games: ${gameIds.join(', ')})`);

      // Watch the game with wave arrival
      spectatorWatchGame(assignedGameday.id, gameIds, auth.token, waveArrivalTime);
      console.log(`[Spectator ${__VU}] Watching complete`);
    });
  }
}

function calculateWaveArrival(vu) {
  /**
   * Determine which wave a spectator arrives in based on VU number
   * Wave 1 (min 5): First 30 VUs
   * Wave 2 (min 9): Next 70 VUs
   * Wave 3 (min 17): Remaining VUs
   */
  if (vu <= 30) return 5;     // Wave 1
  if (vu <= 100) return 9;    // Wave 2
  return 17;                  // Wave 3
}
