---
name: leaguesphere-test-runner
description: Use when running tests locally or verifying test suite passes, before committing changes
---

# LeagueSphere Test Runner

## Overview

Running tests in LeagueSphere requires proper database setup, dependency installation, and environment configuration. This skill ensures tests run reliably with clear pass/fail reporting.

## When to Use

- Running full test suite after making changes
- Running specific test file or test class
- Checking test coverage
- Verifying changes don't break existing tests
- Before committing code

## Core Pattern

### 1. Install Dependencies

```bash
uv sync --extra test
```

Installs all Python dependencies including test extras (pytest, pytest-cov, pytest-xdist).

### 2. Set Up Test Database

```bash
./container/spinup_test_db.sh --fresh
```

Creates fresh LXC test database. Required ONCE before running Django tests.

### 3. Configure Environment

```bash
export MYSQL_HOST=$(lxc list servyy-test --format json | \
  jq -r '.[0].state.network.eth0.addresses[] | select(.family=="inet") | .address' | head -n 1)
echo "Test DB at: $MYSQL_HOST"
```

Extracts test database IP and sets MYSQL_HOST environment variable.

### 4. Run Tests

**Full suite:**
```bash
pytest
```

**Specific file:**
```bash
pytest gameday_designer/tests/test_api.py -v
```

**Specific test:**
```bash
pytest gameday_designer/tests/test_api.py::TestTemplateDetailEndpoint::test_detail_includes_nested_slots -v
```

**With coverage:**
```bash
pytest --cov=. --cov-report=html
```

**Backend only (no E2E):**
```bash
pytest --ignore=scorecard/tests/e2e --ignore=gameday_designer/tests/e2e -v
```

## Quick Reference

| Task | Command |
|------|---------|
| Install deps | `uv sync --extra test` |
| Fresh DB | `./container/spinup_test_db.sh --fresh` |
| Get DB IP | `lxc list servyy-test --format json \| jq -r '.[0].state.network.eth0.addresses[] \| select(.family=="inet") \| .address'` |
| All tests | `pytest` |
| Single file | `pytest path/to/test.py -v` |
| Single test | `pytest path/to/test.py::TestClass::test_name -v` |
| With coverage | `pytest --cov=. --cov-report=html` |
| Parallel (4 workers) | `pytest -n 4` |
| Stop on first fail | `pytest -x` |

## Complete Workflow

**One-time setup:**
```bash
cd leaguesphere
uv sync --extra test
./container/spinup_test_db.sh --fresh
export MYSQL_HOST=$(lxc list servyy-test --format json | jq -r '.[0].state.network.eth0.addresses[] | select(.family=="inet") | .address' | head -n 1)
```

**Before each test run (if DB stopped):**
```bash
export MYSQL_HOST=$(lxc list servyy-test --format json | jq -r '.[0].state.network.eth0.addresses[] | select(.family=="inet") | .address' | head -n 1)
```

**Run tests:**
```bash
pytest gameday_designer/tests/test_api.py -v
```

## Common Mistakes

**❌ Running pytest without setting MYSQL_HOST**
- Error: `django.db.utils.OperationalError: (1045, "Access denied")`
- Fix: `export MYSQL_HOST=<IP>` before running tests

**❌ Database already running from previous test**
- Error: `Address already in use` or connection timeouts
- Fix: `./container/spinup_test_db.sh --fresh` stops old DB and creates new one

**❌ Dependencies not installed**
- Error: `ModuleNotFoundError: No module named 'pytest'`
- Fix: `uv sync --extra test`

**❌ Running with pytest.ini set to wrong database**
- Error: Tests connect to production database instead of test DB
- Fix: pytest.ini MUST point to `league_manager.settings.dev` (uses MYSQL_HOST env var)

**❌ Running parallel tests on slow machine**
- Error: Tests timeout or hang
- Fix: Run without `-n 4` flag, or use `-n 2` for fewer workers

## Troubleshooting

**Tests hang indefinitely:**
```bash
# Kill hanging pytest
pkill -9 pytest

# Restart database
./container/spinup_test_db.sh --fresh
export MYSQL_HOST=...
pytest
```

**Database connection refused:**
```bash
# Verify test DB is running
lxc list servyy-test

# If not running, start it
./container/spinup_test_db.sh --fresh
```

**Test pollution between runs:**
```bash
# Fresh database cleans all state
./container/spinup_test_db.sh --fresh
pytest
```

## Integration with Verification

Before committing code, run the complete verification checklist:

1. **Install dependencies**: `uv sync --extra test`
2. **Set up database**: `./container/spinup_test_db.sh --fresh`
3. **Configure environment**: Set MYSQL_HOST
4. **Run backend tests**: `pytest --ignore=scorecard/tests/e2e --ignore=gameday_designer/tests/e2e`
5. **Check code quality**:
   - Backend: `black .` (formatting required)
   - Frontend (per app): `npm run eslint` (ZERO errors)
6. **Verify staging**: Deploy to test environment and validate behavior

## Test Coverage Reports

After running `pytest --cov=. --cov-report=html`:

1. Open `htmlcov/index.html` in browser
2. Look for <90% coverage areas
3. Add tests to cover those lines
4. Re-run to verify coverage improved
