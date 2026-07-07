# Move prod migrations from CI → Watchtower re-pull

**Date:** 2026-07-07
**Status:** Approved (design)
**Repos touched:** `leaguesphere` (CI), `container` (Ansible)

## Problem

Production database migrations are currently executed by a dedicated CircleCI job,
`run_migrations_production`, which does:

```
docker run --rm -e MYSQL_HOST=$MYSQL_HOST ... backend:latest \
  bash -c "python manage.py migrate --noinput"
```

using the CircleCI `production` context's `MYSQL_HOST`. That reaches the production DB **over
the network from CI**. During the external-DB DDoS this network hop is exactly what makes a
deploy fragile, and it is incompatible with the pending cutover to the internal-only
`leaguesphere.db` container (no published host port — CI cannot reach it).

## Goal

Run migrations **inside the prod stack on container (re)start**, triggered by Watchtower
re-pulling the new `backend:latest` image. Migrations then run against the local
`leaguesphere.db` over the internal Docker network — no external hop, resilient to the
external-DB DDoS, and compatible with the cutover.

## Current state (verified 2026-07-07)

- **Watchtower is live:** `portainer.watchtower-prod` (managed via Portainer, not Ansible).
  Both prod containers carry `com.centurylinklabs.watchtower.scope=prod`, so a new
  `leaguesphere/backend:latest` / `frontend:latest` push auto-recreates them.
- **Migrate-on-startup already exists:** `container/entrypoint.sh` runs
  `python manage.py migrate --no-input` when `RUN_MIGRATIONS=true`, then `exec`s the CMD
  (gunicorn). Prod currently runs with **`RUN_MIGRATIONS=false`**.
- **Prod app already points at the local DB:** live `MYSQL_HOST=leaguesphere.db`
  (`secret_main.yaml` `db_host: leaguesphere.db`). App is in maintenance mode.
- **`check_migrations` CI job already exists** and runs the real backend image through a full
  `manage.py check && makemigrations --check --dry-run && migrate` against a fresh ephemeral
  MariaDB on every build.

## Design

### 1. `leaguesphere/.circleci/config.yml` — remove the against-prod migration job

- Delete the `run_migrations_cmd` command definition (only consumer is
  `run_migrations_production`).
- Delete the `run_migrations_production` job.
- In the production workflow: remove the `run_migrations_production` node and rewire
  `create_production_release`'s `requires:` from `run_migrations_production` →
  `deploy_production`.
- **Keep `check_migrations` unchanged** — it remains the migration gate.

### 2. `container/` Ansible (`ls_app` role) — enable migrate-on-startup for prod only

- Set `RUN_MIGRATIONS=true` in prod's rendered compose project `.env`.
  - Note: the app service reads `RUN_MIGRATIONS: ${RUN_MIGRATIONS:-false}` via compose
    variable interpolation, which resolves from the project `.env` file (rendered from
    `docker.env.j2`), **not** from `env_file: ls.env`. The toggle must land in `.env`.
  - Must be **prod-scoped** so stage/demo stay `false`. Exact mechanism (a `docker.env.j2`
    conditional vs. a role var keyed off the prod secret file) to be pinned in the plan.

### New deploy flow

```
merge/tag → CI builds + pushes leaguesphere/backend:latest
          → watchtower-prod re-pulls → recreates leaguesphere.app
          → entrypoint.sh: migrate (RUN_MIGRATIONS=true) against local leaguesphere.db
          → gunicorn starts → app healthcheck passes
          → www (depends_on app healthy) stays/becomes healthy
```

Only one app container is recreated, so there is no concurrent-migration race.

## Failure handling & gate

- **Gate kept:** `check_migrations` runs the full migration set against a real (ephemeral)
  MariaDB on every build; migrations that do not apply cleanly **block the merge/release**
  before anything reaches prod.
- **Gate given up:** a *pre-swap* gate against real prod **data**. A data-dependent migration
  failure surfaces at container start: `entrypoint.sh` exits 1 → app crash-loops → `www` never
  goes healthy. Recovery is re-pinning the previous image tag. No automatic rollback (Watchtower
  has already replaced the container).
- **Future option (out of scope):** a host-side one-shot migrate step that gates the app swap
  would restore a true pre-swap gate against prod data, at the cost of extra orchestration that
  the Watchtower re-pull model deliberately avoids.

## Testing

- Validate the CircleCI config (`circleci config validate`) and confirm the workflow graph
  resolves with `run_migrations_production` removed and `create_production_release` requiring
  `deploy_production`.
- Exercise the Ansible `RUN_MIGRATIONS=true` render on **servyy-test** first (test-first
  policy): deploy, confirm the app container migrates on start then serves, and confirm
  stage/demo remain `RUN_MIGRATIONS=false`.

## Rollout ordering (ties into the cutover)

The CI + Ansible changes are safe to **land now**. Enabling `RUN_MIGRATIONS=true` means the
**next** app recreate runs migrations against `leaguesphere.db`. Prod already points there and
is in maintenance mode, but the local DB's seeding is part of the still-pending cutover
(blocked on the external-DB DDoS settling). Therefore:

- Land the code changes now.
- Sequence the **first live migrate-on-start** with the cutover — after the DDoS settles and
  `leaguesphere.db` is confirmed seeded.

The code change is independent of the DDoS; only the first live run is sequenced with the
cutover.
