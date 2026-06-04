#!/bin/bash

set -e

# Get CSRF token from cookies
CSRF=$(grep csrftoken /tmp/test_cookies.txt | awk '{print $NF}')

if [ -z "$CSRF" ]; then
  echo "❌ ERROR: CSRF token not found in /tmp/test_cookies.txt"
  echo "   Run test-api.sh first to authenticate"
  exit 1
fi

# Default values
GAME_ID="${1:-175}"
EVENT_NAME="${2:-}"
TEAM="${3:-}"
EVENT_TYPE="${4:-Touchdown}"
HALF="${5:-FH}"

# Helper functions
record_possession() {
  local game_id=$1
  local team=$2
  echo "📍 Recording possession for game $game_id ($team)..."
  curl -s -b /tmp/test_cookies.txt \
    -H 'Content-Type: application/json' \
    -H "X-CSRFToken: $CSRF" \
    -X POST "https://stage.leaguesphere.app/api/journey/events/" \
    -d "{
      \"event_name\": \"possession_recorded\",
      \"metadata\": {\"game_id\": $game_id, \"team_name\": \"$team\"}
    }" | jq .
}

record_game_event() {
  local game_id=$1
  local team=$2
  local event_type=$3
  local half=$4
  echo "🎯 Recording $event_type for $team in $half (game $game_id)..."
  curl -s -b /tmp/test_cookies.txt \
    -H 'Content-Type: application/json' \
    -H "X-CSRFToken: $CSRF" \
    -X POST "https://stage.leaguesphere.app/api/journey/events/" \
    -d "{
      \"event_name\": \"game_event_recorded\",
      \"metadata\": {
        \"game_id\": $game_id,
        \"team\": \"$team\",
        \"event_type\": \"$event_type\",
        \"half\": \"$half\"
      }
    }" | jq .
}

record_halftime() {
  local game_id=$1
  echo "⏱️  Recording halftime for game $game_id..."
  curl -s -b /tmp/test_cookies.txt \
    -H 'Content-Type: application/json' \
    -H "X-CSRFToken: $CSRF" \
    -X POST "https://stage.leaguesphere.app/api/journey/events/" \
    -d "{
      \"event_name\": \"halftime_recorded\",
      \"metadata\": {\"game_id\": $game_id}
    }" | jq .
}

record_game_completed() {
  local game_id=$1
  local home_captain=${2:-"Player 1"}
  local away_captain=${3:-"Player 2"}
  echo "🏁 Recording game completed for game $game_id..."
  curl -s -b /tmp/test_cookies.txt \
    -H 'Content-Type: application/json' \
    -H "X-CSRFToken: $CSRF" \
    -X POST "https://stage.leaguesphere.app/api/journey/events/" \
    -d "{
      \"event_name\": \"game_completed\",
      \"metadata\": {
        \"game_id\": $game_id,
        \"home_captain\": \"$home_captain\",
        \"away_captain\": \"$away_captain\"
      }
    }" | jq .
}

record_full_game() {
  local game_id=$1
  local home_team=${2:-"Lions"}
  local away_team=${3:-"Hawks"}

  echo "🎮 Recording full game lifecycle for game $game_id ($home_team vs $away_team)..."
  echo "===================================================================="

  record_possession "$game_id" "$home_team"
  echo ""

  record_game_event "$game_id" "$home_team" "Touchdown" "FH"
  echo ""

  record_game_event "$game_id" "$away_team" "Touchdown" "FH"
  echo ""

  record_halftime "$game_id"
  echo ""

  record_game_event "$game_id" "$home_team" "Touchdown" "SH"
  echo ""

  record_game_completed "$game_id" "$home_team" "$away_team"

  echo ""
  echo "===================================================================="
  echo "✅ Game lifecycle complete"
}

# Show usage
show_usage() {
  cat << EOF
Usage: $0 [game_id] [command] [args...]

Commands:
  full [home_team] [away_team]     Record full game (possession→event→halftime→event→complete)
  possession <team>                Record possession
  event <team> <type> [half]       Record game event (default half: FH)
  halftime                          Record halftime
  completed [home_capt] [away_capt] Record game completed

Examples:
  $0 175 full "Augsburg Lions" "Nürnberg Hawks"
  $0 175 possession "Lions"
  $0 175 event "Lions" "Touchdown" "FH"
  $0 175 halftime
  $0 175 completed "Captain 1" "Captain 2"

Default: $0 175 full (uses game 175 with default teams)
EOF
}

# Main logic
if [ -z "$EVENT_NAME" ]; then
  # No command specified, show usage
  show_usage
  echo ""
  echo "Recording full game 175 by default..."
  record_full_game 175
elif [ "$EVENT_NAME" = "full" ]; then
  record_full_game "$GAME_ID" "$TEAM" "$EVENT_TYPE"
elif [ "$EVENT_NAME" = "possession" ]; then
  record_possession "$GAME_ID" "$TEAM"
elif [ "$EVENT_NAME" = "event" ]; then
  record_game_event "$GAME_ID" "$TEAM" "$EVENT_TYPE" "$HALF"
elif [ "$EVENT_NAME" = "halftime" ]; then
  record_halftime "$GAME_ID"
elif [ "$EVENT_NAME" = "completed" ]; then
  record_game_completed "$GAME_ID" "$TEAM" "$EVENT_TYPE"
else
  echo "❌ Unknown command: $EVENT_NAME"
  show_usage
  exit 1
fi
