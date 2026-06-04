#!/bin/bash

# tests/load/load-test-runner.sh
# Orchestrate realistic multi-phase load test with k6

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_HOST="${TARGET_HOST:-https://stage.leaguesphere.app}"
TEST_USERNAME="${TEST_USERNAME:-chrisd}"
TEST_PASSWORD="${TEST_PASSWORD:-bumbleFLIES1}"
MAX_GAMEDAYS="${MAX_GAMEDAYS:-5}"

echo "=========================================="
echo "K6 Realistic Load Test Runner"
echo "=========================================="
echo "Target: $TARGET_HOST"
echo "Username: $TEST_USERNAME"
echo "Max Gamedays: $MAX_GAMEDAYS"
echo ""

# Function to run a phase
run_phase() {
  local phase=$1
  local description=$2

  echo "-------------------------------------------"
  echo "Running Phase: $description"
  echo "-------------------------------------------"

  k6 run \
    --stage "0s:0" \
    --env "TARGET_HOST=$TARGET_HOST" \
    --env "TEST_USERNAME=$TEST_USERNAME" \
    --env "TEST_PASSWORD=$TEST_PASSWORD" \
    --env "MAX_GAMEDAYS=$MAX_GAMEDAYS" \
    --env "PHASE=$phase" \
    "$SCRIPT_DIR/../load-test-realistic-cycle.js"

  echo ""
}

# Run all phases in sequence
echo "Starting multi-phase load test..."
echo ""

# Phase 1: Setup Manager (1 VU, 3 minutes)
run_phase "setup" "Setup Manager (Prepare Gamedays)"

# Brief pause between phases
sleep 2

# Phase 2: Performers (5-10 VUs, 20 minutes)
run_phase "performers" "Performers (Score Games)"

# Brief pause between phases
sleep 2

# Phase 3: Spectators (50-100 VUs, 20 minutes)
run_phase "spectators" "Spectators (View Games)"

echo "=========================================="
echo "✅ Load test complete!"
echo "=========================================="
