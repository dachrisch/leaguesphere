# Load Testing Spike: API Findings

**Date:** 2026-06-04  
**Status:** Blocked - Event logging endpoint returns 500 error  
**Objective:** Validate game lifecycle API endpoints and discover actual request/response formats

---

## ✅ Endpoints That Work

### 1. Gameday List
```
GET /api/gamedays/?status=PUBLISHED&limit=100
```
**Response:** Paginated list of gamedays with fields: id, name, date, status, season, league, start, format, address, author

**Key Constraint:** Need to find gamedays where **ALL games** have `status: "Geplant"` (not mixed states)

---

### 2. Games List (by Gameday)
```
GET /api/gamedays/{gameday_id}/games/
```
**Response:** Array of games with structure:
```json
{
  "id": 175,
  "gameday": 12,
  "scheduled": "10:00:00",
  "field": 2,
  "officials": 25,
  "stage": "Vorrunde",
  "standing": "Gruppe 1",
  "status": "Geplant",
  "results": [
    {"team_name": "Lions", "isHome": true, "team_id": 22, "fh": 0, "sh": 0, ...},
    {"team_name": "Hawks", "isHome": false, "team_id": 23, "fh": 0, "sh": 0, ...}
  ],
  "halftime_score": {"home": 0, "away": 0},
  "final_score": {"home": 0, "away": 0}
}
```

**Key Constraint:** Team names in API response are SHORT names (e.g., "Lions", not "Augsburg Lions")

---

### 3. Update Gameday Date
```
PUT /api/gamedays/{gameday_id}/
```
**Required Payload:**
```json
{
  "date": "2026-06-04",
  "name": "Hawks Bowl",
  "status": "PUBLISHED",
  "season": 1,
  "league": 1,
  "start": "10:00",
  "format": "7_2",
  "address": ""
}
```
**Response:** HTTP 200 with updated gameday data

**Purpose:** Change gameday date to TODAY so games become available for recording

---

### 4. Start Game (Game Setup)
```
PUT /api/game/{game_id}/setup
```
**Required Payload:**
```json
{
  "ctResult": "ok",
  "direction": "home",
  "fhPossession": "home"
}
```
**Response:** HTTP 200 with GameSetup fields

**Purpose:** Transition game from "Geplant" to "Gestartet" (started), enables event logging

**Side Effect:** Creates a log entry "Spiel gestartet" (game started)

---

## ❌ Endpoints That Fail

### Event Logging (BLOCKER)
```
POST /api/gamelog/{game_id}
```
**Expected Payload:**
```json
{
  "gameId": 175,
  "team": "Lions",
  "event": "Touchdown",
  "half": "FH"
}
```
**Actual Response:** HTTP 500 with HTML error page
```
<h1>500 - Disqualifikation</h1>
<p>Leider gab es ein grob unsportliches Foul, was zu einem Fehler auf dem Server führte.</p>
```

**Tested With:**
- ✅ Valid session (sessionid cookie)
- ✅ Valid CSRF token (X-Csrftoken header)
- ✅ Correct team names (extracted from game response)
- ✅ Game properly started (PUT /api/game/{id}/setup executed)

**Root Cause:** Unknown - server-side exception not exposed in error message

---

## Data Flow Discoveries

### Team Names
- **API returns:** Short names ("Lions", "Hawks")
- **API expects (for events):** Same short names
- **NOT acceptable:** Full team names ("Augsburg Lions", "Nürnberg Hawks")

### Game Status Flow
- `"Geplant"` → Game scheduled, no events recorded
- `"Gestartet"` → Game started (after PUT /api/game/{id}/setup), ready for events
- `"beendet"` → Game finished

### Test Data Requirements
- Gamedays from **any date** can be used (not limited to today)
- **All games in gameday must be "Geplant"** (not mixed finished/planned)
- Can update gameday date to any value including today

---

## Constraints Discovered

### 1. Team Name Format
Events must use exact team names from `gamedays/{id}/games/` response in the `results[].team_name` field.

### 2. Game State Initialization
Games **must** be initialized with setup data before events can be recorded:
```
PUT /api/game/{id}/setup with {ctResult, direction, fhPossession}
```

### 3. Gameday Selection
Cannot mix game states within a gameday for testing:
- ❌ Gameday with some "beendet" + some "Geplant" games
- ✅ Gameday where ALL games are "Geplant"

---

## Critical Blockers for Load Test

### 1. Event Logging Returns 500
**Status:** Unresolved  
**Impact:** Cannot proceed past game start  
**Next Investigation:**
- Check Django error logs for actual exception
- Verify GameService.create_gamelog() requirements
- Check if additional game state initialization needed

### 2. Server Error Message Unhelpful
Error page shows generic German message, not actual exception.  
Need to:
- Access server logs
- Or use Django debug mode
- Or trace through GameService code to find validation

---

## Working Spike Sequence

```
1. GET /api/gamedays/?status=PUBLISHED (find all)
   ↓
2. Filter: gamedays where ALL games have status="Geplant"
   ↓
3. PUT /api/gamedays/{id}/ (update date to today)
   ↓
4. GET /api/gamedays/{id}/games/ (list games)
   ↓
5. Extract team names from results[].team_name
   ↓
6. PUT /api/game/{game_id}/setup (initialize game)
   ✅ WORKS ✅
   ↓
7. POST /api/gamelog/{game_id} (record event)
   ❌ 500 ERROR ❌
```

---

## Files & Commands

**Spike Scripts Created:**
- `step1-find-game.js` - Find gameday with games
- `setup-gameday-for-today.js` - Change gameday date
- Working curl commands documented above

**Test Data Used:**
- Gameday: Hawks Bowl (ID: 12, Date: 2021-07-17)
- Game: 175 (Lions vs Hawks, Status: Geplant after setup)

---

## Next Steps

1. **Investigate 500 Error:**
   - Check Django logs on server
   - Review GameService.create_gamelog() method
   - Check TeamLog model validation

2. **Possible Causes:**
   - Missing required fields in event payload
   - Game state validation (expects specific sequence)
   - User permissions issue
   - Database constraint violation

3. **Once Resolved:**
   - Validate event response format
   - Test halftime endpoint: `PUT /api/game/{id}/halftime`
   - Test finalize endpoint: `PUT /api/game/{id}/finalize`
   - Document complete lifecycle

---

**Author:** Spike execution via direct API testing  
**Date:** 2026-06-04
