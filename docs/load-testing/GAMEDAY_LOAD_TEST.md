# Gameday-Centric Load Test Guide

This guide covers how to run, interpret results, debug, and scale the gameday-centric k6 load test orchestrator. The orchestrator simulates realistic tournament activity: discovery of gamedays, performers recording game scores, and spectators polling for live updates.

## Quick Start

Run a minimal load test with 1 gameday, 1 performer, and 1 spectator:

```bash
cd tests/load
k6 run load-test-gameday-orchestrator.js \
  --env NUM_GAMEDAYS=1 \
  --env SPECTATORS_PER_GAMEDAY=1
```

This creates:
- 1 discovery phase VU (2 minutes)
- 1 performer VU (scores games during 20-minute peak)
- 1 spectator VU (polls gameday progress during 20-minute peak)

Expected result: 2 log files (`performer_0.json`, `spectator_0.json`) in `/tmp/`

## VU Calculation

The orchestrator calculates virtual users (VUs) based on gamedays and spectators per gameday.

**Formula:**
```
Total VUs = GAMEDAYS + (GAMEDAYS × SPECTATORS_PER_GAMEDAY) + 1 (discovery)
```

**Examples:**

| GAMEDAYS | SPECTATORS_PER_GAMEDAY | Total VUs | Discovery | Performers | Spectators |
|----------|------------------------|-----------|-----------|------------|------------|
| 1        | 1                      | 3         | 1         | 1          | 1          |
| 5        | 1                      | 7         | 1         | 5          | 5          |
| 5        | 3                      | 16        | 1         | 5          | 15         |
| 10       | 3                      | 31        | 1         | 10         | 30         |
| 10       | 5                      | 51        | 1         | 10         | 50         |

**When to scale:**
- Start with GAMEDAYS=1, SPECTATORS_PER_GAMEDAY=1 to verify setup
- Use GAMEDAYS=5, SPECTATORS_PER_GAMEDAY=3 for typical load testing (16 VUs)
- Use GAMEDAYS=10, SPECTATORS_PER_GAMEDAY=5 for stress testing (51 VUs)

## Running Different Phases

The orchestrator supports running individual phases or the full cycle via the `PHASE` environment variable.

### Discovery Only

Find gamedays with unplayed games (useful for verifying test data):

```bash
k6 run load-test-gameday-orchestrator.js \
  --env PHASE=discovery \
  --env NUM_GAMEDAYS=5
```

Output: Logs to console showing discovered gameday IDs, names, and game counts.

### Performers Only

Record game scores on pre-discovered gamedays:

```bash
k6 run load-test-gameday-orchestrator.js \
  --env PHASE=perform \
  --env NUM_GAMEDAYS=5
```

Requires: Coordination file from a prior discovery phase (default: `/tmp/gameday_coordination.json`)

### Spectators Only

Poll gameday progress (useful for load testing the read API):

```bash
k6 run load-test-gameday-orchestrator.js \
  --env PHASE=watch \
  --env NUM_GAMEDAYS=5 \
  --env SPECTATORS_PER_GAMEDAY=3
```

Requires: Coordination file from a prior discovery phase

### Full Load Test (Default)

Run all three phases sequentially: discovery (2m) → performers (20m) → spectators (20m):

```bash
k6 run load-test-gameday-orchestrator.js \
  --env NUM_GAMEDAYS=5 \
  --env SPECTATORS_PER_GAMEDAY=3
```

Timeline:
- 0-2m: 1 VU (discovery)
- 2-3m: 1 + 5 VUs (performers ramping in)
- 3-4m: 5 + 15 VUs (spectators ramping in)
- 4-24m: 20 VUs at peak (5 performers + 15 spectators)
- 24-25m: Ramp down to 0 VUs

## Environment Variables

| Variable | Default | Description | Example |
|----------|---------|-------------|---------|
| `BASE_URL` | `https://stage.leaguesphere.app` | Target server URL | `https://www.leaguesphere.app` |
| `NUM_GAMEDAYS` | `5` | Number of gamedays to discover and test | `10` |
| `SPECTATORS_PER_GAMEDAY` | `3` | Number of spectators per gameday | `5` |
| `TEST_USERNAME` | `chrisd` | Test account username | `testuser` |
| `TEST_PASSWORD` | `bumbleFLIES1` | Test account password | `secretpass123` |
| `PHASE` | `all` | Which phase(s) to run: `discovery`, `perform`, `watch`, or `all` | `discover` |
| `COORDINATION_FILE` | `/tmp/gameday_coordination.json` | Path to coordination file (created by discovery) | `/var/tmp/coord.json` |
| `LOG_DIR` | `/tmp` | Directory for worker log files | `./test-logs` |

