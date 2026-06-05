# Manual Testing Scripts

Standalone scripts for manual API testing and debugging. These use direct REST API calls (via `curl`) instead of k6 load testing.

## Quick Start

### 1. Authenticate
```bash
./test-api.sh
```
Extracts CSRF token and saves cookies to `/tmp/test_cookies.txt` (required by other scripts).

### 2. Record a Full Game
```bash
./scorecard.sh 175 full "Lions" "Hawks"
```
Records complete game lifecycle: setup → officials → events → halftime → events → finalize.

## Scripts

### `test-api.sh` — Authentication
Tests login flow and extracts CSRF token.

**Usage:**
```bash
./test-api.sh
```

**What it does:**
1. GET `/login/` → extract CSRF from HTML
2. POST credentials with CSRF
3. Extract CSRF from cookie
4. Test `/api/gamelog/45` endpoint
5. Save cookies to `/tmp/test_cookies.txt`

**Output:** Cookies file needed by other scripts

---

### `scorecard.sh` — Manual Game Lifecycle
Record a complete game using game management API endpoints.

**Usage:**
```bash
# Full game
./scorecard.sh 175 full "Lions" "Hawks"

# Individual steps
./scorecard.sh 175 setup "Lions"
./scorecard.sh 175 officials
./scorecard.sh 175 possession "Lions"
./scorecard.sh 175 event "Lions" 1 "Touchdown" "123"
./scorecard.sh 175 finalize "Lion Captain" "Hawk Captain"
```

**Endpoints:**
- `PUT /api/game/{id}/setup` — Initialize game
- `PUT /api/game/{id}/officials` — Assign officials
- `POST /api/gamelog/{id}` — Record event
- `PUT /api/game/{id}/halftime` — Mark halftime
- `PUT /api/game/{id}/finalize` — Complete game

**Dependencies:** CSRF token in `/tmp/test_cookies.txt` (run `test-api.sh` first)

---

### `record_event.sh` — Journey Events
Record events via the journey tracking API.

**Usage:**
```bash
# Full game
./record_event.sh 175 full "Lions" "Hawks"

# Individual events
./record_event.sh 175 possession "Lions"
./record_event.sh 175 event "Lions" Touchdown FH
./record_event.sh 175 halftime
./record_event.sh 175 completed "Lion Captain" "Hawk Captain"
```

**Endpoints:**
- `POST /api/journey/events/` with `possession_recorded` event
- `POST /api/journey/events/` with `game_event_recorded` event
- `POST /api/journey/events/` with `halftime_recorded` event
- `POST /api/journey/events/` with `game_completed` event

**Dependencies:** CSRF token in `/tmp/test_cookies.txt`

---

### `record_events.sh` — Bulk Event Recording
Records a hardcoded sequence of 6 events for one game (game 175).

**Usage:**
```bash
./record_events.sh
```

**Sequence:**
1. possession_recorded (Lions)
2. game_event_recorded (Lions Touchdown FH)
3. game_event_recorded (Hawks Touchdown FH)
4. halftime_recorded
5. game_event_recorded (Lions Touchdown SH)
6. game_completed

**Note:** Hardcoded to game 175. Edit file to change game ID.

**Dependencies:** CSRF token in `/tmp/test_cookies.txt`

---

## Workflow

1. **First time setup:**
   ```bash
   ./test-api.sh
   ```

2. **Record a game:**
   ```bash
   ./scorecard.sh 175 full "Lions" "Hawks"
   ```

3. **Or record events individually:**
   ```bash
   ./record_event.sh 175 possession "Lions"
   ./record_event.sh 175 event "Lions" Touchdown FH
   ./record_event.sh 175 halftime
   ./record_event.sh 175 event "Lions" Touchdown SH
   ./record_event.sh 175 completed "Lions Captain" "Hawks Captain"
   ```

## Debugging

### CSRF Token Issues
```bash
cat /tmp/test_cookies.txt
```
Should contain a line with `csrftoken`. If not, run `test-api.sh` again.

### View Response
Scripts use `jq` to format JSON. To see raw response:
```bash
./scorecard.sh 175 setup "Lions" 2>&1 | head -100
```

## Notes

- All scripts require staging environment (`https://stage.leaguesphere.app`)
- Credentials: `k6` / `load!Test`
- CSRF token expires—re-run `test-api.sh` if you get 403 errors
- These scripts are for **manual testing only**—use k6 orchestrator for load testing
