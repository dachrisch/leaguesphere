#!/bin/bash

set -e

# Get CSRF token from cookies
CSRF=$(grep csrftoken /tmp/test_cookies.txt | awk '{print $NF}')

if [ -z "$CSRF" ]; then
  echo "❌ ERROR: CSRF token not found in /tmp/test_cookies.txt"
  exit 1
fi

GAME_ID="${1:-175}"
COMMAND="${2:-}"

# Common headers
HEADERS='-H "Content-Type: application/json" -H "X-CSRFToken: $CSRF"'

set_possession() {
  local game_id=$1
  local team=$2
  echo "📍 Setting possession: $team (game $game_id)..."
  curl -s -b /tmp/test_cookies.txt \
    -H 'Content-Type: application/json' \
    -H "X-CSRFToken: $CSRF" \
    -X PUT "https://stage.leaguesphere.app/api/game/$game_id/possession" \
    -d "{\"team\":\"$team\"}" | jq .
}

record_event() {
  local game_id=$1
  local team=$2
  local half=$3
  local event_name=$4
  local player=$5

  echo "🎯 Recording event: $event_name by $team (H$half, game $game_id)..."
  curl -s -b /tmp/test_cookies.txt \
    -H 'Content-Type: application/json' \
    -H "X-CSRFToken: $CSRF" \
    -X POST "https://stage.leaguesphere.app/api/gamelog/$game_id" \
    -d "{
      \"team\":\"$team\",
      \"gameId\":$game_id,
      \"half\":$half,
      \"event\":[{\"name\":\"$event_name\",\"player\":\"$player\"}]
    }" | jq .
}

set_officials() {
  local game_id=$1
  echo "👔 Setting officials for game $game_id..."
  curl -s -b /tmp/test_cookies.txt \
    -H 'Content-Type: application/json' \
    -H "X-CSRFToken: $CSRF" \
    -X PUT "https://stage.leaguesphere.app/api/game/$game_id/officials" \
    -d '[
      {"name":"","position":"Referee","official":null},
      {"name":"","position":"Scorecard Judge","official":null},
      {"name":"","position":"Down Judge","official":null},
      {"name":"","position":"Field Judge","official":null},
      {"name":"","position":"Side Judge","official":null}
    ]' | jq .
}

setup_game() {
  local game_id=$1
  local home_team=$2
  echo "⚙️  Setting up game $game_id (home: $home_team)..."
  curl -s -b /tmp/test_cookies.txt \
    -H 'Content-Type: application/json' \
    -H "X-CSRFToken: $CSRF" \
    -X PUT "https://stage.leaguesphere.app/api/game/$game_id/setup" \
    -d "{
      \"gameinfo\":$game_id,
      \"ctResult\":\"Gewonnen\",
      \"fhPossession\":\"$home_team\",
      \"direction\":\"directionLeft\"
    }" | jq .
}

play_realistic_half() {
  local game_id=$1
  local home_team=$2
  local away_team=$3
  local half=$4

  echo ""
  echo "🎮 Playing $( [ $half -eq 1 ] && echo 'First' || echo 'Second' ) Half..."
  echo "======================================================================"

  # Home team gets possession
  set_possession "$game_id" "$home_team"
  echo ""

  # Home team scores
  record_event "$game_id" "$home_team" "$half" "Touchdown" "1"
  echo ""

  # Away team gets possession
  set_possession "$game_id" "$away_team"
  echo ""

  # Away team scores
  record_event "$game_id" "$away_team" "$half" "Touchdown" "2"
  echo ""

  # Home team gets possession again
  set_possession "$game_id" "$home_team"
  echo ""

  # Home team safety
  record_event "$game_id" "$home_team" "$half" "Safety" "3"
  echo ""
}

halftime_game() {
  local game_id=$1
  echo "⏱️  Recording halftime for game $game_id..."
  curl -s -b /tmp/test_cookies.txt \
    -H 'Content-Type: application/json' \
    -H "X-CSRFToken: $CSRF" \
    -X PUT "https://stage.leaguesphere.app/api/game/$game_id/halftime" \
    -d '{}' | jq .
}

finalize_game() {
  local game_id=$1
  local home_captain=${2:-"Home Captain"}
  local away_captain=${3:-"Away Captain"}
  echo "🏁 Finalizing game $game_id..."
  curl -s -b /tmp/test_cookies.txt \
    -H 'Content-Type: application/json' \
    -H "X-CSRFToken: $CSRF" \
    -X PUT "https://stage.leaguesphere.app/api/game/$game_id/finalize" \
    -d "{
      \"homeCaptain\":\"$home_captain\",
      \"awayCaptain\":\"$away_captain\",
      \"hasFinalScoreChanged\":false,
      \"note\":\"Load test game\"
    }" | jq .
}

show_usage() {
  cat << EOF
Usage: $0 [game_id] [command] [args...]

Commands:
  full <home_team> <away_team>             Play full realistic game (setup→officials→H1→H2→finalize)
  setup <home_team>                         Setup game configuration
  possession <team>                         Set team possession
  event <team> <half> <name> <pid>          Record event (half: 1 or 2)
  officials                                 Set officials
  finalize [home_capt] [away_capt]          Finalize game with captains

Examples:
  $0 175 full "Lions" "Hawks"
  $0 175 setup "Lions"
  $0 175 possession "Lions"
  $0 175 event "Lions" 1 "Touchdown" "123"
  $0 175 officials
  $0 175 finalize "Captain 1" "Captain 2"

Default: $0 175 full (uses game 175 with default teams)
EOF
}

# Main logic
if [ -z "$COMMAND" ]; then
  show_usage
  echo ""
  echo "Running full game 175 by default (Lions vs Hawks)..."
  setup_game 175 "Lions"
  set_officials 175
  play_realistic_half 175 "Lions" "Hawks" 1
  halftime_game 175
  play_realistic_half 175 "Lions" "Hawks" 2
  finalize_game 175 "Lions Captain" "Hawks Captain"
elif [ "$COMMAND" = "full" ]; then
  home_team=${3:-"Lions"}
  away_team=${4:-"Hawks"}
  setup_game "$GAME_ID" "$home_team"
  set_officials "$GAME_ID"
  play_realistic_half "$GAME_ID" "$home_team" "$away_team" 1
  halftime_game "$GAME_ID"
  play_realistic_half "$GAME_ID" "$home_team" "$away_team" 2
  finalize_game "$GAME_ID" "${home_team} Captain" "${away_team} Captain"
elif [ "$COMMAND" = "setup" ]; then
  setup_game "$GAME_ID" "$3"
elif [ "$COMMAND" = "possession" ]; then
  set_possession "$GAME_ID" "$3"
elif [ "$COMMAND" = "event" ]; then
  record_event "$GAME_ID" "$3" "$4" "$5" "$6"
elif [ "$COMMAND" = "officials" ]; then
  set_officials "$GAME_ID"
elif [ "$COMMAND" = "finalize" ]; then
  finalize_game "$GAME_ID" "$3" "$4"
else
  echo "❌ Unknown command: $COMMAND"
  show_usage
  exit 1
fi
