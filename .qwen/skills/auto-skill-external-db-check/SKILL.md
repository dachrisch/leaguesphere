---
name: external-db-check
description: Post-cutover audit and pre-cutover connectivity checks for LeagueSphere external DB (s207) → local leaguesphere.db migration
source: auto-skill
extracted_at: '2026-07-08T00:17:00Z'
updated_at: '2026-07-08T16:01:39Z'
---

# External DB Connectivity & Post-Cutover Dependency Audit

## Phase A: Pre-Cutover — External DB Connectivity & Dump Readiness

> Use this section BEFORE the cutover to verify the external DB is healthy enough for seeding.

The external DB (`s207.goserver.host`) has experienced DDoS-related degradation. Use this procedure to check whether it's healthy enough for a full `mysqldump`.

## Context

- External DB host: `s207.goserver.host`
- Credentials are in the `leaguesphere.app` container env (`MYSQL_USER`, `MYSQL_PWD`, `MYSQL_DB_NAME`)
- The DB has been experiencing DDoS-related degradation: TCP connects succeed, simple queries work, but data-scanning operations hang
- Run all commands from a machine with SSH access to the prod server (`lehel.xyz`)

## Procedure

### Step 1: Verify SSH to prod server

```bash
ssh lehel.xyz "echo 'SSH_OK'"
```

### Step 2: Get credentials from app container

```bash
ssh lehel.xyz "docker inspect leaguesphere.app --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E 'MYSQL_USER|MYSQL_PWD|MYSQL_DB_NAME'"
```

### Step 3: Test TCP connectivity to external DB

```bash
ssh lehel.xyz "timeout 10 bash -c 'echo > /dev/tcp/s207.goserver.host/3306 && echo TCP_OK || echo TCP_FAIL'"
```

### Step 4: Test simple query (SELECT 1)

```bash
ssh lehel.xyz "timeout 15 mysql -h s207.goserver.host -u <MYSQL_USER> -p'<MYSQL_PWD>' --compression-algorithms=zlib -e 'SELECT 1 AS test' <MYSQL_DB_NAME>"
```

### Step 5: Test data-scanning query (the failure indicator)

```bash
ssh lehel.xyz "timeout 15 mysql -h s207.goserver.host -u <MYSQL_USER> -p'<MYSQL_PWD>' <MYSQL_DB_NAME> -e 'SELECT COUNT(*) FROM auth_user'"
```

- If this **times out (exit 124)** → external DB is still degraded, dump will fail. Wait.
- If this **succeeds** → proceed to Step 6.

### Step 6: Throughput pre-check (small dump)

```bash
ssh lehel.xyz "timeout 60 mysqldump -h s207.goserver.host -u <MYSQL_USER> -p'<MYSQL_PWD>' --compression-algorithms=zlib <MYSQL_DB_NAME> --no-data 2>&1 | wc -c"
```

- If this produces meaningful output (>1KB) → dump is likely feasible.
- If this hangs or produces 0 bytes → wait longer for external DB to settle.

### Step 7: Full dump (only if Steps 5-6 pass)

```bash
ssh lehel.xyz "mysqldump -h s207.goserver.host -u <MYSQL_USER> -p'<MYSQL_PWD>' --compression-algorithms=zlib <MYSQL_DB_NAME> > /tmp/leaguesphere_prod_\$(date +%s).sql 2>&1"
# Verify completion:
ssh lehel.xyz "tail -3 /tmp/leaguesphere_prod_*.sql | grep 'Dump completed'"
```

The `-- Dump completed` trailer is the definitive success indicator.

## Local DB Health Check

To verify the local `leaguesphere.db` is healthy:

```bash
ssh lehel.xyz "docker exec leaguesphere.db mariadb -u root -p'<MYSQL_ROOT_PASSWORD>' -e 'SELECT COUNT(*) as cnt FROM auth_user' <MYSQL_DB_NAME>"
```

### Local DB Data Summary (as of 2026-07-08)

The local `leaguesphere.db` contains **real production data** (not just fixtures):

| Table | Rows |
|---|---|
| `auth_user` | 341 |
| `gamedays_gameday` | 750 |
| `gamedays_team` | 543 |
| `gamedays_person` | 12,808 |
| `officials_official` | 3,649 |
| `journey_journey` | 1,640 |
| `journey_journeyevent` | 32,771 |
| `gamedays_playerachievement` | 0 |

The local DB has 104 tables and appears to be a legitimate production database. To check data freshness, query the most recent dates:

```bash
ssh lehel.xyz "docker exec leaguesphere.db mariadb -u root -p'<MYSQL_ROOT_PASSWORD>' web35_db8 -e '
SELECT MAX(created_at) as latest_journey FROM journey_journeyevent;
SELECT MAX(start_date) as latest_gameday FROM gamedays_gameday;
'"
```

### External DB Dump Alternative — Per-Table Approach

If full `mysqldump` hangs but `SHOW TABLES` works, try dumping tables individually:

```bash
# Schema-only per table works:
ssh lehel.xyz "timeout 20 mysqldump -h s207.goserver.host -u <USER> -p'<PWD>' --compression-algorithms=zlib <DB> Gameinfo --no-data"
```

