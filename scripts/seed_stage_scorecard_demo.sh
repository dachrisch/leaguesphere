#!/usr/bin/env bash
# Seed the Scorecard v2 demo gameday on staging (today by default).
#
#   scripts/seed_stage_scorecard_demo.sh
#   scripts/seed_stage_scorecard_demo.sh --date 2026-10-29 --username my-crew
#
# The stage DB is reset at midnight, so run this once per test day. Override
# STAGE_HOST / STAGE_CONTAINER if the jail or container name changes.
set -euo pipefail

HOST="${STAGE_HOST:-cda@lehel.xyz}"
CONTAINER="${STAGE_CONTAINER:-leaguesphere_stage.staging-app}"
ARGS=$(printf ' %q' "$@")

exec ssh "$HOST" \
    "docker exec ${CONTAINER} python manage.py seed_scorecard_demo${ARGS}"
