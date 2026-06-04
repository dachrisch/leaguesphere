# Realistic Multi-Phase Load Testing Design

**Date:** 2026-06-04  
**Status:** E2E Script Ready - Ready for API Validation  
**Objective:** Design and implement a realistic load test covering game setup, scoring, and spectator viewing with proper user workflow simulation

**⚡ Quick Start:** See [`QUICKSTART.md`](./QUICKSTART.md) for 5-minute E2E validation walkthrough

---

## Executive Summary

A coordinated load test with three distinct worker types running through one complete lifecycle:
- **Setup Manager** (1 worker): Prepares 5-10 gamedays by changing dates to today
- **Performers** (5-10 workers): One per gameday, scores all games through halftime and completion
- **Spectators** (50-100 workers): 1-10 per gameday, arrives in waves, explores concurrent with gameplay

**Resource Model:** ~50 games available from production; each test cycle consumes ~5-10 games sequentially; no reuse/reset.

**Timeline:** Single complete run takes ~25 minutes (setup 2m → performers 18m → spectators 20-25m with wave arrivals)

---

## Phase Breakdown

### Phase 1: Setup Manager (Minutes 0-2)

**Goal:** Prepare fresh gamedays for the test by changing their date to today

**Actions:**
1. Fetch published gamedays: `GET /api/gamedays/?status=PUBLISHED`
2. Select 5-10 gamedays
3. Change date to today: `PUT /api/gamedays/{gameday_id}/` with `{"date": "2026-06-04", "status": "PUBLISHED"}`
4. Extract game metadata (team names, game IDs, count)
5. Write coordination file: `gameday_assignments.json`

**Output:**
```json
{
  "gamedays": [
    {
      "id": 858,
      "name": "Gameday on 04.06.2026",
      "games_count": 4,
      "games": [
        {
          "id": 9001,
          "home": "Team A",
          "away": "Team B",
          "field": 1,
          "scheduled": "10:00"
        }
      ],
      "assigned_performer": "performer_0",
      "assigned_spectators": ["spectator_0_0", "spectator_0_1"]
    }
  ]
}
```

**API Endpoints Used:**
- `GET /api/gamedays/?status=PUBLISHED` - List gamedays
- `PUT /api/gamedays/{gameday_id}/` - Update gameday date

**Load:** Light (1 VU, reads from file)

---

### Phase 2: Performer Workers (Minutes 2-20+)

**Goal:** Score games realistically from start to finish through both halves

**Workers:** 5-10 parallel (1 per assigned gameday)

**Per-Game Loop:**

1. **Start Game** (First Event)
   - `POST /api/gamelog/{game_id}`
   - Payload: `{"gameId": game_id, "team": "Team A", "event": "Goal", "half": "FH"}`
   - Expected: HTTP 201, returns updated game state

2. **First Half Events** (4-5 more goals)
   - Repeat step 1 with alternating teams
   - Realistic spacing: 3-5s between events
   - Total FH duration: ~15-20s

3. **Mark Halftime**
   - `PUT /api/game/{game_id}/halftime`
   - Payload: `{}` (empty or minimal)
   - Expected: HTTP 200

4. **Halftime Break**
   - Sleep 2s (simulates halftime discussion)

5. **Second Half Events** (4-5 more goals)
   - Repeat event logging with `"half": "SH"`
   - Same timing and alternation as FH
   - Total SH duration: ~15-20s

6. **Finalize Game**
   - `PUT /api/game/{game_id}/finalize`
   - Payload: `{"notes": "Game completed by load test"}` (check if required)
   - Expected: HTTP 200

**Per-Game Duration:** ~2 minutes
**Games per Gameday:** 4-6 (varies by test data)
**Total Performer Phase:** 2-4 games × 2 min = 4-8 minutes per performer

**API Endpoints Used:**
- `POST /api/gamelog/{game_id}` - Record event
- `PUT /api/game/{game_id}/halftime` - Mark halftime
- `PUT /api/game/{game_id}/finalize` - Complete game

**Load:** Medium (5-10 VUs, sustained API calls every 3-5s per VU)

---

### Phase 3: Spectators (Minutes 5-25)

**Goal:** Realistically view games and stats as they progress, with concurrent load

