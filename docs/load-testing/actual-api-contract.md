# Actual API Contract for Load Testing

**Endpoint:** `POST /api/journey/events/`

**Headers Required:**
- `Content-Type: application/json`
- `X-CSRFToken: {csrf_token}`
- `Cookie: sessionid={session_id}; csrftoken={csrf_token}`

---

## Event Types & Payloads

### 1. possession_recorded
**Purpose:** Record which team has possession

```json
{
  "event_name": "possession_recorded",
  "metadata": {
    "game_id": 175,
    "team_name": "Lions"
  }
}
```

**Response:**
```json
{
  "id": 11097,
  "event_name": "possession_recorded",
  "metadata": {"game_id": 175, "team_name": "Lions"},
  "created_at": "2026-06-04T01:17:14.297408+02:00"
}
```

---

### 2. game_event_recorded
**Purpose:** Record scoring/game events (touchdowns, etc.)

```json
{
  "event_name": "game_event_recorded",
  "metadata": {
    "game_id": 175,
    "team": "Lions",
    "event_type": "Touchdown",
    "half": "FH"
  }
}
```

**Metadata Fields:**
- `game_id` (required) - Game ID
- `team` (required) - Team name (short: "Lions", not "Augsburg Lions")
- `event_type` (required) - Type of event (Touchdown, Goal, etc.)
- `half` (required) - "FH" (First Half) or "SH" (Second Half)

**Response:** HTTP 200 + event record with id and created_at

---

### 3. halftime_recorded
**Purpose:** Mark halftime transition

```json
{
  "event_name": "halftime_recorded",
  "metadata": {
    "game_id": 175
  }
}
```

**Metadata Fields:**
- `game_id` (required)

---

### 3.5. second_half_started
**Purpose:** Mark start of second half with current score

```json
{
  "event_name": "second_half_started",
  "metadata": {
    "game_id": 176,
    "home_score": 0,
    "away_score": 0
  }
}
```

**Metadata Fields:**
- `game_id` (required)
- `home_score` (required) - Home team score at halftime
- `away_score` (required) - Away team score at halftime

---

### 4. game_completed
**Purpose:** Mark game as finished with final details

```json
{
  "event_name": "game_completed",
  "metadata": {
    "game_id": 175,
    "home_captain": "Player 1",
    "away_captain": "Player 2"
  }
}
```

**Metadata Fields:**
- `game_id` (required)
- `home_captain` (optional) - Home team captain name
- `away_captain` (optional) - Away team captain name

---

### 5. gameday_created
**Purpose:** (Not yet tested) - Created when gameday is set up

**Expected Payload:**
```json
{
  "event_name": "gameday_created",
  "metadata": {
    "gameday_id": 12
  }
}
```

---

## Complete Game Lifecycle Sequence

```
1. PUT /api/gamedays/{id}/ → Update date to today
2. PUT /api/game/{game_id}/setup → Initialize game with ctResult, direction, fhPossession
3. POST /api/journey/events/ (possession_recorded) → Team has possession
4. POST /api/journey/events/ (game_event_recorded) → First half events
   - Multiple touchdown/goal events with half="FH"
5. POST /api/journey/events/ (halftime_recorded) → Mark halftime
6. POST /api/journey/events/ (second_half_started) → Start SH with halftime scores
7. POST /api/journey/events/ (game_event_recorded) → Second half events
   - Multiple touchdown/goal events with half="SH"
8. POST /api/journey/events/ (game_completed) → Game finished with captain info
9. PUT /api/game/{game_id}/finalize → Save final captains and notes
```

---

## Game Finalize Endpoint

**Endpoint:** `PUT /api/game/{game_id}/finalize`

**Purpose:** Save final game state (captains, notes)

```json
{
  "homeCaptain": "Captain Name",
  "awayCaptain": "Captain Name",
  "note": "Optional game notes"
}
```

**Response:** HTTP 200 with GameSetup data

**Note:** Call this AFTER `game_completed` event

---

## Response Format

**All successful events return HTTP 200:**
```json
{
  "id": <auto_incremented_id>,
  "event_name": "<event_name>",
  "metadata": <submitted_metadata>,
  "created_at": "<ISO_timestamp>"
}
```

**Timestamp Format:** `2026-06-04T01:17:14.297408+02:00` (ISO 8601 with timezone)

---

## Load Test Implications

### Event Rate
- Events are recorded instantly (< 10ms per event)
- Can fire many events in sequence without delay

### Data Storage
- Each event gets auto-incremented ID
- Metadata is stored as-is (JSON)
- No validation on metadata values (team name, event_type, etc.)

### Realistic Scenario
For a game with:
- 1 possession event (start)
- 6 scoring events (3 per half)
- 1 halftime event
- 1 completion event
= **9 events per game**

For multi-game load test:
- 10 games × 9 events = 90 events
- At 100 concurrent users scoring games = 9,000 events
- Endpoint needs to handle high write throughput

---

## Test Results (Verified)

✅ All 6 events recorded successfully  
✅ IDs auto-increment (11097-11102)  
✅ Timestamps recorded with timezone  
✅ Metadata preserved exactly as sent  
✅ No validation errors on metadata fields  

---

**Date:** 2026-06-04  
**Tested Against:** Game 175 (Lions vs Hawks)  
**Frontend:** scorecard React app
