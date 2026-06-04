# Load Test Orchestrator: Event Recording Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix event recording in the k6 load test orchestrator by capturing real team names during discovery phase and removing the broken `fetchGameDetails()` endpoint call.

**Architecture:** Three coordinated fixes:
1. Extract team names from discovery API response and store in coordination file
2. Fix `PHASE='all'` initialization by deferring coordination file load to discovery completion
3. Simplify performer phase to use pre-fetched team data instead of calling non-existent endpoint

**Tech Stack:** k6 (JavaScript), Django REST API, JSON coordination file

---

## Files to Modify

### 1. `tests/load/load-test-helpers/gameday-discovery.js`
- **Change:** Extract `homeTeam` and `awayTeam` from `results` array during game mapping
- **Lines:** 130-147 (games mapping), 156-169 (function return)

### 2. `tests/load/load-test-helpers/performer-gameday.js`
- **Delete:** `fetchGameDetails()` function (lines 88-125)
- **Change:** `scoreCompleteGame()` to use `game.homeTeam` and `game.awayTeam` (lines 242-308)
- **Delete:** Placeholder team guard condition (lines 272-299)

### 3. `tests/load/load-test-gameday-orchestrator.js`
- **Change:** Handle coordination file loading for both `PHASE='all'` and other phases (lines 46-78, 264-279, 297-318)

---

## Task 1: Capture Team Names During Discovery

**Files:**
- Modify: `tests/load/load-test-helpers/gameday-discovery.js:130-169`

**Context:** The discovery phase fetches `/api/gamedays/{id}/games/` which returns team names in the `results` array as `results[i].team_name`. Currently this data is discarded. We need to extract and store it in the coordination file.

- [ ] **Step 1: Update `prepareGamedayForTest()` to extract team names**

Open the file and locate the games mapping at line 140. Replace this:

```javascript
export function prepareGamedayForTest(gameday, token, maxGamedaysToTest = 5) {
  const games = fetchGamedayGames(gameday.id, token);

  if (!hasUnplayedGames(games)) {
    console.log(`  Gameday ${gameday.id} has no unplayed games, skipping`);
    return null;
  }

  updateGamedayDateToToday(gameday, token);

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

With this:

```javascript
export function prepareGamedayForTest(gameday, token, maxGamedaysToTest = 5) {
  const games = fetchGamedayGames(gameday.id, token);

  if (!hasUnplayedGames(games)) {
    console.log(`  Gameday ${gameday.id} has no unplayed games, skipping`);
    return null;
  }

  updateGamedayDateToToday(gameday, token);

  return {
    id: gameday.id,
    name: gameday.name,
    date: new Date().toISOString().split('T')[0],
    start: gameday.start || '18:00',
    status: 'PUBLISHED',
    season: gameday.season,
    league: gameday.league,
    games_count: games.length,
    games: games.map((g) => {
      // Extract team names from results array
      const homeResult = g.results?.find((r) => r.isHome === true);
      const awayResult = g.results?.find((r) => r.isHome === false);
      
      const homeTeam = homeResult?.team_name || null;
      const awayTeam = awayResult?.team_name || null;

      return {
        id: g.id,
        field: g.field || 'unknown',
        scheduled: g.scheduled || 'unknown',
        status: g.status || 'PUBLISHED',
        homeTeam: homeTeam,
        awayTeam: awayTeam,
      };
    }),
  };
}
```

- [ ] **Step 2: Add logging to verify team names are captured**

In the same function, add this line right after the games mapping, inside the return object (after `games_count`):

```javascript
    games_count: games.length,
    games: games.map((g) => {
      // ... team extraction code ...
    }),
    // ADD THIS LINE:
    _debug_team_extraction: games.filter((g) => g.results?.length > 0).map((g) => ({
      id: g.id,
      teams: g.results?.map((r) => ({ name: r.team_name, isHome: r.isHome })),
    })),
