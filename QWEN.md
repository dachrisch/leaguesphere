# LeagueSphere — Project Context

## Project Overview

**LeagueSphere** is a Django-based web application for managing sports leagues, game schedules, live score tracking, team management, and match reporting. It is a full-stack monorepo with a **Django backend** and multiple **React/TypeScript frontend micro-apps**, each serving a specific domain.

- **Current version**: 3.33.15
- **Python**: >= 3.12
- **Django**: 6.0.7
- **Database**: MySQL (InnoDB)
- **Frontend**: React 19, TypeScript, Vite, Vitest
- **Package manager**: `uv` (Python), npm (JS)

## Architecture

### Backend (Django)

The project follows a Django multi-app architecture. Each domain is a self-contained Django app:

| App | Purpose |
|---|---|
| `gamedays` | Game scheduling, gameday management, API endpoints |
| `league_table` | League standings and rankings |
| `scorecard` | Score entry and tracking (React frontend) |
| `liveticker` | Real-time game live-ticker (React frontend) |
| `teammanager` | Team roster and management |
| `officials` | Official/referee management |
| `passcheck` | Player eligibility checking (React frontend) |
| `gameday_designer` | Flowchart-based game schedule design (React frontend) |
| `matchreport` | Match reporting |
| `accounts` | Authentication and user management |
| `journey` / `journey_dashboard` | User journey tracking (React frontend) |
| `league_manager` | Core project app — settings, URLs, middleware, base templates |

### Frontend

Each frontend app (`scorecard`, `liveticker`, `passcheck`, `gameday_designer`, `journey_dashboard`) is a standalone React + TypeScript project using:
- **Vite** for building
- **Vitest** + React Testing Library for testing
- **i18next** for internationalization (German primary locale)
- **React-Bootstrap** for UI components

### Deployment

- **Docker** containers: `container/app.Dockerfile` (backend/Gunicorn), `container/nginx.Dockerfile` (frontend)
- **Docker Compose** for production deployments (`deployed/docker-compose.yaml`)
- **CircleCI** for CI/CD with staging, demo, and production environments
- **Release-please** for automated versioning and changelog generation

## Building and Running

### Setup

```bash
# Install Python dependencies (with test extras)
uv sync --extra test

# Install frontend dependencies per app
npm install --prefix scorecard/
npm install --prefix liveticker/
npm install --prefix passcheck/
npm install --prefix gameday_designer/
npm install --prefix journey_dashboard/
```

### Running the Server

```bash
# Set required environment variables (see .env_template)
export SECRET_KEY="..."
export MYSQL_HOST="127.0.0.1"
export MYSQL_DB_NAME="..."
export MYSQL_USER="..."
export MYSQL_PWD="..."

# Run Django development server
python manage.py runserver

# Or with Gunicorn for production-like testing
uv run gunicorn -b 0.0.0.0:8000 league_manager.wsgi
```

### Frontend Development

```bash
# Build a frontend app
npm --prefix scorecard/ run build

# Watch mode for development
npm --prefix scorecard/ run watch

# Start dev server (Vite)
npm --prefix scorecard/ start
```

### Database Migrations

```bash
python manage.py makemigrations
python manage.py migrate
```

### Static Files

```bash
python manage.py collectstatic
```

## Testing

### Backend Tests (pytest)

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=.

# Run in parallel (4 workers)
pytest -n 4

# Run specific app tests
pytest gamedays/tests/

# Run without migrations (faster)
pytest --nomigrations
```

### Frontend Tests

```bash
# Run tests for a specific app
npm --prefix scorecard/ run test:run
npm --prefix liveticker/ run test:run
npm --prefix passcheck/ run test:run
npm --prefix gameday_designer/ run test:run
npm --prefix journey_dashboard/ run test:run
```

### End-to-End Tests (Playwright)

```bash
uv run playwright install chromium --with-deps
uv run pytest scorecard/tests/e2e/ -v
uv run pytest gameday_designer/tests/e2e/ -v --ds=test_settings
```

### Linting

```bash
# Backend
black .

# Frontend (per app)
npm --prefix scorecard/ run eslint
npm --prefix liveticker/ run eslint
npm --prefix passcheck/ run eslint
npm --prefix gameday_designer/ run eslint
npm --prefix journey_dashboard/ run eslint
```

## Development Conventions

- **Test-driven development**: Write tests before implementing features or fixing bugs.
- **TDD for bugfixes**: Reproduce the bug with a test first, then fix.
- **Full verification**: Run the full test suite and linting before completing any task.
- **Documentation**: All documentation lives in `docs/topics/`, organized by topic. Link new docs from the parent topic README.
- **Versioning**: Use `bump2version` or release-please for version bumps. Versions are synchronized across `pyproject.toml`, `league_manager/__init__.py`, and all frontend `package.json` files.

## Key Configuration Files

| File | Purpose |
|---|---|
| `pyproject.toml` | Python dependencies, build config, bumpversion settings |
| `uv.lock` | Locked Python dependency versions |
| `pytest.ini` | Pytest configuration (Django settings module, test file patterns) |
| `.env_template` | Template for required environment variables |
| `.pre-commit-config.yaml` | Pre-commit hooks configuration |
| `release-please-config.json` | Release-please versioning configuration |
| `.circleci/config.yml` | CI/CD pipeline definition |
| `conftest.py` | Root pytest fixtures |

## Documentation Structure

```
docs/
├── topics/          # Topic-based documentation (architecture, guides, features, etc.)
│   ├── architecture/
│   ├── guides/      # Setup, coding standards, contributor guide
│   ├── features/
│   ├── deployment/
│   ├── testing/
│   ├── troubleshooting/
│   └── planning/
├── features/        # Feature-specific docs (legacy)
├── plans/           # Implementation plans
├── reports/         # Verification reports, summaries
├── load-testing/    # Load testing documentation
└── DOCUMENTATION.md # Documentation guidelines
```

## Agent Configuration Files

This repository maintains agent-specific guides. Always consult the relevant one before starting work:

| File | Audience |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Universal guidelines for all autonomous agents — research-first protocol, TDD requirements, documentation standards |
| [`CLAUDE.md`](CLAUDE.md) | Claude Code — essential commands, module guides, query optimization patterns, testing protocol, deployment safety, database initialization notes |
| [`GEMINI.md`](GEMINI.md) | Gemini CLI — research/strategy/execution lifecycle, MCP memory management, testing protocol |

## Agent Guidelines

- **Research first**: Explore the codebase before proposing changes.
- **Specialized guides** (in `docs/topics/`):
  - [Contributor Guide](docs/topics/guides/contributor-guide.md) — Build, test, code style, safety
  - [Coding Standards](docs/topics/guides/coding-standards.md) — Python & TypeScript conventions
  - [Setup Guide](docs/topics/guides/setup-guide.md) — Local environment configuration
  - [Infrastructure Policy](docs/topics/guides/infrastructure-policy.md) — Deployment safety
