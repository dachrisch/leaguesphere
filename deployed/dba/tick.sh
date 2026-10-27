#!/bin/sh
# Managed by hand in this repo - mounted read-only into the db-access sidecar.
#
# One pass of the temporary-access executor: read an approved row, mint the
# MySQL account, and later drop it again. It talks to the app only through rows
# in the application schema - there is no HTTP surface, no volume and no port.
#
# Rules this file holds itself to:
#   * the account name is DERIVED here (dbeaver_prod_<person>), never taken from
#     the row - a row may name a person, not an identity;
#   * the host pattern comes from the environment, never from the row, because
#     MariaDB will happily create '%' and the reaper is then the only guard;
#   * every table is checked against the live schema before anything is granted,
#     and a request that fails validation is parked as 'failed', never half-minted;
#   * the pre-session snapshot is taken here because the temporary account has
#     SELECT+UPDATE only and could not create its own backup table.
set -eu

if [ "${1:-}" = "--loop" ]; then
    while :; do
        /bin/sh /opt/dba/tick.sh || echo "db-access: tick failed" >&2
        sleep 15
    done
fi

: "${DBACCESS_HOST:?DBACCESS_HOST is required}"
: "${DBACCESS_USER:?DBACCESS_USER is required}"
: "${DBACCESS_PASSWORD:?DBACCESS_PASSWORD is required}"
: "${DBACCESS_DB:?DBACCESS_DB is required}"
: "${DBACCESS_HOST_PATTERN:?DBACCESS_HOST_PATTERN is required}"

DB="${DBACCESS_DB}"
PATTERN="${DBACCESS_HOST_PATTERN}"
MAX_PER_TICK="${DBACCESS_MAX_PER_TICK:-5}"
TAB='	'

sql() {
    mariadb -h "$DBACCESS_HOST" -P "${DBACCESS_PORT:-3306}" \
        -u "$DBACCESS_USER" -p"$DBACCESS_PASSWORD" \
        --batch --skip-column-names "$@"
}

# identifier shape, checked twice on purpose: here and by the database
VALID_ID='^[a-z][a-z0-9_]{0,63}$'

fail_row() {
    # $1 = row id, $2 = reason
    sql "$DB" -e "
        UPDATE dbaccess_request
           SET state='failed', failure_reason='$2', updated_at=NOW()
         WHERE id=$1 AND state='approved'"
    sql "$DB" -e "
        INSERT INTO dbaccess_event (request_id, at, actor, action, detail, from_ip)
        VALUES ($1, NOW(), 'sidecar', 'failed', '$2', NULL)"
    echo "db-access: request $1 rejected: $2" >&2
}

record() {
    # $1 = row id, $2 = action, $3 = detail
    sql "$DB" -e "
        INSERT INTO dbaccess_event (request_id, at, actor, action, detail, from_ip)
        VALUES ($1, NOW(), 'sidecar', '$2', '$3', NULL)"
}

drop_account() {
    # $1 = user, $2 = host, $3 = row id ('' when there is no row to update)
    user=$1
    host=$2
    sql -e "SELECT id FROM information_schema.processlist WHERE user='$user'" |
        while read -r pid; do
            case "$pid" in ''|*[!0-9]*) continue ;; esac
            sql -e "KILL $pid" || true
        done
    sql -e "DROP USER IF EXISTS '$user'@'$host'" || true
    if [ -n "${3:-}" ]; then
        sql "$DB" -e "
            UPDATE dbaccess_request
               SET state='dropped', secret=NULL, dropped_at=NOW(), updated_at=NOW()
             WHERE id=$3 AND state <> 'dropped'"
        record "$3" "dropped" "account $user@$host removed"
    fi
    echo "db-access: dropped $user@$host"
}