**Example: Run against production with custom credentials**

```bash
k6 run load-test-gameday-orchestrator.js \
  --env BASE_URL=https://www.leaguesphere.app \
  --env TEST_USERNAME=prod_test_user \
  --env TEST_PASSWORD=prod_test_pass \
  --env NUM_GAMEDAYS=3 \
  --env SPECTATORS_PER_GAMEDAY=2
```

## Analyzing Results

After the load test completes, analyze results in three ways: individual worker logs, aggregated summaries, or detailed event inspection.

### Per-Worker Logs

Each worker (performer/spectator) creates a JSON log file with detailed event history:

```bash
# List all performer logs
ls -la /tmp/performer_*.json

# List all spectator logs
ls -la /tmp/spectator_*.json

# View a specific performer's log
cat /tmp/performer_0.json | jq .

# View just the summary section
cat /tmp/performer_0.json | jq '.summary'

# View all events
cat /tmp/performer_0.json | jq '.events'
```

**Log file structure:**

```json
{
  "metadata": {
    "worker_id": "performer_0",
    "gameday_id": 718,
    "gameday_name": "Gameday 2024-06-15",
    "start_time": "2024-06-04T15:30:00Z",
    "end_time": "2024-06-04T15:45:00Z"
  },
  "summary": {
    "total_events": 42,
    "error_count": 0,
    "response_time_stats": {
      "min": 120,
      "max": 850,
      "avg": 450,
      "p95": 720,
      "p99": 820
    }
  },
  "events": [
    {
      "timestamp": "2024-06-04T15:30:05Z",
      "action": "record_game_score",
      "gameday_id": 718,
      "game_id": 456,
      "response_time": 450,
      "status": 200,
      "error": null
    }
  ]
}
```

### Aggregate Results

Combine all worker logs into a gameday-centric summary:

```bash
# Aggregate logs from /tmp
node tests/load/log-aggregator.js --log-dir /tmp --output results.json

# Aggregate logs from custom directory
node tests/load/log-aggregator.js --log-dir ./test-logs --output aggregated-results.json

# View aggregated results
cat results.json | jq '.gamedays'
```

**Aggregated output structure:**

```json
{
  "test_run_time": "2024-06-04T15:50:00Z",
  "total_gamedays": 5,
  "gamedays": {
    "718": {
      "gameday_id": 718,
      "gameday_name": "Gameday 2024-06-15",
      "test_window": {
        "start": "2024-06-04T15:30:00Z",
        "end": "2024-06-04T16:00:00Z"
      },
      "performers": {
        "performer_0": {
          "worker_id": "performer_0",
          "status": "completed",
          "events": 42,
          "error_count": 0,
          "response_time_stats": {
            "min": 120,
            "max": 850,
            "avg": 450,
            "p95": 720,
            "p99": 820
          }
        }
      },
      "spectators": [
        {
          "worker_id": "spectator_0",
          "status": "completed",
          "events": 156,
          "error_count": 0,
          "response_time_stats": {
            "min": 80,
            "max": 420,
            "avg": 200,
            "p95": 380,
            "p99": 410
          }
        }
      ],
      "metrics": {
        "total_vus": 2,
        "total_api_calls": 198,
        "total_errors": 0
      },
      "anomalies": []
    }
  }
}
```

## Debugging Individual Workers

Inspect specific workers to diagnose issues or understand behavior.

### Find Specific Performer's Log

```bash
# Performer 0 for gameday 718
cat /tmp/performer_0.json | jq .

# Show only errors
cat /tmp/performer_0.json | jq '.events[] | select(.error != null)'

# Show all score recordings
cat /tmp/performer_0.json | jq '.events[] | select(.action == "record_game_score")'

# Show response times (sort by slowest)
cat /tmp/performer_0.json | jq '.events | sort_by(.response_time) | reverse | .[0:5]'
```

### Find Spectators Who Detected State Changes