**Workers:** 50-100 parallel (1-10 per assigned gameday)  
**Arrival Pattern:** Three waves

#### Wave 1 (Min 5-7): 20-30% arrive
- `GET /api/gamedays/{gameday_id}/` - View gameday overview
- `GET /api/gameinfo/{game_id}/log/` - Watch game logs (initial check)
- Browsing time: 2-3 minutes

#### Wave 2 (Min 9): 70-100% present (PEAK LOAD)
- High-frequency polling: `GET /api/gameinfo/{game_id}/log/` every 2-3s
- Concurrent with performers actively scoring
- **Wandering (20% of time):**
  - `GET /leaguetable/dffl/` - League standings
  - `GET /api/gamedays/` - Browse other gamedays
  - `GET /officials/team/all/list/` - View officials
  - Return to assigned gameday

#### Wave 3 (Min 17+): Games finishing
- Transition to final state viewing
- `GET /api/gamedays/{gameday_id}/` - Final scores
- `GET /leaguetable/dffl/` - Updated standings
- Browse/scroll for 5-10 minutes

**API Endpoints Used:**
- `GET /api/gamedays/{gameday_id}/` - Gameday detail
- `GET /api/gameinfo/{game_id}/log/` - Game log (live scores)
- `GET /leaguetable/dffl/` - League table
- `GET /api/gamedays/` - Gameday listing
- `GET /officials/team/all/list/` - Officials list

**Load:** High during peak (50-100 VUs, mixed read patterns)

---

## Data Flow & Coordination

```
┌─────────────────────────────────────────┐
│ Setup Manager                           │
│ • Fetches gamedays from /api/gamedays/  │
│ • Changes date to today (PUT)            │
│ • Extracts game metadata                │
│ • Writes gameday_assignments.json       │
└────────────────┬────────────────────────┘
                 │
        ┌────────▼────────┐
        │ gameday_        │
        │ assignments.json│
        └────────┬────────┘
                 │
        ┌────────┴─────────────────────────────────────┐
        │                                              │
    ┌───▼──────────┐                         ┌────────▼───────┐
    │ Performers   │                         │ Spectators      │
    │ • Read file  │                         │ • Read file     │
    │ • Score each │                         │ • Fetch gameday │
    │   game       │                         │ • Poll logs     │
    │ • Halftime   │                         │ • View tables   │
    │ • Finalize   │                         │ • Wander (20%)  │
    └──────────────┘                         └─────────────────┘
```

**Coordination Method:** JSON file written once before test starts; all workers read at startup. Eliminates need for runtime discovery and ensures deterministic game assignment.

---

## API Endpoint Reference

### Confirmed from Codebase

| Method | Endpoint | Purpose | Status |
|--------|----------|---------|--------|
| GET | `/api/gamedays/` | List gamedays (with filters) | ✅ Confirmed |
| GET | `/api/gamedays/{id}/` | Gameday detail | ✅ Confirmed |
| GET | `/api/gamedays/{id}/games/` | Games in gameday | ✅ Confirmed |
| PUT | `/api/gamedays/{id}/` | Update gameday (date, status) | ✅ Confirmed |
| POST | `/api/gamelog/{game_id}` | Log game event | ✅ Confirmed |
| PUT | `/api/game/{game_id}/halftime` | Mark halftime | ✅ Confirmed |
| PUT | `/api/game/{game_id}/finalize` | Finalize/complete game | ✅ Confirmed |
| GET | `/api/gameinfo/{game_id}/log/` | Fetch game log/scores | ⏳ Needs HAR |
| GET | `/leaguetable/dffl/` | League table view | ✅ Confirmed |
| GET | `/officials/team/all/list/` | Officials list | ✅ Confirmed |

### Request/Response Shapes: PENDING HAR RECORDING

**Needed from Chrome DevTools:**
1. **Event Logging (POST /api/gamelog/{game_id})**
   - Exact request payload format
   - Response structure
   - Status codes (201 vs 200?)
   - Error scenarios

2. **Game Log Fetch (GET /api/gameinfo/{game_id}/log/)**
   - Response schema (game state, scores, events)
   - Pagination (if applicable)
   - Caching headers

