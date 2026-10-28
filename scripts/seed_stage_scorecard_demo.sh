#!/bin/sh
# Seed the Scorecard v2 demo gameday on staging (today by default).
#
#   scripts/seed_stage_scorecard_demo.sh
#   scripts/seed_stage_scorecard_demo.sh --date 2026-10-29 --username my-crew
#
# The stage DB is reset at midnight, so run this once per test day. Override
# STAGE_HOST / STAGE_CONTAINER / STAGE_SSH_KEY if the jail, container or key
# name changes.
set -eu

HOST="${STAGE_HOST:-cda@lehel.xyz}"
CONTAINER="${STAGE_CONTAINER:-leaguesphere_stage.staging-app}"

quote() {
    printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

REMOTE="docker exec ${CONTAINER} python manage.py seed_scorecard_demo"
for arg in "$@"; do
    REMOTE="${REMOTE} $(quote "$arg")"
done

if [ -n "${STAGE_SSH_KEY:-}" ]; then
    exec ssh -i "$STAGE_SSH_KEY" "$HOST" "$REMOTE"
fi
exec ssh "$HOST" "$REMOTE"