```bash
# All state changes across all spectators
grep -l "state_change_detected" /tmp/spectator_*.json | xargs -I{} sh -c 'echo "=== {} ===" && cat {} | jq ".events[] | select(.event == \"state_change_detected\")"'

# Spectator 0 state changes only
cat /tmp/spectator_0.json | jq '.events[] | select(.event_type == "state_change_detected")'

# Count state changes per spectator
for f in /tmp/spectator_*.json; do echo "$f: $(cat $f | jq '.events[] | select(.event_type == "state_change_detected") | .event_type' | wc -l)"; done
```

### Check Polling Adaptation

Spectators adapt their polling frequency based on game activity. View the polling pattern:

```bash
# Show all polling events with intervals
cat /tmp/spectator_0.json | jq '.events[] | select(.action | startswith("poll")) | {timestamp, action, interval_seconds}'

# Identify when polling intervals changed
cat /tmp/spectator_0.json | jq '.events[] | select(.action == "poll_interval_increased" or .action == "poll_interval_decreased")'

# Calculate average polling interval during test
cat /tmp/spectator_0.json | jq '[.events[] | select(.action == "poll_gameday_progress").interval_seconds] | add/length'
```

### Response Time Analysis

```bash
# View response time distribution
cat /tmp/performer_0.json | jq '.summary.response_time_stats'

# Find slowest requests
cat /tmp/performer_0.json | jq '.events | sort_by(.response_time) | reverse | .[0:3] | .[] | {action, response_time, status}'

# Events taking > 500ms
cat /tmp/performer_0.json | jq '.events[] | select(.response_time > 500) | {action, response_time}'
```

## Common Issues

### "Failed to load coordination file"

**Symptom:** Error message: `Failed to load coordination file from /tmp/gameday_coordination.json`

**Cause:** Running performers or spectators phase without first running discovery phase.

**Solution:**
```bash
# Step 1: Run discovery phase
k6 run load-test-gameday-orchestrator.js --env PHASE=discovery --env NUM_GAMEDAYS=5

# Step 2: Run performers phase (uses coordination file)
k6 run load-test-gameday-orchestrator.js --env PHASE=perform --env NUM_GAMEDAYS=5

# Or run full cycle (includes discovery automatically)
k6 run load-test-gameday-orchestrator.js --env NUM_GAMEDAYS=5
```

### "No unplayed games found"

**Symptom:** Discovery completes but logs show 0 gamedays prepared.

**Cause:** All gamedays in the date range have already been played, or test account lacks permission.

**Solution:**
```bash
# Verify test account has active gamedays
curl -H "Authorization: Token YOUR_TOKEN" \
  https://stage.leaguesphere.app/api/gamedays/ | jq '.results | length'

# Check for gamedays with pending games
curl -H "Authorization: Token YOUR_TOKEN" \
  https://stage.leaguesphere.app/api/gamedays/ | jq '.results[] | select(.status == "pending")'

# Run test at different time (ensure gamedays are in schedule)
```

### "Spectators Seeing 404 for Gameday"

**Symptom:** Spectator logs show HTTP 404 errors when polling gameday progress.

**Cause:** Gameday was archived or deleted mid-test, or gameday ID doesn't exist.

**Solution:** This is expected behavior — spectators handle 404 gracefully. Verify:

```bash
# Check if gameday still exists
curl -H "Authorization: Token YOUR_TOKEN" \
  https://stage.leaguesphere.app/api/gamedays/718/

# If 404, verify coordination file has correct gameday IDs
cat /tmp/gameday_coordination.json | jq '.gamedays[].id'

# Re-run discovery to get fresh gameday list
k6 run load-test-gameday-orchestrator.js --env PHASE=discovery --env NUM_GAMEDAYS=5
```

### "Performers Erroring on Team Not Found"

**Symptom:** Performer logs show "Team matching query does not exist" errors.

**Cause:** Test database missing placeholder teams required for playoff scheduling.

**Solution:**
```bash
# Reinitialize test database with placeholder teams
./container/spinup_test_db.sh --fresh

# Verify placeholder teams exist
curl -H "Authorization: Token YOUR_TOKEN" \
  https://stage.leaguesphere.app/api/teams/ | jq '.results[] | select(.name | contains("Platzhalter"))'
```

### "No Log Files Generated"

**Symptom:** After test completes, `/tmp/performer_*.json` and `/tmp/spectator_*.json` files don't exist.

**Cause:** Test didn't reach performer/spectator phases, or log directory is wrong.

