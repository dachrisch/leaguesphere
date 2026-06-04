# Realistic Gameday-Centric Load Test Design

**Date**: 2026-06-04  
**Status**: Approved  
**Scope**: K6 load testing orchestrator for realistic multi-player gameplay simulation

## Executive Summary

Replace phase-based k6 load test with a **gameday-centric model** that mirrors real platform usage:
1. Orchestrator discovers published gamedays with unplayed games and updates date to today
2. For each gameday: 1 authenticated performer scores games sequentially + X anonymous spectators watch in parallel
3. Scaling: configurable `--gamedays N` parameter controls total VUs (N performers + X*N spectators)
4. Spectators self-organize by polling game state and adapting behavior based on live events

## Problem Statement

Current k6 test architecture:
- Separates phases (setup → performers → spectators) sequentially
- Does not reflect realistic concurrent gameplay (scoring + viewing simultaneously)
- Requires multiple test invocations or contrived stage ramping
- Doesn't leverage real gameday data from production dump on staging

Desired behavior:
- Orchestrator finds real gamedays and prepares them (date → today, status = PUBLISHED, has unplayed games)
- Performers and spectators operate concurrently on assigned gameday
- Spectators autonomously detect game state changes and adapt polling/viewing behavior
- Scale by increasing number of gamedays, not phases

## Architecture

### 1. Orchestrator (Discovery & Assignment)

**Responsibility**: Find gamedays and assign performers/spectators

```
Gameday Discovery
├─ Query: /api/gamedays/?status=PUBLISHED (limit 20)
├─ Filter: Has at least 1 game with status != COMPLETED
├─ Select: First N gamedays (configurable via --gamedays param)
├─ Prepare: Update gameday.date → today, keep status=PUBLISHED
└─ Assign: 
   ├─ Performer assignments: gameday_1 → performer_0, gameday_2 → performer_1, etc.
   └─ Spectator assignments: gameday_1 → [spectator_1_0, spectator_1_1, ..., spectator_1_X]
                            gameday_2 → [spectator_2_0, spectator_2_1, ..., spectator_2_X]
```

**Output**: Coordination file containing:
```json
{
  "gamedays": [
    {
      "id": 145,
      "name": "Gameday Name",
      "games_count": 10,
      "games": [
        {
          "id": 1001,
          "field": "Field A",
          "scheduled": "14:00",
          "status": "PUBLISHED"
        }
      ],
      "assigned_performer": "performer_0",
      "assigned_spectators": ["spectator_145_0", "spectator_145_1", "spectator_145_2"]
    }
  ]
}
```

### 2. Performer (Authenticated Game Scorer)

**Responsibility**: Score all games in assigned gameday sequentially

**Flow per game**:
1. Setup game state (PUT `/api/game/{id}/setup`)
2. Assign officials (PUT `/api/game/{id}/officials`)
3. First half events (3 events, alternating teams)
   - Set possession (PUT `/api/game/{id}/possession`)
   - Record event (POST `/api/gamelog/{id}`)
4. Halftime (PUT `/api/game/{id}/halftime`)
5. Second half events (3 events, alternating teams)
6. Finalize (PUT `/api/game/{id}/finalize`)

**Timing**:
- 0.3-0.5s sleep between API calls
- ~1s per game total
- Logs: game ID, status transitions, response details

**Authentication**: Token-based (single login at start)

**Lifecycle**: Loops continuously, scoring all games, then repeats

### 3. Spectator (Anonymous Viewer)

**Responsibility**: Poll gameday state and adapt viewing behavior based on live events

**Flow**:
1. **No login** - direct anonymous access to `/api/progress/gamedays/{id}/`
2. **Poll every 3-5 seconds** with random jitter
3. **State Detection** - watch for `gameStarted`, `gameFinished`, game `status` changes
4. **Behavior Adaptation**:
   - When game starts: increase polling frequency (1-2s), focus on that game's scores
   - When game finishes: reset polling, check next game or wander
   - Between games (80% time): browse gameday, check team info, scores
   - Wander behavior (20% time): randomly check other gamedays or leagues
5. **Response Handling**: 
   - Parse `/api/progress/gamedays/{id}/` response
   - Extract `games[].status`, `games[].gameStarted`, `games[].gameFinished`, `games[].gameresult`
   - No error on 404 (gameday may be archived)

**Lifecycle**: Appears during setup or early games, watches for 15-30 minutes, leaves

### 4. K6 Execution Model

**Single Command**:
```bash
k6 run load-test-gameday-orchestrator.js --env GAMEDAYS=5 --env SPECTATORS_PER_GAMEDAY=3
```

