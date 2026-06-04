# Load Testing Quick Start

## Overview

This directory contains load testing infrastructure for LeagueSphere:

1. **`e2e-game-test.js`** — Single-game E2E test (spike to validate API)
2. **`find-game-id.js`** — Helper to find available game IDs on stage
3. **`load-test-realistic-cycle.js`** — k6 load test script (full multi-phase test)
4. **`realistic-multi-phase-design.md`** — Design documentation

---

## Quick Start: 5-Minute E2E Validation

### 1. Find an Available Game

```bash
cd /home/cda/dev/leaguesphere/.worktrees/feature-ls-worktree
node find-game-id.js --password=YOUR_PASSWORD
```

Output:
```
📋 Available Games:
─────────────────────────────────────────────────────────────
1. Game ID: 9001
   Home Team vs Away Team
   Time: 10:00

🚀 Run E2E Test:
   node e2e-game-test.js --gameid=9001 --password=YOUR_PASSWORD
```

### 2. Run E2E Test Against That Game

```bash
export TEST_PASSWORD=YOUR_PASSWORD
node e2e-game-test.js --gameid=9001
```

Or with arguments:
```bash
node e2e-game-test.js --gameid=9001 --password=YOUR_PASSWORD --target=https://stage.leaguesphere.app
```

### 3. Check Results

The script will:
- ✅ Log in as `chrisd`
- ✅ Fetch game details
- ✅ Record 3 first-half events
- ✅ Mark halftime
- ✅ Record 3 second-half events
- ✅ Finalize the game

Results are saved to `/tmp/e2e-game-test-{gameid}-{timestamp}.json`:

```bash
cat /tmp/e2e-game-test-9001-1717507200000.json
```

---

## Expected Output

### Success (All Green Checkmarks)

```
✅ Login: Logged in as chrisd
   {"cookies": "sessionid, csrftoken"}

✅ Fetch Game: Fetched game 9001
   {"home_team": "Team A", "away_team": "Team B", "status": "Geplant"}

✅ FH Event 1: Recorded: Team A - Goal
   {"status": 201, "duration": "245ms"}

✅ FH Event 2: Recorded: Team B - Goal
   {"status": 201, "duration": "198ms"}

✅ FH Event 3: Recorded: Team A - Goal
   {"status": 201, "duration": "201ms"}

✅ Halftime: Halftime marked
   {"status": 200}

✅ SH Event 1: Recorded: Team A - Goal
   {"status": 201, "duration": "215ms"}

✅ SH Event 2: Recorded: Team B - Goal
   {"status": 201, "duration": "192ms"}

✅ SH Event 3: Recorded: Team B - Goal
   {"status": 201, "duration": "219ms"}

✅ Finalize: Game finalized
   {"status": 200}

======================================================================
TEST SUMMARY
======================================================================
Total Steps: 11
  ✅ Passed: 11
  ❌ Failed: 0
  ℹ️  Info: 0

📝 Results saved to: /tmp/e2e-game-test-9001-1717507200000.json
```

### Failure (Red X)

If any step fails, check the error message:

```
❌ FH Event 1: Event recording failed: 404
   {"event": {"gameId": 9001, "team": "Team A", "event": "Goal", "half": "FH"},
    "body": "{\"detail\": \"Not found.\"}"}
```

Common issues:
- **404 errors**: Game not found, or endpoint path is wrong
- **401 errors**: Not logged in (cookie/CSRF issue)
- **400 errors**: Request payload format is wrong
- **Team not found**: Team name doesn't match database exactly

---

## Next: Run Full k6 Load Test

Once E2E passes successfully, you can run the multi-phase load test:

```bash
# Install k6 (if needed)
# macOS: brew install k6
# Linux: https://k6.io/docs/getting-started/installation/

# Run 1-minute dry run with 1 virtual user
k6 run --vus 1 --duration 1m load-test-realistic-cycle.js --env TARGET_HOST=https://stage.leaguesphere.app

# Run full load test (55+ VUs, 25 minutes)
k6 run --env TARGET_HOST=https://stage.leaguesphere.app load-test-realistic-cycle.js
```

---

## Debugging

### View Raw API Response

The JSON results file contains all API requests/responses:

```json
{
  "step": "FH Event 1",
  "status": "PASS",
  "message": "Recorded: Team A - Goal",
  "details": {
    "status": 201,
    "duration": 245
  }
}
```

### Test with Different Game

```bash
# Find all games with different gameday
node find-game-id.js --password=X

# Test specific game
node e2e-game-test.js --gameid=9999 --password=X
```

### Test Against Production

```bash
node e2e-game-test.js --gameid=9001 \
  --password=X \
  --target=https://leaguesphere.app
```

---

## Design Reference

For detailed design, architecture, and API endpoint list, see:
- **Design**: `realistic-multi-phase-design.md`
- **Phase 1 (Setup)**: Minutes 0-2, 1 VU
- **Phase 2 (Performers)**: Minutes 2-20, 5-10 VUs
- **Phase 3 (Spectators)**: Minutes 5-25, 50-100 VUs with 3 wave arrivals

---

## Troubleshooting

### "No published gamedays found"

Check stage has data:
1. Go to https://stage.leaguesphere.app
2. Create a gameday or change date of existing to today
3. Publish it
4. Try again

### "Team not found" error

The `find-game-id.js` script shows team names. Use exact names in e2e script:
```bash
# Check what names were found
cat /tmp/e2e-game-test-*.json | grep -A 5 "home_team"
```

### "CSRF token not found"

The login form might have changed. Check `/login/` page structure:
```bash
curl -s https://stage.leaguesphere.app/login/ | grep csrf
```

---

## Files Reference

```
docs/load-testing/
├── QUICKSTART.md (this file)
├── realistic-multi-phase-design.md (design + architecture)
├── e2e-game-test.js (single-game validation script)
├── find-game-id.js (helper to find game IDs)
└── ../../../load-test-realistic-cycle.js (k6 multi-phase test)
```
