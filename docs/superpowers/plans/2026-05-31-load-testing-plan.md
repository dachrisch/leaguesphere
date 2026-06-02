# Load Testing with Unified Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up a k6 load test that ramps from 1→10 req/sec over 10 minutes targeting 4 LeagueSphere endpoints, with real-time monitoring via Prometheus and Grafana showing p95 latency and error rates.

**Architecture:** k6 runs a ramping load test and exposes metrics on `localhost:6565`. Prometheus (already running in container infrastructure) scrapes these metrics every 5 seconds. Grafana (at `monitor.lehel.xyz`) displays real-time dashboards combining k6 metrics (load pattern, latency, error rate) with system health from Loki.

**Tech Stack:** k6 (load testing), Prometheus (metrics scraping), Grafana (visualization), Loki (log aggregation/system health)

---

## File Structure

**Files to create:**
- `load-test-k6.js` — k6 load test script with ramping pattern and custom metrics
- `grafana-k6-dashboard.json` — Grafana dashboard with 4 panels for load test monitoring

**Files to modify:**
- `container/monitor/prometheus.yml` — Add scrape job for k6 metrics endpoint

---

## Task 1: Write and Test k6 Load Test Script

**Files:**
- Create: `load-test-k6.js`

- [ ] **Step 1: Install k6 locally (if not present)**

