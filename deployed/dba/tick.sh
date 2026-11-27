#!/bin/sh
# Managed by hand in this repo - mounted read-only into the db-access sidecar.
#
# One pass of the temporary-access executor: read an approved row, mint the
# MySQL account, and later drop it again. It talks to the app only through rows
# in the application schema - there is no HTTP surface, no volume and no port.
#
# Rules this file holds itself to:
#   * the account name comes from the row (one row, one account). It is checked
#     before it reaches hand-written SQL; the app wrote it at creation time as
#     dbeaver_prod_<handle>_r<base36(id)>, and a re-mint keeps it unchanged;
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

# identifier shape, checked twice on purpose: here and by the database.
# Case-sensitive on purpose too: the allow-list seeds names verbatim from
# information_schema and production has three mixed-case ones (`Gameinfo`,
# `Gesamttabelle_2022_sortiert`, `Strafen`). The GRANT backticks the name, so
# the case carries no injection risk - a lowercase-only guard just made those
# tables unrequestable.
VALID_ID='^[A-Za-z][A-Za-z0-9_]{0,63}$'

# --- snapshot naming -------------------------------------------------------
# The runbook's `bak_<table>_<date>` is kept whenever it fits: MariaDB caps an
# identifier at 64 bytes, and a long table name overflows it
# (`bak_league_table_leagueseasonconfig_leagues_for_league_points_20261113` is
# 70, which the server refuses with 1103 - so that table could never be
# snapshotted, and a request naming it failed whole, after approval).
#
# A name that does not fit keeps a 38-character prefix plus an 8-hex digest of
# the full table name: 4 + 38 + 1 + 8 + 1 + 8 = 60 characters, stable across
# ticks (so `CREATE TABLE IF NOT EXISTS` reuses it) and specific to one table
# (truncation alone would merge two names that share a prefix).
snapshot_for() {
    candidate="bak_$1_$today"
    if [ "${#candidate}" -le 64 ]; then
        printf '%s\n' "$candidate"
        return 0
    fi
    digest=$(printf '%s' "$1" | sha256sum | cut -c1-8)
    printf 'bak_%s_%s_%s\n' "$(printf '%s' "$1" | cut -c1-38)" "$digest" "$today"
}
# --- end snapshot naming ---------------------------------------------------

# --- privilege set ---------------------------------------------------------
# The grant a requested table gets. Read + UPDATE is the floor of every
# request; INSERT and DELETE are added only when the requester ticked them.
# The allow-list tables used for context are granted SELECT only, separately.
privileges_for() {
    # $1 = may_insert, $2 = may_delete (0/1; absent reads as 0)
    privileges="SELECT, UPDATE"
    if [ "${1:-0}" = "1" ]; then
        privileges="$privileges, INSERT"
    fi
    if [ "${2:-0}" = "1" ]; then
        privileges="$privileges, DELETE"
    fi
    printf '%s\n' "$privileges"
}
# --- end privilege set ---

# --- grant failure reason --------------------------------------------------
grant_failure_reason() {
    # $1 = may_delete, $2 = captured mariadb error
    if [ "${1:-0}" = "1" ]; then
        case "$2" in
            *DELETE*|*1142*|*1143*)
                printf 'could not grant DELETE - the provisioner lacks it (run the ls.dbeaver role): %s\n' "$2"
                return 0
                ;;
        esac
    fi
    printf 'could not create the account or grant its reads: %s\n' "$2"
}
# --- end grant failure reason ---

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
# A tick may run before the app deploy has migrated the two write flags in.
# COALESCE does not protect against a column that does not exist, so the select
# is built from information_schema: two literal zeros until both are there.
# That keeps an old row - and an old schema - at read + UPDATE, never wider.
write_columns="0, 0"
have_write_columns=$(sql -e "SELECT COUNT(*) FROM information_schema.columns
                              WHERE table_schema='$DB' AND table_name='dbaccess_request'
                                AND column_name IN ('may_insert','may_delete')")
if [ "$have_write_columns" = "2" ]; then
    write_columns="COALESCE(may_insert,0), COALESCE(may_delete,0)"
fi

sql "$DB" -e "
    SELECT id, db_user, tables_csv, ttl_hours, $write_columns
      FROM dbaccess_request
     WHERE state='approved'
     ORDER BY id
     LIMIT $MAX_PER_TICK" | while IFS="$TAB" read -r id db_user_row tables ttl may_insert may_delete; do
    [ -n "${id:-}" ] || continue

    # The app owns the name; this is the injection guard, not a second naming
    # implementation. Prefix (the reaper matches it), safe characters, the
    # request suffix, and MariaDB's 32-byte limit must all hold.
    if [ "${#db_user_row}" -gt 32 ] ||
       ! printf '%s' "$db_user_row" | grep -Eq '^dbeaver_prod_[a-z0-9]*_r[0-9a-z]+$'; then
        fail_row "$id" "invalid minted account name on the row"
        continue
    fi

    user="$db_user_row"
    valid_tables=""
    for t in $(printf '%s' "$tables" | tr ',' ' '); do
        if ! printf '%s' "$t" | grep -Eq "$VALID_ID"; then
            fail_row "$id" "table name is not a plain identifier: $t"
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
        snap=$(snapshot_for "$t")
        if ! sql "$DB" -e "CREATE TABLE IF NOT EXISTS \`${snap}\`
                             AS SELECT * FROM \`${t}\`"; then
            fail_row "$id" "snapshot ${snap} of $t failed"
            continue 2
        fi
        echo "db-access: snapshot $snap"
    done

    pw=$(head -c 512 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)
    privileges=$(privileges_for "${may_insert:-0}" "${may_delete:-0}")
    privilege_names="read+update"
    if [ "${may_insert:-0}" = "1" ]; then
        privilege_names="$privilege_names+insert"
    fi
    if [ "${may_delete:-0}" = "1" ]; then
        privilege_names="$privilege_names+delete"
    fi

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

    if ! grant_error=$({
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
            # The requested table gets the chosen set; DELETE only works when
            # the provisioner holds DELETE itself (infrastructure role), which
            # is why a failed grant is turned into a clear reason below. The
            # snapshot taken a moment ago stays readable so the runbook's
            # "verify the safety copy" step still works.
            printf "GRANT %s ON \`%s\`.\`%s\` TO '%s'@'%s';\n" \
                "$privileges" "$DB" "$t" "$user" "$PATTERN"
            printf "GRANT SELECT ON \`%s\`.\`%s\` TO '%s'@'%s';\n" \
                "$DB" "$(snapshot_for "$t")" "$user" "$PATTERN"
        done
    } | sql "$DB" 2>&1); then
        # Nothing half-minted: the account is dropped again before the row is
        # parked, so a failed DELETE does not leave a SELECT/INSERT account.
        drop_account "$user" "$PATTERN" ""
        grant_error=$(printf '%s' "$grant_error" | tr '\n' ' ' | tr -d "'" | cut -c1-300)
        fail_row "$id" "$(grant_failure_reason "${may_delete:-0}" "$grant_error")"
        continue
    fi

    sql "$DB" -e "
        UPDATE dbaccess_request
           SET state='active', db_user='${user}', grant_host='${PATTERN}',
               secret='${pw}', activated_at=NOW(), updated_at=NOW()
         WHERE id=${id} AND state='approved'"
    record "$id" "activated" "$user@$PATTERN on${valid_tables}; privileges: ${privilege_names}"
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
