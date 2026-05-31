# Load Testing Design: LeagueSphere Production Ramping Test with Unified Monitoring

**Date:** 2026-05-31  
**Objective:** Identify breaking points and stress-test resilience under ramping load with simultaneous monitoring  
**Duration:** 10 minutes  
**Load Pattern:** 1 req/sec (minute 1) → 10 req/sec (minute 10)  
**Success Metrics:** p95 latency < 2s, error rate < 5%

---

## Goals

1. **Find Breaking Points** — Determine at what load level the system begins to degrade
2. **Stress Test for Resilience** — Observe how gracefully the system degrades under extreme load
3. **Establish Baseline** — Capture metrics for before/after comparisons of future optimizations

---

## Target Endpoints

Load testing focuses on these 4 production endpoints:

| Endpoint | Purpose | Expected Load |
|----------|---------|----------------|
| `GET /gamedays/` | List all gamedays | High traffic, filtering/sorting heavy |
| `GET /leaguetable/dffl/` | League standings table | Complex aggregation queries |
| `GET /officials/team/all/list/` | Officials roster | Medium complexity |
| `GET /gamedays/gameday/718/` | Single gameday detail | Single-record lookup |

Load is distributed equally (25% each) unless otherwise specified.

---

## Architecture

### Components

**1. k6 Load Generator**
- Open-source load testing tool (single binary, no dependencies)
- Runs locally on test machine
- Executes ramping load pattern (1→10 req/sec over 10 minutes)
- Exposes metrics via HTTP endpoint on `localhost:6565` for Prometheus scraping
- Tracks: response times, error rates, p95 latency, request counts

**2. Prometheus** (already running at `monitor.prometheus`)
- Existing instance in the container infrastructure (servyy-container)
- Will scrape k6 metrics every 5 seconds after adding a scrape job
- Stores metrics for Grafana to query

**3. Grafana Dashboard** (already accessible at `https://monitor.lehel.xyz`)
- Real-time visualization of: load pattern, response times, error rates
- Additional panels for server health (CPU, memory, active connections) pulled from Loki
- Single pane of glass during test execution
- Built in the existing Grafana instance (no new infrastructure needed)

### Data Flow

```
k6 load generator → generates requests → production endpoints
                 ↓
            metrics HTTP endpoint (localhost:6565)
                 ↓
            Prometheus scrapes every 5s
                 ↓
            Grafana queries & displays
                 ↓
            Loki logs aggregated into dashboard
```

---

## Load Test Script Specification

### Load Pattern

**Ramping profile:**
- Minute 1: 1 virtual user (1 req/sec, assuming 1 req per second per user)
- Minute 2: 2 virtual users
- Minute 3: 3 virtual users
- ... (linear increase)
- Minute 10: 10 virtual users

Total requests over 10 minutes: ~55 requests (1+2+3+...+10)

### Endpoint Distribution

Each virtual user makes requests to all 4 endpoints in round-robin or random order:
- 25% of requests → `/gamedays/`
- 25% of requests → `/leaguetable/dffl/`
- 25% of requests → `/officials/team/all/list/`
- 25% of requests → `/gamedays/gameday/718/`

### Custom Metrics

k6 script tracks:
- `http_req_duration` — Response time for each request
- `http_req_failed` — Count of failed requests (non-2xx/3xx status)
- `p95_latency` — 95th percentile latency (recalculated every minute as load increases)
- `error_rate` — Percentage of failed requests

---

## Prometheus Configuration

Add a new scrape job to `monitor/prometheus.yml` in the container infrastructure:

```yaml
scrape_configs:
  - job_name: 'k6-load-test'
    static_configs:
      - targets: ['localhost:6565']  # k6 metrics endpoint
    scrape_interval: 5s
    scrape_timeout: 5s
```

Deploy this change to production via Ansible: `./container/ansible/servyy.sh --tags user.docker --limit lehel.xyz`

---

## Grafana Dashboard Specification

### Dashboard Panels

**Panel 1: Load Pattern Over Time**
- X-axis: Time (minutes)
- Y-axis: Virtual users (0-10)
- Expected: Linear ramp from 1 to 10
- Purpose: Confirm load pattern is correct

