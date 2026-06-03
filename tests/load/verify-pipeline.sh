#!/bin/bash
# Test script to verify Prometheus/Pushgateway data flow

set -e

PUSHGATEWAY_URL="${PUSHGATEWAY_URL:-http://localhost:9091}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"

echo "🧪 Testing Prometheus/Pushgateway Data Flow"
echo "==========================================="
echo ""

# Step 1: Push a test metric to Pushgateway
echo "1️⃣  Pushing test metric to Pushgateway..."
JOB_NAME="test_k6_metrics"
INSTANCE="test-instance"

curl -X POST "${PUSHGATEWAY_URL}/metrics/job/${JOB_NAME}/instance/${INSTANCE}" \
  --data-binary @- <<EOF
# HELP test_metric_counter Test metric for verification
# TYPE test_metric_counter counter
test_metric_counter{endpoint="/gamedays/",status="200"} 42
test_metric_counter{endpoint="/leaguetable/",status="200"} 35

# HELP test_request_duration_ms Test duration metric
# TYPE test_request_duration_ms gauge
test_request_duration_ms{endpoint="/gamedays/"} 125.5
test_request_duration_ms{endpoint="/leaguetable/"} 98.3
EOF

echo "✅ Metric pushed successfully"
echo ""

# Step 2: Verify metric appears in Pushgateway
echo "2️⃣  Checking Pushgateway metrics endpoint..."
PUSHGATEWAY_METRICS=$(curl -s "${PUSHGATEWAY_URL}/metrics" | grep "test_metric_counter")

if [ -z "$PUSHGATEWAY_METRICS" ]; then
  echo "❌ ERROR: Metrics not found in Pushgateway!"
  exit 1
fi

echo "✅ Metrics visible in Pushgateway:"
echo "$PUSHGATEWAY_METRICS" | head -5
echo ""

# Step 3: Wait for Prometheus to scrape
echo "3️⃣  Waiting for Prometheus to scrape Pushgateway (max 30s)..."
for i in {1..30}; do
  PROM_RESULT=$(curl -s "${PROMETHEUS_URL}/api/v1/query?query=test_metric_counter" | grep -o '"value"' | wc -l)

  if [ "$PROM_RESULT" -gt 0 ]; then
    echo "✅ Prometheus scraped the metrics after ${i} seconds"
    break
  fi

  if [ $i -eq 30 ]; then
    echo "❌ ERROR: Prometheus didn't scrape metrics within 30 seconds"
    echo "   Make sure Prometheus is running and Pushgateway is reachable"
    exit 1
  fi

  sleep 1
done

echo ""

# Step 4: Query metrics from Prometheus
echo "4️⃣  Querying metrics from Prometheus..."
QUERY_RESULT=$(curl -s "${PROMETHEUS_URL}/api/v1/query?query=test_metric_counter" | jq '.data.result | length')

echo "✅ Found $QUERY_RESULT metric time series in Prometheus"
echo ""

# Step 5: Display the actual metrics
echo "5️⃣  Metric details:"
curl -s "${PROMETHEUS_URL}/api/v1/query?query=test_metric_counter" | jq '.data.result[] | {metric: .metric, value: .value}'

echo ""
echo "==========================================="
echo "✅ SUCCESS: Data is flowing through the pipeline!"
echo "   Pushgateway → Prometheus data flow verified"
echo "==========================================="