3. **Halftime/Finalize (PUT endpoints)**
   - Required payload fields
   - Response indication of success
   - Validation errors

4. **Authentication**
   - How cookies persist
   - Token handling
   - CSRF token requirements (if any)

---

## E2E Game Lifecycle Spike (Single Game Test)

**File:** `e2e-game-test.js`

**Purpose:** Validate the complete game lifecycle API without load testing framework overhead. Tests:
- ✅ Login and session management
- ✅ Game detail fetching
- ✅ Event logging (goal recording)
- ✅ Halftime marking
- ✅ Game finalization

**Usage:**
```bash
# Default credentials (chrisd user on stage)
node e2e-game-test.js --gameid=9001 --password=YOUR_PASSWORD

# Or with environment variables
export TEST_PASSWORD=YOUR_PASSWORD
export GAME_ID=9001
node e2e-game-test.js

# Specify custom target
node e2e-game-test.js --gameid=9001 --password=X --target=https://stage.leaguesphere.app
```

**Output:**
- Console log with step-by-step results
- JSON results file saved to `/tmp/e2e-game-test-{gameid}-{timestamp}.json`
- Exit code 0 on success, 1 on failure

**To Find an Active Game:**
1. Go to https://stage.leaguesphere.app
2. Find a gameday with "PUBLISHED" status
3. Click on a game to get its ID from the URL: `/gameinfo/{game_id}/`
4. Run the e2e test with that ID

---

## k6 Load Test Script Status

**File:** `load-test-realistic-cycle.js`

**Current State:** 
- ✅ Login flow implemented
- ✅ Gameday fetch and update logic
- ✅ Games list fetch
- ⏳ Event logging (API payload validated via e2e script)
- ⏳ Halftime marking (API payload validated via e2e script)
- ⏳ Game finalize (API payload validated via e2e script)
- ✅ Spectator viewing flow skeleton

**API Validation:**
Use the e2e script to validate all endpoint payloads before running the full load test. Once e2e script passes all steps, copy the exact request/response formats into the k6 script.

---

## Timeline & Concurrency Model

```
Time (minutes)  |  Setup (1 VU)  |  Performers (5-10)  |  Spectators (50-100)
────────────────┼────────────────┼────────────────────┼─────────────────────
0-2             |  ████░░░░░░░░  |  (idle)             |  (idle)
2-5             |  (done)        |  ████░░░░░░░░░░░░░  |  (idle)
5-7             |  (done)        |  ████░░░░░░░░░░░░░  |  Wave 1: ██░░ (20%)
7-9             |  (done)        |  ████░░░░░░░░░░░░░  |  Wave 1: ████ (30%)
9-17            |  (done)        |  ████░░░░░░░░░░░░░  |  Wave 2: ████████ (peak)
17-20           |  (done)        |  ████░░░░░░░░░░░░░  |  Wave 3: ████████ (final)
20-25           |  (done)        |  (done)             |  ████░░░░ (browsing)
```

**Peak Load Characteristics:**
- Min 9-17: 5-10 performers + 50-100 spectators = 55-110 concurrent VUs
- Request rate: ~20-30 requests/second (mix of event logging + viewing)
- Typical response time: 50-200ms
- Success rate target: >95%

---

## Known Issues & Workarounds

### Issue 1: Non-Static Data
- **Problem:** Each test run uses different game IDs, team names, layouts
- **Solution:** Setup manager fetches fresh data from production; coordination file captures IDs for this run
- **Implication:** k6 script must read coordination file, not hardcode IDs

### Issue 2: Game State Changes
- **Problem:** Games transition through states (Geplant → Gestartet → beendet)
- **Solution:** Spectators must handle state transitions gracefully (no errors if game finishes during their view)
- **Implication:** GET requests should not fail if game already completed