**Panel 2: Response Time Distribution (p95 Latency)**
- X-axis: Time
- Y-axis: Latency in milliseconds
- Lines: p50, p95, p99 latency
- Thresholds: Yellow at 1000ms, red at 2000ms
- Purpose: Identify when response times degrade

**Panel 3: Error Rate**
- X-axis: Time
- Y-axis: Error rate (%)
- Single line: HTTP error rate
- Threshold: Red at 5%, yellow at 2%
- Purpose: Spot when errors begin to occur

**Panel 4: Server Health (from Loki/infrastructure)**
- CPU utilization (%)
- Memory utilization (%)
- Active database connections
- Purpose: Correlate errors/latency with resource exhaustion

---

## Success Criteria

### Test Passes If:
- p95 latency remains under 2 seconds through at least 8 req/sec (minute 8)
- Error rate stays under 5% throughout the test
- System recovers when load plateaus (metrics stabilize, don't cascade)

### Breaking Point Identified When:
- p95 latency spikes above 3 seconds for 2+ consecutive minutes
- Error rate exceeds 10% for more than 30 seconds
- Server resource exhaustion: CPU sustained above 90%, memory near OOM, or database connections hit max

### Interpretation
- **Healthy degradation:** Latency increases smoothly, errors minimal until high load
- **Cascading failure:** Latency spikes, errors spike, system struggles to recover
- **Resource bottleneck:** CPU/memory maxed before latency degrades (optimization opportunity)

---

## Implementation Sequence

1. **Write k6 script:** Implement ramping load pattern (1→10 req/sec) and metrics export to `localhost:6565`
2. **Update Prometheus config:** Add scrape job for k6 metrics to `monitor/prometheus.yml`
3. **Deploy Prometheus change:** Test on `servyy-test.lxd` first, then production via Ansible
4. **Build Grafana dashboard:** Create 4 panels in existing Grafana instance showing load, latency, errors, system health
5. **Dry run:** Execute k6 test on staging to verify metrics flow to Prometheus/Grafana
6. **Execute production test:** Run k6 on production with Grafana dashboard open for monitoring
7. **Collect results:** Export dashboard snapshots and Prometheus metrics for analysis

---

## Constraints & Assumptions

- **Production traffic:** Load test will add synthetic traffic to production. Schedule during low-traffic window if possible.
- **Prometheus retention:** Metrics automatically retained by existing Prometheus instance; snapshot dashboard after test for archive
- **Loki logs:** Server logs already flowing to Loki via Promtail (infrastructure in place)
- **Network:** k6 runs with network access to production endpoints (either locally or from stable infrastructure machine)
- **Database:** Test database NOT used; this is a production test to find real breaking points
- **Prometheus scrape:** Existing infrastructure Prometheus (`monitor.prometheus`) will scrape k6 metrics via `localhost:6565`; requires Prometheus config update and Ansible deployment

---

## Known Unknowns / Future Refinements

- **Endpoint weights:** Currently equal distribution; can be adjusted based on real production traffic patterns
- **Request payload:** GET requests assumed; POST/authentication may require different handling
- **Cache effects:** First run may warm caches; repeat test may show different results
- **Time of day:** Results may vary based on production load at test time; document when test runs

---

## Related Documentation

- **k6 docs:** https://k6.io/docs/ (for script writing and metrics)
- **k6 Prometheus integration:** https://k6.io/docs/results-output/real-time/prometheus/
- **Prometheus config:** https://prometheus.io/docs/prometheus/latest/configuration/configuration/
- **Infrastructure setup:** `/home/cda/dev/infrastructure/container/CLAUDE.md` for Prometheus, Grafana, Loki details
- **Grafana dashboards:** Accessible at `https://monitor.lehel.xyz`
- **Monitoring services:**
  - Prometheus: `monitor.prometheus` container
  - Grafana: `monitor.grafana` container
  - Loki: `monitor.loki` container (log aggregation)
  - Promtail: `monitor.promtail` container (log collection)
