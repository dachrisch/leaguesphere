#!/bin/bash
# K6 Load Test Wrapper - Handles file I/O and coordination
#
# Since k6 cannot write files during test execution, this script:
# 1. Runs k6 test and captures output
# 2. Extracts coordination data from k6 console output
# 3. Writes coordination file for subsequent phases
# 4. Post-test: Extracts and writes logger files

set -e

# ============================================================================
# Configuration
# ============================================================================

TARGET_HOST="${TARGET_HOST:-https://stage.leaguesphere.app}"
PHASE="${PHASE:-all}"
GAMEDAYS="${GAMEDAYS:-5}"
SPECTATORS_PER_GAMEDAY="${SPECTATORS_PER_GAMEDAY:-3}"
COORDINATION_FILE="${COORDINATION_FILE:-/tmp/gameday_coordination.json}"
LOG_DIR="${LOG_DIR:-/tmp}"
TEST_USERNAME="${TEST_USERNAME:-k6}"
TEST_PASSWORD="${TEST_PASSWORD:-load!Test}"

K6_SCRIPT="${K6_SCRIPT:-load-test-gameday-orchestrator.js}"

# ============================================================================
# Utilities
# ============================================================================

log_info() {
  echo "[$(date '+%H:%M:%S')] INFO: $*"
}

log_error() {
  echo "[$(date '+%H:%M:%S')] ERROR: $*" >&2
}

extract_coordination_data() {
  # Extract COORDINATION_DATA_JSON line from k6 output
  # Format: COORDINATION_DATA_JSON: {"discovery_time":...}
  local k6_output="$1"
  local coordination_json

  coordination_json=$(echo "$k6_output" | grep 'COORDINATION_DATA_JSON:' | head -1 | sed 's/.*COORDINATION_DATA_JSON: //')

  if [ -z "$coordination_json" ]; then
    return 1
  fi

  echo "$coordination_json"
  return 0
}

# ============================================================================
# Main
# ============================================================================

log_info "K6 Load Test Wrapper"
log_info "Target: $TARGET_HOST"
log_info "Phase: $PHASE"
log_info "Gamedays: $GAMEDAYS"
log_info ""

# Clean up old coordination file for discovery phase
if [ "$PHASE" = "discovery" ] || [ "$PHASE" = "all" ]; then
  log_info "Cleaning up old coordination file..."
  rm -f "$COORDINATION_FILE"
fi

# Build k6 command
K6_CMD="k6 run $K6_SCRIPT"
K6_CMD="$K6_CMD --env TARGET_HOST=$TARGET_HOST"
K6_CMD="$K6_CMD --env PHASE=$PHASE"
K6_CMD="$K6_CMD --env GAMEDAYS=$GAMEDAYS"
K6_CMD="$K6_CMD --env SPECTATORS_PER_GAMEDAY=$SPECTATORS_PER_GAMEDAY"
K6_CMD="$K6_CMD --env COORDINATION_FILE=$COORDINATION_FILE"
K6_CMD="$K6_CMD --env LOG_DIR=$LOG_DIR"
K6_CMD="$K6_CMD --env TEST_USERNAME=$TEST_USERNAME"
K6_CMD="$K6_CMD --env TEST_PASSWORD=$TEST_PASSWORD"

# Add optional k6 flags
if [ -n "$K6_OPTS" ]; then
  K6_CMD="$K6_CMD $K6_OPTS"
fi

log_info "Running: $K6_CMD"
log_info ""

# Run k6 and capture output
K6_OUTPUT=$($K6_CMD 2>&1) || {
  log_error "K6 test failed"
  echo "$K6_OUTPUT"
  exit 1
}

# Echo k6 output for inspection
echo "$K6_OUTPUT"
echo ""

# Extract and write coordination data for discovery phase
if [ "$PHASE" = "discovery" ] || [ "$PHASE" = "all" ]; then
  log_info "Extracting coordination data from k6 output..."

  COORDINATION_DATA=$(extract_coordination_data "$K6_OUTPUT")
  if [ -z "$COORDINATION_DATA" ]; then
    log_error "Failed to extract coordination data from k6 output"
    log_error "Expected format: COORDINATION_DATA_JSON: {...}"
    exit 1
  fi

  # Validate JSON
  if ! echo "$COORDINATION_DATA" | jq . > /dev/null 2>&1; then
    log_error "Invalid JSON extracted from k6 output"
    exit 1
  fi

  # Write coordination file
  echo "$COORDINATION_DATA" | jq . > "$COORDINATION_FILE"
  log_info "Coordination file written to: $COORDINATION_FILE"
  log_info "Gamedays: $(echo "$COORDINATION_DATA" | jq '.gamedays | length')"
  echo ""
fi

log_info "K6 Load Test Wrapper Complete"
