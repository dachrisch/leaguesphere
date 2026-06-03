#!/bin/bash
set -e

# Run k6 load test with metrics pushed to Prometheus Pushgateway
# Usage: ./run.sh [test-file] [target-host]
# Example: ./run.sh k6.js https://www.leaguesphere.app

TEST_FILE="${1:-k6.js}"
TARGET_HOST="${2:-https://www.leaguesphere.app}"
PUSHGATEWAY_HOST="${PUSHGATEWAY_HOST:-lehel.xyz}"

if [ ! -f "$TEST_FILE" ]; then
    echo "Error: Test file not found: $TEST_FILE"
    exit 1
fi

echo "🚀 K6 Load Test with Prometheus Metrics"
echo "   Test: $TEST_FILE"
echo "   Target: $TARGET_HOST"
echo "   Pushgateway: $PUSHGATEWAY_HOST:9091"

# Setup SSH tunnel to Pushgateway (leave it open in background)
# Using -o ServerAliveInterval for better keepalive to prevent tunnel disconnection
echo "Setting up SSH tunnel to Pushgateway..."
ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L 9091:localhost:9091 "$PUSHGATEWAY_HOST" sleep 3600 &
TUNNEL_PID=$!
trap "kill $TUNNEL_PID 2>/dev/null || true" EXIT

# Give the tunnel time to establish
sleep 2

# Check tunnel is working
if ! nc -zv localhost 9091 2>/dev/null; then
    echo "Error: Could not establish tunnel to Pushgateway"
    kill $TUNNEL_PID
    exit 1
fi

echo "✓ Tunnel established (PID: $TUNNEL_PID)"
echo ""

# Run k6 test with Prometheus remote write output
# This will push metrics to the Pushgateway via the tunnel
k6 run "$TEST_FILE" \
    --out experimental-prometheus-rw \
    -e TARGET_HOST="$TARGET_HOST" \
    -e K6_PROMETHEUS_RW_SERVER_URL="http://localhost:9091"

EXIT_CODE=$?

echo ""
echo "✓ Test completed with exit code: $EXIT_CODE"
echo "  Metrics should now appear in Grafana dashboard:"
echo "  https://monitor.lehel.xyz/d/k6-leaguesphere-prod-enhanced"

exit $EXIT_CODE
