# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 📋 Quick Reference: Essential Commands

### Backend (Python/Django)
```bash
# Install dependencies
uv sync --extra test

# Run migrations
python manage.py migrate

# Format code (REQUIRED before pushing)
black .

# Run all tests (requires LXC test DB — see Testing section)
pytest

# Run a single test file
pytest accounts/tests/test_views.py -v

# Run tests in parallel
pytest -n auto
```

### Frontend (React/Vite — run from app directory like `gameday_designer/`, `passcheck/`, etc.)
```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm run test:run

# Lint (REQUIRED before pushing — CI blocks merge on errors)
npm run eslint

# Run dev server
npm run dev
```

### Database & Infrastructure
```bash
# Spin up fresh LXC test database
./container/spinup_test_db.sh --fresh

# Get test DB IP for MYSQL_HOST
lxc list servyy-test --format json | jq -r '.[0].state.network.eth0.addresses[] | select(.family=="inet") | .address' | head -n 1
```

See **[Infrastructure Policy](docs/guides/infrastructure-policy.md)** and **[Contributor Guide § Version Management](docs/guides/contributor-guide.md#-version-management-automated-via-release-please)** for deployment and release workflows.

---

## 🏗 Architecture Overview

### System Design
LeagueSphere is a **hybrid Django + React** application for tournament management:

- **Backend (Django 5.2)**: REST API serving as the central hub. Manages data persistence, authentication (Knox tokens), complex scheduling logic, and player eligibility validation. Key modules: `gamedays` (core scheduling), `accounts` (auth), `league_table` (standings), `teammanager` (rosters).

- **Frontend (Multiple React Apps via Vite)**: Specialized applications built independently and integrated into Django's `static/` directory:
  - `gameday_designer`: Flowchart-based schedule builder
  - `passcheck`: Player eligibility verification interface
  - `liveticker`: Real-time fan updates
  - `scorecard`: On-field scoring entry
  - `journey_dashboard`: Game progress dashboard (shows gameday schedule and live score updates)
  - `dashboard`: Legacy dashboard (being phased out)
  
- **Database (MariaDB/MySQL)**: Central persistence layer. Test environment uses dedicated LXC container (`servyy-test`).

### Game Progress Dashboard Feature
A dedicated feature for viewing live game progress across a 21-day window (7 days past, 14 days future):
- **View**: `GameProgressPageView` in `journey/progress_view.py` — authentication-required template view
- **API**: `GameProgressViewSet` in `journey/api/progress_views.py` — read-only API returning denormalized gameday + games + scores
- **Frontend**: `journey_dashboard/` React app displays paginated gameday schedule with live score updates
- **Query Optimization**: Uses `select_related()` for league/season and `prefetch_related()` for gameinfo/gameresult sets
- **Filters**: By league and season via query parameters

### Integration Pattern
All frontend apps communicate with Django via REST API (endpoints use `/api/` prefix). Frontend apps use Vite's `base` configuration to align with Django's static URL structure. The `collectstatic` command aggregates all built frontend assets for production delivery.

---

## ⚡ Query Optimization & Caching Patterns

### HTTP-Level ETag Caching
The `gamedays/api/views.py` implements ETag-based caching to reduce redundant data transfers:
- **Gameday List**: Uses `@condition(etag_func=generate_gameday_list_etag)` decorator with query parameters + latest gameday pk
- **Gameday Games**: Uses `generate_gameday_games_etag()` based on latest gameresult pk
- Returns HTTP 304 (Not Modified) when ETags match, preventing unnecessary response payload transfers

**When to use:** Always use ETags for read-heavy endpoints that serve large data structures. Include relevant query parameters and latest object PKs in ETag generation.

### Query Optimization with Prefetch & Select
The `GameProgressViewSet` demonstrates the optimization pattern:
```python
queryset = queryset.select_related(
    'league',
    'season',
).prefetch_related(
    'gameinfo_set',
    'gameinfo_set__gameresult_set',
)
```
- `select_related()`: Joins related objects (league, season) in a single query
- `prefetch_related()`: Batch-fetches related sets (gameinfos and their results) in separate queries
- **Critical for performance:** Every API endpoint returning gameday data should use these patterns

**When to use:** 
- `select_related()`: Foreign keys / one-to-one relationships (use when relationships are mandatory)
- `prefetch_related()`: Reverse foreign keys / many-to-many (use to avoid N+1 queries)

---

## 🧪 Testing & Verification (MANDATORY)

**All code MUST pass verification before pushing to remote.**

### Backend Testing
```bash
# Set up test database (one-time or when fresh start needed)
./container/spinup_test_db.sh --fresh
export MYSQL_HOST=$(lxc list servyy-test --format json | jq -r '.[0].state.network.eth0.addresses[] | select(.family=="inet") | .address' | head -n 1)

# Run full test suite
pytest

# Run with coverage report
pytest --cov=. --cov-report=html

# Run specific tests
pytest gamedays/tests/test_models.py::TestSchedule -v
```

**Critical Note:** Backend tests require a MariaDB instance in LXC. Do NOT assume it's unavailable without checking with `./container/spinup_test_db.sh`.

### Frontend Testing
Frontend tests run independently with **no external database required**:
```bash
# From app directory (e.g., gameday_designer/)
npm run test:run
```

### Code Quality (CI Blocks Merge on Violations)
- **Backend**: `black .` (code formatting) — no linting errors
- **Frontend**: `npm run eslint` (ZERO errors) — critical rules enforced:
  - ❌ No `as any` type assertions (use `ReturnType<typeof fn>` or explicit types)
  - ❌ No deprecated methods (`.substr()` → `.slice()`)
  - ❌ No `Math.random()` for security-sensitive values (use `crypto.getRandomValues()`)
  - ❌ No unused imports or variables

### Verification Checklist
Before marking a task complete:
1. ✅ Write tests first (TDD: RED → GREEN → REFACTOR)
2. ✅ All backend tests pass: `pytest`
3. ✅ All frontend tests pass: `npm run test:run` (in each app)
4. ✅ Format backend code: `black .`
5. ✅ Lint frontend: `npm run eslint` (ZERO errors)
6. ✅ Verify on staging: `./container/deploy.sh stage`, then test at [stage.leaguesphere.app](https://stage.leaguesphere.app)

---

## 🚀 Development Workflow

### 1. Test-Driven Development (Mandatory)
All features and bugfixes MUST follow the RED → GREEN → REFACTOR cycle:
1. Write failing test that captures the requirement
2. Implement code to pass the test
3. Refactor for clarity and maintainability
4. Verify full test suite passes

### 2. Git & Branching Protocol
- Create a feature branch; never commit directly to `master`
- Use conventional commits: `feat:`, `fix:`, `refactor:`, etc.
- Create PR via: `gh pr create --repo dachrisch/leaguesphere --base master --title "..." --body "..."`
- Require ≥90% patch coverage
- See **[Contributor Guide § Git & Branching](docs/guides/contributor-guide.md#-core-development-workflow)** for release and versioning details

### 3. Staging Validation
All changes MUST be tested on [stage.leaguesphere.app](https://stage.leaguesphere.app) before merging to master.

---

## ⚠️ Deployment Safety (Mandatory Policy)

**CRITICAL: ZERO TOLERANCE FOR MANUAL PRODUCTION EDITS**

❌ FORBIDDEN:
- Manual file edits on production servers (SSH + vi/nano)
- Direct configuration changes without Ansible automation
- Hotfixes bypassing proper automation workflow
- Skipping test environment validation

✅ REQUIRED WORKFLOW:
1. Develop via Ansible playbooks/scripts (never manual edits)
2. Test on test server (`servyy-test.lxd`) first
3. Only after successful test deployment, deploy to production
4. Verify results and document changes

Refer to **[Infrastructure Policy](docs/guides/infrastructure-policy.md)** for complete deployment protocols.

---

## 🔑 Special Configuration Requirements

### Database Initialization: Placeholder Teams (Critical)
The test database MUST include specific placeholder teams referenced by schedule JSON files. These are created automatically during `spinup_test_db.sh --fresh`:

- **Playoff Placeholders**: P3 Gruppe 1/2, P2 Gruppe 1/2/3, P1 Gruppe 1/2/3, P4 Gruppe 1/2
- **Match Outcomes**: Gewinner HF1/2, Verlierer HF1/2, Gewinner P3, Verlierer P3, etc.
- **Playoff Rankings**: Bester/Schlechtester P1/P2, Zweitbester P1/P2, etc.

If you see `Team.DoesNotExist: Team matching query does not exist`, run: `./container/spinup_test_db.sh --fresh`

See `gamedays/tests/setup_factories/db_setup.py::DBSetup.create_playoff_placeholder_teams()` for the complete list.

---

## 📚 Central Authority

For detailed protocols and standards, refer to:
- **[Contributor Guide](docs/guides/contributor-guide.md)**: Build, test, code style, and safety guidelines (primary reference)
- **[Architecture Overview](docs/arch/architecture-overview.md)**: System design and tech stack decisions
- **[Coding Standards](docs/guides/coding-standards.md)**: Python, TypeScript, and CSS conventions
- **[Infrastructure Policy](docs/guides/infrastructure-policy.md)**: Deployment safety and Ansible rules
- **[Setup Guide](docs/guides/setup-guide.md)**: Local environment configuration
- **[AGENTS.md](AGENTS.md)**: Universal guidelines for all autonomous agents
- **[GEMINI.md](GEMINI.md)**: Gemini CLI-specific instructions

**Documentation Structure (`docs/` directory):**
- `docs/arch/`: Architectural Decision Records and system design
- `docs/features/`: Feature documentation (current and historical)
- `docs/guides/`: Setup, contributor, and coding standards
- `docs/plans/`: Historical and current implementation plans
- `docs/reports/`: Performance analysis, verification reports, and summaries
- `docs/testing/`: Test scenarios and testing strategies

---

## 🤖 Claude Code Workflow

### When Delegating to Agents
This project defines specialized agents for different tasks. Use them when appropriate:
- **TDD Engineer**: For test-driven feature development
- **Architecture Designer**: For system design and technical approaches
- **QA Verification Engineer**: For comprehensive quality checks before merging
- **Git Commit Manager**: For commits and PR creation with proper formatting
- **Documentation Specialist**: For creating/updating technical documentation

### Default Behavior
1. **Research First**: Map the codebase and validate assumptions before proposing changes
2. **Test-Driven**: Write tests before implementation code
3. **Verify Thoroughly**: Run full test suite and linting before reporting completion
4. **No Hotfixes**: Always use proper automation workflows — no manual production edits
