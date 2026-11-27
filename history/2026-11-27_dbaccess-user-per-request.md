# db-access: one MySQL account per request row

**Date:** 2026-11-27
**Branch:** `claude/dbaccess-user-per-request`
**Status:** implemented and unit-tested locally; not deployed

## Problem

`db_user` was `dbeaver_prod_<handle>`: deterministic per person, reused for
every request. The ledger could not tell which request a DB session belonged
to, so the host reaper judged sessions by *any* row sharing the name:

- 2026-11-20 `past-cap` (an old row's `created_at` poisoned a fresh session),
- 2026-11-20 session kill (a `dropped` row made a live session killable),
- 2026-11-27 six error-1226s: request 14 was revoked, request 15 for the same
  handle was activated, and the three idle connections from 14 survived
  because a live row still backed the account.

The infra reaper's live-state and audit-log fixes contain the damage, but the
underlying flaw is the non-unique key. This change removes it.

## Naming scheme

```
dbeaver_prod_<handle>_r<base36(request_id)>
```

- `dbeaver_prod_` (13 chars) is kept: the reaper matches
  `dbeaver\_prod\_%` in `mysql.user` / `processlist`, and grants stay host-scoped
  (`172.25.%` prod, `192.168.16.%` stage). **No infra pattern change needed.**
- The **full primary key** is appended in base36 after `_r`. Injection is
  mathematical, not probabilistic: no hash or collision window. Truncation
  applies only to the human-readable handle, which is a label, not a key.
- Why base36 and not decimal: MariaDB caps a user name at 32 characters. With
  a 13-char prefix and a 2-char marker, a 64-bit decimal id can take 19 chars
  and overflow; base36 takes at most 13 (`1y2p0ij32e8e7` for `2**63-1`),
  leaving at least 4 handle chars across the whole `BigAutoField` range.
  Examples: `dbeaver_prod_5eradmin_rf` (14), `dbeaver_prod_chrisd_r10` (36).
- The app writes the name at creation; the sidecar reads it from the row and
  only validates it (prefix, safe characters, suffix, 32 chars) before it
  reaches hand-written SQL. There is no second naming implementation in the
  shell, so the two halves cannot drift. A re-mint keeps the name: the row is
  the identity for its whole life.

## Files changed

| File | Change |
|---|---|
| `dbaccess/accounts.py` (new) | single definition of the name: `base36()`, `access_handle()`, `db_user_for()`, regexes |
| `dbaccess/models.py` | imports/re-exports the name helpers; `save()` assigns `db_user` on insert; help text |
| `deployed/dba/tick.sh` | selects `db_user` from the row, validates it, mints that exact account; no per-person derivation |
| `dbaccess/migrations/0003_db_user_per_request.py` (new) | data backfill + `AlterField` for the help text |
| `dbaccess/management/commands/dbaccess_finalize_db_users.py` (new) | finalise rows that were live during the deploy; `--dry-run` |
| `dbaccess/templates/dbaccess/{request_form,request_list,request_detail,request_reveal}.html` | show the per-request account |
| `league_manager/help/content/dbaccess.de.md` | staff help: name carries the request id; saved credentials from an older session do not apply |
| `dbaccess/tests/test_account_naming.py` (new) | 32-char budget, base36 injectivity, uniqueness, determinism, SQL-safe alphabet |
| `dbaccess/tests/test_db_user_migration.py` (new) | backfill/live split, reverse, finalise command, idempotence |
| `dbaccess/tests/test_models.py`, `test_sidecar_grants.py`, `test_views.py` | creation-time assignment, shell guard, surfaces |

## Migration and rollout

1. **Pre-flight.** Check there is at most one live request per person. If two
   requests for one handle are live at rollout, they still share the old
   account; revoke the older one and wait for the reaper's sweep first.
2. **Deploy the app** (this code). `manage.py migrate` runs `0003`:
   - terminal rows (including the historical dropped rows from the incidents)
     get their per-request name and a `db_user-migrated` audit event;
   - rows in `approved`/`active`/`revoke_requested`/`expired` **keep** their old
     name: the MySQL account still has it, and renaming only the ledger would
     make the reaper treat the session as orphaned and kill it.
   New requests get `dbeaver_prod_<handle>_r<id>` immediately.
3. **Let in-flight sessions end.** They are reaped at their cap (≤8 h from
   request time) or by **Revoke now**. The infra reaper still matches the old
   names, and its live-state filter now sees exactly one row per account.
4. **Finalise.** `manage.py dbaccess_finalize_db_users --dry-run` then without
   the flag. It renames only rows whose account is already gone; live rows are
   counted and skipped. Idempotent, so repeat until the "still live" count is 0.
5. **Infra rollout** (owner: infrastructure repo): deploy the audit-log-based
   reap fix. No pattern/host changes are required for this app change, but the
   two should roll out together: the reap fix handles the remaining old-name
   edge cases during the transition window.

**Risks.** A stale DBeaver profile always gets `1045` after a re-mint; the
per-request name makes that explicit but does not change the re-mint flow.
Finalise must not run while a session is live — the command skips those rows,
but running it early only delays the backfill, it cannot break a session.
Reversing `0003` restores the old names; the migration audit events are kept.

## Test

Written first (RED: 2 collection errors + 4 failures), then implemented (GREEN).
```bash
export MYSQL_HOST=<servyy-test LXC IP>   # .env had a stale address
.venv/bin/python -m pytest dbaccess/tests -q        # 125 passed
.venv/bin/python manage.py makemigrations --check --dry-run   # No changes detected
.venv/bin/python -m black --check <changed files>   # clean (with --fast on py3.14)
```
The tests use the repo's throwaway MariaDB in `servyy-test.lxd`; no prod or
stage data, hosts or containers were touched.
