#!/bin/bash
set -e

log() { echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $1"; }

log "Syncing production DB to staging..."
DUMP_FILE="/tmp/prod_dump_$(date +%s).sql"

log "Dumping ${PROD_MYSQL_DB_NAME} from ${PROD_MYSQL_HOST}..."
mysqldump \
  -h "$PROD_MYSQL_HOST" \
  -u "$PROD_MYSQL_USER" \
  -p"$PROD_MYSQL_PWD" \
  --no-tablespaces \
  --single-transaction \
  --skip-triggers \
  "$PROD_MYSQL_DB_NAME" > "$DUMP_FILE"

log "Recreating staging database..."
mysql -h "$MYSQL_HOST" -u root -p"$MYSQL_ROOT_PASSWORD" <<SQL
DROP DATABASE IF EXISTS \`${MYSQL_DB_NAME}\`;
CREATE DATABASE \`${MYSQL_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON \`${MYSQL_DB_NAME}\`.* TO '${MYSQL_USER}'@'%';
FLUSH PRIVILEGES;
SQL

log "Importing production data..."
mysql -h "$MYSQL_HOST" -u "$MYSQL_USER" -p"$MYSQL_PWD" "$MYSQL_DB_NAME" < "$DUMP_FILE"
rm -f "$DUMP_FILE"
log "Sync complete"

log "Running migrations..."
python manage.py migrate --noinput || { log "Migrations failed"; exit 1; }

exec "$@"
