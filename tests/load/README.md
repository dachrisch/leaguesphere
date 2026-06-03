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

**Last Updated:** 2026-06-03  
**K6 Version:** 0.45+  
**Dashboard:** https://monitor.lehel.xyz/d/k6-leaguesphere-prod-enhanced
