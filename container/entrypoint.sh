#!/bin/sh

# Run migrations only if RUN_MIGRATIONS is set to "true"
if [ "$RUN_MIGRATIONS" = "true" ]; then
    echo "Running database migrations..."
    python manage.py migrate --no-input || { echo "Migrations failed, aborting startup"; exit 1; }
    
    # Also migrate finance DB if configured
    if [ -n "$MYSQL_FINANCE_DB_NAME" ]; then
        echo "Running finance database migrations..."
        python manage.py migrate --database=finance --no-input || { echo "Finance migrations failed"; exit 1; }
    fi
fi

exec "$@"
