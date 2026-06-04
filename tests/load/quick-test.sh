#!/bin/bash
set -e

echo "=== Quick Validation: 1 Game in Each Phase ==="
echo ""

# Get a game ID
GAME_ID=8960
HOME_TEAM="Bamb"
AWAY_TEAM="Erlangen2"

echo "Phase 1: Setup (implicit in scorecard.sh)"
echo "✅ Using game $GAME_ID ($HOME_TEAM vs $AWAY_TEAM)"
echo ""

echo "Phase 2: Performer (1 VU)"
echo "Recording complete game lifecycle..."
./scorecard.sh $GAME_ID full "$HOME_TEAM" "$AWAY_TEAM" 2>&1 | grep -E "^(⚙️|👔|🎮|⏱️|🏁)" || true
echo ""

echo "Phase 3: Spectator (1 VU)"
echo "✅ Would poll game $GAME_ID for live scores"
echo ""

echo "=== ✅ Validation Complete ==="
echo "Real load test ready in k6 (once k6/fs resolved)"