**Solution:**
```bash
# Check if k6 ran at all (look for k6 output)
# Verify log directory is writable
ls -la /tmp/ | grep -E "performer_|spectator_"

# Run with custom log directory
mkdir -p ./test-logs
k6 run load-test-gameday-orchestrator.js \
  --env LOG_DIR=./test-logs \
  --env NUM_GAMEDAYS=1

# Verify logs were created
ls -la ./test-logs/
```

## Success Metrics

A successful load test should meet these criteria:

### Discovery Phase (2 minutes)
- **Target:** Discovers 5+ gamedays with unplayed games
- **Time:** Completes in < 2 minutes
- **Validation:** `cat /tmp/gameday_coordination.json | jq '.total_gamedays'` shows 5+

### Performers Phase (20 minutes)
- **Target:** All performers score games without errors
- **HTTP Failure Rate:** 0% (p(95) < 1s, p(99) < 2s)
- **Validation:** `cat /tmp/performer_*.json | jq '.summary.error_count'` is 0 for all

### Spectators Phase (20 minutes)
- **Target:** Spectators detect game state changes within 5 seconds
- **HTTP Failure Rate:** 0% (p(95) < 1s, p(99) < 2s for progress API)
- **Polling Adaptation:** Interval increases/decreases based on game activity
- **Validation:** `cat /tmp/spectator_*.json | jq '.summary.error_count'` is 0 for all

### Overall Test
- **Response Times:** p95 < 1s, p99 < 2s for all endpoints
- **Logs:** All workers produce valid JSON files with timestamps
- **Aggregation:** `node log-aggregator.js` completes without errors

**Check success:**

```bash
# Quick validation after test
echo "=== Gamedays Discovered ==="
cat /tmp/gameday_coordination.json | jq '.total_gamedays'

echo "=== Performer Errors ==="
for f in /tmp/performer_*.json; do echo "$f: $(cat $f | jq '.summary.error_count')"; done

echo "=== Spectator Errors ==="
for f in /tmp/spectator_*.json; do echo "$f: $(cat $f | jq '.summary.error_count')"; done

echo "=== Aggregate Results ==="
node tests/load/log-aggregator.js --log-dir /tmp --output results.json
cat results.json | jq '.gamedays | to_entries | .[] | {gameday: .key, errors: .value.metrics.total_errors}'
```

## Advanced Configuration

### Custom Test Credentials

For production testing with dedicated test accounts:

```bash
k6 run load-test-gameday-orchestrator.js \
  --env BASE_URL=https://www.leaguesphere.app \
  --env TEST_USERNAME=prod_load_test_1 \
  --env TEST_PASSWORD=<secure-password> \
  --env NUM_GAMEDAYS=10
```

### Distributed Load Testing

For large-scale tests, use k6 cloud to run from multiple geographic regions:

```bash
# Run test on k6 cloud (requires k6 account)
k6 cloud load-test-gameday-orchestrator.js \
  --env NUM_GAMEDAYS=20 \
  --env SPECTATORS_PER_GAMEDAY=5
```

### Persistent Result Storage

Store results in a database for trend analysis:

```bash
# Run test and store results
node tests/load/log-aggregator.js --log-dir /tmp --output results.json

# Parse and insert into database
cat results.json | jq '.gamedays[] | {gameday_id, metrics}' > gameday_metrics.jsonl
```

## Troubleshooting

### Test Hangs or Doesn't Complete

```bash
# Check k6 process
ps aux | grep k6

# Increase timeout (if behind slow network)
k6 run load-test-gameday-orchestrator.js \
  --env BASE_URL=https://slow-server.com \
  --duration=30m  # Extend test duration

# Check server availability
curl -I https://stage.leaguesphere.app/api/gamedays/
```

### Memory Issues with Large Logs

If testing with many VUs, log aggregation may run out of memory:

```bash
# Process logs in batches
ls /tmp/performer_*.json | head -10 | xargs -I {} cp {} ./batch1/
node tests/load/log-aggregator.js --log-dir ./batch1 --output batch1-results.json
```

### Coordination File Corruption

If coordination file is malformed, regenerate it:

```bash
# Remove old coordination file
rm /tmp/gameday_coordination.json

# Re-run discovery phase
k6 run load-test-gameday-orchestrator.js --env PHASE=discovery --env NUM_GAMEDAYS=5
```

## See Also

- [Performance Guide](../guides/performance-guide.md) — Query optimization and caching patterns
- [Load Testing Design](realistic-multi-phase-design.md) — Architecture and multi-phase orchestration
- [API Contract](actual-api-contract.md) — Endpoint specifications used by load test
