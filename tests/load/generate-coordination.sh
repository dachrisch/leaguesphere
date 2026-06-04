#!/bin/bash
# generate-coordination.sh
# Generate coordination file for k6 load test using open()

set -e

TARGET_HOST="${TARGET_HOST:-https://stage.leaguesphere.app}"
TEST_USERNAME="${TEST_USERNAME:-chrisd}"
TEST_PASSWORD="${TEST_PASSWORD:-bumbleFLIES1}"
MAX_GAMEDAYS="${MAX_GAMEDAYS:-5}"
COORDINATION_FILE="${COORDINATION_FILE:-/tmp/gameday_assignments.json}"

echo "Generating coordination file for k6 load test..."
echo "Target: $TARGET_HOST"
echo "Max Gamedays: $MAX_GAMEDAYS"
echo ""

# Run Phase 1 (Setup Manager)
echo "Running Phase 1: Setup Manager"
k6 run \
  --env "TARGET_HOST=$TARGET_HOST" \
  --env "TEST_USERNAME=$TEST_USERNAME" \
  --env "TEST_PASSWORD=$TEST_PASSWORD" \
  --env "MAX_GAMEDAYS=$MAX_GAMEDAYS" \
  --env "PHASE=setup" \
  load-test-realistic-cycle.js

echo ""
echo "✅ Coordination file should be generated at:"
echo "   $COORDINATION_FILE"
echo ""
echo "Next steps:"
echo "1. Phase 2 (Performers): k6 run --env \"PHASE=performers\" load-test-realistic-cycle.js"
echo "2. Phase 3 (Spectators): k6 run --env \"PHASE=spectators\" load-test-realistic-cycle.js"