### Issue 3: 50-Game Pool Exhaustion
- **Problem:** ~50 games available; each test cycle consumes 5-10 games (can't reset)
- **Solution:** Plan for 5-10 test cycles max before pool depleted
- **Implication:** Consider test scheduling to avoid exhausting games during development

---

## Getting Started: Quick 5-Minute Validation

1. **Find a Game ID on Stage:**
   - Go to https://stage.leaguesphere.app
   - Find a gameday with "PUBLISHED" status  
   - Click on any game (URL will be `/gameinfo/{game_id}/`)
   - Note the game ID

2. **Run the E2E Spike:**
   ```bash
   export TEST_PASSWORD=bumbleFLIES1  # or your password
   node e2e-game-test.js --gameid=9001
   ```

3. **Verify Output:**
   - ✅ All steps should show green checkmarks
   - ❌ Any red X indicates API mismatch
   - Results saved to `/tmp/e2e-game-test-*.json`

4. **Inspect JSON results:**
   ```bash
   cat /tmp/e2e-game-test-*.json
   ```

---

## Next Steps

### Phase 1: Validate Game Lifecycle (IN PROGRESS)

1. **Run E2E Script Against Multiple Games:**
   - Test at least 3 different games to ensure consistency
   - Capture actual request/response payloads
   - Document any API variations or edge cases

2. **Update k6 Script Based on E2E Validation:**
   - Once e2e passes consistently, copy exact payloads into k6 script
   - Implement event logging with correct format
   - Add halftime/finalize with correct payloads
   - Test with k6 against single game (1 VU, 1 minute)

### Phase 2: Multi-Game & Spectator Simulation

1. **Implement Setup Manager Phase:**
   - Fetch PUBLISHED gamedays
   - Change 5-10 gameday dates to today
   - Write coordination file with game assignments

2. **Implement Performer Phase:**
   - Read coordination file
   - Assign 1 performer per gameday
   - Score all games sequentially

3. **Implement Spectator Phase:**
   - Wave arrivals (5m, 10m, 20m marks)
   - Concurrent polling + wandering
   - Mixed read patterns

### Phase 3: Full Load Test

1. **Multi-Cycle Support:**
   - Loop k6 script to run N test cycles
   - Consume fresh games each cycle
   - Aggregate metrics across cycles

2. **Realistic Event Distribution:**
   - Vary event types (Goal, Touchdown, Field Goal, etc.)
   - Vary goal counts per team per half
   - Add realistic delays (coaching timeouts, injuries, etc.)

3. **Production Validation:**
   - Run against production environment
   - Monitor Grafana dashboards
   - Verify p95 latency and error rates meet SLOs

---

## Success Criteria

- ✅ All endpoints respond with HTTP 2xx
- ✅ p95 latency < 1000ms during peak load
- ✅ Error rate < 2%
- ✅ Game state transitions correctly (Geplant → Gestartet → beendet)
- ✅ Spectators can view in-progress games without errors
- ✅ Load test completes without runner crash

---

## Files & References

**Code:**
- Load test script: `load-test-realistic-cycle.js` (needs HAR-based fixes)
- API URLs: `gamedays/api/urls.py` (source of endpoint discovery)
- Game views: `gamedays/api/game_views.py` (GameLogAPIView, GameHalftimeAPIView, GameFinalizeUpdateView)

**Documentation:**
- This file: Realistic load testing design
- Original spec: `docs/superpowers/specs/2026-05-31-load-testing-design.md` (read-only test)
- Implementation plan: `docs/superpowers/plans/2026-05-31-load-testing-plan.md`

**Demo Data:**
- Staging site: `https://stage.leaguesphere.app/`
- Sample gameday: `/gamedays/gameday/858/` (4. Juni 2026, AFVH_U13)

---

## Architecture Assumptions

1. **Stateless Workers:** Each performer/spectator makes independent HTTP requests; no shared state
2. **Coordination File:** Single JSON file written at startup; no runtime coordination
3. **Production Data:** Fresh games pulled from production database each test
4. **No Data Cleanup:** Games are marked completed and left in that state (no reset)
5. **Time-Independent:** Load test can run at any time; no time-of-day dependencies

---

## Questions for Implementation

1. **Event Types:** What event types are valid? (Goal, Touchdown, etc.)
2. **Max Events:** Realistic max events per half? (5-6 assumed)
3. **Team Assignment:** Do event teams need to be actual roster members, or just team name?
4. **Scoring Rules:** Are scores cumulative or per-event?
5. **Finalize Requirements:** What data required in finalize request?

---

**Author:** Claude (via Chrome DevTools exploration and codebase analysis)  
**Last Updated:** 2026-06-04  
**Status:** Ready for HAR recording phase