**VU Scaling**:
- `GAMEDAYS`: 1-10 (default 5)
- `SPECTATORS_PER_GAMEDAY`: 1-20 (default 3)
- **Total VUs** = GAMEDAYS + (GAMEDAYS * SPECTATORS_PER_GAMEDAY)
- Example: `GAMEDAYS=5 SPECTATORS_PER_GAMEDAY=3` → 5 performers + 15 spectators = **20 VUs**

**Stages**:
```javascript
// Phase 1: Orchestrator discovers & prepares gamedays (1 VU, ~2min)
{ duration: '2m', target: 1 }

// Phase 2: Transition to performers + spectators (ramp up)
{ duration: '1m', target: performers + spectators }

// Phase 3: Main load (steady state)
{ duration: '30m', target: performers + spectators }

// Phase 4: Wind down
{ duration: '2m', target: 0 }
```

**Total test duration**: ~35 minutes (configurable)

## Data Flow

```
┌─────────────────────┐
│ 1. Orchestrator VU  │
├─────────────────────┤
│ Query gamedays      │
│ Filter unplayed     │
│ Update date→today   │
│ Assign roles        │
│ Write coord file    │
└──────────┬──────────┘
           │
           ▼
    ┌──────────────┐
    │ Coord File   │
    │ (JSON)       │
    └──────┬───────┘
           │
    ┌──────┴─────────────────────────┐
    │                                 │
    ▼                                 ▼
┌─────────────────┐          ┌──────────────────────┐
│ Performers (N)  │          │ Spectators (N*X)     │
├─────────────────┤          ├──────────────────────┤
│ Auth: Login     │          │ Auth: None (anon)    │
│ Poll: coord     │          │ Poll: progress API   │
│ Action: Score   │          │ Action: View state   │
└────────┬────────┘          └──────────┬───────────┘
         │                             │
         └─────────────┬───────────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │ LeagueSphere Backend │
            ├──────────────────────┤
            │ Game scoring API     │
            │ Progress API         │
            │ Database             │
            └──────────────────────┘
```

## Success Criteria

1. **Orchestrator phase** completes in <3 minutes, discovers 1-10 gamedays
2. **Performers** score all games in assigned gameday without errors
3. **Spectators** detect game state changes and adapt polling (proven by logs)
4. **Scaling**: VU count matches formula `GAMEDAYS + (GAMEDAYS * SPECTATORS_PER_GAMEDAY)`
5. **Concurrent execution**: Performers and spectators run in parallel from minute 3 onwards
6. **Load metrics**:
   - 0% HTTP errors on success-path requests
   - p(95) response time < 1s for progress API
   - p(99) response time < 2s for game scoring API

## Implementation Files

**New files to create**:
1. `tests/load/load-test-gameday-orchestrator.js` - Main orchestrator & VU logic
2. `tests/load/load-test-helpers/gameday-discovery.js` - Gameday finding & filtering
3. `tests/load/load-test-helpers/performer-gameday.js` - Updated performer logic
4. `tests/load/load-test-helpers/spectator-autonomous.js` - New spectator self-organizing logic
5. `docs/load-testing/GAMEDAY_LOAD_TEST.md` - User guide

**Files to deprecate**:
- `tests/load/load-test-realistic-cycle.js` (phase-based approach)
- `tests/load/load-test-helpers/setup-manager.js` (gameday preparation logic moves to discovery)
- `tests/load/load-test-helpers/coordination.js` (integrated into orchestrator)

## Testing & Validation

1. **Unit tests** (k6 compatible):
   - Gameday discovery filters correctly (has unplayed games)
   - Performer loops through all games
   - Spectator detects state transitions
   - JSON parsing handles empty/malformed responses

2. **Integration test**:
   - Run with `--gamedays 1 --spectators-per-gameday 2` (3 VUs total)
   - Verify coordination file created correctly
   - Check logs for performer game completions
   - Check logs for spectator state detections

3. **Smoke test** (staging):
   - Run with `--gamedays 5 --spectators-per-gameday 3` (20 VUs)
   - Verify no 500 errors
   - Check load profile matches expected (5 performers, 15 spectators)
   - Verify all games scored, spectators watched

## Known Constraints

1. **Gameday date mutation**: Required because games can only be scored when `gameday.date == today`
2. **Anonymous spectator access**: `/api/progress/gamedays/` must be publicly accessible (no auth required)
3. **Game scoring state**: Assumes games can be scored multiple times or have rollback mechanism
4. **Staging vs Production**: Test uses production data dump on staging, may include completed gamedays

## Future Enhancements

- Real-time WebSocket spectator updates (if available)
- Spectator team favoritism (watch specific teams across gamedays)
- Performer error recovery (retry on transient failures)
- Metrics export to Grafana dashboard
