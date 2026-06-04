# Load Testing - K6

Load testing infrastructure for LeagueSphere using [k6](https://k6.io/).

## Overview

This directory contains the **gameday-centric orchestrator** — a comprehensive load testing framework that simulates realistic user behavior across three coordinated phases:

1. **Discovery** — Find gamedays with unplayed games and prepare them for testing
2. **Performers** — Simulate officials scoring complete games  
3. **Spectators** — Simulate fans viewing gameday progress with autonomous polling behavior

## Quick Start

### Run 1 Gameday with 1 Performer

```bash
cd tests/load
GAMEDAYS=1 SPECTATORS_PER_GAMEDAY=1 TEST_USERNAME=k6 TEST_PASSWORD='load!Test' bash run-load-test.sh
```

**Duration:** ~25 minutes  
**Total VUs:** 2 (1 performer + 1 spectator)  
**Target:** https://stage.leaguesphere.app (default)

### Run with Custom Configuration

```bash
GAMEDAYS=5 \
SPECTATORS_PER_GAMEDAY=3 \
TARGET_HOST=https://stage.leaguesphere.app \
TEST_USERNAME=k6 \
TEST_PASSWORD='load!Test' \
bash run-load-test.sh
```

## Architecture

### Main Orchestrator

**`load-test-gameday-orchestrator.js`** — Single k6 script that orchestrates all phases:

- **Phase 1 - Discovery (2 min, 1 VU)**
  - Login with manager credentials
  - Find published gamedays with unplayed games
  - Update gameday dates to today
  - Write coordination file

- **Phase 2 - Performers (20 min, N VUs)**
  - Login as officials
  - Score games sequentially:
    1. Setup game state
    2. Assign officials
    3. Record first half events (3 events, alternating teams)
    4. Record halftime
    5. Record second half events (3 events, alternating teams)
    6. Finalize game

- **Phase 3 - Spectators (20+ min, N×M VUs)**
  - Anonymous polling of gameday progress
  - Adaptive polling frequency (3.5s idle → 1.5s active)
  - Autonomous state detection (game start/finish/score changes)
  - Wander behavior (80% focus on assigned gameday, 20% explore others)

### Wrapper Script

**`run-load-test.sh`** — Coordinator that:
- Handles k6 file I/O limitations (k6 cannot write files during execution)
- Extracts coordination data from k6 console output
- Orchestrates all phases sequentially
- Aggregates logs post-test

### Helper Modules

Located in `load-test-helpers/`:

- **`auth.js`** — Token-based authentication (performers) and anonymous access (spectators)
- **`gameday-discovery.js`** — Discovery phase logic
- **`performer-gameday.js`** — Game scoring and event recording
- **`spectator-autonomous.js`** — Autonomous spectator polling
- **`logging.js`** — Structured JSON logging with event tracking
- **`coordination.js`** — Coordination file handling

## Configuration

### Environment Variables

```bash
TARGET_HOST              # API base URL (default: https://stage.leaguesphere.app)
GAMEDAYS                 # Number of gamedays to test (default: 5)
SPECTATORS_PER_GAMEDAY   # Spectators per gameday (default: 3)
TEST_USERNAME            # Login username (default: k6)
TEST_PASSWORD            # Login password (default: load!Test)
PHASE                    # Execution phase (default: all)
                         # Options: discovery, perform, watch, all
COORDINATION_FILE        # Coordination data file path (default: /tmp/gameday_coordination.json)
LOG_DIR                  # Log directory for worker logs (default: /tmp)
K6_OPTS                  # Additional k6 command-line flags
```

### VU Calculation

Total VUs = GAMEDAYS + (GAMEDAYS × SPECTATORS_PER_GAMEDAY)

Examples:
- 1 gameday, 1 spectator → 2 VUs
- 5 gamedays, 3 spectators → 20 VUs
- 10 gamedays, 5 spectators → 60 VUs

## Running Phases Individually

If needed, run specific phases:

```bash
# Discovery only
PHASE=discovery bash run-load-test.sh

# Performers only (requires coordination file from discovery)
PHASE=perform bash run-load-test.sh

# Spectators only (requires coordination file from discovery)
PHASE=watch bash run-load-test.sh
```

## Monitoring

### View Results

K6 outputs summary statistics including:
- Request count and success rate
- Response time percentiles (p50, p95, p99)
- Error rates
- Custom event metrics (game setup, halftime, finalize, etc.)

### Production Monitoring

View real application metrics during/after tests:
- **Grafana Dashboard:** https://monitor.lehel.xyz/d/k6-leaguesphere-prod-enhanced
- **Prometheus:** http://localhost:9090

## Testing

### Integration Test (Smoke Test)

Verify the framework works end-to-end:

```bash
bash integration-test-gameday.sh
```

This runs a quick discovery + performance cycle to validate:
- API connectivity
- Authentication
- Game discovery and preparation
- Event recording
- Coordination file generation

## Troubleshooting

### "Coordination file not found"

**Error:** Failed to load coordination file when running perform/watch phases  
**Solution:** Ensure discovery phase completed successfully before running subsequent phases

```bash
# Run discovery first
PHASE=discovery bash run-load-test.sh

# Then performers
PHASE=perform bash run-load-test.sh
```

### "Team not found" during event recording

**Issue:** Game preparation didn't properly fetch team data  
**Solution:** Ensure discovery phase completed successfully and target gamedays have valid team assignments

### "No gamedays found"

**Issue:** Discovery phase found no published gamedays with unplayed games  
**Solution:** Verify the staging environment has published gamedays available

### High latency or p95/p99 threshold violations

**Interpretation:** May indicate real application performance issues under load, not a test problem  
**Action:** Check application logs and server health during test execution

## Files

### Core
- `load-test-gameday-orchestrator.js` — Main k6 orchestrator
- `run-load-test.sh` — Wrapper coordinator
- `log-aggregator.js` — Post-test log aggregation
- `integration-test-gameday.sh` — Smoke test

### Helpers (`load-test-helpers/`)
- `auth.js` — Authentication
- `gameday-discovery.js` — Discovery phase
- `performer-gameday.js` — Game scoring
- `spectator-autonomous.js` — Spectator polling
- `logging.js` — Structured logging
- `coordination.js` — Coordination I/O

### Operations
- `verify-pipeline.sh` — Prometheus pipeline validation

### Manual Testing (`manual-testing/`)
- `test-api.sh` — Authenticate and extract CSRF token
- `scorecard.sh` — Record complete game lifecycle manually
- `record_event.sh` — Record individual journey events
- `record_events.sh` — Bulk record sequence of events

### Legacy
- `k6.js` — Legacy basic ramping test (rarely used)

## Known Constraints

### API Behavior

- **Gameday date update** requires full payload (name, start, season, league), not just date
- **Workaround:** Orchestrator fetches full gameday before update

### K6 File I/O

- K6 cannot write files during test execution
- **Solution:** Wrapper script (`run-load-test.sh`) extracts coordination data from console output

## Next Steps

1. Run smoke test: `bash integration-test-gameday.sh`
2. Start load test: `GAMEDAYS=1 SPECTATORS_PER_GAMEDAY=1 bash run-load-test.sh`
3. Monitor in Grafana: https://monitor.lehel.xyz/d/k6-leaguesphere-prod-enhanced
4. Review aggregated logs in `/tmp/`

## Documentation

- **Design Spec:** `docs/superpowers/specs/2026-06-04-realistic-gameday-load-test.md`
- **Implementation Plan:** `docs/superpowers/plans/2026-06-04-gameday-load-test.md`
- **Related History:** `history/2026-06-04_gameday-load-test.md`
- **K6 Official Docs:** https://k6.io/docs/
- **Prometheus Metrics:** https://prometheus.io/docs/

---

**Last Updated:** 2026-06-04  
**K6 Version:** v2.0.0+  
**Status:** Production-ready