```

- [ ] **Step 3: Verify the change compiles**

Run:
```bash
cd /home/cda/dev/leaguesphere/.worktrees/feature-ls-worktree
node -c tests/load/load-test-helpers/gameday-discovery.js
```

Expected: No output (syntax check passes)

- [ ] **Step 4: Commit the discovery phase changes**

```bash
cd /home/cda/dev/leaguesphere/.worktrees/feature-ls-worktree
git add tests/load/load-test-helpers/gameday-discovery.js
git commit -m "feat: extract team names from discovery API response and store in coordination file"
```

---

## Task 2: Remove Broken `fetchGameDetails()` Function

**Files:**
- Modify: `tests/load/load-test-helpers/performer-gameday.js:88-125`

**Context:** The `fetchGameDetails()` function at lines 88-125 calls `GET /api/game/{gameId}/` which doesn't exist in the Django API. This always returns 404, causing event recording to be permanently disabled. We'll delete this function entirely since team names are now in the coordination file.

- [ ] **Step 1: Delete the `fetchGameDetails()` function**

Locate this function in `performer-gameday.js`:

```javascript
function fetchGameDetails(gameId, token, logger) {
  /**
   * Fetch game details including team names for the given game.
   * This function attempts to retrieve team information but does not exist as a valid endpoint.
   *
   * @param {number} gameId - The ID of the game
   * @param {string} token - Auth token
   * @param {WorkerLogger} logger - Logger instance
   * @returns {Object} { homeTeam, awayTeam }
   */
  try {
    const res = http.get(
      `${BASE_URL}/api/game/${gameId}/`,
      {
        headers: {
          Authorization: `Token ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    check(res, {
      'game details fetch succeeds': (r) => r.status === 200,
    });

    const gameDetails = res.json();

    return {
      homeTeam: gameDetails?.home_team_name || 'Home',
      awayTeam: gameDetails?.away_team_name || 'Away',
    };
  } catch (e) {
    logger.logEvent('game_detail_fetch_failed', {
      game_id: gameId,
      error: e.message,
    });
    return { homeTeam: 'Home', awayTeam: 'Away' };
  }
}
```

**Delete this entire function (approximately 37 lines).**

- [ ] **Step 2: Verify syntax after deletion**

Run:
```bash
node -c tests/load/load-test-helpers/performer-gameday.js
```

Expected: No output (syntax check passes)

- [ ] **Step 3: Commit the deletion**

```bash
cd /home/cda/dev/leaguesphere/.worktrees/feature-ls-worktree
git add tests/load/load-test-helpers/performer-gameday.js
git commit -m "fix: remove broken fetchGameDetails() that called non-existent endpoint"
```

---

## Task 3: Update `scoreCompleteGame()` to Use Pre-Fetched Team Names

**Files:**
- Modify: `tests/load/load-test-helpers/performer-gameday.js:242-308`

**Context:** Now that team names are in the coordination file, `scoreCompleteGame()` should use them directly from the `game` parameter instead of trying to fetch them. We also need to remove the placeholder team guard condition since all team names are guaranteed to be real from discovery.

- [ ] **Step 1: Update function signature and initial team name extraction**

Locate the `scoreCompleteGame()` function (starts around line 242). Replace the first ~20 lines:

```javascript
export function scoreCompleteGame(game, token, logger) {
  const gameId = game.id;

  // Fetch game details to get real team names
  const { homeTeam, awayTeam } = fetchGameDetails(gameId, token, logger);

  logger.logEvent('game_start', {
    game_id: gameId,
    field: game.field,
    scheduled: game.scheduled,
  });
```

With this:

```javascript
export function scoreCompleteGame(game, token, logger) {
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
```

- [ ] **Step 2: Remove the placeholder team guard condition**

Locate this section in the function (around line 272):

```javascript
  // First Half - 3 events alternating teams
  if (homeTeam !== 'Home' && awayTeam !== 'Away') {
    // Record first half events (only if we have real team names)
    const firstHalfEvents = ['Touchdown', 'Touchdown', 'Safety'];
    const firstHalfTeams = [homeTeam, awayTeam, homeTeam];

    for (let i = 0; i < firstHalfEvents.length; i++) {
      recordEvent(gameId, firstHalfTeams[i], firstHalfEvents[i], 1, token, logger);
      sleep(0.3);
    }
  } else {
    logger.logEvent('game_skipped', { game_id: gameId, reason: 'placeholder_teams' });
  }
```

Replace with:

```javascript
  // First Half - 3 events alternating teams
  const firstHalfEvents = ['Touchdown', 'Touchdown', 'Safety'];
  const firstHalfTeams = [homeTeam, awayTeam, homeTeam];

  for (let i = 0; i < firstHalfEvents.length; i++) {
    recordEvent(gameId, firstHalfTeams[i], firstHalfEvents[i], 1, token, logger);
    sleep(0.3);
  }
```

- [ ] **Step 3: Remove the second half guard condition**

Locate this section (around line 291):

```javascript
  // Second Half - 3 events alternating teams
  if (homeTeam !== 'Home' && awayTeam !== 'Away') {
    const secondHalfEvents = ['Touchdown', 'Touchdown', 'Safety'];
    const secondHalfTeams = [homeTeam, awayTeam, homeTeam];

    for (let i = 0; i < secondHalfEvents.length; i++) {
      recordEvent(gameId, secondHalfTeams[i], secondHalfEvents[i], 2, token, logger);
      sleep(0.3);
    }
  }
```

Replace with:

```javascript
  // Second Half - 3 events alternating teams
  const secondHalfEvents = ['Touchdown', 'Touchdown', 'Safety'];
  const secondHalfTeams = [homeTeam, awayTeam, homeTeam];

  for (let i = 0; i < secondHalfEvents.length; i++) {
    recordEvent(gameId, secondHalfTeams[i], secondHalfEvents[i], 2, token, logger);
    sleep(0.3);
  }
```

- [ ] **Step 4: Update the final logging**

Locate the final game_complete log (around line 304):

```javascript
  logger.logEvent('game_complete', {
    game_id: gameId,
    total_events: 6,
  });
```

Update to include team names for clarity:

```javascript
  logger.logEvent('game_complete', {
    game_id: gameId,
    home_team: homeTeam,
    away_team: awayTeam,
    total_events: 6,
  });
```

- [ ] **Step 5: Verify syntax**

Run:
```bash
node -c tests/load/load-test-helpers/performer-gameday.js
```

Expected: No output (syntax check passes)

- [ ] **Step 6: Commit the performer phase changes**

```bash
cd /home/cda/dev/leaguesphere/.worktrees/feature-ls-worktree
git add tests/load/load-test-helpers/performer-gameday.js
git commit -m "fix: use pre-fetched team names from coordination file, remove placeholder team guards"
```

---

## Task 4: Fix PHASE='all' Coordination File Loading

**Files:**
- Modify: `tests/load/load-test-gameday-orchestrator.js:46-78, 264-279, 297-318`

**Context:** When `PHASE='all'`, the coordination file doesn't exist at init time (it's created by the discovery phase during test execution). The current code tries to load it at init time and fails silently, leaving `coordinationData = null`. We need to handle both cases: pre-existing files for `PHASE='perform'` and files created during discovery for `PHASE='all'`.

- [ ] **Step 1: Update init-time loading to handle `PHASE='all'`**

Locate the coordination file loading section (lines 46-78):

```javascript
const COORDINATION_FILE = '/tmp/gameday_coordination.json';
let coordinationData = null;

// Load coordination data if it exists
if (PHASE !== 'discovery') {
  try {
    const coordFile = open(COORDINATION_FILE);
    coordinationData = JSON.parse(coordFile);
  } catch (e) {
    // For 'all' phase, file may not exist yet (created during discovery)
    if (PHASE === 'all') {
      console.warn(`Coordination file not found (expected during discovery phase)`);
    } else {
      throw e;
    }
  }
}
```

Replace with:

```javascript
const COORDINATION_FILE = '/tmp/gameday_coordination.json';
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
```

- [ ] **Step 2: Update performers phase to wait for and load coordination file**

Locate the performers phase check (around line 276-279):

```javascript
  if (!coordinationData || !coordinationData.gamedays) {
    console.error('Coordination data not available for performers');
    return;
  }
```

Replace with:

```javascript
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
```

- [ ] **Step 3: Update spectators phase similarly**

Locate the spectators phase check (around line 306-309):

```javascript
  if (!coordinationData || !coordinationData.gamedays) {
    console.error('Coordination data not available for spectators');
    return;
  }
```

Replace with:

```javascript
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
```

- [ ] **Step 4: Remove the sleep(2) hack for VU > 1 during discovery**

Locate this section (around line 264):

```javascript
  // Other VUs wait briefly for VU 1 to complete discovery
  if (__VU > 1) {
    sleep(2);
    return;
  }
```

Replace with:

```javascript
  // Other VUs skip discovery phase; VU 1 writes the coordination file
  if (__VU > 1) {
    // VU 1 will write coordination file; other VUs will load it during performers phase
    return;
  }
```

- [ ] **Step 5: Add validation logging**

After the performers phase coordination load, add this validation (around line 280):

```javascript
  if (!coordinationData || !coordinationData.gamedays) {
    // ... error message ...
    return;
  }

  // ADD THIS:
  if (coordinationData.gamedays.length > 0) {
    const firstGameday = coordinationData.gamedays[0];
    const firstGame = firstGameday.games?.[0];
    if (firstGame && (!firstGame.homeTeam || !firstGame.awayTeam)) {
      console.warn(`⚠️ WARNING: Game ${firstGame.id} has missing team names (homeTeam: ${firstGame.homeTeam}, awayTeam: ${firstGame.awayTeam})`);
    } else if (firstGame) {
      console.log(`✓ Coordination data verified: ${coordinationData.gamedays.length} gamedays, first game has teams ${firstGame.homeTeam} vs ${firstGame.awayTeam}`);
    }
  }
```

- [ ] **Step 6: Verify syntax**

Run:
```bash
node -c tests/load/load-test-gameday-orchestrator.js
```

Expected: No output (syntax check passes)

- [ ] **Step 7: Commit the orchestrator changes**

```bash
cd /home/cda/dev/leaguesphere/.worktrees/feature-ls-worktree
git add tests/load/load-test-gameday-orchestrator.js
git commit -m "fix: handle PHASE='all' coordination file loading with proper wait mechanism"
```

---

## Task 5: Verify Fixes End-to-End

**Files:**
- Test: All three modified files
- Manual test: Run orchestrator with `PHASE=all`

- [ ] **Step 1: Verify all files have correct syntax**

Run:
```bash
cd /home/cda/dev/leaguesphere/.worktrees/feature-ls-worktree
node -c tests/load/load-test-helpers/gameday-discovery.js && \
node -c tests/load/load-test-helpers/performer-gameday.js && \
node -c tests/load/load-test-gameday-orchestrator.js
echo "✓ All files have valid syntax"
```

Expected: "✓ All files have valid syntax"

- [ ] **Step 2: Run minimal orchestrator test with `PHASE=perform`**

First, verify discovery works and creates the coordination file:

```bash
cd /home/cda/dev/leaguesphere/.worktrees/feature-ls-worktree/tests/load
PHASE=discovery k6 run load-test-gameday-orchestrator.js
```

Expected: 
- Discovery completes
- Coordination file written to `/tmp/gameday_coordination.json`
- Output shows games with team names (check logs for homeTeam/awayTeam)

- [ ] **Step 3: Run performers phase with pre-existing coordination file**

```bash
cd /home/cda/dev/leaguesphere/.worktrees/feature-ls-worktree/tests/load
PHASE=perform k6 run load-test-gameday-orchestrator.js --duration 30s --vus 2
```

Expected:
- Performers phase loads coordination file successfully
- Logs show "game_start" events with home_team and away_team names
- All 6 events recorded per game (no "placeholder_teams" skips)
- No "team ... not found" errors in output
- Check count: 100% (all game setup, officials, events, finalize succeed)

- [ ] **Step 4: Run full orchestrator with `PHASE=all`**

```bash
cd /home/cda/dev/leaguesphere/.worktrees/feature-ls-worktree/tests/load
PHASE=all k6 run load-test-gameday-orchestrator.js --duration 120s --vus 3
```

Expected:
- VU 1 runs discovery and writes coordination file
- VUs 2-3 wait for file to exist, then load it
- Performers phase runs successfully with real team names
- Logs show proper progression: discovery → performers
- Spectators phase runs if enabled
- All games recorded with real team data

- [ ] **Step 5: Verify coordination file structure**

After a test run, check the coordination file:

```bash
cd /home/cda/dev/leaguesphere/.worktrees/feature-ls-worktree/tests/load
cat /tmp/gameday_coordination.json | jq '.gamedays[0].games[0]'
```

Expected output (should include homeTeam and awayTeam):

```json
{
  "id": 123,
  "field": "Field A",
  "scheduled": "18:00",
  "status": "PUBLISHED",
  "homeTeam": "Red Dragons",
  "awayTeam": "Blue Titans"
}
```

- [ ] **Step 6: Create final verification commit**

```bash
cd /home/cda/dev/leaguesphere/.worktrees/feature-ls-worktree
git log --oneline -5
# Should show 4 new commits from tasks 1-4
git commit --allow-empty -m "test: verify all event recording fixes working end-to-end"
```

---

## Task 6: Update Documentation

**Files:**
- Modify: `docs/load-testing/GAMEDAY_LOAD_TEST.md`

- [ ] **Step 1: Update the "How the Orchestrator Works" section**

Add clarification about team data capture:

```markdown
## How the Orchestrator Works

### Discovery Phase
- Fetches gameday list from `/api/gamedays/` 
- For each gameday, fetches games from `/api/gamedays/{id}/games/`
- **Extracts team names from game results** and stores in coordination file
- Updates gameday date to today (enables playable games)
- Writes coordination file to `/tmp/gameday_coordination.json`
- Other VUs skip discovery and wait

### Performers Phase
- Loads coordination file (pre-existing or created by discovery)
- For each game in coordination file:
  - **Uses pre-fetched team names from coordination file** (no additional API calls)
  - Setup: PUT `/api/game/{id}/setup`
  - Officials: PUT `/api/game/{id}/officials`
  - Events: 6 events via POST `/api/gamelog/{id}` (uses real team names)
  - Finalize: PUT `/api/game/{id}/finalize`

### Spectators Phase
- Polls game progress from `/api/gamedays/{id}/games/`
- Real-time score updates via `/api/gamelog/{id}`
```

- [ ] **Step 2: Add troubleshooting for team names**

Add a new troubleshooting section:

```markdown
## Troubleshooting

### "team ... not found" errors gone
If you previously saw errors like "team Home not found", these should no longer occur because:
- Team names are now captured during discovery phase
- Performer phase uses real team data from coordination file
- The broken `GET /api/game/{id}/` endpoint is no longer called

### Coordination file missing real team names
If coordination file has `homeTeam: null` or `awayTeam: null`:
1. Check that discovery phase completed successfully
2. Verify API endpoint `/api/gamedays/{id}/games/` is returning `results` array with `team_name` field
3. Run discovery phase again to regenerate coordination file

### PHASE='all' performers not running
If performers don't execute with `PHASE='all'`:
- Performers wait up to 180 seconds for coordination file from discovery
- Check k6 logs for "Coordination data not available" messages
- Ensure discovery phase (VU 1) completed before performers start
```

- [ ] **Step 3: Commit documentation updates**

```bash
cd /home/cda/dev/leaguesphere/.worktrees/feature-ls-worktree
git add docs/load-testing/GAMEDAY_LOAD_TEST.md
git commit -m "docs: update orchestrator documentation with team name capture details"
```

---

## Summary

This plan fixes three critical issues:

1. **Task 1:** Capture team names from discovery API response
2. **Task 2-3:** Remove broken endpoint call and use pre-fetched data
3. **Task 4:** Fix PHASE='all' coordination file loading
4. **Task 5:** End-to-end verification
5. **Task 6:** Documentation updates

**Expected outcome:**
- ✅ Event recording works with real team names
- ✅ PHASE='all' orchestration works correctly
- ✅ No more "team Home not found" errors
- ✅ All 6 events recorded per game
- ✅ Coordination file contains complete game metadata

**Total commits:** 6 (one per task)
