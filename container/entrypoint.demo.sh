#!/bin/bash
set -eo pipefail

# entrypoint.demo.sh - Recreates and reseeds the demo database once per UTC day.
#
# The nightly Ofelia job runs this once per UTC day; a manual run follows the
# same path. The database is dropped and recreated (not flushed) so the data
# migrations replay: a flush keeps django_migrations and silently loses the
# default SiteConfiguration and the league tie-break steps/rulesets.

# DEMO_APP_DIR only moves the script's files for tests (tests/unit/test_entrypoint_demo.py).
APP_DIR="${DEMO_APP_DIR:-/app}"
RESET_FLAG_FILE="$APP_DIR/.demo_last_reset"
LOGS_DIR="$APP_DIR/logs"

# Create logs directory if it doesn't exist
mkdir -p "$LOGS_DIR"

log() {
    echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $1" | tee -a "$LOGS_DIR/demo_reset.log"
}

# Check if reset is needed (first run or past midnight UTC)
needs_reset() {
    local now=$(date -u +%s)
    local today_midnight=$(date -u -d "today 00:00:00" +%s)

    if [ ! -f "$RESET_FLAG_FILE" ]; then
        return 0  # First run, needs initialization
    fi

    local last_reset=$(cat "$RESET_FLAG_FILE")
    if [ "$now" -ge "$today_midnight" ] && [ "$last_reset" -lt "$today_midnight" ]; then
        return 0  # Past midnight since last reset
    fi

    return 1  # No reset needed
}

reset_demo_database() {
    cd "$APP_DIR"

    log "Recreating demo database..."
    python manage.py reset_demo_database --recreate-database 2>&1 \
        | tee -a "$LOGS_DIR/demo_reset.log"

    log "Applying migrations to the empty database..."
    python manage.py migrate --noinput
    log "Migrations completed"

    python manage.py seed_demo_data
    log "Demo data seeded"

    # After the seed: the seeded league gamedays keep the dates of the seed,
    # so the scorecard needs a gameday dated today for every reset.
    python manage.py seed_scorecard_demo
    log "Scorecard gameday for today seeded"
}

# Main logic
if needs_reset; then
    reset_demo_database
    date -u +%s > "$RESET_FLAG_FILE"
fi

log "Entrypoint script completed, application ready"
