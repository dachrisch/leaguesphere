#!/bin/bash

CSRF=$(grep csrftoken /tmp/test_cookies.txt | awk '{print $NF}')
GAMEDAY=12
GAME=175

echo "Recording actual events via /api/journey/events/..."
echo ""

# Event 1: possession_recorded
echo "1️⃣ possession_recorded - Lions has possession"
curl -s -b /tmp/test_cookies.txt \
  -H 'Content-Type: application/json' \
  -H "X-CSRFToken: $CSRF" \
  -X POST "https://stage.leaguesphere.app/api/journey/events/" \
  -d '{
    "event_name": "possession_recorded",
    "metadata": {"game_id": 175, "team_name": "Lions"}
  }' | head -c 300
echo ""
echo ""

# Event 2: game_event_recorded - Lions Touchdown
echo "2️⃣ game_event_recorded - Lions Touchdown FH"
curl -s -b /tmp/test_cookies.txt \
  -H 'Content-Type: application/json' \
  -H "X-CSRFToken: $CSRF" \
  -X POST "https://stage.leaguesphere.app/api/journey/events/" \
  -d '{
    "event_name": "game_event_recorded",
    "metadata": {
      "game_id": 175,
      "team": "Lions",
      "event_type": "Touchdown",
      "half": "FH"
    }
  }' | head -c 300
echo ""
echo ""

# Event 3: game_event_recorded - Hawks Touchdown
echo "3️⃣ game_event_recorded - Hawks Touchdown FH"
curl -s -b /tmp/test_cookies.txt \
  -H 'Content-Type: application/json' \
  -H "X-CSRFToken: $CSRF" \
  -X POST "https://stage.leaguesphere.app/api/journey/events/" \
  -d '{
    "event_name": "game_event_recorded",
    "metadata": {
      "game_id": 175,
      "team": "Hawks",
      "event_type": "Touchdown",
      "half": "FH"
    }
  }' | head -c 300
echo ""
echo ""

# Event 4: halftime_recorded
echo "4️⃣ halftime_recorded"
curl -s -b /tmp/test_cookies.txt \
  -H 'Content-Type: application/json' \
  -H "X-CSRFToken: $CSRF" \
  -X POST "https://stage.leaguesphere.app/api/journey/events/" \
  -d '{
    "event_name": "halftime_recorded",
    "metadata": {"game_id": 175}
  }' | head -c 300
echo ""
echo ""

# Event 5: game_event_recorded - SH
echo "5️⃣ game_event_recorded - Lions Touchdown SH"
curl -s -b /tmp/test_cookies.txt \
  -H 'Content-Type: application/json' \
  -H "X-CSRFToken: $CSRF" \
  -X POST "https://stage.leaguesphere.app/api/journey/events/" \
  -d '{
    "event_name": "game_event_recorded",
    "metadata": {
      "game_id": 175,
      "team": "Lions",
      "event_type": "Touchdown",
      "half": "SH"
    }
  }' | head -c 300
echo ""
echo ""

# Event 6: game_completed
echo "6️⃣ game_completed"
curl -s -b /tmp/test_cookies.txt \
  -H 'Content-Type: application/json' \
  -H "X-CSRFToken: $CSRF" \
  -X POST "https://stage.leaguesphere.app/api/journey/events/" \
  -d '{
    "event_name": "game_completed",
    "metadata": {
      "game_id": 175,
      "home_captain": "Player 1",
      "away_captain": "Player 2"
    }
  }' | head -c 300
echo ""