However, as of 2026-07-08, even single-table dumps with data **produce 0 bytes** and time out. The external DB's MySQL process is responsive to control queries but cannot serve data rows.

## ⚠️ Critical Warnings

- **Do NOT run `--tags ls.db.migrate`** on the Ansible roles until `ls_db_migrate` gets the same external-host decoupling fix that `ls_db_sync` received in container PR #34. It currently uses `secret_main.app.db_host` (now `leaguesphere.db`) as its export source and then does `DROP DATABASE` on the local prod DB — running it as-is would wipe `leaguesphere.db`.
- `ls_db_sync` / `ls_db_migrate` pass the DB password on the shell command line (visible in host process list). This is a known security TODO.

---

## Phase B: Post-Cutover — External DB Dependency Audit

> Run this AFTER the cutover to `leaguesphere.db` to find any remaining references to the old external host.

### Scan procedure

```bash
# 1. Infrastructure repo — external host references
grep -rn "s207\.goserver\.host\|goserver\.host" /path/to/servyy-container/

# 2. Infrastructure repo — db_host / MYSQL_HOST patterns
grep -rn "db_host\|MYSQL_HOST\|mysql_host" /path/to/servyy-container/

# 3. Application repo — external host references (exclude vendor dirs)
grep -rn "s207\|goserver\.host" /path/to/leaguesphere/ \
  --include="*.{py,yml,yaml,sh,md,env,txt,toml,json}" \
  --exclude-dir=node_modules --exclude-dir=.venv --exclude-dir=__pycache__

# 4. Broken ansible_facts patterns (Python 3.14 / Ansible 2.20 incompatibility)
grep -rn "ansible_facts\['date_time'\]\|ansible_facts\.date_time" /path/to/servyy-container/
```

### Known dependencies (as of 2026-07-08 post-cutover — all resolved)

| Role/Service | File | External Ref | Status | Risk |
|---|---|---|---|---|
| `ls_db_sync` | `roles/ls_db_sync/defaults/main.yml` | `ls_db_sync_external_host: "s207.goserver.host"` | ✅ Intentional — default is `local`; external for recovery | Low |
| `ls_db_sync` | `roles/ls_db_sync/defaults/main.yml` | `ls_db_sync_source: "local"` | ✅ Fixed — default changed from `external` in PR #39 | — |
| `ls_db_migrate` | `roles/ls_db_migrate/defaults/main.yml` | `ls_migrate_external_host: "s207.goserver.host"` | ✅ Intentional — on-demand seed tool only | Low |
| `ls_db_migrate` | `roles/ls_db_migrate/tasks/main.yml:12` | `ansible_facts['date_time']['epoch']` | ✅ Fixed — same `date +%s` pattern as ls_db_sync (PR #36) | — |
| `leagues_finance` | `vars/secrets.yml:152` | `ls_db_host: "leaguesphere.db"` | ✅ Fixed — PR #40, joins `leaguesphere_database` network | — |
| `ls_app` | `roles/ls_app/vars/secret_main.yaml` | `db_host: leaguesphere.db` | ✅ Cut over | — |
| `ls.env.j2` | `roles/ls_app/templates/ls.env.j2` | `MYSQL_HOST={{ app.db_host }}` | ✅ Cut over | — |
| `leaguesphere` app | all source files | none | ✅ Clean | — |

### Fix for `ansible_facts['date_time']` breakage

On Python 3.14 / Ansible 2.20, `ansible_facts['date_time']` is not reliably available. Replace:

```yaml
# Before (broken):
- name: Set dump file variable
  set_fact:
    sql_dump_file: "/tmp/leaguesphere_prod_{{ ansible_facts['date_time']['epoch'] }}.sql"

# After (fixed):
- name: Set dump file variable
  command: date +%s
  register: dump_timestamp
  changed_when: false

- name: Set dump file path
  set_fact:
    sql_dump_file: "/tmp/leaguesphere_prod_{{ dump_timestamp.stdout }}.sql"
```

This fix was applied to `ls_db_sync` in servyy-container PR #36. The same fix is needed in `ls_db_migrate/tasks/main.yml` and `roles/testing/tasks/_restic_check_single.yml`.

### Fix for `leagues_finance` external DB host — ✅ COMPLETED (PR #40)

The `leagues_finance` service was updated to connect to the local leaguesphere DB via the shared `leaguesphere_database` Docker network.

**What was done:**

1. **`secrets.yml`** — Changed `ls_db_host: "s207.goserver.host"` → `ls_db_host: "leaguesphere.db"`
2. **leagues-finance compose** (`leagues-finance/docker-compose.yml`) — Added `leaguesphere_database` as external network:
   ```yaml
   services:
     finance-api:
       networks:
         - proxy
         - leaguesphere_database
   networks:
     leaguesphere_database:
       external: true
   ```
3. **Redeploy**: `ansible-playbook -i production plays/user.yml -t user.docker.leagues-finance`

**Key detail**: The DB container is on `leaguesphere_database` (not `leaguesphere_default`). The compose project name is `leaguesphere` (from `secret_main.yaml`). The `database` network has `internal: false` (containers can reach out, but no inbound internet access — no port publishing).
