---
name: dev-server
description: Use when starting Django development server locally with test database for manual testing or debugging
---

# Development Server with Test Database

## Overview

Running the Django development server against the test database (servyy-test) enables local development with isolated test data. This skill ensures proper setup, database connectivity, and demo data loading.

## When to Use

- Manual testing of features with UI
- Debugging API endpoints in browser
- Testing with realistic demo data
- Interactive development workflow
- Before running E2E tests that depend on live server

## Core Pattern

### 1. Install Dependencies

```bash
cd leaguesphere
uv sync --extra test
```

Installs all dependencies including dev extras.

### 2. Set Up Test Database

```bash
./container/spinup_test_db.sh --fresh
```

Creates fresh LXC test database (servyy-test).

### 3. Configure Environment

```bash
export MYSQL_HOST=$(lxc list servyy-test --format json | \
  jq -r '.[0].state.network.eth0.addresses[] | select(.family=="inet") | .address' | head -n 1)
echo "Using test database at: $MYSQL_HOST"
```

Extracts test database IP and sets MYSQL_HOST.

### 4. Apply Migrations

```bash
python manage.py migrate
```

Applies all pending migrations to test database.

### 5. Load Demo Data (Optional)

```bash
python manage.py seed_demo_data
```

Loads realistic demo users, teams, associations, and gamedays.

**Caution:** seed_demo_data is idempotent but can be slow on first run (creates ~100 users, 20 teams). Run only once.

### 6. Start Development Server

```bash
python manage.py runserver
```

Starts Django dev server at `http://127.0.0.1:8000`.

## Quick Reference

| Task | Command |
|------|---------|
| Install deps | `uv sync --extra test` |
| Fresh DB | `./container/spinup_test_db.sh --fresh` |
| Get DB IP | `lxc list servyy-test --format json \| jq -r '.[0].state.network.eth0.addresses[] \| select(.family=="inet") \| .address'` |
| Set MYSQL_HOST | `export MYSQL_HOST=<IP>` |
| Migrations | `python manage.py migrate` |
| Load demo data | `python manage.py seed_demo_data` |
| Start server | `python manage.py runserver` |
| Access server | `http://127.0.0.1:8000` |
| Admin panel | `http://127.0.0.1:8000/admin` |
| API root | `http://127.0.0.1:8000/api/` |

## Complete Startup Workflow

**One-time setup:**
```bash
cd leaguesphere
uv sync --extra test
./container/spinup_test_db.sh --fresh
export MYSQL_HOST=$(lxc list servyy-test --format json | jq -r '.[0].state.network.eth0.addresses[] | select(.family=="inet") | .address' | head -n 1)
python manage.py migrate
python manage.py seed_demo_data  # Optional, slow first time
```

**Start server (after setup):**
```bash
export MYSQL_HOST=$(lxc list servyy-test --format json | jq -r '.[0].state.network.eth0.addresses[] | select(.family=="inet") | .address' | head -n 1)
python manage.py runserver
```

**Access in browser:**
- App: http://127.0.0.1:8000
- Admin: http://127.0.0.1:8000/admin (demo user: staff@demo.local / password)
- API: http://127.0.0.1:8000/api/

## Demo Data Users

After `seed_demo_data`:

| Username | Password | Role |
|----------|----------|------|
| staff@demo.local | password | Staff |
| user1@demo.local | password | Regular user |
| user2@demo.local | password | Regular user |
| assoc_admin@demo.local | password | Association admin |

## Frontend Development (Optional)

If also developing React apps:

```bash
# In a separate terminal, from gameday_designer (or other app)
cd gameday_designer
npm install
npm run dev
```

Frontend dev server runs at `http://localhost:5173` and proxies API to Django.

## Common Mistakes

**❌ Server starts but 502 errors on API calls**
- Error: `Bad Gateway` or `Connection refused`
- Cause: MYSQL_HOST not set or wrong database
- Fix: `export MYSQL_HOST=...` and restart server

**❌ "Table doesn't exist" errors**
- Error: `ProgrammingError: relation "gamedays_gameday" does not exist`
- Cause: Migrations not applied
- Fix: `python manage.py migrate` before starting server

**❌ Demo data takes forever or fails**
- Error: Hangs during `seed_demo_data` or UNIQUE constraint
- Cause: Database has old data, command is slow
- Fix: `./container/spinup_test_db.sh --fresh` to reset DB

**❌ "Port already in use" error**
- Error: `Address already in use`
- Cause: Server already running on port 8000
- Fix: `lsof -i :8000` to find process, `kill -9 <PID>`

**❌ Database connection refused**
- Error: `(2003, "Can't connect to MySQL server")`
- Cause: Test DB not running or MYSQL_HOST is wrong
- Fix: Verify DB: `lxc list servyy-test` and re-export MYSQL_HOST

## Troubleshooting

**Server won't start:**
```bash
# 1. Check database is running
lxc list servyy-test

# 2. Check MYSQL_HOST is set
echo $MYSQL_HOST

# 3. Check migrations applied
python manage.py showmigrations

# 4. Check port is free
lsof -i :8000
```

**All requests return 500 errors:**
```bash
# Check Django logs in console output
# Common causes:
# - Missing MYSQL_HOST
# - Migrations not applied
# - Wrong database (test vs dev)

# Verify settings:
python manage.py shell
>>> from django.conf import settings
>>> print(settings.DATABASES)
```

**Demo data idempotency issues:**
```bash
# If seed_demo_data fails on rerun, reset database
./container/spinup_test_db.sh --fresh
export MYSQL_HOST=$(lxc list servyy-test --format json | jq -r '.[0].state.network.eth0.addresses[] | select(.family=="inet") | .address' | head -n 1)
python manage.py migrate
python manage.py seed_demo_data
```

## Cleanup

**Stop server:**
```bash
# Press Ctrl+C in terminal running runserver
```

**Keep database for next session:**
- Database persists in LXC container
- Just re-export MYSQL_HOST and restart server

**Reset database:**
```bash
./container/spinup_test_db.sh --fresh
```

## Integration with Test Runner Skill

**REQUIRED BACKGROUND:** Understand `test-runner` skill for running tests against same database

When developing and testing:

1. **Start server** (this skill)
   ```bash
   python manage.py runserver
   ```

2. **In another terminal, run tests** (test-runner skill)
   ```bash
   export MYSQL_HOST=...
   pytest gameday_designer/tests/ -v
   ```

3. **Database is shared** - both use same test DB (servyy-test)
4. **Clean up** - `./container/spinup_test_db.sh --fresh` resets for next session

## Frontend App Routing

After starting Django server, access React apps:

| App | URL | Purpose |
|-----|-----|---------|
| Gameday Designer | http://127.0.0.1:8000/designer/ | Schedule builder |
| PassCheck | http://127.0.0.1:8000/passcheck/ | Eligibility checker |
| LiveTicker | http://127.0.0.1:8000/liveticker/ | Live updates |
| Journey Dashboard | http://127.0.0.1:8000/journey/ | Game progress |
| Scorecard | http://127.0.0.1:8000/scorecard/ | Score entry |
| Admin | http://127.0.0.1:8000/admin/ | Django admin panel |