########################################
# 1. approved -> active
########################################
sql "$DB" -e "
    SELECT id, person, tables_csv, ttl_hours
      FROM dbaccess_request
     WHERE state='approved'
     ORDER BY id
     LIMIT $MAX_PER_TICK" | while IFS="$TAB" read -r id person tables ttl; do
    [ -n "${id:-}" ] || continue

    if ! printf '%s' "$person" | grep -Eq '^[a-z][a-z0-9]{1,20}$'; then
        fail_row "$id" "person must be lowercase alphanumeric"
        continue
    fi

    user="dbeaver_prod_${person}"
    valid_tables=""
    for t in $(printf '%s' "$tables" | tr ',' ' '); do
        if ! printf '%s' "$t" | grep -Eq "$VALID_ID"; then
            fail_row "$id" "table name is not a plain identifier"
            continue 2
        fi
        exists=$(sql -e "SELECT COUNT(*) FROM information_schema.tables
                          WHERE table_schema='$DB' AND table_name='$t'")
        if [ "$exists" != "1" ]; then
            fail_row "$id" "unknown table $t"
            continue 2
        fi
        valid_tables="$valid_tables $t"
    done
    if [ -z "$valid_tables" ]; then
        fail_row "$id" "empty table list"
        continue
    fi

    echo "db-access: minting $user for$valid_tables"

    # Snapshot first: a grant without a way back is worse than no grant.
    today=$(date +%Y%m%d)
    for t in $valid_tables; do
        if ! sql "$DB" -e "CREATE TABLE IF NOT EXISTS \`bak_${t}_${today}\`
                             AS SELECT * FROM \`${t}\`"; then
            fail_row "$id" "snapshot of $t failed"
            continue 2
        fi
    done

    pw=$(head -c 512 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)

    # Reads are granted table by table from the curated list, NOT as `db`.*:
    # schema-wide SELECT also hands out auth_user's password hashes,
    # django_session, the OAuth2 bearer tokens and - worst - every live row of
    # dbaccess_request.secret, which is the plaintext credential of a session
    # nobody has revealed yet. The list lives in the application schema, so a
    # deploy that adds a table only needs `dbaccess_sync_tables` to widen it.
    read_tables=$(sql "$DB" -e "SELECT name FROM dbaccess_grantabletable
                                 WHERE grantable=1 ORDER BY name")
    if [ -z "$read_tables" ]; then
        fail_row "$id" "the allow-list is empty - run dbaccess_sync_tables"
        continue
    fi

    if ! {
        cat <<SQL
CREATE USER IF NOT EXISTS '${user}'@'${PATTERN}' IDENTIFIED BY '${pw}';
ALTER USER '${user}'@'${PATTERN}' IDENTIFIED BY '${pw}';
ALTER USER '${user}'@'${PATTERN}'
  WITH MAX_STATEMENT_TIME 60 MAX_USER_CONNECTIONS 4;
REVOKE ALL PRIVILEGES, GRANT OPTION FROM '${user}'@'${PATTERN}';
SQL
        for t in $read_tables; do
            case $t in *[!A-Za-z0-9_]*) continue;; esac
            printf "GRANT SELECT ON \`%s\`.\`%s\` TO '%s'@'%s';\n" \
                "$DB" "$t" "$user" "$PATTERN"
        done
        for t in $valid_tables; do
            # the table itself, and the snapshot taken a moment ago so the
            # runbook's "verify the safety copy" step still works
            printf "GRANT SELECT, UPDATE ON \`%s\`.\`%s\` TO '%s'@'%s';\n" \
                "$DB" "$t" "$user" "$PATTERN"
            printf "GRANT SELECT ON \`%s\`.\`bak_%s_%s\` TO '%s'@'%s';\n" \
                "$DB" "$t" "$today" "$user" "$PATTERN"
        done
    } | sql "$DB"; then
        drop_account "$user" "$PATTERN" ""
        fail_row "$id" "could not create the account or grant its reads"
        continue
    fi

    sql "$DB" -e "
        UPDATE dbaccess_request
           SET state='active', db_user='${user}', grant_host='${PATTERN}',
               secret='${pw}', activated_at=NOW(), updated_at=NOW()
         WHERE id=${id} AND state='approved'"
    record "$id" "activated" "$user@$PATTERN on${valid_tables}"
    echo "db-access: $user active"
done

########################################
# 2. revoke / expiry -> drop
########################################
sql "$DB" -e "
    SELECT id, db_user, grant_host
      FROM dbaccess_request
     WHERE state IN ('revoke_requested','expired')
       AND db_user IS NOT NULL
     ORDER BY id
     LIMIT $MAX_PER_TICK" | while IFS="$TAB" read -r id user host; do
    [ -n "${id:-}" ] || continue
    drop_account "$user" "$host" "$id"
done
