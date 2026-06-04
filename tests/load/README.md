# Load Testing - K6

Load testing infrastructure for LeagueSphere using [k6](https://k6.io/).

## Overview

This directory contains k6 load testing scripts and tools for testing LeagueSphere under simulated production load. K6 generates synthetic traffic, measures response times and error rates, and pushes metrics to Prometheus for visualization in Grafana.

## Files

- **`k6.js`** — Main k6 load test script
  - Load pattern: Ramping 1→10 virtual users over 10 minutes
  - Endpoints: `/gamedays/`, `/leaguetable/dffl/`, `/officials/team/all/list/`, `/gamedays/gameday/718/`
  - Metrics: Request rate, latency percentiles (p50/90/95/99), error rates
  - Thresholds: p95 < 2000ms, p99 < 3000ms

- **`run.sh`** — Execution wrapper with Prometheus Pushgateway integration
  - Establishes SSH tunnel to Pushgateway on production
  - Runs k6 with `experimental-prometheus-rw` output
  - Automatically manages tunnel lifecycle

- **`verify-pipeline.sh`** — Validates Prometheus/Pushgateway data flow
  - Pushes test metrics to Pushgateway
  - Verifies metrics appear in Prometheus
  - Confirms pipeline is operational before running tests

## Quick Start

### Run Local Load Test

```bash
# Navigate to tests/load directory
cd leaguesphere/tests/load

# Run against production
./run.sh

# Run against staging
./run.sh k6.js https://stage.leaguesphere.app

# Run against local development
./run.sh k6.js http://localhost:8000
```

### Verify Prometheus Pipeline

```bash
# Check metrics flow from Pushgateway → Prometheus
./verify-pipeline.sh

# With custom endpoints
export PUSHGATEWAY_URL="http://custom-pushgateway:9091"
export PROMETHEUS_URL="http://custom-prometheus:9090"
./verify-pipeline.sh
```

### Monitor Results

**Production Dashboard:**
```
https://monitor.lehel.xyz/d/k6-leaguesphere-prod-enhanced
```

Dashboard shows:
- K6 load profile (virtual users over time)
- K6 request rate and latency percentiles
- LeagueSphere actual request rate and latency (from Traefik metrics)
- Server CPU usage during test
- Request success rate

## Configuration

### Environment Variables

**For `run.sh`:**
- `TARGET_HOST` — Target URL for load test (default: `https://www.leaguesphere.app`)
- `PUSHGATEWAY_HOST` — Production Pushgateway host (default: `lehel.xyz`)

**For `verify-pipeline.sh`:**
- `PUSHGATEWAY_URL` — Pushgateway endpoint (default: `http://localhost:9091`)
- `PROMETHEUS_URL` — Prometheus endpoint (default: `http://localhost:9090`)

### K6 Script Configuration

Edit `k6.js` to modify:
- **Load pattern**: `rampingVUs` stages (currently 1→10 over 10 minutes)
- **Endpoints**: Modify `ENDPOINTS` array to test different routes
- **Thresholds**: `options.thresholds` for p95/p99 success criteria
- **Duration**: Adjust `duration` in each ramp stage

Example modifications:
```javascript
// Change load pattern
{duration: '2m', target: 20},  // Ramp to 20 users
{duration: '5m', target: 20},  // Hold at 20 users
{duration: '2m', target: 0},   // Ramp down

// Add new endpoint
'https://' + TARGET_HOST + '/api/endpoint',

// Adjust thresholds
'p(95) < 1000':  true,  // More aggressive
'p(99) < 5000':  true,  // More lenient
```

## Metrics Flow

```
K6 Load Test
    ↓
experimental-prometheus-rw output
    ↓
SSH Tunnel (localhost:9091)
    ↓
Prometheus Pushgateway (lehel.xyz:9091)
    ↓
Prometheus (every 15s scrape)
    ↓
Grafana Dashboard (monitor.lehel.xyz)
```

### Metrics Published by K6

**Virtual Users:**
- `k6_vu{job="k6-load-test"}` — Current virtual user count

**Request Metrics:**
- `k6_http_reqs_total{job="k6-load-test"}` — Total requests counter
- `k6_http_req_duration{job="k6-load-test"}` — Request duration histogram

**Error Metrics:**
- Custom `errors` rate metric
- HTTP status codes in labels

### Metrics from LeagueSphere (Traefik)

The dashboard also shows real application metrics during the test:
- `traefik_service_requests_total{service=~".*leaguesphere.*"}` — Real request rate
- `traefik_service_request_duration_seconds_bucket{service=~".*leaguesphere.*"}` — Real latency

## Troubleshooting

### "SSH tunnel failed" or "Could not establish tunnel"

**Problem:** SSH connection to Pushgateway failed
**Solution:**
1. Verify SSH access: `ssh lehel.xyz echo "OK"`
2. Check Pushgateway running: `curl http://lehel.xyz:9091/metrics`
3. Verify port forwarding: `netstat -tuln | grep 9091`

### "No data in Grafana" after test

**Problem:** K6 metrics don't appear in dashboard
**Solution:**
1. Run `verify-pipeline.sh` to check data flow
2. Check Prometheus targets: `curl http://prometheus:9090/api/v1/targets`
3. Verify Pushgateway is registered in Prometheus scrape config
4. Wait 15+ seconds (Prometheus scrape interval)

### "Thresholds exceeded" warnings

**Problem:** Test shows warnings about p95 or p99 latency
**Solution:**
1. Check server health: CPU/memory load during test
2. Verify LeagueSphere latency panel in dashboard
3. If app latency is high, not a k6 issue — indicates real performance problem
4. Adjust thresholds in `k6.js` if needed

## Best Practices

1. **Verify pipeline before major tests**: Run `verify-pipeline.sh` first
2. **Monitor dashboard during test**: Keep Grafana open while running test
3. **Correlate with real metrics**: Compare K6 request rate vs LeagueSphere actual rate
4. **Check server health**: Monitor CPU/memory impact during test
5. **Document results**: Record baseline metrics for comparison

## Related Documentation

- **Load Testing History**: `leaguesphere/history/2026-05-31_load-testing-infrastructure.md`
- **Dashboard Extension**: `leaguesphere/history/2026-06-03_k6-dashboard-extension.md`
- **K6 Official Docs**: https://k6.io/docs/
- **Prometheus Metrics**: https://prometheus.io/docs/

## Examples

### Run 30-minute load test
```bash
# Edit k6.js to change duration:
# {duration: '30m', target: 10},

./run.sh
```

### Test specific endpoint
```bash
# Modify k6.js ENDPOINTS array to only include one endpoint
./run.sh
```

### Load test against staging
```bash
./run.sh k6.js https://stage.leaguesphere.app
```

### Continuous load testing
```bash
# Run test every hour
watch -n 3600 'cd tests/load && ./run.sh'
```

---

## Realistic Multi-Phase Load Test (New)

### Overview

A comprehensive load test that simulates production-like behavior across three coordinated phases:

1. **Phase 1 - Setup Manager (1 VU, 3 min):** Prepares gamedays by changing dates to today
2. **Phase 2 - Performers (5-10 VUs, 20 min):** Scores games from start to finish
3. **Phase 3 - Spectators (50-100 VUs, 20 min):** Views games with realistic wave arrivals

Total run time: ~55 minutes  
Peak concurrent VUs: 110 (1 setup + 10 performers + 100 spectators)

### Quick Start

```bash
cd tests/load

# Run complete multi-phase test against staging
export TARGET_HOST=https://stage.leaguesphere.app
export TEST_USERNAME=chrisd
export TEST_PASSWORD=bumbleFLIES1
export MAX_GAMEDAYS=5

# Option 1: Run using runner script (orchestrates all phases)
./load-test-runner.sh

# Option 2: Run specific phase
k6 run --env "PHASE=setup" ../../load-test-realistic-cycle.js
k6 run --env "PHASE=performers" ../../load-test-realistic-cycle.js
k6 run --env "PHASE=spectators" ../../load-test-realistic-cycle.js

# Option 3: Run entire test in one go
k6 run --env "PHASE=all" ../../load-test-realistic-cycle.js
```

### Phase Details

#### Phase 1: Setup Manager
- **VUs:** 1
- **Duration:** 3 minutes
- **Actions:**
  - Fetch published gamedays from API
  - Change date of 5-10 gamedays to today
  - Fetch all games for each gameday
  - Write `gameday_assignments.json` coordination file

**Success Criteria:** Coordination file contains 5+ gamedays with games assigned to performers

#### Phase 2: Performers
- **VUs:** 5-10 (1 per gameday)
- **Duration:** 20 minutes
- **Per Game Sequence:**
  1. Setup game (`PUT /api/game/{id}/setup`)
  2. Set officials (`PUT /api/game/{id}/officials`)
  3. Record first half events (3 events, alternating teams)
  4. Mark halftime (`PUT /api/game/{id}/halftime`)
  5. Record second half events (3 events, alternating teams)
  6. Finalize game (`PUT /api/game/{id}/finalize`)

**Per-game duration:** ~2-3 minutes  
**Success Criteria:** p95 latency < 1000ms, error rate < 2%

#### Phase 3: Spectators
- **VUs:** 50-100
- **Duration:** 20 minutes
- **Wave Arrivals:**
  - Wave 1 (min 5): 30 VUs arrive, browse gameday overview
  - Wave 2 (min 9): 100 VUs total, peak load with game polling
  - Wave 3 (min 17): Final browsing and standings view

**Success Criteria:** Concurrent viewing doesn't cause performance degradation

### Coordination File

Setup Manager produces `gameday_assignments.json` in `/tmp/`:

```json
{
  "timestamp": "2026-06-04T12:00:00Z",
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
      "assigned_spectators": ["spectator_858_0", "spectator_858_1"]
    }
  ]
}
```

### Environment Variables

```bash
TARGET_HOST            # API base URL (default: https://stage.leaguesphere.app)
TEST_USERNAME          # Login username (default: chrisd)
TEST_PASSWORD          # Login password (default: bumbleFLIES1)
MAX_GAMEDAYS          # Number of gamedays to prepare (default: 5)
PHASE                 # Which phase to run: 'setup', 'performers', 'spectators', 'all'
```

### Monitoring

View results in Grafana:
- **Production:** https://monitor.lehel.xyz/d/k6-leaguesphere-prod-enhanced
- Local Prometheus: http://localhost:9090

### Troubleshooting

**Q: Coordination file not found**
A: Ensure Phase 1 (Setup) completed successfully and has write access to `/tmp/`

**Q: Games not found**
A: Check that `MAX_GAMEDAYS` is set to a value where published gamedays exist (5-10 recommended)

**Q: High latency in Phase 3**
A: This is expected at peak (100 VUs). Check server health and compare against baseline.

### Architecture

- **Main script:** `load-test-realistic-cycle.js` - Orchestrates all three phases
- **Helper modules:** `load-test-helpers/` - Modular functions for auth, setup, performers, spectators
- **Coordination:** `gameday_assignments.json` - Shared state written by Phase 1, read by Phases 2-3
- **Runner:** `load-test-runner.sh` - Bash wrapper to orchestrate phases sequentially

### Files

- `load-test-realistic-cycle.js` - Main k6 script with all phases
- `load-test-helpers/auth.js` - Authentication module
- `load-test-helpers/coordination.js` - Coordination file I/O
- `load-test-helpers/setup-manager.js` - Phase 1 (setup) logic
- `load-test-helpers/performers.js` - Phase 2 (game scoring) logic
- `load-test-helpers/spectators.js` - Phase 3 (viewing) logic
- `load-test-runner.sh` - Phase orchestration script

---

**Last Updated:** 2026-06-04  
**K6 Version:** 0.45+  
**Dashboard:** https://monitor.lehel.xyz/d/k6-leaguesphere-prod-enhanced
