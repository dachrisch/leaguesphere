#!/bin/bash
# Integration Test (Smoke Test) for Gameday-Centric K6 Load Test Orchestrator
#
# Runs all 3 phases sequentially with 1 gameday, 1 performer, 1 spectator
# to verify the orchestrator works end-to-end.

set -e

# ============================================================================
# Echo Test Header
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Integration Test: Gameday-Centric K6 Load Test Orchestrator  ║"
echo "║  Running: 1 gameday, 1 performer, 1 spectator (smoke test)    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# ============================================================================
# Phase 1: Cleanup
# ============================================================================

echo "Phase 1: Cleaning up old logs..."
echo "────────────────────────────────────────────────────────────────"

rm -f /tmp/gameday_coordination.json
rm -f /tmp/performer_*.json
rm -f /tmp/spectator_*.json
rm -f /tmp/aggregated-results.json

echo "✅ Cleanup complete"
echo ""

# ============================================================================
# Phase 2: Discovery
# ============================================================================

echo "Phase 2: Discovery - Finding gamedays with unplayed games..."
echo "────────────────────────────────────────────────────────────────"

k6 run load-test-gameday-orchestrator.js \
  --env TARGET_HOST="https://stage.leaguesphere.app" \
  --env PHASE=discovery \
  --env GAMEDAYS=1 \
  --env TEST_USERNAME=chrisd \
  --env TEST_PASSWORD=bumbleFLIES1

# Verify coordination file exists
if [ ! -f /tmp/gameday_coordination.json ]; then
  echo "❌ ERROR: Coordination file not created at /tmp/gameday_coordination.json"
  exit 1
fi

# Extract gameday count
GAMEDAY_COUNT=$(jq '.gamedays | length' /tmp/gameday_coordination.json)

if [ -z "$GAMEDAY_COUNT" ] || [ "$GAMEDAY_COUNT" -eq 0 ]; then
  echo "❌ ERROR: No gamedays discovered in coordination file"
  exit 1
fi

echo "✅ Discovery phase complete: $GAMEDAY_COUNT gameday(s) discovered"
echo ""

# ============================================================================
# Phase 3: Performer
# ============================================================================

echo "Phase 3: Performer - Recording game events and scores..."
echo "────────────────────────────────────────────────────────────────"

k6 run load-test-gameday-orchestrator.js \
  --env TARGET_HOST="https://stage.leaguesphere.app" \
  --env PHASE=perform \
  --env GAMEDAYS=1 \
  --env TEST_USERNAME=chrisd \
  --env TEST_PASSWORD=bumbleFLIES1 \
  --vus 1 \
  --duration 5m

# Verify performer log exists
if [ ! -f /tmp/performer_0.json ]; then
  echo "❌ ERROR: Performer log not created at /tmp/performer_0.json"
  exit 1
fi

# Extract event count
EVENT_COUNT=$(jq '.events | length' /tmp/performer_0.json)

if [ -z "$EVENT_COUNT" ]; then
  echo "❌ ERROR: Could not extract event count from performer log"
  exit 1
fi

echo "✅ Performer phase complete: $EVENT_COUNT event(s) recorded"
echo ""

# ============================================================================
# Phase 4: Spectator
# ============================================================================

echo "Phase 4: Spectator - Polling gameday progress autonomously..."
echo "────────────────────────────────────────────────────────────────"

k6 run load-test-gameday-orchestrator.js \
  --env TARGET_HOST="https://stage.leaguesphere.app" \
  --env PHASE=watch \
  --env GAMEDAYS=1 \
  --env SPECTATORS_PER_GAMEDAY=1 \
  --vus 1 \
  --duration 5m

# Find first spectator log
SPECTATOR_LOG=$(ls /tmp/spectator_*.json 2>/dev/null | head -1)

if [ -z "$SPECTATOR_LOG" ]; then
  echo "❌ ERROR: No spectator logs found"
  exit 1
fi

# Extract event count
SPECTATOR_EVENT_COUNT=$(jq '.events | length' "$SPECTATOR_LOG")

if [ -z "$SPECTATOR_EVENT_COUNT" ]; then
  echo "❌ ERROR: Could not extract event count from spectator log"
  exit 1
fi

echo "✅ Spectator phase complete: $SPECTATOR_EVENT_COUNT event(s) recorded"
echo ""

# ============================================================================
# Phase 5: Aggregation
# ============================================================================

echo "Phase 5: Aggregating results..."
echo "────────────────────────────────────────────────────────────────"

node log-aggregator.js --log-dir /tmp --output /tmp/aggregated-results.json

# Verify aggregated results file exists
if [ ! -f /tmp/aggregated-results.json ]; then
  echo "❌ ERROR: Aggregated results file not created at /tmp/aggregated-results.json"
  exit 1
fi

echo "✅ Aggregation complete"
echo ""

# ============================================================================
# Final Summary
# ============================================================================

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Integration Test Complete                                    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "📊 Gameday Summary:"
jq '.gamedays | to_entries[] | "\(.value.gameday_name): \(.value.performers | length) performers, \(.value.spectators | length) spectators"' /tmp/aggregated-results.json

echo ""
echo "💡 Hint: View detailed results:"
echo "   cat /tmp/aggregated-results.json | jq ."
echo ""