Run: `which k6` or check [k6 installation](https://k6.io/docs/getting-started/installation/)

Expected: k6 binary available in your PATH

- [ ] **Step 2: Create k6 script with ramping load pattern**

Create `load-test-k6.js`:

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const reqDuration = new Trend('http_req_duration');
const errorCounter = new Counter('http_error_count');

const BASE_URL = 'https://www.leaguesphere.app';

const endpoints = [
  '/gamedays/',
  '/leaguetable/dffl/',
  '/officials/team/all/list/',
  '/gamedays/gameday/718/',
];

export const options = {
  stages: [
    { duration: '1m', target: 1 },   // 1 VU for 1 minute
    { duration: '1m', target: 2 },   // 2 VU for 1 minute
    { duration: '1m', target: 3 },   // 3 VU for 1 minute
    { duration: '1m', target: 4 },   // 4 VU for 1 minute
    { duration: '1m', target: 5 },   // 5 VU for 1 minute
    { duration: '1m', target: 6 },   // 6 VU for 1 minute
    { duration: '1m', target: 7 },   // 7 VU for 1 minute
    { duration: '1m', target: 8 },   // 8 VU for 1 minute
    { duration: '1m', target: 9 },   // 9 VU for 1 minute
    { duration: '1m', target: 10 },  // 10 VU for 1 minute
  ],
};

export default function () {
  // Pick random endpoint for this iteration
  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  const url = BASE_URL + endpoint;

  const response = http.get(url);

  // Check response status
  const isSuccess = check(response, {
    'status is 2xx or 3xx': (r) => r.status >= 200 && r.status < 400,
  });

  // Track errors
  if (!isSuccess) {
    errorRate.add(1);
    errorCounter.add(1);
  } else {
    errorRate.add(0);
  }

  // Track request duration
  reqDuration.add(response.timings.duration);

  // Small sleep to distribute requests
  sleep(0.1);
}
```

- [ ] **Step 3: Verify script is valid syntax**

Run: `k6 run load-test-k6.js --duration 10s --vus 1` (short test to verify)

Expected: Script runs without syntax errors, generates metrics, completes cleanly

- [ ] **Step 4: Commit k6 script**

```bash
git add load-test-k6.js
git commit -m "feat: add k6 load test script with ramping 1-10 req/sec pattern"
```

---

## Task 2: Update Prometheus Configuration for k6 Metrics

**Files:**
- Modify: `container/monitor/prometheus.yml`

- [ ] **Step 1: Read current Prometheus config**

Run: `cat container/monitor/prometheus.yml`

Expected: YAML file with existing scrape_configs (traefik, cAdvisor, node-exporter, etc.)

- [ ] **Step 2: Add k6 scrape job to prometheus.yml**

Locate the `scrape_configs:` section and add this job (add after the last existing job):

```yaml
  - job_name: 'k6-load-test'
    static_configs:
      - targets: ['localhost:6565']
    scrape_interval: 5s
    scrape_timeout: 5s
    metrics_path: '/metrics'
```

Expected: File now includes k6-load-test job in scrape_configs

- [ ] **Step 3: Verify YAML syntax**

Run: `yamllint container/monitor/prometheus.yml` (or just `cat` it and visually verify indentation)

Expected: No syntax errors

- [ ] **Step 4: Commit Prometheus config change**

```bash
git add container/monitor/prometheus.yml
git commit -m "feat: add Prometheus scrape job for k6 load test metrics"
```

---

## Task 3: Test Prometheus Config on Staging

**Files:**
- No new files (testing existing deployment)

- [ ] **Step 1: Deploy to test environment**

```bash
cd container/scripts
./setup_test_container.sh
cd ../ansible
./servyy-test.sh --tags user.docker
```

Expected: Ansible playbook completes successfully, test container has updated prometheus.yml

- [ ] **Step 2: Verify Prometheus is running on test**

```bash
ssh servyy-test.lxd "docker ps | grep monitor.prometheus"
```

Expected: Container is running

- [ ] **Step 3: Check Prometheus config is loaded**

```bash
ssh servyy-test.lxd "docker exec monitor.prometheus cat /etc/prometheus/prometheus.yml | grep k6"
```

Expected: k6-load-test job section appears in config

- [ ] **Step 4: Commit successful test (implicit in task 2 commit)**

No additional commit needed — config is already committed

---

## Task 4: Deploy Prometheus Config to Production

**Files:**
- No new files (deployment only)

- [ ] **Step 1: Verify prod Prometheus before deployment**

```bash
ssh lehel.xyz "docker ps | grep monitor.prometheus"
```

Expected: Container is running

- [ ] **Step 2: Deploy to production**

```bash
cd container/ansible
./servyy.sh --tags user.docker --limit lehel.xyz
```

Expected: Ansible completes, Prometheus container restarts with new config

- [ ] **Step 3: Verify production Prometheus loaded new config**

```bash
ssh lehel.xyz "docker exec monitor.prometheus cat /etc/prometheus/prometheus.yml | grep k6"
```

Expected: k6-load-test job appears in production Prometheus config

---

## Task 5: Build Grafana Dashboard

**Files:**
- Create: `grafana-k6-dashboard.json`

- [ ] **Step 1: Access Grafana UI**

Navigate to `https://monitor.lehel.xyz` in browser. Log in if required.

Expected: Grafana dashboard home page loads

- [ ] **Step 2: Create new dashboard**

In Grafana UI:
1. Click "Dashboards" → "New Dashboard"
2. Click "Add a new panel"
3. Name it "Load Pattern" and configure panel

- [ ] **Step 3: Configure Panel 1: Load Pattern**

Panel settings:
- **Title:** "Load Pattern Over Time"
- **Data Source:** Prometheus
- **Query:** `k6_vu{job="k6-load-test"}`
- **Legend:** Show
- **Y-axis label:** "Virtual Users"
- **Type:** Graph (time series)

Expected: Panel shows ramping line from 1→10 over time

- [ ] **Step 4: Configure Panel 2: Response Time (p95 Latency)**

Add new panel:
- **Title:** "Response Time - p95 Latency"
- **Data Source:** Prometheus
- **Queries:**
  - `histogram_quantile(0.95, k6_http_req_duration{job="k6-load-test"})`
  - Label: "p95 Latency"
- **Thresholds:** Yellow 1000ms, Red 2000ms
- **Y-axis label:** "Latency (ms)"
- **Type:** Graph (time series)

Expected: Panel shows latency trend with color-coded thresholds

- [ ] **Step 5: Configure Panel 3: Error Rate**

Add new panel:
- **Title:** "HTTP Error Rate"
- **Data Source:** Prometheus
- **Query:** `rate(k6_http_errors_total{job="k6-load-test"}[1m]) * 100`
- **Legend:** "Error Rate %"
- **Thresholds:** Yellow 2%, Red 5%
- **Y-axis label:** "Error Rate (%)"
- **Type:** Graph (time series)

Expected: Panel shows error rate percentage with thresholds

- [ ] **Step 6: Configure Panel 4: System Health**

Add new panel:
- **Title:** "Server Health (CPU, Memory, Connections)"
- **Data Source:** Loki (for server logs/metrics)
- **Queries (combine in single panel or use multi-stat):**
  - CPU: `node_cpu_usage_percent` or similar metric from Prometheus (if available)
  - Memory: System memory usage from Loki logs
  - Connections: Active database connections from Loki
- **Type:** Stat (or multiple graphs if Stat doesn't work)

Expected: Panel displays current server resource utilization

- [ ] **Step 7: Save dashboard as JSON**

In Grafana:
1. Dashboard settings (gear icon) → "Save as JSON"
2. Copy the JSON output

Create `grafana-k6-dashboard.json` with the exported JSON:

```json
{
  "annotations": { "list": [] },
  "editable": true,
  "gnetId": null,
  "graphTooltip": 0,
  "id": null,
  "links": [],
  "panels": [
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {},
        "overrides": []
      },
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
      "id": 2,
      "options": {},
      "targets": [
        {
          "expr": "k6_vu{job=\"k6-load-test\"}",
          "refId": "A"
        }
      ],
      "title": "Load Pattern Over Time",
      "type": "timeseries"
    }
  ],
  "refresh": "5s",
  "schemaVersion": 35,
  "style": "dark",
  "tags": ["k6", "load-testing"],
  "templating": { "list": [] },
  "time": { "from": "now-10m", "to": "now" },
  "timepicker": {},
  "timezone": "UTC",
  "title": "k6 Load Test - LeagueSphere Production",
  "uid": "k6-leaguesphere-prod",
  "version": 1
}
```

- [ ] **Step 8: Commit dashboard**

```bash
git add grafana-k6-dashboard.json
git commit -m "feat: add Grafana dashboard for k6 load test monitoring"
```

---

## Task 6: Dry Run on Staging

**Files:**
- No new files (testing only)

- [ ] **Step 1: Start k6 test against staging**

From local machine:

```bash
k6 run load-test-k6.js --vus 1 --duration 2m
```

(Use 2 minute duration for dry run instead of full 10 minutes)

Expected: Test runs, metrics appear in console output

- [ ] **Step 2: Check Prometheus is scraping k6 metrics**

While test is running, visit `https://monitor.servyy-test.lxd:9090` (Prometheus UI on staging):
1. Click "Status" → "Targets"
2. Look for `k6-load-test` job

Expected: k6-load-test shows "UP" (green)

- [ ] **Step 3: Verify Grafana receives metrics**

While test is running, visit `https://monitor.servyy-test.lxd` (Grafana on staging):
1. Open the k6 dashboard (or create temporary panel)
2. Add query: `k6_vu{job="k6-load-test"}`
3. Check if metrics appear

Expected: Grafana shows live k6 metrics (VU count rising over time)

- [ ] **Step 4: Verify error rate and latency metrics**

Add temporary panels to verify:
- Query: `k6_http_req_duration{job="k6-load-test"}`
- Query: `k6_http_errors_total{job="k6-load-test"}`

Expected: Both metrics present in Prometheus (even if values are 0)

---

## Task 7: Execute Full Production Load Test

**Files:**
- No new files (execution only)

- [ ] **Step 1: Prepare monitoring dashboard**

1. Open `https://monitor.lehel.xyz` in browser
2. Navigate to k6 Load Test dashboard
3. Set time range to "Last 15 minutes" for visibility
4. Ensure all 4 panels are visible

Expected: Dashboard is ready and showing current state

- [ ] **Step 2: Start k6 load test against production**

From local machine (or a stable infrastructure machine):

```bash
k6 run load-test-k6.js
```

Expected: Test starts, displays progress, and runs for 10 minutes

- [ ] **Step 3: Monitor metrics in real-time**

While test runs (10 minutes):
1. Watch Grafana dashboard at `https://monitor.lehel.xyz`
2. Observe:
   - Load pattern ramping from 1→10 VU
   - Response time (p95) trend
   - Error rate trend
   - System health (CPU, memory)

Expected: All 4 panels update in real-time, metrics flowing

- [ ] **Step 4: Record test completion**

When test completes (10 minutes):
1. Note final metrics from Grafana
2. Take screenshot of final dashboard state
3. Record any observations (breaking points, error patterns)

Expected: Test completes cleanly, dashboard shows full 10-minute window

- [ ] **Step 5: Collect and document results**

Create `results/load-test-2026-05-31.md`:

```markdown
# Load Test Results - 2026-05-31

## Test Parameters
- Duration: 10 minutes
- Load Pattern: 1 req/sec (minute 1) → 10 req/sec (minute 10)
- Target Endpoints: 4 LeagueSphere endpoints (gamedays, leaguetable, officials, gameday detail)
- Request Distribution: Equal (25% each)

## Metrics Collected

### Load Pattern
- [Screenshot or description of load ramping]

### Response Times (p95)
- Minute 1: X ms
- Minute 5: Y ms
- Minute 10: Z ms
- Peak: [value] ms

### Error Rate
- Overall: X%
- Peak: Y%
- [Note any endpoints with higher errors]

### System Health
- CPU Utilization: [peak value]
- Memory Utilization: [peak value]
- Database Connections: [peak value]

## Analysis

### Breaking Point
- Identified at [minute/load level]
- Symptoms: [latency spike, error rate increase, resource exhaustion]

### Resilience
- System degradation was [graceful/abrupt]
- Recovery time: [if applicable]

### Recommendations
- [Any optimizations identified]
- [Bottleneck insights]

## Dashboard URL
- Production Grafana: https://monitor.lehel.xyz
- Dashboard: k6 Load Test - LeagueSphere Production
```

- [ ] **Step 6: Commit results documentation**

```bash
git add results/load-test-2026-05-31.md grafana-k6-dashboard.json
git commit -m "docs: document k6 load test results from 2026-05-31"
```

---

## Spec Coverage Self-Review

- ✅ k6 script with ramping 1→10 req/sec pattern (Task 1)
- ✅ 4 target endpoints included (gamedays, leaguetable, officials, gameday/718) (Task 1)
- ✅ Prometheus scrape config added (Task 2)
- ✅ Deployed to staging then production (Tasks 3-4)
- ✅ Grafana dashboard with 4 panels (load, latency, errors, system health) (Task 5)
- ✅ Dry run on staging (Task 6)
- ✅ Full production test (Task 7)
- ✅ Monitoring of p95 latency and error rate (Tasks 5-7)
