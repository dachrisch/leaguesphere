#!/bin/bash
set -e

# entrypoint.demo.sh - Handles demo database initialization and midnight reset

RESET_FLAG_FILE="/app/.demo_last_reset"
DEMO_SNAPSHOT="/app/snapshots/demo_snapshot.sql"
LOGS_DIR="/app/logs"

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

# Initialize database: run migrations and seed data
init_database() {
    log "Initializing demo database..."
    cd /app

    python manage.py migrate --noinput
    log "Migrations completed"

    python manage.py seed_demo_data
    log "Demo data seeded"

    # Create snapshot for resets
    mkdir -p "$(dirname "$DEMO_SNAPSHOT")"
    python manage.py reset_demo_database \
        --create-snapshot \
        --snapshot-path="$DEMO_SNAPSHOT" 2>&1 | tee -a "$LOGS_DIR/demo_reset.log"

    if [ $? -ne 0 ]; then
        log "WARNING: Failed to create snapshot"
    fi
}

# Reset database from snapshot
reset_database() {
    log "Resetting demo database from snapshot..."

    if [ ! -f "$DEMO_SNAPSHOT" ]; then
        log "ERROR: Demo snapshot not found at $DEMO_SNAPSHOT"
        log "Initializing database instead..."
        init_database
        return
    fi

    cd /app
    python manage.py reset_demo_database \
        --restore-snapshot \
        --snapshot-path="$DEMO_SNAPSHOT" 2>&1 | tee -a "$LOGS_DIR/demo_reset.log"

    if [ $? -eq 0 ]; then
        log "Database reset successful"
    else
        log "ERROR: Database reset failed"
        exit 1
    fi
}

# Main logic
if needs_reset; then
    if [ ! -f "$DEMO_SNAPSHOT" ]; then
        init_database
    else
        reset_database
    fi
    date -u +%s > "$RESET_FLAG_FILE"
fi

log "Entrypoint script completed, application ready"
